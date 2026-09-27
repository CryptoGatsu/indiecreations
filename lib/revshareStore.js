// Server-side only: the Supabase side of the revenue share and the economy numbers (tables in supabase/revshare.sql).
// Token amounts travel as strings and are BigInts in code: they are 256-bit integers.
import { rest, persistent } from './supabase';

export { persistent };

const q = encodeURIComponent;
const PAGE = 1000; // Supabase's default max rows per request

// ---- the chain copy
export async function getIndexedBlock(id) {
  const rows = await rest(`chain_index_state?id=eq.${q(id)}&select=last_block`);
  return rows[0] ? BigInt(rows[0].last_block) : null;
}

// { block, updatedAt } of the copy, or null before the first run (for the admin page).
export async function getIndexState(id) {
  const rows = await rest(`chain_index_state?id=eq.${q(id)}&select=last_block,updated_at`);
  return rows[0] ? { block: BigInt(rows[0].last_block), updatedAt: rows[0].updated_at } : null;
}

export async function setIndexedBlock(id, block) {
  await rest('chain_index_state?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id, last_block: block.toString(), updated_at: new Date().toISOString() }),
  });
}

// rows: { block_number, log_index, block_time, tx_hash, from_addr, to_addr, value }. Safe to repeat.
export async function saveTransfers(rows) {
  for (let i = 0; i < rows.length; i += 500) {
    await rest('token_transfers?on_conflict=block_number,log_index', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
  }
}

// Map of address -> balance (BigInt) at moment `iso`, positive balances only.
export async function balancesAt(iso) {
  const out = new Map();
  for (let offset = 0; ; offset += PAGE) {
    const rows = await rest(`rpc/revshare_balances_at?limit=${PAGE}&offset=${offset}`, {
      method: 'POST',
      body: JSON.stringify({ t: iso }),
    });
    for (const r of rows) out.set(r.address, BigInt(r.balance));
    if (rows.length < PAGE) return out;
  }
}

// { total: BigInt, transfers: number } of transfers to `to`, optionally from `from` and inside [t0, t1).
export async function transfersTotal({ to, from = null, t0 = null, t1 = null }) {
  if (!to.length || (from && !from.length)) return { total: 0n, transfers: 0 };
  const rows = await rest('rpc/transfers_total', {
    method: 'POST',
    body: JSON.stringify({ to_addrs: to, from_addrs: from, t0, t1 }),
  });
  return { total: BigInt(rows[0]?.total || 0), transfers: Number(rows[0]?.transfers || 0) };
}

// [{ game, orders, usdCents, raw }] of paid shop orders, optionally inside [t0, t1).
export async function shopRevenue(t0 = null, t1 = null) {
  const rows = await rest('rpc/shop_revenue', { method: 'POST', body: JSON.stringify({ t0, t1 }) });
  return rows.map((r) => ({
    game: r.game,
    orders: Number(r.orders),
    usdCents: Number(r.usd_cents),
    raw: BigInt(r.amount_raw),
  }));
}

// ---- payout months
const EPOCH_COLUMNS = [
  'month', 'status', 'orders', 'revenue_usd_cents', 'revenue_raw::text', 'pool_raw::text', 'paid_out_raw::text',
  'holders', 'root', 'total_allocated_raw::text', 'seed_block', 'seed', 'snapshots', 'tx_hash', 'created_at',
  'published_at',
].join(',');

const toEpoch = (r) => ({
  month: r.month,
  status: r.status,
  orders: r.orders,
  revenueUsdCents: Number(r.revenue_usd_cents),
  revenueRaw: BigInt(r.revenue_raw),
  poolRaw: BigInt(r.pool_raw),
  paidOutRaw: BigInt(r.paid_out_raw),
  holders: r.holders,
  root: r.root,
  totalAllocatedRaw: r.total_allocated_raw == null ? null : BigInt(r.total_allocated_raw),
  seedBlock: r.seed_block,
  seed: r.seed,
  snapshots: r.snapshots,
  txHash: r.tx_hash,
  publishedAt: r.published_at,
});

// Every closed month, oldest first (without the trees, which can be large).
export async function listEpochs() {
  return (await rest(`revshare_epochs?select=${EPOCH_COLUMNS}&order=month.asc`)).map(toEpoch);
}

export async function epochTree(month) {
  const rows = await rest(`revshare_epochs?month=eq.${q(month)}&select=tree`);
  return rows[0]?.tree || null;
}

export async function saveEpoch(e) {
  await rest('revshare_epochs', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      month: e.month,
      status: e.status,
      orders: e.orders,
      revenue_usd_cents: e.revenueUsdCents,
      revenue_raw: e.revenueRaw.toString(),
      pool_raw: e.poolRaw.toString(),
      paid_out_raw: e.paidOutRaw.toString(),
      holders: e.holders,
      root: e.root || null,
      total_allocated_raw: e.totalAllocatedRaw == null ? null : e.totalAllocatedRaw.toString(),
      seed_block: e.seedBlock == null ? null : Number(e.seedBlock),
      seed: e.seed || null,
      snapshots: e.snapshots || null,
      tree: e.tree || null,
    }),
  });
}

export async function markPublished(month, txHash) {
  await rest(`revshare_epochs?month=eq.${q(month)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'published', tx_hash: txHash, published_at: new Date().toISOString() }),
  });
}

// ---- claims
export async function saveClaims(root, claims) {
  const rows = claims.map((c) => ({
    root,
    address: c.address,
    cumulative: c.cumulative.toString(),
    proof: c.proof,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await rest('revshare_claims?on_conflict=root,address', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
  }
}

// { cumulative: BigInt, proof } for `address` under `root`, or null.
export async function getClaim(root, address) {
  const rows = await rest(
    `revshare_claims?root=eq.${q(root)}&address=eq.${q(address.toLowerCase())}&select=cumulative::text,proof`
  );
  return rows[0] ? { cumulative: BigInt(rows[0].cumulative), proof: rows[0].proof } : null;
}
