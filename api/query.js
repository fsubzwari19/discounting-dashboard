/**
 * Vercel Serverless Function — Trino Query Proxy
 * POST /api/query
 * Body: { "query": "SELECT ..." }
 * Returns: array of row objects [{ col1: val1, col2: val2 }, ...]
 *
 * AUTH: gated. Requires a valid signed session cookie issued by /api/auth
 * after Google sign-in with an @bazaartechnologies.com account.
 *
 * Required env vars in Vercel:
 *   TRINO_SCHEME        — https
 *   TRINO_HOST          — e.g. highoctane-trino-prod.bazaar-engineering.com
 *   TRINO_PORT          — 443
 *   TRINO_USER          — Trino username / email
 *   TRINO_PASSWORD      — Trino password / token
 *   TRINO_HEADERS       — JSON string of extra headers {"P-Access-Token-Id":"...","P-Access-Token":"..."}
 *   SESSION_SECRET      — random string ≥32 chars (shared with _auth.js)
 *   GOOGLE_CLIENT_ID    — from Google Cloud Console
 *   GOOGLE_CLIENT_SECRET
 *   ALLOWED_DOMAIN      — bazaartechnologies.com
 */
import { getUser } from './_auth.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Auth gate ──────────────────────────────────────────────────────────
  const user = getUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized — please sign in' });
  }

  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: 'Missing query in request body' });

  const scheme    = process.env.TRINO_SCHEME   || 'https';
  const host      = process.env.TRINO_HOST;
  const port      = process.env.TRINO_PORT     || '443';
  const trinoUser = process.env.TRINO_USER;
  const password  = process.env.TRINO_PASSWORD;
  const hdrsEnv   = process.env.TRINO_HEADERS;

  if (!host || !trinoUser || !password) {
    return res.status(500).json({ error: 'Missing Trino environment variables (TRINO_HOST / TRINO_USER / TRINO_PASSWORD)' });
  }

  const basicAuth = Buffer.from(`${trinoUser}:${password}`).toString('base64');

  let extraHeaders = {};
  if (hdrsEnv) {
    try { extraHeaders = JSON.parse(hdrsEnv); } catch (_) {}
  }

  const baseHeaders = {
    'Authorization': `Basic ${basicAuth}`,
    'X-Trino-User': trinoUser,
    'Content-Type': 'text/plain',
    ...extraHeaders,
  };

  const baseUrl = `${scheme}://${host}:${port}`;

  try {
    const submitRes = await fetch(`${baseUrl}/v1/statement`, {
      method: 'POST',
      headers: baseHeaders,
      body: query,
    });

    if (!submitRes.ok) {
      const text = await submitRes.text();
      return res.status(submitRes.status).json({ error: `Trino submit failed: ${text}` });
    }

    let state = await submitRes.json();
    if (state.error) {
      return res.status(400).json({ error: `${state.error.errorName}: ${state.error.message}` });
    }

    let columns = state.columns || [];
    let allRows = state.data   || [];

    while (state.nextUri) {
      await sleep(100);
      const nextRes = await fetch(state.nextUri, { headers: baseHeaders });
      if (!nextRes.ok) {
        const text = await nextRes.text();
        return res.status(nextRes.status).json({ error: `Trino pagination failed: ${text}` });
      }
      state = await nextRes.json();
      if (state.error) {
        return res.status(400).json({ error: `${state.error.errorName}: ${state.error.message}` });
      }
      if (state.columns) columns = state.columns;
      if (state.data)    allRows = allRows.concat(state.data);
    }

    const rows = allRows.map(row =>
      Object.fromEntries(columns.map((col, i) => [col.name, row[i]]))
    );

    return res.status(200).json(rows);

  } catch (err) {
    console.error('Trino proxy error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
