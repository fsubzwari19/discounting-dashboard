import { esc, downloadCSV } from '../util.js';

let tpRows=[], tpDates=[], tpMetric='moq';
const TP_FIXED_W=[120,320,170,160];
const TP_DATE_W=96;
let tpColW=[];
const tpSd=()=>document.getElementById('tp_sd').value;
const tpEd=()=>document.getElementById('tp_ed').value;

export function setMetric(btn){
  tpMetric=btn.dataset.m;
  document.querySelectorAll('#tpSeg button').forEach(b=>b.classList.toggle('on', b===btn));
  renderTradePlan();
}

function tpShowErr(m){ const b=document.getElementById('tpErr'); b.textContent=m; b.style.display='block'; }

function tpHideErr(){ document.getElementById('tpErr').style.display='none'; }

export async function loadTradePlan(){
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

export function renderTradePlan(){
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

export function layoutFrozen(){
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

export function exportTradePlanCSV(){
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

export function tpLoaded(){ return tpRows.length>0; }
