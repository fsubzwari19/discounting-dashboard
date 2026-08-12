// Supabase client + shared helpers. The URL and publishable key are public by
// design (safe in the browser); all privileged work happens inside the edge
// functions, which verify the caller's session and the @bazaartech.com domain.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';

export const SUPABASE_URL = 'https://bxlydelarjrpqhkpjazd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8ugOzhSopmZpxQtmyEtsbw_0OSxV5un';

export const ALLOWED_DOMAIN = 'bazaartech.com';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Invoke an edge function with the current session. Returns parsed JSON data.
// On HTTP error, throws an Error with `.status` set so callers can handle 401.
export async function invokeFn(name, body){
  const { data, error } = await supabase.functions.invoke(name, { body: body || {} });
  if(error){
    const status = error.context && error.context.status;
    let msg = error.message;
    try { const j = await error.context.json(); if(j && j.error) msg = j.error; } catch(_){ /* non-JSON */ }
    const e = new Error(msg || ('HTTP ' + (status || 'error')));
    e.status = status;
    throw e;
  }
  return data;
}

export async function currentSession(){
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function signInWithGoogle(){
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/',
      queryParams: { hd: ALLOWED_DOMAIN, prompt: 'select_account' },
    },
  });
  return error;
}

export async function signOut(){
  await supabase.auth.signOut();
  window.location.replace('/login.html');
}
