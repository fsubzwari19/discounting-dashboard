import { q } from '../api.js';
import { stWhere } from '../filters.js';
import { N, esc, downloadCSV } from '../util.js';

const ORD_PAGE_SIZE=200; let ordPage=0, allOrderRows=[], ordHasMore=false;
const ordSd=()=>document.getElementById('ord_sd').value;
const ordEd=()=>document.getElementById('ord_ed').value;

function validateOrdRange(){
  const s=new Date(ordSd()),e=new Date(ordEd()),days=(e-s)/(864e5);
  if(days<0){document.getElementById('ordErrMsg').textContent='Start must be before end.';return false;}
  if(days>92){document.getElementById('ordErrMsg').textContent='Max range is 3 months.';return false;}
  document.getElementById('ordErrMsg').textContent=''; return true;
}

export async function loadOrders(reset){
  if(reset===undefined) reset=true;
  if(!validateOrdRange()) return;
  if(reset){ ordPage=0; allOrderRows=[]; }
  const offset=ordPage*ORD_PAGE_SIZE;
  if(reset){
    document.getElementById('orderBody').innerHTML='<tr><td colspan="9"><div class="spin-wrap"><span class="spin"></span>Loading…</div></td></tr>';
    document.getElementById('ordLoadMoreBtn').style.display='none';
    document.getElementById('ordCountMsg').textContent='';
  }
  try {
    const rows=await q(`
      SELECT order_number, ord_date, wh, st, bd, id, td, gmv, dp
      FROM (
        SELECT order_number,
          CAST(order_date AS VARCHAR) AS ord_date,
          order_warehouse AS wh, store_type_order AS st,
          COALESCE(basket_discount,0) AS bd,
          COALESCE(item_discount,0) AS id,
          COALESCE(basket_discount,0)+COALESCE(item_discount,0) AS td,
          gross_gmv AS gmv,
          ROUND((COALESCE(basket_discount,0)+COALESCE(item_discount,0))/NULLIF(gross_gmv,0)*100,2) AS dp,
          ROW_NUMBER() OVER (ORDER BY order_date DESC, order_number) AS rn
        FROM hive.bazaar_biz_silver.order_booked
        WHERE partition_key >= DATE '2026-06-01'
          AND order_date >= DATE '${ordSd()}' AND order_date <= DATE '${ordEd()}'
          AND order_status NOT IN ('CANCELLED')
          AND (COALESCE(basket_discount,0)+COALESCE(item_discount,0)) > 0
          ${stWhere('store_type_order')}
      ) t
      WHERE rn > ${offset} AND rn <= ${offset + ORD_PAGE_SIZE + 1}
      ORDER BY rn
    `);
    if(!rows) return;
    ordHasMore = rows.length > ORD_PAGE_SIZE;
    allOrderRows = allOrderRows.concat(ordHasMore ? rows.slice(0,ORD_PAGE_SIZE) : rows);
    ordPage++; renderOrders();
    document.getElementById('ordLoadMoreBtn').style.display = ordHasMore?'inline-flex':'none';
    document.getElementById('orderBadge').textContent = allOrderRows.length+(ordHasMore?'+':'')+' orders';
    document.getElementById('ordCountMsg').textContent = ordHasMore
      ? `Showing ${allOrderRows.length} orders — more available`
      : `${allOrderRows.length} orders total`;
  } catch(e) {
    document.getElementById('orderBody').innerHTML=`<tr><td colspan="9" class="empty" style="color:#b91c1c;">Error: ${esc(e.message)}</td></tr>`;
  }
}

function renderOrders(){
  const tbody=document.getElementById('orderBody');
  if(!allOrderRows.length){ tbody.innerHTML='<tr><td colspan="9" class="empty">No discounted orders found</td></tr>'; return; }
  tbody.innerHTML=allOrderRows.map(r=>{
    const p=r.dp||0,cls=p>=15?'high':p>=7?'med':'low';
    return `<tr>
      <td style="font-family:monospace;font-size:12px;">${esc(r.order_number)||'—'}</td>
      <td>${r.ord_date?r.ord_date.substring(0,10):'—'}</td>
      <td>${esc(r.wh)||'—'}</td>
      <td><span class="st-pill">${esc(r.st)||'—'}</span></td>
      <td class="num">PKR ${N(r.bd)}</td><td class="num">PKR ${N(r.id)}</td>
      <td class="num" style="font-weight:700;">PKR ${N(r.td)}</td>
      <td class="num">${r.gmv!=null?'PKR '+N(r.gmv):'—'}</td>
      <td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill bar-${cls}" style="width:${Math.min(p*4,100)}%"></div></div><span class="pct-txt pct-${cls}">${p.toFixed(1)}%</span></div></td>
    </tr>`;
  }).join('');
}

export function exportOrderCSV(){
  if(!allOrderRows.length){ alert('No data loaded yet. Click Load first.'); return; }
  const cols=['order_number','ord_date','wh','st','bd','id','td','gmv','dp'];
  const hdrs=['Order Number','Date','Warehouse','Store Type','Basket Discount','Item Discount','Total Discount','GMV','Disc %'];
  downloadCSV([hdrs].concat(allOrderRows.map(r=>cols.map(c=>r[c]==null?'':r[c]))),
    `discounted_orders_${ordSd()}_to_${ordEd()}.csv`);
}
