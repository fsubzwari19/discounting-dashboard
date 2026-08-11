// Global controls: date range, store-type multiselect, error/status banners.

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

export function toggleMsDropdown(){
  document.getElementById('msBtn').classList.toggle('open');
  document.getElementById('msDropdown').classList.toggle('open');
}

document.addEventListener('click', e=>{
  if(!document.getElementById('msWrap').contains(e.target)){
    document.getElementById('msBtn').classList.remove('open');
    document.getElementById('msDropdown').classList.remove('open');
  }
});

export function msSelectAll(){ document.querySelectorAll('.st-cb').forEach(cb=>cb.checked=true); updateMsLabel(); }

export function msClearAll(){ document.querySelectorAll('.st-cb').forEach(cb=>cb.checked=false); updateMsLabel(); }

export function updateMsLabel(){
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

export function stWhere(col){
  col=col||'store_type_order';
  const checked=[...document.querySelectorAll('.st-cb:checked')].map(cb=>`'${cb.value}'`);
  return checked.length>0?`AND ${col} IN (${checked.join(',')})`: '';
}

export const sd=()=>document.getElementById('sd').value;

export const ed=()=>document.getElementById('ed').value;

export function validateRange(){
  const s=new Date(sd()),e=new Date(ed()),days=(e-s)/(864e5);
  if(days>90){showErr('Date range cannot exceed 90 days.');return false;}
  if(days<0){showErr('Start date must be before end date.');return false;}
  hideErr();return true;
}

export function showErr(m){const b=document.getElementById('errBanner');b.textContent=m;b.style.display='block';}

function hideErr(){document.getElementById('errBanner').style.display='none';}

export function setStatus(m){document.getElementById('statusMsg').textContent=m;}
