// Trino query proxy client. POSTs SQL to /api/query, redirects to login on 401.

export async function q(sql){
  const res=await fetch('/api/query',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({query:sql})
  });
  if(res.status===401){ window.location.replace('/login.html'); return []; }
  if(!res.ok){ throw new Error(await res.text() || `HTTP ${res.status}`); }
  return await res.json();
}
