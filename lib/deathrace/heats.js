// Server-side only: DeathRace3000 heats, run by the operator. A heat opens on demand, takes verified runs from the
// players who entered it on-chain, and once it closes is settled (entries minus the treasury rake paid 60/25/15 to the
// top three) or, with fewer than two real players, cancelled with every entry refunded.
//
// There is no long-running process on the site: whoever asks about heats also moves them along (tick), under locks, so
// only one instance at a time sends the operator's transactions.
import { randomBytes, createHash } from 'node:crypto';
import { parseEventLogs, keccak256, toBytes, verifyMessage, getAddress } from 'viem';
import { drConfig } from './config';
import { chainClients, opWrite, heatsAbi, shopAbi } from './chain';
import * as db from './store';
import { verifyRun } from './verify';
import { HEAT_ENTRY_USD, tokenPrice, usdToRaw, carItem } from './catalog';

const MAX_ENTRANTS = 20;
const minutes = (env, d) => (Number(process.env[env]) > 0 ? Number(process.env[env]) : d) * 60;
const HEAT_S = () => minutes('DR_HEAT_MINUTES', drConfig().testnet ? 5 : 30);    // entries open this long
const GRACE_S = () => minutes('DR_GRACE_MINUTES', drConfig().testnet ? 3 : 10);  // then runs in progress get this long
const STUCK_S = 180;   // a settle / cancel that died mid-flight gets re-checked after this
const now = () => Math.floor(Date.now() / 1000);

export const resultMessage = (heatId, address, digest, issuedAt) =>
  `DeathRace3000 heat ${heatId} result\nWallet: ${address}\nLogs: ${digest}\nIssued: ${issuedAt}`;

export const logsDigest = (logs) => createHash('sha256').update(logs.join(',')).digest('hex');

const cmp = (a, b) => (b > a ? 1 : b < a ? -1 : 0);

function onChainEntered(id, address) {
  const { pub, cfg } = chainClients();
  return pub.readContract({ address: cfg.dep.heats, abi: heatsAbi, functionName: 'entered', args: [BigInt(id), address] });
}

async function createHeat() {
  const { cfg, pub } = chainClients();
  const net = cfg.key;
  return db.withLock(`create:${net}`, 120, 30_000, async () => {
    const again = await db.latestOpenHeat(net, 60);   // someone else may have just opened one
    if (again) return again;
    const price = await tokenPrice();
    if (!price) throw new Error('No reliable $CREATIONS price right now; heats reopen when the price feeds agree.');
    const entryRaw = usdToRaw(HEAT_ENTRY_USD, price.usd);
    const seed = BigInt('0x' + randomBytes(7).toString('hex'));
    const closesAt = now() + HEAT_S();
    const reserve = await pub.readContract({ address: cfg.dep.heats, abi: heatsAbi, functionName: 'bonusReserve' });
    const r = await opWrite({ address: cfg.dep.heats, abi: heatsAbi, functionName: 'createHeat',
      args: [seed, entryRaw, MAX_ENTRANTS, BigInt(closesAt), reserve] });
    const ev = parseEventLogs({ abi: heatsAbi, logs: r.logs, eventName: 'HeatCreated' })[0];
    const h = {
      id: Number(ev.args.id), seed: seed.toString(), entry_raw: entryRaw.toString(), entry_usd: HEAT_ENTRY_USD,
      top_up_raw: reserve.toString(), closes_at: closesAt, max_entrants: MAX_ENTRANTS, state: 'open',
      created_tx: r.transactionHash,
    };
    await db.insertHeat(net, h);
    return h;
  });
}

/** The heat new players join: the newest open one with at least a minute of entries left (opens one if needed). */
export async function currentHeat() {
  const net = drConfig().key;
  tick().catch((e) => console.error('deathrace tick:', e.message));
  return (await db.latestOpenHeat(net, 60)) || createHeat();
}

export async function heatView(h) {
  if (!h) return null;
  const net = drConfig().key;
  const rows = await db.entrants(net, h.id);
  const names = new Map((await db.getProfiles(net, rows.map((r) => r.address))).map((p) => [p.address, p.name]));
  const standings = rows.map((e) => {
    const r = e.result;
    return {
      address: e.address, name: names.get(e.address) || `${e.address.slice(0, 6)}…${e.address.slice(-4)}`,
      submitted: !!r, scoreRaw: r ? String(e.score_raw) : '0', end: r ? r.end : '', checkpoints: r ? r.checkpoints : 0,
      payoutRaw: (h.payouts && h.payouts[e.address]) || '0',
    };
  }).sort((x, y) => cmp(BigInt(x.scoreRaw), BigInt(y.scoreRaw)));
  const pool = BigInt(h.entry_raw) * BigInt(standings.length) + BigInt(h.top_up_raw || '0');
  const closesAt = Number(h.closes_at);
  return {
    id: h.id, seed: h.seed, entryRaw: h.entry_raw, entryUsd: Number(h.entry_usd), closesAt,
    resultsDueAt: closesAt + GRACE_S(), state: h.state === 'settling' || h.state === 'cancelling' ? 'open' : h.state,
    maxEntrants: h.max_entrants, poolRaw: pool.toString(), standings, settleTx: h.settle_tx || null,
    cancelTx: h.cancel_tx || null, rakeRaw: h.rake_raw || '0', serverTime: now(),
  };
}

