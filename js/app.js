const VIEW_META = {
  overview : ['Overview',           'Basket &amp; item discounts · live from Trino'],
  breakdown: ['Breakdown',          'Discount by warehouse and SKU'],
  orders   : ['Orders',             'Order level discount detail'],
  expiry   : ['Expiry',             'Near-expiry inventory and discount linkage'],
  tradeplan: ['Trade Plan History', 'MOQ, rate and MIX changes over time'],
};
let curView = 'overview';
function go(el){
  const v = el.dataset.view;
  curView = v;
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('on', n===el));
  document.querySelectorAll('.view').forEach(s=>s.classList.toggle('on', s.id==='view-'+v));
  const meta = VIEW_META[v];
  document.getElementById('viewTitle').textContent = meta[0];
  document.getElementById('viewSub').innerHTML = meta[1];
  const isTP = v==='tradeplan';
  document.getElementById('globalControls').style.display = isTP ? 'none' : 'flex';
  document.getElementById('tpControls').style.display     = isTP ? 'flex' : 'none';
  if(isTP && !tpRows.length) loadTradePlan();
}

const STORE_TYPES = [
  {v:'BUYER',label:'Buyer',cnt:19726},
  {v:'SELF_SERVICE_STORE_PRIME',label:'Self-Service Prime',cnt:16031},
  {v:'HOUSEHOLD',label:'Household',cnt:3039},
  {v:'DIGITAL_BUYER',label:'Digital Buyer',cnt:1089},
  {v:'OFFICES_INSTITUTIONS',label:'Offices & Institutions',cnt:339},
  {v:'GENERAL_STORE',label:'General Store',cnt:293},
  {v:'CORPORATE',label:'Corporate',cnt:183},
  {v:'WHOLE_SELLER_PRIME',label:'Wholesaler Prime',cnt:151},
  {v:'TEXTILE',label:'Textile',cnt:128},
  {v:'CORPORATE_BUYER',label:'Corporate Buyer',cnt:109},
  {v:'TRADER',label:'Trader',cnt:96},
  {v:'PAINT_MANUFACTURERS',label:'Paint Manufacturers',cnt:52},
  {v:'PAPER_N_PACKAGING',label:'Paper & Packaging',cnt:32},
  {v:'WHOLE_SELLER',label:'Wholesaler',cnt:27},
  {v:'HORECA',label:'HoReCa',cnt:17},
  {v:'CHEMICAL_MANUFACTURER',label:'Chemical Manufacturer',cnt:12},
  {v:'CONFECTIONARY',label:'Confectionary',cnt:10},
  {v:'INDUSTRIAL',label:'Industrial',cnt:8},
];
(function buildMsItems(){
  document.getElementById('msItems').innerHTML = STORE_TYPES.map(st=>`
    <div class="ms-item">
      <input type="checkbox" class="st-cb" id="cb_${st.v}" value="${st.v}" onchange="updateMsLabel()">
      <label for="cb_${st.v}">${st.label}</label>
      <span class="ms-cnt">${st.cnt.toLocaleString()}</span>
    </div>`).join('');
})();
function toggleMsDropdown(){
  document.getElementById('msBtn').classList.toggle('open');
  document.getElementById('msDropdown').classList.toggle('open');
}
document.addEventListener('click', e=>{
  if(!document.getElementById('msWrap').contains(e.target)){
    document.getElementById('msBtn').classList.remove('open');
    document.getElementById('msDropdown').classList.remove('open');
  }
});
function msSelectAll(){ document.querySelectorAll('.st-cb').forEach(cb=>cb.checked=true); updateMsLabel(); }
function msClearAll(){ document.querySelectorAll('.st-cb').forEach(cb=>cb.checked=false); updateMsLabel(); }
function updateMsLabel(){
  const checked=[...document.querySelectorAll('.st-cb:checked')];
  const lbl=document.getElementById('msBtnLabel'), btn=document.getElementById('msBtn');
  const ex=btn.querySelector('.ms-count'); if(ex) ex.remove();
  if(checked.length===0){ lbl.textContent='All Store Types'; }
  else {
    lbl.textContent='Store Types';
    const b=document.createElement('span'); b.className='ms-count'; b.textContent=checked.length;
    btn.insertBefore(b,btn.querySelector('.ms-arrow'));
  }
}
function stWhere(col){
  col=col||'store_type_order';
  const checked=[...document.querySelectorAll('.st-cb:checked')].map(cb=>`'${cb.value}'`);
  return checked.length>0?`AND ${col} IN (${checked.join(',')})`: '';
}

