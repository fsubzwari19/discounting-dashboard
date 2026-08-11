import { q } from '../api.js';
import { sd, ed, stWhere } from '../filters.js';
import { N, esc } from '../util.js';

let allExp=[], curBucket='ALL';

export async function loadExpiry(){
  const [invRows, ordRows] = await Promise.all([
    q(`SELECT inv.item_name, inv.warehouse AS wh, inv.expiry_date AS exp,
      DATE_DIFF('day', CURRENT_DATE, inv.expiry_date) AS dte,
      SUM(inv.balance_sale) AS bal_sale,
      MAX(inv.uom_sale_name) AS uom,
      ROUND(SUM(inv.balance_sale * COALESCE(CAST(inv.mrp AS DOUBLE), 0)), 0) AS inv_value,
      MAX(CAST(inv.snapshot_date AS VARCHAR)) AS snap_dt,
      CASE
        WHEN DATE_DIFF('day', CURRENT_DATE, inv.expiry_date) < 0 THEN 'EXPIRED'
        WHEN DATE_DIFF('day', CURRENT_DATE, inv.expiry_date) <= 30 THEN '0-30 days'
        WHEN DATE_DIFF('day', CURRENT_DATE, inv.expiry_date) <= 60 THEN '31-60 days'
        ELSE '61-90 days'
      END AS bucket
    FROM hive.bazaar_ops_silver.warehouse_inventory_batch_snapshot inv
    WHERE inv.partition_key >= DATE '2026-06-01'
      AND inv.snapshot_date = (SELECT MAX(snapshot_date) FROM hive.bazaar_ops_silver.warehouse_inventory_batch_snapshot WHERE partition_key >= DATE '2026-06-01')
      AND inv.expiry_date > DATE '2020-01-01'
      AND inv.expiry_date <= CURRENT_DATE + INTERVAL '90' DAY
      AND inv.balance_stock > 0
    GROUP BY inv.item_name, inv.warehouse, inv.expiry_date
    ORDER BY dte ASC LIMIT 500`),
    q(`SELECT item_name,
      SUM(COALESCE(item_discount, 0)) AS dg,
      SUM(COALESCE(ordered_quantity, 0)) AS qs
    FROM hive.bazaar_biz_silver.order_item_booked
    WHERE partition_key >= DATE '2026-06-01'
      AND order_date >= DATE '${sd()}' AND order_date <= DATE '${ed()}'
      AND order_status NOT IN ('CANCELLED')
      ${stWhere('store_type_order')}
    GROUP BY item_name`)
  ]);
  if(!invRows.length && !ordRows.length) return;
  const ordMap={}; ordRows.forEach(r=>{ ordMap[r.item_name]=r; });
  allExp = invRows.map(r=>{ const o=ordMap[r.item_name]||{}; return Object.assign({}, r, {dg:o.dg||0, qs:o.qs||0}); });
  const snapDt=allExp.length&&allExp[0].snap_dt?allExp[0].snap_dt.substring(0,10):'';
  if(snapDt) document.getElementById('expSnapshotDate').textContent='Snapshot: '+snapDt;
  const cnts={ALL:allExp.length,EXPIRED:0,'0-30 days':0,'31-60 days':0,'61-90 days':0};
  allExp.forEach(r=>{ if(cnts[r.bucket]!==undefined) cnts[r.bucket]++; });
  document.getElementById('expBadge').textContent=allExp.length+' items';
  document.querySelectorAll('#tabBar .tab').forEach(t=>{
    t.textContent=t.textContent.replace(/\s*\(\d+\)$/,'')+` (${cnts[t.dataset.b]||0})`;
  });
  renderExp(curBucket);
}

function renderExp(bucket){
  curBucket=bucket;
  const data=bucket==='ALL'?allExp:allExp.filter(r=>r.bucket===bucket);
  const tbody=document.getElementById('expBody');
  if(!data.length){ tbody.innerHTML='<tr><td colspan="9" class="empty">No items in this category</td></tr>'; return; }
  tbody.innerHTML=data.map(r=>{
    const d=r.dte, ec=d<0?'exp-crit':d<=7?'exp-crit':d<=30?'exp-warn':'exp-ok';
    const dl=d<0?`${Math.abs(d)}d ago`:`${d}d`;
    const disc=(r.dg||0)>0;
    const badge=r.bucket==='EXPIRED'?'<span class="s-exp">EXPIRED</span>':disc?'<span class="s-disc">Discounted</span>':'<span class="s-none">No Discount</span>';
    const stockLabel=(r.bal_sale!=null&&r.uom)?`${Math.round(r.bal_sale).toLocaleString()} <span style="font-size:10px;color:var(--faint);">${esc(r.uom)}</span>`:(r.bal_sale!=null?Math.round(r.bal_sale).toLocaleString():'—');
    const invVal=(r.inv_value&&r.inv_value>0)?'PKR '+N(r.inv_value):'—';
    return `<tr><td><strong>${esc(r.item_name)||'—'}</strong></td><td>${esc(r.wh)||'—'}</td>
      <td class="num"><span class="${ec}">${dl}</span></td><td>${r.exp?r.exp.substring(0,10):'—'}</td>
      <td class="num">${stockLabel}</td><td class="num" style="font-weight:600;">${invVal}</td>
      <td class="num">${(r.qs||0).toLocaleString()}</td>
      <td class="num" style="font-weight:600;">${disc?'PKR '+N(r.dg):'—'}</td><td>${badge}</td></tr>`;
  }).join('');
}

export function switchTab(btn){
  document.querySelectorAll('#tabBar .tab').forEach(t=>t.classList.remove('on'));
  btn.classList.add('on'); renderExp(btn.dataset.b);
}
