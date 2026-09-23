// The playtest download log. With SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set, that is the `playtest_downloads`
// table (see supabase/playtest_downloads.sql); without them it lives in memory, which is fine for local development.
//
// Server-side only: the service-role key bypasses Row Level Security and must never reach the browser.

import { rest, persistent } from './supabase';

const REPEAT_MINUTES = 2; // a double click, or a retry right after a failed download, is the same download
let memory = [];

export const buildKey = (build) => `${build.name} ${build.version}`;

/** Logs a download; false if this wallet already started one moments ago. */
export async function recordDownload(wallet, build) {
  const key = buildKey(build);
  const who = String(wallet).toLowerCase();
  const since = new Date(Date.now() - REPEAT_MINUTES * 60 * 1000).toISOString();

  if (!persistent) {
    if (memory.some((r) => r.wallet === who && r.build === key && r.created_at > since)) return false;
    memory.unshift({ wallet: who, build: key, created_at: new Date().toISOString() });
    memory = memory.slice(0, 2000);
    return true;
  }

  const recent = await rest(
    `playtest_downloads?select=id&wallet=eq.${who}&build=eq.${encodeURIComponent(key)}` +
      `&created_at=gte.${encodeURIComponent(since)}&limit=1`
  );
  if (recent && recent.length) return false;
  await rest('playtest_downloads', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ wallet: who, build: key }),
  });
  return true;
}

/** { total, holders, lastDay } for the public counter. */
export async function downloadStats(build) {
  const key = buildKey(build);
  if (!persistent) {
    const rows = memory.filter((r) => r.build === key);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return {
      total: rows.length,
      holders: new Set(rows.map((r) => r.wallet)).size,
      lastDay: rows.filter((r) => r.created_at > dayAgo).length,
    };
  }
  const rows = await rest('rpc/playtest_download_stats', { method: 'POST', body: JSON.stringify({ p_build: key }) });
  const s = (rows && rows[0]) || {};
  return { total: Number(s.total || 0), holders: Number(s.holders || 0), lastDay: Number(s.last_day || 0) };
}

/** Newest downloads, for the studio's own view. */
export async function recentDownloads(build, limit = 50) {
  const key = buildKey(build);
  if (!persistent) return memory.filter((r) => r.build === key).slice(0, limit).map((r) => ({ wallet: r.wallet, date: r.created_at }));
  const rows = await rest(
    `playtest_downloads?select=wallet,created_at&build=eq.${encodeURIComponent(key)}&order=created_at.desc&limit=${limit}`
  );
  return rows.map((r) => ({ wallet: r.wallet, date: r.created_at }));
}