export async function viewHeat(id) {
  const h = await db.getHeat(drConfig().key, id);
  if (h && h.state !== 'settled' && h.state !== 'cancelled') {
    await tick().catch((e) => console.error('deathrace tick:', e.message));
    return heatView(await db.getHeat(drConfig().key, id));
  }
  return heatView(h);
}

/** A player says their game wallet entered. Trust the chain, not the claim. */
export async function joined(id, address) {
  const net = drConfig().key;
  const h = await db.getHeat(net, id);
  if (!h) throw new Error('unknown heat');
  address = getAddress(address);
  if (!(await onChainEntered(id, address))) throw new Error('that wallet has not entered this heat on-chain');
  await db.addEntrant(net, id, address);
  return heatView(h);
}

export async function submit(id, body) {
  const net = drConfig().key;
  const h = await db.getHeat(net, id);
  if (!h) throw new Error('unknown heat');
  if (h.state !== 'open') throw new Error('this heat is already ' + h.state);
  if (now() > Number(h.closes_at) + GRACE_S()) throw new Error('results for this heat are closed');
  const address = getAddress(body.address);
  const logs = Array.isArray(body.logs) ? body.logs.map(String) : [];
  if (logs.length === 0 || logs.length > 12) throw new Error('bad run');
  const digest = logsDigest(logs);
  const issued = Number(body.issuedAt);
  if (!Number.isFinite(issued) || Math.abs(now() - issued) > 600) throw new Error('stale signature');
  const okSig = await verifyMessage({ address, message: resultMessage(id, address, digest, issued), signature: body.signature }).catch(() => false);
  if (!okSig) throw new Error('bad signature');
  const mine = (await db.entrants(net, id)).find((e) => e.address === address.toLowerCase());
  if (mine && mine.result) throw new Error('one attempt per heat: your run is already in');
  if (!(await onChainEntered(id, address))) throw new Error('that wallet has not entered this heat');
  if (!mine) await db.addEntrant(net, id, address);
  const v = await verifyRun(logs);
  if (!v.ok) throw new Error('run could not be verified: ' + (v.error || 'replay failed'));
  if (v.seed !== h.seed) throw new Error('that run was on a different track');
  // a heat is raced in a car the wallet owns (the replay says which car it was)
  const item = carItem((Number(v.loadout) >> 12) & 7);
  if (item) {
    const { pub, cfg } = chainClients();
    const [owns] = await pub.readContract({ address: cfg.dep.shop, abi: shopAbi, functionName: 'ownsMany', args: [address, [item]] });
    if (!owns) throw new Error('that run used a car this wallet does not own');
  }
  const stored = await db.setResult(net, id, address, v.scoreRaw, {
    end: v.end, checkpoints: v.checkpoints, ticks: v.ticks, hash: v.hash, pack: v.pack, digest, at: now(),
  });
  if (!stored) throw new Error('one attempt per heat: your run is already in');
  await tick().catch((e) => console.error('deathrace tick:', e.message));
  return heatView(await db.getHeat(net, id));
}

/** If the chain already settled / cancelled this heat (an earlier attempt died after sending), catch up from it. */
async function syncFromChain(h) {
  const { pub, cfg } = chainClients();
  const net = cfg.key;
  const onchain = await pub.readContract({ address: cfg.dep.heats, abi: heatsAbi, functionName: 'heats', args: [BigInt(h.id)] });
  const state = Number(onchain[6]);   // 0 None, 1 Open, 2 Settled, 3 Cancelled
  if (state === 1) return false;
  let fromBlock = BigInt(cfg.dep.startBlock);
  if (h.created_tx) {
    const rc = await pub.getTransactionReceipt({ hash: h.created_tx }).catch(() => null);
    if (rc) fromBlock = rc.blockNumber;
  }
  const evName = state === 2 ? 'Settled' : 'Cancelled';
  const evs = await pub.getContractEvents({ address: cfg.dep.heats, abi: heatsAbi, eventName: evName, args: { id: BigInt(h.id) }, fromBlock })
    .catch(() => []);
  const ev = evs[evs.length - 1];
  if (state === 2) {
    const fields = { state: 'settled' };
    if (ev) {
      fields.payouts = {};
      ev.args.ranked.forEach((a, i) => { fields.payouts[a.toLowerCase()] = ev.args.payouts[i].toString(); });
      fields.rake_raw = ev.args.rake.toString(); fields.settle_tx = ev.transactionHash;
    }
    await db.patchHeat(net, h.id, fields);
  } else {
    await db.patchHeat(net, h.id, { state: 'cancelled', cancel_tx: ev ? ev.transactionHash : null });
  }
  return true;
}

