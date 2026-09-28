// Server-side only: DeathRace3000's records in the site's Supabase (tables dr_profiles, dr_heats, dr_entrants,
// dr_faucet, dr_locks). Every row carries the network, so testnet and mainnet never mix.
import { rest, persistent } from '../supabase';

const q = encodeURIComponent;
const now = () => Math.floor(Date.now() / 1000);

function need() {
  if (!persistent) throw new Error('DeathRace3000 storage is not configured');
}

const rpc = (fn, args) => rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

/** Run fn while holding a named lock (ttl seconds); waits up to waitMs for it, then gives up. */
export async function withLock(name, ttl, waitMs, fn) {
  need();
  const until = Date.now() + waitMs;
  while (!(await rpc('dr_try_lock', { p_name: name, p_ttl: ttl }))) {
    if (Date.now() > until) throw new Error('The race server is busy, try again in a moment.');
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
  }
  try { return await fn(); } finally { await rpc('dr_unlock', { p_name: name }).catch(() => {}); }
}

/** Take a lock only if it's free right now (for background work that can simply skip a turn). */
export async function tryLock(name, ttl) { need(); return !!(await rpc('dr_try_lock', { p_name: name, p_ttl: ttl })); }
export const unlock = (name) => rpc('dr_unlock', { p_name: name }).catch(() => {});

// ------------------------------------------------------------------ profiles
export async function getProfile(net, address) {
  need();
  const rows = await rest(`dr_profiles?network=eq.${net}&address=eq.${q(address.toLowerCase())}&select=address,name,linked`);
  return rows[0] || null;
}

export async function getProfiles(net, addresses) {
  need();
  if (!addresses.length) return [];
  const list = addresses.map((a) => `"${a.toLowerCase()}"`).join(',');
  return rest(`dr_profiles?network=eq.${net}&address=in.(${q(list)})&select=address,name,linked`);
}

async function upsertProfile(net, address, fields) {
  const rows = await rest('dr_profiles?on_conflict=network,address', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ network: net, address: address.toLowerCase(), ...fields, updated_at: new Date().toISOString() }),
  });
  return rows[0];
}

/** Returns the profile, or throws { status: 409 } when another wallet already races under that name. */
export async function saveProfileName(net, address, name) {
  need();
  try {
    return await upsertProfile(net, address, { name });
  } catch (e) {
    if (e.status === 409) { const err = new Error(`"${name}" is taken, pick another name.`); err.status = 409; throw err; }
    throw e;
  }
}

export async function linkProfile(net, address, linked) { need(); return upsertProfile(net, address, { linked }); }

// ------------------------------------------------------------------ heats
const HEAT_COLS = 'id,seed,entry_raw,entry_usd,top_up_raw,closes_at,max_entrants,state,state_since,created_tx,settle_tx,cancel_tx,rake_raw,payouts';

export async function getHeat(net, id) {
  need();
  const rows = await rest(`dr_heats?network=eq.${net}&id=eq.${Number(id)}&select=${HEAT_COLS}`);
  return rows[0] || null;
}

/** The newest open heat that still takes entries for at least `minLeft` seconds. */
export async function latestOpenHeat(net, minLeft) {
  need();
  const rows = await rest(`dr_heats?network=eq.${net}&state=eq.open&closes_at=gt.${now() + minLeft}&order=id.desc&limit=1&select=${HEAT_COLS}`);
  return rows[0] || null;
}

/** Heats that may need the operator: open (or stuck mid-transaction) and past their close. */
export async function heatsToTick(net) {
  need();
  return rest(`dr_heats?network=eq.${net}&state=in.(open,settling,cancelling)&order=id.asc&limit=20&select=${HEAT_COLS}`);
}

export async function insertHeat(net, h) {
  need();
  await rest('dr_heats', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ network: net, ...h }),
  });
}

/** Update a heat; with `fromState`, only if it's still in that state. Returns true if a row changed. */
export async function patchHeat(net, id, fields, fromState) {
  need();
  const cond = fromState ? `&state=eq.${fromState}` : '';
  const body = { ...fields };
  if (fields.state) body.state_since = new Date().toISOString();
  const rows = await rest(`dr_heats?network=eq.${net}&id=eq.${Number(id)}${cond}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body),
  });
  return rows.length > 0;
}

// ------------------------------------------------------------------ entrants
export async function entrants(net, heatId) {
  need();
  return rest(`dr_entrants?network=eq.${net}&heat_id=eq.${Number(heatId)}&select=address,entered_at,score_raw,result`);
}

export async function addEntrant(net, heatId, address, enteredAt) {
  need();
  await rest('dr_entrants', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ network: net, heat_id: Number(heatId), address: address.toLowerCase(), entered_at: enteredAt ?? now() }),
  });
}

/** Store a verified run: only the first one per player per heat sticks. Returns false if one was already in. */
export async function setResult(net, heatId, address, scoreRaw, result) {
  need();
  const rows = await rest(
    `dr_entrants?network=eq.${net}&heat_id=eq.${Number(heatId)}&address=eq.${q(address.toLowerCase())}&result=is.null`,
    { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ score_raw: scoreRaw, result }) });
  return rows.length > 0;
}

// ------------------------------------------------------------------ faucet (testnet)
/** Claims the faucet for `address` if it hasn't been used in `gapSec`; returns false if too soon. */
export async function claimFaucet(net, address, gapSec) {
  need();
  const a = address.toLowerCase();
  const rows = await rest(`dr_faucet?network=eq.${net}&address=eq.${q(a)}&select=last_at`);
  if (rows[0] && now() - Number(rows[0].last_at) < gapSec) return false;
  await rest('dr_faucet?on_conflict=network,address', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ network: net, address: a, last_at: now() }),
  });
  return true;
}

export async function releaseFaucet(net, address) {
  await rest(`dr_faucet?network=eq.${net}&address=eq.${q(address.toLowerCase())}`, { method: 'DELETE' }).catch(() => {});
}
