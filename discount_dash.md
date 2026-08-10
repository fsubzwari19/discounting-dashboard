# Discounting Dashboard

Internal dashboard for Bazaar's discount review and trade plan history.
Static single-page app on Vercel with serverless API routes. No build step,
no npm dependencies.

---

## Stack

- `index.html` — the whole UI. Inline `<style>` and `<script>`, no framework.
  Chart.js is loaded from CDN. On load it calls `/api/me` and redirects to
  `login.html` when there is no valid session.
- `api/query.js` — proxies arbitrary SQL to Trino. **Auth-gated.**
- `api/tradeplan.js` — reads trade plan history from Supabase Postgres. **Auth-gated.**
- `login.html`, `api/_auth.js`, `api/login.js`, `api/auth.js`, `api/me.js`,
  `api/logout.js` — Google OAuth, **active** and protecting the API routes
  (see [Auth](#auth) below).
- `sql/` — SQL definitions that must be run manually in Supabase.
- `package.json` — deliberately has no dependencies. `"type": "module"` is
  required so Vercel does not transpile the ESM routes to CJS.

Deploys automatically from `main`.

---

## UI structure

Sidebar nav, five sections, all in `index.html` as `.view` divs toggled by `go()`:

| Section | id | Source |
|---|---|---|
| Overview | `view-overview` | Trino: KPIs, daily trend, store-type donut |
| Breakdown | `view-breakdown` | Trino: warehouse table, top discounted SKUs |
| Orders | `view-orders` | Trino: order-level detail, paginated, CSV export |
| Expiry | `view-expiry` | Trino: near-expiry inventory joined to discounts |
| Plan History | `view-tradeplan` | Supabase: trade plan MOQ / rate / MIX over time |

Theme is celestial blue, `--pri: #4997D0`. Do not use the previous navy.

Global date-range and store-type controls apply to the four Trino views. Plan
History has its own controls and hides the global ones.

---

## Data sources

### Trino (`api/query.js`)

Silver-layer schemas, always prefixed `hive.`:

- `hive.bazaar_biz_silver.order_booked`
- `hive.bazaar_biz_silver.order_item_booked`
- `hive.bazaar_biz_silver.item_mapping`
- `hive.bazaar_biz_silver.store_mapping`
- `hive.bazaar_ops_silver.warehouse_inventory_batch_snapshot`

Gotchas learned the hard way:

- `partition_key` is a **monthly** partition, always the first of the month.
  It is not the order date. Filter on both: `partition_key >= date_trunc('month', current_date)`
  **and** `order_date = current_date`.
- Trino has no `LIMIT n OFFSET m`. Page with a `ROW_NUMBER()` subquery.
- `item_mapping` has duplicate `item_name` values. Join on `item_id`, which is unique.
- Real category names are `Milk & Dairy` and `Snacks & Confectionary`, not
  `Dairy` and `Snacks`. The short forms match nothing and fail silently.

### Supabase (`api/tradeplan.js`)

Schema `bz_discount`, which must be listed under Settings > API > Exposed schemas.

- `tradeplan_snapshot` — written six times a day by the n8n workflow
  "Bazaar - Trade Plan Snapshot". One row per trade plan sheet row per capture.
- `tradeplan_daily` — view in `sql/`, collapses each day's snapshots into one row
  per SKU, city and day with opening/closing values and a variant count so
  intraday edits are detectable.

`api/tradeplan.js` is deliberately **not** a SQL proxy. It accepts only a date
range and optional city, both validated server side. Keep it that way.

---

## Auth

Google OAuth is **live** and gates every data route. This section replaces the
old "`/api/query` is unauthenticated" open issue, which was resolved by wiring
the gate in after the first draft of this doc.

**Flow**

1. `index.html` calls `GET /api/me` on load. No valid session → redirect to
   `login.html`.
2. `login.html` links to `GET /api/login`, which redirects to Google's consent
   screen (`hd` hint set to `ALLOWED_DOMAIN`).
3. `GET /api/auth` is the OAuth callback: exchanges the code, fetches the user's
   email, enforces `ALLOWED_DOMAIN` via an `@domain` suffix check, then sets a
   signed session cookie and redirects to `/`.
4. `GET /api/logout` clears the cookie.

**Session cookie** — issued and verified in `api/_auth.js`:

- `auth=<base64url(payload)>.<hmac-sha256>` signed with `SESSION_SECRET`.
- Payload is `{ email, exp }`, 8-hour TTL. Signature checked with a constant-time
  compare; expiry checked on every request.
- Cookie flags: `HttpOnly; Secure; Path=/; Max-Age=28800; SameSite=Lax`
  (`Secure` is dropped on localhost).

**Enforcement** — `api/query.js`, `api/tradeplan.js` and `api/me.js` all call
`getUser(req)` and return `401` when there is no valid cookie. The frontend
turns a `401` into a redirect to `login.html`. `getUser` returns null when
`SESSION_SECRET` is unset, so the routes **fail closed**: if the OAuth env vars
are missing in Vercel, every data call `401`s rather than running open. `/api/login`
and `/api/auth` are intentionally public (they are the login flow itself).

**Residual risks worth knowing**

- `api/query.js` still runs **arbitrary SQL** — it is now gated, but any signed-in
  `@bazaartechnologies.com` user can run any statement Trino's credentials can
  reach. There is no read-only / `SELECT`-only enforcement. If you want to reduce
  that blast radius, the stronger fix is still to replace the SQL proxy with named
  parameterised queries the way `api/tradeplan.js` works.
- `api/auth.js` accepts Google's `email` without checking `verified_email`. Fine
  for a domain-restricted org, but worth tightening if the audience widens.

---

## Environment variables

Set in Vercel. None are committed.

| Var | Used by | Status |
|---|---|---|
| `SUPABASE_URL` | `api/tradeplan.js` | active |
| `SUPABASE_SERVICE_KEY` | `api/tradeplan.js` | active, server side only |
| Trino connection vars | `api/query.js` | active |
| `GOOGLE_CLIENT_ID` | `api/login.js`, `api/auth.js` | active |
| `GOOGLE_CLIENT_SECRET` | `api/auth.js` | active |
| `SESSION_SECRET` | `api/_auth.js` (all gated routes) | active, needs 32+ chars |
| `ALLOWED_DOMAIN` | `api/login.js`, `api/auth.js` | active, `bazaartechnologies.com` |

All seven are required for the gate to work. Because the routes fail closed, a
missing `SESSION_SECRET` (or any OAuth var) breaks the whole dashboard rather
than leaving it open.

---

## Related n8n workflows

Not in this repo, but they produce the data Plan History reads.

- **Bazaar - Discount Approval Processing** — auto-approves discount orders
  against the trade plan sheet. Runs every 2 hours, 10:30 to 20:30 PKT.
- **Bazaar - Trade Plan Snapshot** — captures the trade plan sheet six times a
  day into `bz_discount.tradeplan_snapshot`. Same schedule.
- **Bazaar - n8n Error Alerts** — error workflow, posts failures to Slack.

Retention on the snapshot table: everything for 60 days, then thinned to one
snapshot per day, deleted entirely past 90 days.

---

## Working on this repo

- `index.html` is one large file. The inline `<style>` and `<script>` are prime
  candidates for extraction into `styles.css` and `app.js`, which would make the
  file editable in smaller pieces.
- There is no test suite. Verify changes by checking the inline JS parses and
  every `getElementById` target exists in the markup, then load the page.
- The trade plan grid uses `table-layout: fixed` with a `<colgroup>` so columns
  can be dragged. Frozen columns are positioned by measuring in `layoutFrozen()`,
  not by fixed CSS offsets, so any change to the column set must keep that in sync.
