// Pure formatting + CSV helpers, shared by every view.

export const N=n=>n==null?'—':Math.abs(n)>=1e6?(n/1e6).toFixed(1)+'M':Math.abs(n)>=1e3?(n/1e3).toFixed(0)+'K':Math.round(n).toLocaleString();

export const P=n=>n==null?'—':n.toFixed(1)+'%';

export const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function downloadCSV(rows, filename){
  const csv=rows.map(r=>r.map(v=>{
    const s=String(v==null?'':v);
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }).join(',')).join('\n');
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
  a.download=filename; a.click();
}
