// Server-side only: Don't Worry, You're Safe! (/youre-safe). Its purchases go through the site's shared game checkout
// (/api/game/quote -> ERC-20 transfer to the treasury -> /api/shop/confirm), so this file only holds what is specific
// to the game: its SKU <-> catalog id mapping, cloud saves, and the Inner Voice's daily allowance.
//
// Storage is the site's Supabase project (supabase/buddy.sql); without it everything sits in memory, which is only
// acceptable for local development.
import { rest, persistent } from './supabase';
import { listOwned } from './shop';

export const GAME = "Don't Worry, You're Safe!";

// The game names premium items buddy.<item_id>; the catalog id is ys-<item-id>. Never rename either side.
export const skuToItemId = (sku) =>
  /^buddy\.[a-z0-9_]{1,40}$/.test(sku || '') ? `ys-${sku.slice('buddy.'.length).replace(/_/g, '-')}` : null;
export const itemIdToSku = (id) => (/^ys-[a-z0-9-]{1,40}$/.test(id || '') ? `buddy.${id.slice(3).replace(/-/g, '_')}` : null);

export async function ownsSku(wallet, sku) {
  const id = skuToItemId(sku);
  return Boolean(id) && (await listOwned(wallet, GAME)).includes(id);
}

const mem = (globalThis.__icBuddyMem ||= { saves: new Map(), voice: [] });
const q = encodeURIComponent;

// ---------------------------------------------------------------------------------------------------- cloud saves
export const MAX_SAVE_BYTES = 256 * 1024;

export async function loadSave(wallet) {
  if (!persistent) return mem.saves.get(wallet) || null;
  const rows = await rest(`buddy_saves?wallet=eq.${q(wallet)}&select=version,state,updated_at&limit=1`);
  return rows[0] || null;
}

export async function storeSave(wallet, version, state) {
  const row = { wallet, version, state, updated_at: new Date().toISOString() };
  if (!persistent) {
    mem.saves.set(wallet, row);
    return row;
  }
  await rest('buddy_saves?on_conflict=wallet', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  });
  return row;
}

// ---------------------------------------------------------------------------------------------------- Inner Voice
// Each line costs a model call, so every wallet gets a daily allowance. A line is only counted once it was written.
export const VOICE_PER_DAY = Number(process.env.BUDDY_VOICE_PER_DAY || 40);

export async function voiceUsedToday(wallet) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  if (!persistent) return mem.voice.filter((v) => v.wallet === wallet && v.at > since).length;
  const rows = await rest(`buddy_voice_log?wallet=eq.${q(wallet)}&at=gt.${q(since)}&select=at&limit=${VOICE_PER_DAY + 1}`);
  return rows.length;
}

export async function logVoice(wallet, kind) {
  const row = { wallet, kind, at: new Date().toISOString() };
  if (!persistent) {
    mem.voice.push(row);
    if (mem.voice.length > 5000) mem.voice.splice(0, 1000);
    return;
  }
  await rest('buddy_voice_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
}
