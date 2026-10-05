// Server-side only: the items creators sell for their community games (supabase/creator_stores.sql), and what they
// have earned. Payment and delivery are the site's ordinary checkout (lib/shop.js): an item here is just another
// thing it can sell, with a seller who takes CREATOR_BPS of the price.
import crypto from 'crypto';
import { rest, persistent } from './supabase';
import { CREATOR_BPS, ITEM_USD_MAX, ITEM_USD_MIN, isItemId, orderGameName } from './creations';
import { getGame } from './creationStore';
// (not lib/creators.js: it reaches lib/shop.js through lib/admin.js, and lib/shop.js imports this file)

export { persistent };

const q = encodeURIComponent;
const mem = (globalThis.__icCreatorStoreMem ||= { items: new Map() });
const ITEM_FIELDS = 'id,game_id,name,description,usd_cents,available,created_at,updated_at';

export function newItemId() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return `ci-${Array.from(bytes, (b) => '0123456789abcdefghijklmnopqrstuvwxyz'[b % 36]).join('')}`;
}

export async function listItems(gameId) {
  if (!persistent) return [...mem.items.values()].filter((i) => i.game_id === gameId).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return rest(`creations_items?game_id=eq.${q(gameId)}&select=${ITEM_FIELDS}&order=created_at.asc`);
}

export async function getItem(id) {
  if (!isItemId(id)) return null;
  if (!persistent) return mem.items.get(id) || null;
  const rows = await rest(`creations_items?id=eq.${q(id)}&select=${ITEM_FIELDS}&limit=1`);
  return rows[0] || null;
}

export async function createItem({ gameId, name, description, usdCents }) {
  const now = new Date().toISOString();
  const item = { id: newItemId(), game_id: gameId, name, description, usd_cents: usdCents, available: true, created_at: now, updated_at: now };
  if (!persistent) {
    mem.items.set(item.id, item);
    return item;
  }
  await rest('creations_items', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(item) });
  return item;
}

// patch: any of { name, description, usd_cents, available }
export async function updateItem(id, patch) {
  const row = { ...patch, updated_at: new Date().toISOString() };
  if (!persistent) return Object.assign(mem.items.get(id), row);
  const rows = await rest(`creations_items?id=eq.${q(id)}&select=${ITEM_FIELDS}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  return rows[0] || null;
}

export async function deleteItem(id) {
  if (!persistent) return void mem.items.delete(id);
  await rest(`creations_items?id=eq.${q(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

export async function deleteItemsOf(gameId) {
  if (!persistent) {
    for (const [id, i] of mem.items) if (i.game_id === gameId) mem.items.delete(id);
    return;
  }
  await rest(`creations_items?game_id=eq.${q(gameId)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

// Checks a creator's item fields: { value } (in column names) or { error }. `partial` for an edit.
export function cleanItem(body, partial = false) {
  const out = {};
  if (body.name !== undefined || !partial) {
    const name = String(body.name || '').replace(/\s+/g, ' ').trim();
    if (!name || name.length > 40) return { error: 'Give the item a name (up to 40 characters).' };
    out.name = name;
  }
  if (body.description !== undefined || !partial) {
    const description = String(body.description || '').replace(/\s+/g, ' ').trim();
    if (description.length > 200) return { error: 'Keep the description under 200 characters.' };
    out.description = description;
  }
  if (body.usd !== undefined || !partial) {
    const usd = Number(body.usd);
    if (!Number.isFinite(usd) || usd < ITEM_USD_MIN || usd > ITEM_USD_MAX) {
      return { error: `Prices go from $${ITEM_USD_MIN.toFixed(2)} to $${ITEM_USD_MAX}.` };
    }
    out.usd_cents = Math.round(usd * 100);
  }
  if (typeof body.available === 'boolean') out.available = body.available;
  return { value: out };
}

export const itemView = (i, sales) => ({
  id: i.id,
  name: i.name,
  description: i.description,
  usd: i.usd_cents / 100,
  available: i.available,
  sold: sales?.byItem[i.id]?.sold || 0,
});

// ------------------------------------------------------------------------------------------------------- sales
// Paid orders of a game's items: { [itemId]: { sold, usdCents, raw } } and the totals, read from shop_orders.
export async function salesOf(gameId) {
  const game = orderGameName(gameId);
  let rows;
  if (!persistent) {
    const shop = globalThis.__icShopMem;
    rows = shop ? [...shop.orders.values()].filter((o) => o.game === game && o.status === 'paid') : [];
  } else {
    rows = await rest(`shop_orders?game=eq.${q(game)}&status=eq.paid&select=item_id,usd_cents,amount_raw,seller_bps&limit=10000`);
  }
  const byItem = {};
  const total = { sold: 0, usdCents: 0, raw: 0n, earnedRaw: 0n };
  for (const r of rows) {
    const s = (byItem[r.item_id] ||= { sold: 0, usdCents: 0, raw: 0n });
    const raw = BigInt(r.amount_raw);
    s.sold += 1;
    s.usdCents += r.usd_cents;
    s.raw += raw;
    total.sold += 1;
    total.usdCents += r.usd_cents;
    total.raw += raw;
    total.earnedRaw += (raw * BigInt(r.seller_bps || 0)) / 10_000n;
  }
  return { byItem, total };
}

// A seller's cut of paid orders in [t0, t1): [{ seller, orders, usdCents, raw }]. The monthly payout adds these to the
// sellers' running totals.
export async function creatorEarnings(t0 = null, t1 = null, who = null) {
  if (!persistent) {
    const shop = globalThis.__icShopMem;
    const out = new Map();
    for (const o of shop ? shop.orders.values() : []) {
      if (o.status !== 'paid' || !o.seller || !o.seller_bps) continue;
      if ((t0 && o.paid_at < t0) || (t1 && o.paid_at >= t1) || (who && o.seller !== who)) continue;
      const e = out.get(o.seller) || { seller: o.seller, orders: 0, usdCents: 0, raw: 0n };
      e.orders += 1;
      e.usdCents += Math.floor((o.usd_cents * o.seller_bps) / 10_000);
      e.raw += (BigInt(o.amount_raw) * BigInt(o.seller_bps)) / 10_000n;
      out.set(o.seller, e);
    }
    return [...out.values()];
  }
  const rows = await rest('rpc/creator_earnings', { method: 'POST', body: JSON.stringify({ t0, t1, who }) });
  return rows.map((r) => ({ seller: r.seller, orders: Number(r.orders), usdCents: Number(r.usd_cents), raw: BigInt(r.earned_raw) }));
}

// ------------------------------------------------------------------------------------------------- the checkout
// What lib/shop.js needs to sell a creator item, or null when it can't be sold right now: the game must be public,
// the item on sale, and the seller is whoever owns the game at the moment of the quote.
export async function sellableItem(itemId) {
  const item = await getItem(itemId);
  if (!item) return null;
  const game = await getGame(item.game_id);
  if (!game) return null;
  return {
    id: item.id,
    name: item.name,
    game: orderGameName(game.id),
    gameTitle: game.title,
    usd: item.usd_cents / 100,
    available: item.available && game.published && !game.hidden,
    seller: game.owner,
    sellerBps: CREATOR_BPS,
  };
}
