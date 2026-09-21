// Where shop orders and owned cosmetics live: the `shop_orders` / `shop_entitlements` tables of the site's Supabase
// project (see supabase/shop.sql). Without Supabase they sit in memory, which is only acceptable for local
// development - lib/shop.js refuses to sell in production unless storage is persistent, because a paid order that
// vanishes on the next deploy is somebody's money gone.
import { rest, persistent } from './supabase';

export { persistent };

// on globalThis because every API route gets its own copy of this module, and they have to see the same orders
const mem = (globalThis.__icShopMem ||= { orders: new Map(), entitlements: new Map() });
const entKey = (steamId, itemId) => `${steamId}:${itemId}`;
const q = encodeURIComponent;

export async function createOrder(order) {
  if (!persistent) {
    mem.orders.set(order.id, { ...order });
    return;
  }
  await rest('shop_orders', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(order),
  });
}

export async function getOrder(id) {
  if (!persistent) return mem.orders.get(id) || null;
  const rows = await rest(`shop_orders?id=eq.${q(id)}&limit=1`);
  return rows[0] || null;
}

// A still-valid unpaid quote for the same buyer + item + wallet, so reloading the page doesn't mint a new order.
export async function findOpenOrder({ steamId, itemId, wallet }) {
  const now = new Date().toISOString();
  if (!persistent) {
    return (
      [...mem.orders.values()].find(
        (o) =>
          o.steam_id === steamId && o.item_id === itemId && o.wallet === wallet &&
          o.status === 'pending' && o.expires_at > now
      ) || null
    );
  }
  const rows = await rest(
    `shop_orders?steam_id=eq.${q(steamId)}&item_id=eq.${q(itemId)}&wallet=eq.${q(wallet)}` +
      `&status=eq.pending&expires_at=gt.${q(now)}&order=created_at.desc&limit=1`
  );
  return rows[0] || null;
}

// Marks an order paid by one specific transaction. The unique index on tx_hash means a payment can settle exactly
// one order, however many times (or for however many orders) its hash is submitted.
//   'ok'       settled now, or already settled
//   'tx-used'  that transaction has already paid for a different order
export async function settleOrder(id, txHash) {
  const patch = { status: 'paid', tx_hash: txHash, paid_at: new Date().toISOString() };
  if (!persistent) {
    const taken = [...mem.orders.values()].some((o) => o.tx_hash === txHash && o.id !== id);
    if (taken) return 'tx-used';
    const order = mem.orders.get(id);
    if (order && order.status === 'pending') Object.assign(order, patch);
    return 'ok';
  }
  try {
    await rest(`shop_orders?id=eq.${q(id)}&status=eq.pending`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });
    return 'ok';
  } catch (err) {
    if (err.status === 409) return 'tx-used';
    throw err;
  }
}

// Safe to repeat: owning something twice is the same as owning it once.
export async function grantEntitlement({ steamId, itemId, game, orderId }) {
  if (!persistent) {
    mem.entitlements.set(entKey(steamId, itemId), { steam_id: steamId, item_id: itemId, game, order_id: orderId });
    return;
  }
  await rest('shop_entitlements?on_conflict=steam_id,item_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ steam_id: steamId, item_id: itemId, game, order_id: orderId }),
  });
}

// Item ids owned by a Steam account, optionally for one game only.
export async function listOwned(steamId, game) {
  if (!persistent) {
    return [...mem.entitlements.values()]
      .filter((e) => e.steam_id === steamId && (!game || e.game === game))
      .map((e) => e.item_id);
  }
  const rows = await rest(
    `shop_entitlements?select=item_id&steam_id=eq.${q(steamId)}${game ? `&game=eq.${q(game)}` : ''}&limit=1000`
  );
  return rows.map((r) => r.item_id);
}
