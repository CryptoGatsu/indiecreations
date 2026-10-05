// Server-side only: where community games live. With SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set, that is the
// creations_* tables (supabase/creations.sql); without them everything sits in memory, which is only acceptable for
// local development (the API refuses to create games in production without a database).
import { rest, persistent } from './supabase';

export { persistent };

const q = encodeURIComponent;
const mem = (globalThis.__icCreationsMem ||= { games: new Map(), versions: [], log: [], reports: [], presence: new Map() });

// Older versions beyond this many are deleted when a new one is saved.
const KEEP_VERSIONS = 20;

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export function newGameId() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

const GAME_FIELDS = 'id,owner,title,description,prompt,version,versions,published,hidden,plays,reports,show_prompts,created_at,updated_at';

// ------------------------------------------------------------------------------------------------------- games
export async function getGame(id) {
  if (!persistent) return mem.games.get(id) || null;
  const rows = await rest(`creations_games?id=eq.${q(id)}&select=${GAME_FIELDS}&limit=1`);
  return rows[0] || null;
}

export async function listByOwner(owner) {
  if (!persistent) return [...mem.games.values()].filter((g) => g.owner === owner).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return rest(`creations_games?owner=eq.${q(owner)}&select=${GAME_FIELDS}&order=created_at.asc`);
}

// Published, not taken down. sort: 'popular' | 'new'
export async function listPublic({ sort = 'popular', limit = 60 } = {}) {
  if (!persistent) {
    return [...mem.games.values()]
      .filter((g) => g.published && !g.hidden)
      .sort((a, b) => (sort === 'new' ? (a.created_at < b.created_at ? 1 : -1) : b.plays - a.plays))
      .slice(0, limit);
  }
  const order = sort === 'new' ? 'created_at.desc' : 'plays.desc,created_at.desc';
  return rest(`creations_games?published=is.true&hidden=is.false&select=${GAME_FIELDS}&order=${order}&limit=${limit}`);
}

// For the admin page: reported games first, then the newest.
export async function listForAdmin(limit = 50) {
  if (!persistent) return [...mem.games.values()].sort((a, b) => b.reports - a.reports).slice(0, limit);
  const [reported, recent] = await Promise.all([
    rest(`creations_games?reports=gt.0&select=${GAME_FIELDS}&order=reports.desc&limit=${limit}`),
    rest(`creations_games?select=${GAME_FIELDS}&order=created_at.desc&limit=${limit}`),
  ]);
  const seen = new Set(reported.map((g) => g.id));
  return [...reported, ...recent.filter((g) => !seen.has(g.id))].slice(0, limit);
}

export async function createGame({ owner, title, description, prompt, html }) {
  const now = new Date().toISOString();
  const game = {
    id: newGameId(), owner, title, description, prompt,
    version: 1, versions: 1, published: false, hidden: false, plays: 0, reports: 0, show_prompts: true,
    created_at: now, updated_at: now,
  };
  const version = { game_id: game.id, version: 1, request: prompt, html, created_at: now };
  if (!persistent) {
    mem.games.set(game.id, game);
    mem.versions.push(version);
    return game;
  }
  await rest('creations_games', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(game) });
  await rest('creations_versions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(version) });
  return game;
}

