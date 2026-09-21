// Server-side only: a tiny client for the site's Supabase project over its REST API - no extra dependency.
// The service-role key bypasses Row Level Security and must never reach the browser.

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const persistent = Boolean(URL_BASE && KEY);

export async function rest(path, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  // writes ask for "return=minimal": a 200 / 201 / 204 with an EMPTY body, which is not valid JSON
  return text ? JSON.parse(text) : null;
}
