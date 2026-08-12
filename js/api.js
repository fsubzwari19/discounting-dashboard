// Trino query client. Invokes the Supabase `query` edge function with the
// caller's session; redirects to login on 401.
import { invokeFn } from './supabase.js';

export async function q(sql){
  try {
    return await invokeFn('query', { query: sql });
  } catch(e){
    if(e.status === 401){ window.location.replace('/login.html'); return []; }
    throw e;
  }
}
