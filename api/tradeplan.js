// api/tradeplan.js
//
// Reads trade plan history from bz_discount.tradeplan_daily in Supabase.
//
// Deliberately NOT a SQL proxy. The client sends a date range and optional city,
// nothing else, so this route cannot be turned into a general query endpoint the
// way /api/query can.
//
// Env vars required on Vercel:
//   SUPABASE_URL          e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  service role key (server side only, never sent to the browser)

const PAGE = 1000;          // PostgREST default max rows per request
const MAX_PAGES = 40;       // hard stop, 40k rows
const MAX_DAYS = 90;

function isIsoDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const base = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_KEY;

  if (!base || !key) {
    return res.status(500).json({ error: 'Supabase environment variables are not configured' });
  }

  const { from, to, city } = req.body || {};

  if (!isIsoDate(from) || !isIsoDate(to)) {
    return res.status(400).json({ error: 'from and to must be YYYY-MM-DD' });
  }

  const spanDays = (new Date(to) - new Date(from)) / 86400000;
  if (spanDays < 0)        return res.status(400).json({ error: 'from must be on or before to' });
  if (spanDays > MAX_DAYS) return res.status(400).json({ error: `Range cannot exceed ${MAX_DAYS} days` });

  // city is optional; when present it must look like a plain city name
  if (city != null && city !== '' && !/^[A-Za-z ]{1,40}$/.test(city)) {
    return res.status(400).json({ error: 'Invalid city' });
  }

  const params = new URLSearchParams();
  params.set('select', [
    'plan_date', 'city_raw', 'sku_name', 'vendor', 'parent_brand', 'core_category',
    'moq_open', 'moq_close', 'moq_variants',
    'rate_open', 'rate_close', 'rate_variants',
    'mix_open', 'mix_close', 'mix_variants',
    'snapshots',
  ].join(','));
  params.append('plan_date', `gte.${from}`);
  params.append('plan_date', `lte.${to}`);
  if (city) params.append('city_raw', `eq.${city}`);
  params.set('order', 'city_raw.asc,sku_name.asc,plan_date.asc');

  const url = `${base}/rest/v1/tradeplan_daily?${params.toString()}`;

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Accept-Profile': 'bz_discount',      // the view is not in public
    'Content-Type': 'application/json',
  };

  try {
    const rows = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const start = page * PAGE;
      const end   = start + PAGE - 1;

      const r = await fetch(url, {
        headers: { ...headers, Range: `${start}-${end}`, 'Range-Unit': 'items' },
      });

      if (!r.ok) {
        const body = await r.text();
        return res.status(502).json({ error: `Supabase returned ${r.status}: ${body.slice(0, 400)}` });
      }

      const batch = await r.json();
      rows.push(...batch);

      if (batch.length < PAGE) break;

      if (page === MAX_PAGES - 1) {
        return res.status(413).json({
          error: 'Result set is too large. Narrow the date range or filter by city.',
        });
      }
    }

    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unexpected error' });
  }
}
