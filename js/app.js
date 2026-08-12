// Entry module: hash-routed view shell, orchestration, and bridge that exposes
// the handlers referenced by inline on* attributes onto window.
import { validateRange, setStatus, showErr,
         toggleMsDropdown, msSelectAll, msClearAll, updateMsLabel } from './filters.js';
import { loadTrend, loadStore } from './views/overview.js';
import { loadWH, loadSKUs } from './views/breakdown.js';
import { loadExpiry, switchTab } from './views/expiry.js';
import { loadOrders, exportOrderCSV } from './views/orders.js';
import { loadTradePlan, renderTradePlan, setMetric,
         exportTradePlanCSV, layoutFrozen, tpLoaded } from './views/tradeplan.js';

const VIEW_META = {
  overview : ['Overview',           'Basket &amp; item discounts · live from Trino'],
  breakdown: ['Breakdown',          'Discount by warehouse and SKU'],
  orders   : ['Orders',             'Order level discount detail'],
  expiry   : ['Expiry',             'Near-expiry inventory and discount linkage'],
  tradeplan: ['Trade Plan History', 'MOQ, rate and MIX changes over time'],
};

let curView = 'overview';

// Switch the visible section. Pure DOM work — routing decides when to call it.
function activate(v){
  if(!VIEW_META[v]) v = 'overview';
  curView = v;
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('on', n.dataset.view===v));
  document.querySelectorAll('.view').forEach(s=>s.classList.toggle('on', s.id==='view-'+v));
  const meta = VIEW_META[v];
  document.getElementById('viewTitle').textContent = meta[0];
  document.getElementById('viewSub').innerHTML = meta[1];
  const isTP = v==='tradeplan';
  document.getElementById('globalControls').style.display = isTP ? 'none' : 'flex';
  document.getElementById('tpControls').style.display     = isTP ? 'flex' : 'none';
  if(isTP && !tpLoaded()) loadTradePlan();
}

const hashView = () => location.hash.replace(/^#\/?/, '') || 'overview';
function route(){ activate(hashView()); }

// Nav click: drive the URL so back/forward and deep-links work. When the hash
// already matches (re-click), activate directly since hashchange won't fire.
function go(el){
  const v = el.dataset.view;
  if(hashView() === v) activate(v);
  else location.hash = '/' + v;
}
window.addEventListener('hashchange', route);

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

window.addEventListener('resize',()=>{ if(curView==='tradeplan') layoutFrozen(); });

// Expose handlers used by inline on* attributes in index.html.
Object.assign(window, {
  go, loadAll,
  toggleMsDropdown, msSelectAll, msClearAll, updateMsLabel,
  loadOrders, exportOrderCSV, switchTab,
  loadTradePlan, renderTradePlan, setMetric, exportTradePlanCSV,
});

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

  route();      // honor the initial URL hash (deep-link / refresh)
  loadAll();
});
