/**
 * Vercel Serverless Function — Trino Query Proxy
 * POST /api/query
 * Body: { "query": "SELECT ..." }
 * Returns: array of row objects [{ col1: val1, col2: val2 }, ...]
 *
 * Environment variables required in Vercel:
 *   TRINO_SCHEME   — https
 *   TRINO_HOST     — highoctane-trino-prod.bazaar-engineering.com
 *   TRINO_PORT     — 443
 *   TRINO_USER     — your email
 *   TRINO_PASSWORD — your password/token
 *   TRINO_HEADERS  — JSON string of extra headers, e.g. {"X-Trino-Catalog":"hive"}
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: 'Missing query in request body' });

  const scheme   = process.env.TRINO_SCHEME   || 'https';
  const host     = process.env.TRINO_HOST;
  const port     = process.env.TRINO_PORT     || '443';
  const user     = process.env.TRINO_USER;
  const password = process.env.TRINO_PASSWORD;
  const hdrsEnv  = process.env.TRINO_HEADERS;

  if (!host || !user || !password) {
    return res.status(500).json({ error: 'Missing Trino environment variables' });
  }

  const basicAuth = Buffer.from(`${user}:${password}`).toString('base64');

  let extraHeaders = {};
  if (hdrsEnv) {
    try { extraHeaders = JSON.parse(hdrsEnv); } catch (_) {}
  }

  const baseHeaders = {
    'Authorization': `Basic ${basicAuth}`,
    'X-Trino-User': user,
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
      await new Promise(r => setTimeout(r, 100));
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
