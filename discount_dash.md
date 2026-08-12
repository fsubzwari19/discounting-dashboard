# Discounting Dashboard

Internal dashboard for Bazaar's discount review and trade-plan history.
A static single-page app (no build step, no npm dependencies) with all
server-side work on **Supabase**. **Migrated off Vercel** (Aug 2026) — there are
no serverless functions or `vercel.json` in this repo anymore.

---

## Architecture

- **Frontend** — the static files in this repo (`index.html`, `login.html`,
  `styles.css`, `js/*`). Served as a plain static site. Repo is moving to the
  `bazaartechnologies` GitHub org; production host/domain is **TBD** (see below).
- **Backend** — Supabase project **BZ Keenu Project** (`bxlydelarjrpqhkpjazd`,
  region ap-southeast-2):
  - Edge function **`query`** — Trino SQL proxy.
  - Edge function **`tradeplan`** — reads `bz_discount.tradeplan_daily`.
  - **Supabase Auth** (Google provider) — sign-in and session.
  - **Postgres** — the `bz_discount` schema (trade-plan snapshots).
- **Auth** — Supabase Auth Google sign-in. The browser holds a session JWT; the
  edge functions verify it and enforce the `@bazaartech.com` email domain on
  every call. There is no custom cookie/OAuth server anymore.

The frontend embeds only the **public** Supabase project URL and publishable key
(safe in the browser). All secrets live in Supabase.

---

## Frontend structure

Native ES modules under `js/` (loaded via `<script type="module">`, no bundler):

| Module | Responsibility |
|---|---|
| `app.js` | Entry: hash routing, view shell, auth check on load, exposes inline `on*` handlers on `window` |
| `supabase.js` | supabase-js client (from `esm.sh`) + `invokeFn()` and auth helpers |
| `api.js` | `q(sql)` → invokes the `query` edge function |
| `filters.js` | Global date range, store-type multiselect, error/status banners |
| `util.js` | `N`, `P`, `esc`, `downloadCSV` |
| `views/overview.js` · `breakdown.js` · `orders.js` · `expiry.js` · `tradeplan.js` | One module per section |

Five sections, **hash-routed** (`#/overview`, `#/breakdown`, `#/orders`,
`#/expiry`, `#/tradeplan`) — deep-linkable, with working back/forward and
refresh. Theme is celestial blue, `--pri: #4997D0`. Chart.js is loaded from CDN
(pinned + SRI).

---

## Backend — Supabase edge functions

Both are at `https://bxlydelarjrpqhkpjazd.supabase.co/functions/v1/<name>` and
deployed with `verify_jwt = false` **on purpose**: they run their own auth so the
CORS preflight (which carries no `Authorization` header) can be answered. Each
function: handles `OPTIONS`/CORS → verifies the caller's Supabase session via
`auth.getUser()` → enforces `@bazaartech.com` (env `ALLOWED_EMAIL_DOMAIN`,
default `bazaartech.com`) → does its work.

### `query`

Proxies arbitrary SQL to Trino using server-side credentials (Trino secrets).
Returns an array of row objects. **Still an arbitrary-SQL proxy** — the
`SELECT`-only hardening is a parked item, carried over from the Vercel version.

### `tradeplan`

Reads `bz_discount.tradeplan_daily` with the service role (never exposed to the
browser). Accepts `{ from, to, city }`, validated server side (ISO dates, span
≤ 90 days, city letters/spaces only). Deliberately **not** a SQL proxy — keep it
that way.

---

## Data sources

### Trino (`query` edge function)

Silver-layer schemas, always prefixed `hive.`:

- `hive.bazaar_biz_silver.order_booked`
- `hive.bazaar_biz_silver.order_item_booked`
- `hive.bazaar_biz_silver.item_mapping`
- `hive.bazaar_biz_silver.store_mapping`
- `hive.bazaar_ops_silver.warehouse_inventory_batch_snapshot`

Gotchas learned the hard way:

- `partition_key` is a **monthly** partition (first of the month), not the order
  date. Filter on both `partition_key >= date_trunc('month', current_date)` and
  the real `order_date`.
- Trino has no `LIMIT n OFFSET m`. Page with a `ROW_NUMBER()` subquery.
- `item_mapping` has duplicate `item_name` values. Join on `item_id` (unique).
- Real category names are `Milk & Dairy` and `Snacks & Confectionary`, not
  `Dairy` / `Snacks` — the short forms match nothing and fail silently.

### Supabase Postgres — schema `bz_discount`

- `tradeplan_snapshot` — written six times a day by the n8n workflow
  "Bazaar - Trade Plan Snapshot". One row per trade-plan sheet row per capture.
- `tradeplan_daily` — the view the `tradeplan` function reads. Collapses each
  day's snapshots into one row per SKU / city / day with opening & closing values
  and a variant count so intraday edits are detectable.

The schema must stay listed under Settings → API → Exposed schemas.

---

## Secrets & configuration (Supabase)

Edge-function secrets (`supabase secrets set --project-ref bxlydelarjrpqhkpjazd …`
or Dashboard → Edge Functions → Secrets):

| Secret | Used by | Notes |
|---|---|---|
| `TRINO_HOST` / `TRINO_PORT` / `TRINO_USER` / `TRINO_PASSWORD` / `TRINO_HEADERS` / `TRINO_SCHEME` | `query` | Trino connection; `query` returns 500 until these are set |
| `ALLOWED_EMAIL_DOMAIN` | both | Defaults to `bazaartech.com`; only set to override |
| `ALLOWED_ORIGINS` | both | CSV of allowed site origins for CORS; `*` until the domain is set |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | both | **Auto-injected** by Supabase — do not set |

**Supabase Auth** — Google provider enabled with the org's Google OAuth client.
The Google client's authorized redirect URI must include
`https://bxlydelarjrpqhkpjazd.supabase.co/auth/v1/callback`. The Site URL and
redirect allowlist (Auth → URL Configuration) must include the production domain.

---

## Related n8n workflows

Not in this repo, but they produce the data the Trade Plan section reads.

- **Bazaar - Discount Approval Processing** — auto-approves discount orders
  against the trade plan. Runs every 2 hours, 10:30–20:30 PKT. Its queue query is
  **Metabase card 447** (not in the n8n flow itself).
- **Bazaar - Trade Plan Snapshot** — captures the trade-plan sheet six times a
  day into `bz_discount.tradeplan_snapshot`. Same schedule.
- **Bazaar - n8n Error Alerts** — posts failures to Slack.

Snapshot retention: everything for 60 days, then thinned to one snapshot per day,
deleted entirely past 90 days.

---

## Production domain — TBD

The static site will be deployed by the onboarding/deploy skill, which assigns a
URL. Once that URL exists, three things must be set (this doc will be updated with
the final value):

1. `ALLOWED_ORIGINS` secret on both edge functions → the site origin (tightens
   CORS from `*`).
2. Supabase Auth → URL Configuration → Site URL + redirect allowlist → include
   the domain, or Google sign-in's `redirectTo` is rejected.
3. Google OAuth authorized redirect URI stays the Supabase callback (unchanged by
   the site domain).

---

## Working on this repo

- Pure static, no build step. Verify changes by confirming the JS parses, every
  `getElementById` target exists in the markup, the module graph resolves, and the
  page loads. (`package.json` is a harmless Vercel-era leftover; static hosts
  ignore it.)
- The trade-plan grid uses `table-layout: fixed` with a `<colgroup>` so columns
  can be dragged; frozen columns are positioned by measuring in `layoutFrozen()`,
  so any change to the column set must keep that in sync.
