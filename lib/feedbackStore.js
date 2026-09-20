// Where holder reviews live. With SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set, that is the `feedback` table of a
// Supabase project (see supabase/feedback.sql), reached over its REST API - no extra dependency. Without them the
// site still works, but reviews sit in memory and vanish on every deploy / cold start (fine for local development).
//
// Server-side only: the service-role key bypasses Row Level Security and must never reach the browser.

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const persistent = Boolean(URL_BASE && KEY);

let memory = [];

async function rest(path, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}

// One review per wallet per build: a second post from the same wallet replaces the first.
export async function saveReview({ wallet, game, rating, feedback }) {
  const now = new Date().toISOString();
  if (!persistent) {
    memory = memory.filter((r) => !(r.wallet === wallet && r.game === game));
    memory.unshift({ wallet, game, rating, feedback, date: now });
    memory = memory.slice(0, 500);
    return;
  }
  await rest('feedback?on_conflict=wallet,game', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ wallet, game, rating, feedback, updated_at: now }),
  });
}

// Newest first, in the shape the reviews page expects.
export async function listReviews(limit = 200) {
  if (!persistent) return memory.slice(0, limit);
  const rows = await rest(
    `feedback?select=wallet,game,rating,feedback,updated_at&order=updated_at.desc&limit=${limit}`
  );
  return rows.map((r) => ({
    wallet: r.wallet,
    game: r.game,
    rating: r.rating,
    feedback: r.feedback,
    date: r.updated_at,
  }));
}
