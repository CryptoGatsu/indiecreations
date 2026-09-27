// Server-side only: who is playing each browser game right now (supabase/presence.sql).
// A loaded game pings once a minute with an anonymous id its browser keeps; players "now" are those seen in the last
// 2 minutes. IPs are never stored, only a salted hash, used to count at most 3 ids per IP.
import crypto from 'crypto';
import { GAMES } from './games';
import { rest, persistent } from './supabase';

// Games whose pages can ping: the ones that run in the browser on this site.
export const PLAYABLE = new Set(GAMES.filter((g) => g.play).map((g) => g.slug));

const lastPing = new Map(); // `${game}:${id}` -> ms; ignore pings closer together than this instance has seen
let cache = { at: 0, value: null };

const hashIp = (ip) =>
  crypto.createHash('sha256').update(`${process.env.SESSION_SECRET || 'dev-only-salt'}:presence:${ip}`).digest('hex');

export function clientIp(req) {
  return String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
}

export async function recordPing({ game, id, ip }) {
  if (!persistent) return;
  const key = `${game}:${id}`;
  const now = Date.now();
  if (now - (lastPing.get(key) || 0) < 30_000) return;
  lastPing.set(key, now);
  if (lastPing.size > 50_000) lastPing.clear();

  await rest('game_presence?on_conflict=game,visitor_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ game, visitor_id: id, ip_hash: hashIp(ip), last_seen: new Date(now).toISOString() }),
  });
  // now and then, forget visitors not seen for over a month
  if (Math.random() < 0.01) {
    const old = new Date(now - 35 * 24 * 3600e3).toISOString();
    await rest(`game_presence?last_seen=lt.${encodeURIComponent(old)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  }
}

// { [slug]: { now, day, month } } for every browser game (zeros when nobody has played). Cached for 5 seconds.
export async function playerCounts() {
  if (cache.value && Date.now() - cache.at < 5_000) return cache.value;
  const counts = Object.fromEntries([...PLAYABLE].map((slug) => [slug, { now: 0, day: 0, month: 0 }]));
  if (persistent) {
    for (const r of await rest('rpc/game_player_counts', { method: 'POST', body: '{}' })) {
      if (counts[r.game]) counts[r.game] = { now: Number(r.playing_now), day: Number(r.last_day), month: Number(r.last_month) };
    }
  }
  cache = { at: Date.now(), value: counts };
  return counts;
}