async function settleOrRefund(h) {
  const { pub, cfg } = chainClients();
  const net = cfg.key;
  const closesAt = Number(h.closes_at);
  if (h.state !== 'open') {
    // an earlier settle / cancel never finished: see what the chain says, then retry
    if (now() - Date.parse(h.state_since) / 1000 < STUCK_S) return;
    if (await syncFromChain(h)) return;
    if (!(await db.patchHeat(net, h.id, { state: 'open' }, h.state))) return;
    h = { ...h, state: 'open' };
  }
  if (now() < closesAt) {
    // before the close only a full heat can settle early; don't hit the chain for the common case
    const rows = await db.entrants(net, h.id);
    if (rows.length < h.max_entrants) return;
  }
  if (await syncFromChain(h)) return;
  const players = await pub.readContract({ address: cfg.dep.heats, abi: heatsAbi, functionName: 'players', args: [BigInt(h.id)] });
  const closed = now() >= closesAt || players.length >= h.max_entrants;
  if (!closed) return;
  const rows = await db.entrants(net, h.id);
  const byAddr = new Map(rows.map((r) => [r.address, r]));
  for (const p of players) if (!byAddr.has(p.toLowerCase())) await db.addEntrant(net, h.id, p, closesAt);

  if (players.length < 2) {
    if (!(await db.patchHeat(net, h.id, { state: 'cancelling' }, 'open'))) return;
    try {
      const r = await opWrite({ address: cfg.dep.heats, abi: heatsAbi, functionName: 'cancel', args: [BigInt(h.id)] });
      await db.patchHeat(net, h.id, { state: 'cancelled', cancel_tx: r.transactionHash });
    } catch (e) {
      console.error(`deathrace heat ${h.id} cancel failed:`, e.shortMessage || e.message);
      await db.patchHeat(net, h.id, { state: 'open' }, 'cancelling');
    }
    return;
  }

  const allIn = players.every((p) => byAddr.get(p.toLowerCase())?.result);
  const due = now() >= closesAt + GRACE_S();
  if (!allIn && !due) return;
  const ranked = players.map((p) => {
    const e = byAddr.get(p.toLowerCase());
    return { p, s: e && e.result ? BigInt(e.score_raw) : 0n, hash: e?.result?.hash || '', digest: e?.result?.digest || '' };
  }).sort((a, b) => cmp(a.s, b.s));
  const root = keccak256(toBytes(JSON.stringify(ranked.map((x) => [x.p, x.hash, x.digest]))));
  if (!(await db.patchHeat(net, h.id, { state: 'settling' }, 'open'))) return;
  try {
    const r = await opWrite({ address: cfg.dep.heats, abi: heatsAbi, functionName: 'settle',
      args: [BigInt(h.id), ranked.map((x) => x.p), ranked.map((x) => x.s), root] });
    const ev = parseEventLogs({ abi: heatsAbi, logs: r.logs, eventName: 'Settled' })[0];
    const payouts = {};
    ev.args.ranked.forEach((a, i) => { payouts[a.toLowerCase()] = ev.args.payouts[i].toString(); });
    await db.patchHeat(net, h.id, { state: 'settled', payouts, rake_raw: ev.args.rake.toString(), settle_tx: r.transactionHash });
  } catch (e) {
    console.error(`deathrace heat ${h.id} settle failed:`, e.shortMessage || e.message);
    await db.patchHeat(net, h.id, { state: 'open' }, 'settling');
  }
}

let lastTick = 0;

/** Move every heat that is due along: settle, refund, or recover a stuck transaction. Cheap when nothing is due. */
export async function tick(force = false) {
  if (!force && Date.now() - lastTick < 5_000) return;
  lastTick = Date.now();
  const net = drConfig().key;
  const todo = await db.heatsToTick(net);
  if (!todo.length) return;
  if (!(await db.tryLock(`tick:${net}`, 120))) return;
  try {
    for (const h of todo) await settleOrRefund(h);
  } finally { await db.unlock(`tick:${net}`); }
}