let tCI=null, sCI=null, allExp=[], curBucket='ALL';
const N=n=>n==null?'—':Math.abs(n)>=1e6?(n/1e6).toFixed(1)+'M':Math.abs(n)>=1e3?(n/1e3).toFixed(0)+'K':Math.round(n).toLocaleString();
const P=n=>n==null?'—':n.toFixed(1)+'%';
const sd=()=>document.getElementById('sd').value;
const ed=()=>document.getElementById('ed').value;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function validateRange(){
  const s=new Date(sd()),e=new Date(ed()),days=(e-s)/(864e5);
  if(days>90){showErr('Date range cannot exceed 90 days.');return false;}
  if(days<0){showErr('Start date must be before end date.');return false;}
  hideErr();return true;
}
function showErr(m){const b=document.getElementById('errBanner');b.textContent=m;b.style.display='block';}
function hideErr(){document.getElementById('errBanner').style.display='none';}
function setStatus(m){document.getElementById('statusMsg').textContent=m;}

async function q(sql){
  const res=await fetch('/api/query',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({query:sql})
  });
  if(res.status===401){ window.location.replace('/login.html'); return []; }
  if(!res.ok){ throw new Error(await res.text() || `HTTP ${res.status}`); }
  return await res.json();
}

const REFRESH_SECS=30*60; let secsLeft=REFRESH_SECS, autoTimer=null;
function startCountdown(){
  clearInterval(autoTimer); secsLeft=REFRESH_SECS;
  autoTimer=setInterval(()=>{
    secsLeft--;
    const m=String(Math.floor(secsLeft/60)).padStart(2,'0'), s=String(secsLeft%60).padStart(2,'0');
    document.getElementById('countdown').textContent=`${m}:${s}`;
    if(secsLeft<=0){ loadAll(); }
  },1000);
}

