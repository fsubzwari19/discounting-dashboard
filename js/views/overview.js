import { q } from '../api.js';
import { sd, ed, stWhere } from '../filters.js';
import { N, P } from '../util.js';

let tCI=null, sCI=null;

export async function loadTrend(){
  const rows=await q(`
    SELECT CAST(order_date AS VARCHAR) AS d,
      COUNT(DISTINCT order_number) AS orders,
      COUNT(DISTINCT CASE WHEN (COALESCE(basket_discount,0)+COALESCE(item_discount,0))>0 THEN order_number END) AS disc_orders,
      SUM(COALESCE(basket_discount,0)) AS bd,
      SUM(COALESCE(item_discount,0)) AS id,
      SUM(COALESCE(basket_discount,0)+COALESCE(item_discount,0)) AS td,
      SUM(gross_gmv) AS gmv
    FROM hive.bazaar_biz_silver.order_booked
    WHERE partition_key >= DATE '2026-06-01'
      AND order_date >= DATE '${sd()}' AND order_date <= DATE '${ed()}'
      AND order_status NOT IN ('CANCELLED')
      ${stWhere('store_type_order')}
    GROUP BY 1 ORDER BY 1
  `);
  if(!rows.length) return;
  const tBd=rows.reduce((s,r)=>s+(r.bd||0),0), tId=rows.reduce((s,r)=>s+(r.id||0),0);
  const tTd=rows.reduce((s,r)=>s+(r.td||0),0), tGmv=rows.reduce((s,r)=>s+(r.gmv||0),0);
  const tOrd=rows.reduce((s,r)=>s+(r.orders||0),0), tDO=rows.reduce((s,r)=>s+(r.disc_orders||0),0);
  const dPct=tGmv>0?tTd/tGmv*100:0;
  document.getElementById('kpiRow').innerHTML=`
    <div class="kpi"><div class="lbl">Total Discount</div><div class="val">PKR ${N(tTd)}</div><div class="sub">PKR ${Math.round(tTd).toLocaleString()}</div></div>
    <div class="kpi"><div class="lbl">Basket Discount</div><div class="val">PKR ${N(tBd)}</div><div class="sub">${P(tGmv>0?tBd/tGmv*100:0)} of GMV</div></div>
    <div class="kpi"><div class="lbl">Item Discount</div><div class="val">PKR ${N(tId)}</div><div class="sub">${P(tGmv>0?tId/tGmv*100:0)} of GMV</div></div>
    <div class="kpi ${dPct>=5?'alert':''}"><div class="lbl">Discount % of GMV</div><div class="val">${P(dPct)}</div><div class="sub">GMV: PKR ${N(tGmv)}</div></div>
    <div class="kpi"><div class="lbl">Discounted Orders</div><div class="val">${tDO.toLocaleString()}</div><div class="sub">of ${tOrd.toLocaleString()} · ${P(tOrd>0?tDO/tOrd*100:0)}</div></div>`;
  document.getElementById('trendBadge').textContent=rows.length+' days';
  const ctx=document.getElementById('trendChart').getContext('2d');
  if(tCI) tCI.destroy();
  tCI=new Chart(ctx,{type:'line',data:{
    labels:rows.map(r=>r.d?r.d.substring(5,10):''),
    datasets:[
      {label:'Total Discount',data:rows.map(r=>Math.round(r.td||0)),borderColor:'#1F5375',backgroundColor:'rgba(73,151,208,.12)',fill:true,tension:.35,pointRadius:3,borderWidth:2.5,yAxisID:'y'},
      {label:'Item Discount',data:rows.map(r=>Math.round(r.id||0)),borderColor:'#f97316',fill:false,tension:.35,pointRadius:3,borderWidth:2,yAxisID:'y'},
      {label:'Basket Discount',data:rows.map(r=>Math.round(r.bd||0)),borderColor:'#10b981',fill:false,tension:.35,pointRadius:3,borderWidth:2,borderDash:[5,3],yAxisID:'y'},
      {label:'Discounted Orders',data:rows.map(r=>r.disc_orders||0),borderColor:'#a855f7',fill:false,tension:.35,pointRadius:3,borderWidth:2,borderDash:[4,2],yAxisID:'y1'}
    ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
    plugins:{legend:{position:'bottom',labels:{font:{size:11},padding:10}},tooltip:{callbacks:{label:c=>c.dataset.yAxisID==='y1'?` ${c.dataset.label}: ${c.raw.toLocaleString()} orders`:` ${c.dataset.label}: PKR ${c.raw.toLocaleString()}`}}},
    scales:{
      y:{position:'left',ticks:{callback:v=>'PKR '+(v>=1e6?(v/1e6).toFixed(1)+'M':(v>=1e3?(v/1e3).toFixed(0)+'K':v)),font:{size:10}},grid:{color:'#f1f5f9'}},
      y1:{position:'right',ticks:{callback:v=>v>=1e3?(v/1e3).toFixed(1)+'K':v,font:{size:10},color:'#a855f7'},grid:{drawOnChartArea:false}},
      x:{ticks:{font:{size:10}},grid:{display:false}}
    }}});
}

export async function loadStore(){
  const rows=await q(`
    SELECT store_type_order AS st,
      SUM(COALESCE(basket_discount,0)+COALESCE(item_discount,0)) AS td
    FROM hive.bazaar_biz_silver.order_booked
    WHERE partition_key >= DATE '2026-06-01'
      AND order_date >= DATE '${sd()}' AND order_date <= DATE '${ed()}'
      AND order_status NOT IN ('CANCELLED') ${stWhere('store_type_order')}
    GROUP BY 1 HAVING SUM(COALESCE(basket_discount,0)+COALESCE(item_discount,0))>0
    ORDER BY SUM(COALESCE(basket_discount,0)+COALESCE(item_discount,0)) DESC LIMIT 10
  `);
  if(!rows.length) return;
  const pal=['#1F5375','#4997D0','#f97316','#10b981','#a855f7','#ef4444','#f59e0b','#06b6d4','#64748b','#84cc16'];
  const ctx=document.getElementById('storeChart').getContext('2d');
  if(sCI) sCI.destroy();
  sCI=new Chart(ctx,{type:'doughnut',data:{
    labels:rows.map(r=>r.st||'Unknown'),
    datasets:[{data:rows.map(r=>Math.round(r.td||0)),backgroundColor:pal,borderWidth:2,borderColor:'#fff'}]
  },options:{responsive:true,maintainAspectRatio:false,cutout:'60%',
    plugins:{legend:{position:'bottom',labels:{font:{size:10},padding:6,boxWidth:10}},tooltip:{callbacks:{label:c=>` ${c.label}: PKR ${c.raw.toLocaleString()}`}}}}});
}
