import { q } from '../api.js';
import { sd, ed, stWhere } from '../filters.js';
import { N, esc } from '../util.js';

export async function loadWH(){
  const rows=await q(`
    SELECT order_warehouse AS wh, store_type_order AS st,
      COUNT(DISTINCT order_number) AS ord,
      SUM(COALESCE(basket_discount,0)) AS bd,
      SUM(COALESCE(item_discount,0)) AS id,
      SUM(COALESCE(basket_discount,0)+COALESCE(item_discount,0)) AS td,
      SUM(gross_gmv) AS gmv,
      ROUND((SUM(COALESCE(basket_discount,0))+SUM(COALESCE(item_discount,0)))/NULLIF(SUM(gross_gmv),0)*100,2) AS dp
    FROM hive.bazaar_biz_silver.order_booked
    WHERE partition_key >= DATE '2026-06-01'
      AND order_date >= DATE '${sd()}' AND order_date <= DATE '${ed()}'
      AND order_status NOT IN ('CANCELLED') ${stWhere('store_type_order')}
    GROUP BY 1,2 HAVING SUM(COALESCE(basket_discount,0)+COALESCE(item_discount,0))>0
    ORDER BY SUM(COALESCE(basket_discount,0)+COALESCE(item_discount,0)) DESC LIMIT 60
  `);
  document.getElementById('whBadge').textContent=rows.length+' rows';
  const mx=Math.max(...rows.map(r=>r.td||0));
  document.getElementById('whBody').innerHTML=rows.length?rows.map(r=>{
    const p=r.dp||0,cls=p>=15?'high':p>=7?'med':'low',bw=mx>0?Math.round((r.td||0)/mx*100):0;
    return `<tr><td><strong>${esc(r.wh)||'—'}</strong></td><td><span class="st-pill">${esc(r.st)||'—'}</span></td>
      <td class="num">${(r.ord||0).toLocaleString()}</td><td class="num">PKR ${N(r.bd)}</td>
      <td class="num">PKR ${N(r.id)}</td><td class="num" style="font-weight:700;">PKR ${N(r.td)}</td>
      <td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill bar-${cls}" style="width:${bw}%"></div></div><span class="pct-txt pct-${cls}">${p.toFixed(1)}%</span></div></td></tr>`;
  }).join(''):'<tr><td colspan="7" class="empty">No data for selection</td></tr>';
}

export async function loadSKUs(){
  const rows=await q(`
    SELECT item_name, order_warehouse AS wh, store_type_order AS st,
      COUNT(DISTINCT order_number) AS ord, SUM(ordered_quantity) AS qty,
      SUM(item_discount) AS id, SUM(gross_gmv) AS gmv,
      ROUND(SUM(item_discount)/NULLIF(SUM(gross_gmv),0)*100,2) AS dp
    FROM hive.bazaar_biz_silver.order_item_booked
    WHERE partition_key >= DATE '2026-06-01'
      AND order_date >= DATE '${sd()}' AND order_date <= DATE '${ed()}'
      AND order_status NOT IN ('CANCELLED') AND item_discount>0 ${stWhere('store_type_order')}
    GROUP BY 1,2,3 ORDER BY id DESC LIMIT 30
  `);
  document.getElementById('skuBadge').textContent='Top '+rows.length;
  document.getElementById('skuBody').innerHTML=rows.length?rows.map((r,i)=>{
    const p=r.dp||0,cls=p>=20?'high':p>=10?'med':'low';
    return `<tr><td style="color:var(--faint);font-size:11px;font-weight:700;">${i+1}</td>
      <td><strong>${esc(r.item_name)||'—'}</strong></td><td>${esc(r.wh)||'—'}</td>
      <td><span class="st-pill">${esc(r.st)||'—'}</span></td>
      <td class="num">${(r.ord||0).toLocaleString()}</td><td class="num">${(r.qty||0).toLocaleString()}</td>
      <td class="num" style="font-weight:700;color:var(--pri-dd);">PKR ${N(r.id)}</td>
      <td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill bar-${cls}" style="width:${Math.min(p*3,100)}%"></div></div><span class="pct-txt pct-${cls}">${p.toFixed(1)}%</span></div></td></tr>`;
  }).join(''):'<tr><td colspan="8" class="empty">No data for selection</td></tr>';
}