async function loadTrend(){
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

async function loadStore(){
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

async function loadWH(){
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

async function loadSKUs(){
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

async function loadExpiry(){
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
function switchTab(btn){
  document.querySelectorAll('#tabBar .tab').forEach(t=>t.classList.remove('on'));
  btn.classList.add('on'); renderExp(btn.dataset.b);
}

async function loadAll(){
  if(!validateRange()) return;
  const btn=document.getElementById('refBtn');
  btn.disabled=true; setStatus('Loading data…');
  document.getElementById('kpiRow').innerHTML=
    ['Total Discount','Basket Discount','Item Discount','Discount % of GMV','Discounted Orders']
    .map(l=>`<div class="kpi"><div class="lbl">${l}</div><div class="val sk" style="height:28px;width:100px;margin-bottom:6px;"></div></div>`).join('');
  ['whBody','skuBody','expBody'].forEach(id=>{
    document.getElementById(id).innerHTML='<tr><td colspan="9"><div class="spin-wrap"><span class="spin"></span>Loading…</div></td></tr>';
  });
  try {
    await Promise.all([loadTrend(),loadStore(),loadWH(),loadSKUs(),loadExpiry()]);
    document.getElementById('lastUp').textContent='Updated '+new Date().toLocaleTimeString();
    setStatus(''); startCountdown();
  } catch(e) { showErr('Error loading data: '+e.message); setStatus(''); }
  finally { btn.disabled=false; }
}

const ORD_PAGE_SIZE=200; let ordPage=0, allOrderRows=[], ordHasMore=false;
const ordSd=()=>document.getElementById('ord_sd').value;
const ordEd=()=>document.getElementById('ord_ed').value;

function validateOrdRange(){
  const s=new Date(ordSd()),e=new Date(ordEd()),days=(e-s)/(864e5);
  if(days<0){document.getElementById('ordErrMsg').textContent='Start must be before end.';return false;}
  if(days>92){document.getElementById('ordErrMsg').textContent='Max range is 3 months.';return false;}
  document.getElementById('ordErrMsg').textContent=''; return true;
}

async function loadOrders(reset){
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

function downloadCSV(rows, filename){
  const csv=rows.map(r=>r.map(v=>{
    const s=String(v==null?'':v);
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }).join(',')).join('\n');
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
  a.download=filename; a.click();
}

function exportOrderCSV(){
  if(!allOrderRows.length){ alert('No data loaded yet. Click Load first.'); return; }
  const cols=['order_number','ord_date','wh','st','bd','id','td','gmv','dp'];
  const hdrs=['Order Number','Date','Warehouse','Store Type','Basket Discount','Item Discount','Total Discount','GMV','Disc %'];
  downloadCSV([hdrs].concat(allOrderRows.map(r=>cols.map(c=>r[c]==null?'':r[c]))),
    `discounted_orders_${ordSd()}_to_${ordEd()}.csv`);
}

let tpRows=[], tpDates=[], tpMetric='moq';
const TP_FIXED_W=[120,320,170,160];
const TP_DATE_W=96;
let tpColW=[];
const tpSd=()=>document.getElementById('tp_sd').value;
const tpEd=()=>document.getElementById('tp_ed').value;

function setMetric(btn){
  tpMetric=btn.dataset.m;
  document.querySelectorAll('#tpSeg button').forEach(b=>b.classList.toggle('on', b===btn));
  renderTradePlan();
}
function tpShowErr(m){ const b=document.getElementById('tpErr'); b.textContent=m; b.style.display='block'; }
function tpHideErr(){ document.getElementById('tpErr').style.display='none'; }

async function loadTradePlan(){
  const from=tpSd(), to=tpEd();
  if(!from||!to){ tpShowErr('Pick both dates.'); return; }
  const days=(new Date(to)-new Date(from))/864e5;
  if(days<0){ tpShowErr('Start must be on or before end.'); return; }
  if(days>90){ tpShowErr('Range cannot exceed 90 days.'); return; }
  tpHideErr();
  const btn=document.getElementById('tpBtn');
  btn.disabled=true;
  document.getElementById('tpWrap').innerHTML='<div class="spin-wrap"><span class="spin"></span>Loading plan history…</div>';
  try{
    const res=await fetch('/api/tradeplan',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({from:from,to:to})
    });
    if(res.status===401){ window.location.replace('/login.html'); return; }
    if(!res.ok){
      let msg=null;
      try{ msg=(await res.json()).error; }catch(err){ msg=null; }
      throw new Error(msg||('HTTP '+res.status));
    }
    tpRows=await res.json();
    tpDates=Array.from(new Set(tpRows.map(r=>String(r.plan_date).substring(0,10)))).sort();
    const sel=document.getElementById('tp_city'), keep=sel.value;
    const cities=Array.from(new Set(tpRows.map(r=>r.city_raw).filter(Boolean))).sort();
    sel.innerHTML='<option value="">All cities</option>'+cities.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if(cities.indexOf(keep)>=0) sel.value=keep;
    renderTradePlan();
  }catch(e){
    document.getElementById('tpWrap').innerHTML=`<div class="empty" style="color:#b91c1c;">${esc(e.message)}</div>`;
    document.getElementById('tpBadge').textContent='—';
  }finally{ btn.disabled=false; }
}

function tpFmt(v){
  if(v==null||v==='') return '—';
  if(typeof v==='number') return v.toLocaleString();
  const n=Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : String(v);
}

function tpGroup(cityF){
  const map=new Map();
  for(const r of tpRows){
    if(cityF && r.city_raw!==cityF) continue;
    const key=r.city_raw+'||'+r.sku_name;
    if(!map.has(key)){
      map.set(key,{ city:r.city_raw, sku:r.sku_name, vendor:r.vendor,
                    brand:r.parent_brand, cat:r.core_category, days:{} });
    }
    map.get(key).days[String(r.plan_date).substring(0,10)]=r;
  }
  return Array.from(map.values()).sort((a,b)=>
    (a.city||'').localeCompare(b.city||'') || (a.sku||'').localeCompare(b.sku||''));
}

function renderTradePlan(){
  const wrap=document.getElementById('tpWrap');
  if(!tpRows.length){ wrap.innerHTML='<div class="empty">Pick a date range and click Load ↻</div>'; return; }
  const cityF=document.getElementById('tp_city').value;
  const search=document.getElementById('tp_search').value.trim().toLowerCase();
  const only=document.getElementById('tp_changed').checked;
  const m=tpMetric;
  let rows=tpGroup(cityF);
  if(search){
    rows=rows.filter(r=>
      (r.sku||'').toLowerCase().indexOf(search)>=0 ||
      (r.brand||'').toLowerCase().indexOf(search)>=0 ||
      (r.vendor||'').toLowerCase().indexOf(search)>=0 ||
      (r.cat||'').toLowerCase().indexOf(search)>=0);
  }
  const changed=function(r){
    let prev=null, moved=false;
    for(const d of tpDates){
      const rec=r.days[d]; if(!rec) continue;
      const open=rec[m+'_open'], close=rec[m+'_close'];
      if((rec[m+'_variants']||0)>1 && String(open)!==String(close)) moved=true;
      if(prev!=null && String(close)!==String(prev)) moved=true;
      if(close!=null) prev=close;
    }
    return moved;
  };
  if(only) rows=rows.filter(changed);
  document.getElementById('tpBadge').textContent=rows.length+' SKUs · '+tpDates.length+' days';
  if(!rows.length){ wrap.innerHTML='<div class="empty">Nothing matches those filters</div>'; return; }
  const widths=[...TP_FIXED_W,...tpDates.map(()=>TP_DATE_W)].map((w,i)=>tpColW[i]||w);
  const cols='<colgroup>'+widths.map(w=>`<col style="width:${w}px">`).join('')+'</colgroup>';
  const head='<thead><tr>'+
    '<th class="f">City</th>'+'<th class="f">SKU</th>'+'<th class="f">Parent Brand</th>'+'<th class="f f-last">Core Category</th>'+
    tpDates.map(d=>`<th style="text-align:right;">${d.substring(8,10)}/${d.substring(5,7)}</th>`).join('')+
    '</tr></thead>';
  const body=rows.map(r=>{
    let prev=null;
    const cells=tpDates.map(d=>{
      const rec=r.days[d];
      if(!rec) return '<td class="tp-cell tp-empty">·</td>';
      const open=rec[m+'_open'], close=rec[m+'_close'], variants=rec[m+'_variants']||0;
      if(open==null && close==null) return '<td class="tp-cell tp-empty">·</td>';
      const intraday=variants>1 && String(open)!==String(close);
      const dod=prev!=null && String(close)!==String(prev);
      prev=close!=null?close:prev;
      const cls='tp-cell'+(intraday?' tp-intraday':'')+(dod&&!intraday?' tp-dod':'');
      const inner=intraday
        ?`<span class="tp-old">${tpFmt(open)}</span><span class="tp-arrow">→</span><span class="tp-new">${tpFmt(close)}</span>`
        :tpFmt(close);
      return `<td class="${cls}">${inner}</td>`;
    }).join('');
    return '<tr>'+
      `<td class="f">${esc(r.city)||'—'}</td>`+
      `<td class="f tp-sku" title="${esc(r.sku)}">${esc(r.sku)||'—'}</td>`+
      `<td class="f tp-meta" title="${esc(r.brand)}">${esc(r.brand)||'—'}</td>`+
      `<td class="f f-last tp-meta" title="${esc(r.cat)}">${esc(r.cat)||'—'}</td>`+
      cells+'</tr>';
  }).join('');
  wrap.innerHTML='<table class="tp">'+cols+head+'<tbody>'+body+'</tbody></table>';
  const table=wrap.querySelector('table.tp');
  attachResizers(table);
  layoutFrozen();
}

function layoutFrozen(){
  const table=document.querySelector('#tpWrap table.tp');
  if(!table) return;
  const headF=[...table.querySelectorAll('thead th.f')];
  let acc=0;
  const lefts=headF.map(th=>{ const l=acc; acc+=th.getBoundingClientRect().width; return l; });
  headF.forEach((th,i)=>{ th.style.left=lefts[i]+'px'; });
  table.querySelectorAll('tbody tr').forEach(tr=>{
    [...tr.querySelectorAll('td.f')].forEach((td,i)=>{ td.style.left=lefts[i]+'px'; });
  });
}

function attachResizers(table){
  const cols=[...table.querySelectorAll('colgroup col')];
  [...table.querySelectorAll('thead th')].forEach((th,i)=>{
    const rz=document.createElement('div');
    rz.className='rz';
    th.appendChild(rz);
    rz.addEventListener('mousedown',e=>{
      e.preventDefault(); e.stopPropagation();
      const startX=e.pageX, startW=th.getBoundingClientRect().width;
      rz.classList.add('dragging'); document.body.classList.add('resizing');
      const move=ev=>{ const w=Math.max(56,Math.round(startW+(ev.pageX-startX))); if(cols[i]) cols[i].style.width=w+'px'; tpColW[i]=w; layoutFrozen(); };
      const up=()=>{ rz.classList.remove('dragging'); document.body.classList.remove('resizing'); document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up); };
      document.addEventListener('mousemove',move);
      document.addEventListener('mouseup',up);
    });
    rz.addEventListener('dblclick',e=>{
      e.preventDefault(); e.stopPropagation();
      const def=i<TP_FIXED_W.length?TP_FIXED_W[i]:TP_DATE_W;
      if(cols[i]) cols[i].style.width=def+'px';
      tpColW[i]=def; layoutFrozen();
    });
  });
}

function exportTradePlanCSV(){
  if(!tpRows.length){ alert('Load the plan history first.'); return; }
  const m=tpMetric;
  const rows=tpGroup(document.getElementById('tp_city').value);
  const hdrs=['City','SKU Name / Particular','Parent Brand','Core Category'].concat(tpDates);
  const out=[hdrs];
  for(const r of rows){
    out.push([r.city,r.sku,r.brand,r.cat].concat(tpDates.map(d=>{
      const rec=r.days[d]; if(!rec) return '';
      const open=rec[m+'_open'], close=rec[m+'_close'];
      const intraday=(rec[m+'_variants']||0)>1 && String(open)!==String(close);
      return intraday?(open+' -> '+close):(close==null?'':close);
    })));
  }
  downloadCSV(out,`tradeplan_${m}_${tpSd()}_to_${tpEd()}.csv`);
}

window.addEventListener('resize',()=>{ if(curView==='tradeplan') layoutFrozen(); });

window.addEventListener('load', async ()=>{
  // ── Auth check: redirect to login if no valid session ──
  try {
    const meRes = await fetch('/api/me');
    if (!meRes.ok) { window.location.replace('/login.html'); return; }
    const { email } = await meRes.json();
    document.getElementById('userName').textContent = email;
  } catch(e) {
    window.location.replace('/login.html');
    return;
  }

  const today=new Date(), fmt=d=>d.toISOString().split('T')[0];
  const start=new Date(today); start.setDate(today.getDate()-29);
  document.getElementById('ed').value=fmt(today);
  document.getElementById('sd').value=fmt(start);

  const ordStart=new Date(today); ordStart.setDate(today.getDate()-7);
  document.getElementById('ord_ed').value=fmt(today);
  document.getElementById('ord_sd').value=fmt(ordStart);

  const tpStart=new Date(today); tpStart.setDate(today.getDate()-6);
  document.getElementById('tp_ed').value=fmt(today);
  document.getElementById('tp_sd').value=fmt(tpStart);

  loadAll();
});
