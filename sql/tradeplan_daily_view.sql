-- ============================================================================
-- bz_discount.tradeplan_daily
--
-- Collapses the six daily snapshots into one row per SKU, city and day.
--
-- For each day it exposes the opening and closing effective value, plus a count
-- of how many distinct values that day held. Anything above 1 means the plan was
-- edited intraday, which is what the dashboard highlights.
--
-- "Effective" mirrors the approval flow: column F supersedes D for MOQ, column G
-- supersedes E for rate, and zero is not a valid value.
--
-- Source data is written by the n8n workflow "Bazaar - Trade Plan Snapshot",
-- six times a day at 10:30, 12:30, 14:30, 16:30, 18:30 and 20:30 PKT.
-- ============================================================================

create or replace view bz_discount.tradeplan_daily as
with ranked as (
  select
    (captured_at at time zone 'Asia/Karachi')::date as plan_date,
    city_raw,
    sku_name,
    vendor,
    parent_brand,
    core_category,
    coalesce(nullif(moq_2,  0), moq_1)  as eff_moq,
    coalesce(nullif(rate_2, 0), rate_1) as eff_rate,
    nullif(btrim(coalesce(mix, '')), '') as eff_mix,
    captured_at,
    row_number() over (
      partition by (captured_at at time zone 'Asia/Karachi')::date, city_raw, sku_name
      order by captured_at asc
    ) as rn_first,
    row_number() over (
      partition by (captured_at at time zone 'Asia/Karachi')::date, city_raw, sku_name
      order by captured_at desc
    ) as rn_last
  from bz_discount.tradeplan_snapshot
  where sku_name is not null
)
select
  plan_date,
  city_raw,
  sku_name,
  max(vendor)        as vendor,
  max(parent_brand)  as parent_brand,
  max(core_category) as core_category,

  max(case when rn_first = 1 then eff_moq  end) as moq_open,
  max(case when rn_last  = 1 then eff_moq  end) as moq_close,
  count(distinct eff_moq)                       as moq_variants,

  max(case when rn_first = 1 then eff_rate end) as rate_open,
  max(case when rn_last  = 1 then eff_rate end) as rate_close,
  count(distinct eff_rate)                      as rate_variants,

  max(case when rn_first = 1 then eff_mix  end) as mix_open,
  max(case when rn_last  = 1 then eff_mix  end) as mix_close,
  count(distinct eff_mix)                       as mix_variants,

  count(*) as snapshots
from ranked
group by plan_date, city_raw, sku_name;


-- The REST layer needs to be able to read it.
grant select on bz_discount.tradeplan_daily to anon, authenticated, service_role;

-- Snapshot volume grows quickly, so keep the date filter fast.
create index if not exists tradeplan_snapshot_captured_at_idx
  on bz_discount.tradeplan_snapshot (captured_at);

create index if not exists tradeplan_snapshot_sku_city_idx
  on bz_discount.tradeplan_snapshot (sku_name, city_raw);


-- ============================================================================
-- Retention. Run monthly as a Supabase cron job.
--   past 90 days  -> delete everything
--   60 to 90 days -> keep only the first snapshot of each day
-- ============================================================================

-- delete from bz_discount.tradeplan_snapshot
-- where captured_at < now() - interval '90 days';
--
-- delete from bz_discount.tradeplan_snapshot
-- where captured_at < now() - interval '60 days'
--   and snapshot_id not in (
--     select min(snapshot_id) from bz_discount.tradeplan_snapshot
--     group by date(captured_at)
--   );