// Saves a new version and makes it the current one.
export async function addVersion(game, { request, html, title, description }) {
  const now = new Date().toISOString();
  const n = game.versions + 1;
  const patch = { version: n, versions: n, title, description, updated_at: now };
  const version = { game_id: game.id, version: n, request, html, created_at: now };
  if (!persistent) {
    mem.versions.push(version);
    mem.versions = mem.versions.filter((v) => v.game_id !== game.id || v.version > n - KEEP_VERSIONS);
    return Object.assign(mem.games.get(game.id), patch);
  }
  await rest('creations_versions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(version) });
  await rest(`creations_games?id=eq.${q(game.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
  await rest(`creations_versions?game_id=eq.${q(game.id)}&version=lte.${n - KEEP_VERSIONS}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  return { ...game, ...patch };
}

// patch: any of { title, published, hidden, version, show_prompts }
export async function updateGame(id, patch) {
  const row = { ...patch, updated_at: new Date().toISOString() };
  if (!persistent) return Object.assign(mem.games.get(id), row);
  const rows = await rest(`creations_games?id=eq.${q(id)}&select=${GAME_FIELDS}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  return rows[0] || null;
}

export async function deleteGame(id) {
  if (!persistent) {
    mem.games.delete(id);
    mem.versions = mem.versions.filter((v) => v.game_id !== id);
    return;
  }
  // versions and reports go with it (on delete cascade)
  await rest(`creations_games?id=eq.${q(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

// ------------------------------------------------------------------------------------------------------ versions
export async function getHtml(id, version) {
  if (!persistent) return mem.versions.find((v) => v.game_id === id && v.version === version)?.html || null;
  const rows = await rest(`creations_versions?game_id=eq.${q(id)}&version=eq.${Number(version)}&select=html&limit=1`);
  return rows[0]?.html || null;
}

export async function listVersions(id) {
  if (!persistent) {
    return mem.versions
      .filter((v) => v.game_id === id)
      .map(({ version, request, created_at }) => ({ version, request, created_at }))
      .sort((a, b) => b.version - a.version);
  }
  return rest(`creations_versions?game_id=eq.${q(id)}&select=version,request,created_at&order=version.desc`);
}

// Lines of code in a version (for the stats). A version never changes once saved, so this is cached per instance.
const lineCache = new Map();
export async function codeLines(id, version) {
  const key = `${id}:${version}`;
  if (lineCache.has(key)) return lineCache.get(key);
  const html = await getHtml(id, version);
  const lines = html ? html.split('\n').filter((l) => l.trim()).length : 0;
  if (lineCache.size > 2000) lineCache.clear();
  lineCache.set(key, lines);
  return lines;
}

// ---------------------------------------------------------------------------------------------------- allowances
// One row per generation (a new game or an edit), for the per-wallet and site-wide daily allowances. Logged when the
// model call starts: the tokens are spent whether or not the result is usable.
// Counts up to `cap` rows: callers only need to know whether an allowance is used up.
export async function generationsSince(since, { wallet = null, cap }) {
  if (!persistent) return mem.log.filter((r) => r.at > since && (!wallet || r.wallet === wallet)).length;
  const who = wallet ? `&wallet=eq.${q(wallet)}` : '';
  const rows = await rest(`creations_log?at=gt.${q(since)}${who}&select=id&limit=${cap}`);
  return rows.length;
}

export async function logGeneration(wallet, gameId, kind) {
  const row = { wallet, game_id: gameId, kind, at: new Date().toISOString() };
  if (!persistent) {
    mem.log.push(row);
    if (mem.log.length > 5000) mem.log.splice(0, 1000);
    return;
  }
  await rest('creations_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
}

// ------------------------------------------------------------------------------------------- plays and reports
export async function countPlay(id) {
  if (!persistent) {
    const g = mem.games.get(id);
    if (g) g.plays += 1;
    return;
  }
  await rest('rpc/creations_play', { method: 'POST', body: JSON.stringify({ gid: id }) });
}

// One report per game per reporter (a wallet, or a hash of the IP for visitors without one).
export async function reportGame(id, reporter, reason) {
  if (!persistent) {
    if (mem.reports.some((r) => r.game_id === id && r.reporter === reporter)) return;
    mem.reports.push({ game_id: id, reporter, reason, at: new Date().toISOString() });
    const g = mem.games.get(id);
    if (g) g.reports += 1;
    return;
  }
  await rest('rpc/creations_report', { method: 'POST', body: JSON.stringify({ gid: id, who: reporter, why: reason }) });
}

export async function listReports(id) {
  if (!persistent) return mem.reports.filter((r) => r.game_id === id);
  return rest(`creations_reports?game_id=eq.${q(id)}&select=reporter,reason,at&order=at.desc&limit=20`);
}

// --------------------------------------------------------------------------------------------- who is playing
// The page around a public game pings once a minute while it is in front (lib/creations.js PING_MS). A new visitor
// counts a minute of play; after that, each ping at least 50 seconds after the last adds one.
export async function recordPresence(id, visitorId, ipHash) {
  if (!persistent) {
    const key = `${id}:${visitorId}`;
    const now = Date.now();
    const row = mem.presence.get(key);
    if (!row) mem.presence.set(key, { game_id: id, ip_hash: ipHash, minutes: 1, last_seen: now });
    else if (now - row.last_seen >= 50_000) Object.assign(row, { minutes: row.minutes + 1, last_seen: now, ip_hash: ipHash });
    return;
  }
  await rest('rpc/creations_ping', { method: 'POST', body: JSON.stringify({ gid: id, vid: visitorId, iph: ipHash }) });
}

const EMPTY_STATS = { now: 0, day: 0, players: 0, minutes: 0 };

// { [game id]: { now, day, players, minutes } } for every game anyone has played, or only `id`. Player counts take at
// most 3 visitors per IP, so one person inventing ids can't inflate them.
export async function presenceStats(id = null) {
  const out = {};
  if (!persistent) {
    const now = Date.now();
    const perIp = new Map();
    for (const r of mem.presence.values()) {
      if (id && r.game_id !== id) continue;
      const k = `${r.game_id}:${r.ip_hash}`;
      const a = perIp.get(k) || { game_id: r.game_id, now: 0, day: 0, all: 0, minutes: 0 };
      if (now - r.last_seen < 120_000) a.now += 1;
      if (now - r.last_seen < 86_400_000) a.day += 1;
      a.all += 1;
      a.minutes += r.minutes;
      perIp.set(k, a);
    }
    for (const a of perIp.values()) {
      const s = (out[a.game_id] ||= { ...EMPTY_STATS });
      s.now += Math.min(a.now, 3);
      s.day += Math.min(a.day, 3);
      s.players += Math.min(a.all, 3);
      s.minutes += a.minutes;
    }
    return out;
  }
  const rows = await rest('rpc/creations_stats', { method: 'POST', body: JSON.stringify({ gid: id }) });
  for (const r of rows) {
    out[r.game_id] = { now: Number(r.playing_now), day: Number(r.last_day), players: Number(r.players), minutes: Number(r.minutes) };
  }
  return out;
}

export const statsFor = (all, id) => all[id] || { ...EMPTY_STATS };
