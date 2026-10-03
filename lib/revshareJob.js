// Server-side only: closes a month of the holder revenue share and publishes it on-chain, with nobody pressing a
// button. Called by /api/cron/revshare every day; each run does at most one month, so a missed run just catches up.
//
// For the next month that has closed:
//   1. its revenue from every game = paid /shop orders + $CREATIONS sent to each game's on-chain revenue contracts;
//   2. if the revenue since the last payout (carried months + this one) is under REVSHARE_MIN_USD, the month is saved
//      as 'carried' and nothing is paid - its revenue rolls into the next month;
//   3. otherwise REVSHARE_BPS of it is the pool. It is split by each wallet's balances at REVSHARE_SNAPSHOTS random
//      moments in the month's last 14 days, seeded by the hash of the first block after the month;
//   4. the new running totals go into a Merkle tree; the claims are stored, then the root is published on the
//      RevenueShare contract from the publisher wallet, which pulls the pool from the treasury.
// Games with `burnBps` (lib/games.js) also owe a burn of that share of the month's checkout revenue. It is recorded
// when the month closes (carried or not) and the job burns it automatically before any payout is published: directly
// when the publisher wallet is the treasury, otherwise through an allowance the treasury gives the publisher wallet.
// A burn the treasury makes by hand (to a burn address) also counts.
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { createWalletClient, encodePacked, erc20Abi, getAddress, isAddress, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { TOKEN_ADDRESS, robinhoodChain } from './config';
import { getDecimals, publicClient } from './holder';
import { getTokenPriceUsd } from './price';
import { patientFetch, serverTransport } from './patientFetch';
import {
  BURN_ADDRESSES, BURN_TO, GAME_BURNS, GAME_CONTRACTS, REVSHARE_ADDRESS, REVSHARE_BPS, REVSHARE_MIN_USD, REVSHARE_SNAPSHOTS,
  SNAPSHOT_WINDOW_DAYS, revshareAbi,
} from './revshare';
import { TREASURY } from './shop';
import { indexedBlock, indexTransfers, mapLimit } from './chainIndex';
import * as store from './revshareStore';

const START_MONTH = process.env.REVSHARE_START_MONTH || ''; // first month that pays, YYYY-MM
const PUBLISHER_KEY = process.env.REVSHARE_PUBLISHER_KEY || '';
const MIN_INTERVAL_SECONDS = 20 * 24 * 60 * 60; // RevenueShare.MIN_INTERVAL

const addrList = (s) => (s || '').split(',').map((a) => a.trim()).filter((a) => isAddress(a)).map((a) => a.toLowerCase());
const INCLUDE = new Set(addrList(process.env.REVSHARE_INCLUDE));

// ---- months
export const monthStart = (month) => {
  const [y, m] = month.split('-').map(Number);
  return Date.UTC(y, m - 1, 1) / 1000;
};
export const monthEnd = (month) => {
  const [y, m] = month.split('-').map(Number);
  return Date.UTC(y, m, 1) / 1000;
};
export const nextMonth = (month) => new Date(monthEnd(month) * 1000).toISOString().slice(0, 7);
const iso = (ts) => new Date(ts * 1000).toISOString();

// ---- revenue
// Revenue in [t0, t1) from every game: { orders, usdCents, raw, games: [{ game, orders, usdCents, raw }] }.
// On-chain sales are valued at the live price. With no price to be had, `strict` throws (a payout waits for the next
// run); otherwise they count as $0 and the result says `unpriced` (fine for a stats page).
export async function revenueBetween(t0, t1, { strict = true } = {}) {
  const games = new Map();
  const add = (game, orders, usdCents, raw) => {
    const g = games.get(game) || { game, orders: 0, usdCents: 0, raw: 0n };
    g.orders += orders;
    g.usdCents += usdCents;
    g.raw += raw;
    games.set(game, g);
  };

  for (const r of await store.shopRevenue(t0, t1)) add(r.game, r.orders, r.usdCents, r.raw);

  let price;
  let unpriced = false;
  for (const g of GAME_CONTRACTS) {
    const { total, transfers } = await store.transfersTotal({ to: g.revenue.map((a) => a.toLowerCase()), t0, t1 });
    if (total === 0n) continue;
    if (price === undefined) price = (await getTokenPriceUsd().catch(() => null))?.usd || null; // { usd, sources }
    if (!price && strict) throw new Error('No $CREATIONS price right now to value on-chain game sales.');
    if (!price) unpriced = true;
    const cents = price ? Math.round((Number(total) / 10 ** (await getDecimals())) * price * 100) : 0;
    add(g.game, transfers, cents, total);
  }

  const list = [...games.values()];
  return {
    games: list,
    unpriced,
    orders: list.reduce((s, g) => s + g.orders, 0),
    usdCents: list.reduce((s, g) => s + g.usdCents, 0),
    raw: list.reduce((s, g) => s + g.raw, 0n),
  };
}

// Revenue not paid out yet: months carried since the last payout, plus anything after the last closed month.
export function unpaidMonths(epochs) {
  const lastPaid = epochs.map((e) => e.status).lastIndexOf('published');
  const lastComputed = epochs.map((e) => e.status).lastIndexOf('computed');
  return epochs.slice(Math.max(lastPaid, lastComputed) + 1).filter((e) => e.status === 'carried');
}

// ---- the split
function snapshotTimes(seed, month) {
  const end = monthEnd(month);
  const window = SNAPSHOT_WINDOW_DAYS * 24 * 60 * 60;
  return Array.from({ length: REVSHARE_SNAPSHOTS }, (_, i) =>
    end - window + Number(BigInt(keccak256(encodePacked(['bytes32', 'uint256'], [seed, BigInt(i)]))) % BigInt(window))
  ).sort((a, b) => a - b);
}

// First block whose timestamp is >= ts, or null if the chain has not got there yet.
async function firstBlockAtOrAfter(ts) {
  const latest = await publicClient.getBlockNumber();
  const at = async (n) => Number((await publicClient.getBlock({ blockNumber: n })).timestamp);
  if ((await at(latest)) < ts) return null;
  let lo = 0n;
  let hi = latest;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if ((await at(mid)) < ts) lo = mid + 1n;
    else hi = mid;
  }
  return lo;
}

// Wallets that never earn: the treasury, the payout contract, burn addresses, REVSHARE_EXCLUDE, and any address with
// contract code (the trading pool, the Hoodlock lockers, the PONS liquidity locker, the launchpad) unless listed in REVSHARE_INCLUDE.
// A wallet upgraded with EIP-7702 (code = 0xef0100 + delegate) is still a person's wallet, so it counts.
const isPersonalWallet = (code) => !code || code === '0x' || code.toLowerCase().startsWith('0xef0100');

async function holdersOnly(weights) {
  const never = new Set([
    ...BURN_ADDRESSES,
    TREASURY?.toLowerCase(),
    TOKEN_ADDRESS?.toLowerCase(),
    REVSHARE_ADDRESS?.toLowerCase(),
    ...addrList(process.env.REVSHARE_EXCLUDE),
  ]);
  const candidates = [...weights.entries()].filter(([a, w]) => w > 0n && !never.has(a));
  const codes = await mapLimit(candidates, 8, ([a]) =>
    INCLUDE.has(a) ? '0x' : publicClient.getCode({ address: getAddress(a) })
  );
  return candidates.filter((_, i) => isPersonalWallet(codes[i]));
}

async function computeMonth(month, epochs, seedBlock) {
  const t0 = iso(monthStart(month));
  const t1 = iso(monthEnd(month));
  const revenue = await revenueBetween(t0, t1);
  const carried = unpaidMonths(epochs);
  const pendingCents = carried.reduce((s, e) => s + e.revenueUsdCents, 0) + revenue.usdCents;
  const pendingRaw = carried.reduce((s, e) => s + e.revenueRaw, 0n) + revenue.raw;

  // The month's burns (its own revenue only: a carried month is burned when it closes, so nothing is burned twice).
  const burns = GAME_BURNS.map((g) => {
    const raw = revenue.games.find((r) => r.game === g.game)?.raw || 0n;
    return { month, game: g.game, amountRaw: (raw * BigInt(g.bps)) / 10_000n };
  }).filter((b) => b.amountRaw > 0n);

  const base = {
    month,
    burns,
    orders: revenue.orders,
    revenueUsdCents: revenue.usdCents,
    revenueRaw: revenue.raw,
    poolRaw: 0n,
    paidOutRaw: 0n,
    holders: 0,
  };
  if (pendingCents < Math.round(REVSHARE_MIN_USD * 100)) {
    return { ...base, status: 'carried', note: `$${(pendingCents / 100).toFixed(2)} since the last payout is under the $${REVSHARE_MIN_USD} minimum` };
  }

  // Random snapshots, seeded by the first block after the month.
  const seed = (await publicClient.getBlock({ blockNumber: seedBlock })).hash;
  const times = snapshotTimes(seed, month);
  const weights = new Map();
  for (const t of times) {
    for (const [a, b] of await store.balancesAt(iso(t))) weights.set(a, (weights.get(a) || 0n) + b);
  }
  const counted = await holdersOnly(weights);
  const totalWeight = counted.reduce((s, [, w]) => s + w, 0n);
  if (totalWeight === 0n) return { ...base, status: 'carried', note: 'no holders at the snapshots' };

  // Each holder's cut, rounded down, added to what earlier payouts already owed them.
  const pool = (pendingRaw * BigInt(REVSHARE_BPS)) / 10_000n;
  const owed = new Map();
  const lastTreeMonth = [...epochs].reverse().find((e) => e.root)?.month;
  if (lastTreeMonth) {
    for (const v of (await store.epochTree(lastTreeMonth)).values) owed.set(v.value[0].toLowerCase(), BigInt(v.value[1]));
  }
  let paidOut = 0n;
  for (const [a, w] of counted) {
    const share = (pool * w) / totalWeight;
    if (share === 0n) continue;
    owed.set(a, (owed.get(a) || 0n) + share);
    paidOut += share;
  }
  const entries = [...owed.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([a, v]) => [getAddress(a), v.toString()]);
  const tree = StandardMerkleTree.of(entries, ['address', 'uint256']);
  const claims = [...tree.entries()].map(([i, [address, cumulative]]) => ({
    address: address.toLowerCase(),
    cumulative: BigInt(cumulative),
    proof: tree.getProof(i),
  }));

  return {
    ...base,
    status: 'computed',
    poolRaw: pool,
    paidOutRaw: paidOut,
    holders: counted.length,
    root: tree.root,
    totalAllocatedRaw: [...owed.values()].reduce((s, v) => s + v, 0n),
    seedBlock,
    seed,
    snapshots: times.map(iso),
    tree: tree.dump(),
    claims,
  };
}

// ---- on-chain
async function publish(e) {
  if (!REVSHARE_ADDRESS) return { waiting: 'NEXT_PUBLIC_REVSHARE_ADDRESS is not set' };
  if (!PUBLISHER_KEY) return { waiting: 'REVSHARE_PUBLISHER_KEY is not set' };

  const read = (functionName) => publicClient.readContract({ address: REVSHARE_ADDRESS, abi: revshareAbi, functionName });
  if ((await read('merkleRoot')) === e.root) {
    await store.markPublished(e.month, null); // an earlier run got it on-chain but stopped before saying so
    return { published: e.root, already: true };
  }
  const last = Number(await read('lastPublishedAt'));
  const chainNow = Number((await publicClient.getBlock()).timestamp); // the contract goes by the chain's clock
  if (last && chainNow < last + MIN_INTERVAL_SECONDS) {
    return { waiting: `the contract allows the next payout after ${iso(last + MIN_INTERVAL_SECONDS)}` };
  }

  // The contract pulls whatever it is short of from the treasury: check the treasury can cover it, and say so plainly.
  const [held, claimedSoFar, ready] = await Promise.all([
    publicClient.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [REVSHARE_ADDRESS] }),
    read('totalClaimed'),
    treasuryReadiness(),
  ]);
  const needed = e.totalAllocatedRaw > held + claimedSoFar ? e.totalAllocatedRaw - held - claimedSoFar : 0n;
  if (needed > 0n && ready) {
    const decimals = await getDecimals();
    const fmt = (v) => (Number(v) / 10 ** decimals).toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (ready.balance < needed) return { waiting: `the treasury holds ${fmt(ready.balance)} $CREATIONS; this payout needs ${fmt(needed)}` };
    if (ready.allowance < needed) {
      return { waiting: `the treasury has approved the contract for ${fmt(ready.allowance)} $CREATIONS; this payout needs ${fmt(needed)}` };
    }
  }

  const account = privateKeyToAccount(PUBLISHER_KEY.startsWith('0x') ? PUBLISHER_KEY : `0x${PUBLISHER_KEY}`);
  const wallet = createWalletClient({ account, chain: robinhoodChain, transport: serverTransport({ fetchFn: patientFetch }) });
  try {
    const { request } = await publicClient.simulateContract({
      account,
      address: REVSHARE_ADDRESS,
      abi: revshareAbi,
      functionName: 'publish',
      args: [e.root, e.totalAllocatedRaw],
    });
    const hash = await wallet.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') return { error: `publish reverted in ${hash}` };
    await store.markPublished(e.month, hash);
    return { published: e.root, txHash: hash };
  } catch (err) {
    // Usually the treasury: not enough $CREATIONS, or not enough allowance for the contract. Retried next run.
    return { error: err.shortMessage || err.message };
  }
}

// ---- burns from checkout sales
const publisherAccount = () =>
  PUBLISHER_KEY ? privateKeyToAccount(PUBLISHER_KEY.startsWith('0x') ? PUBLISHER_KEY : `0x${PUBLISHER_KEY}`) : null;

// Finishes one recorded burn. Returns { burned, txHash? } or { waiting } / { error } (retried on the next run).
async function burnOne(b) {
  const decimals = await getDecimals();
  const fmt = (v) => (Number(v) / 10 ** decimals).toLocaleString('en-US', { maximumFractionDigits: 2 });

  // 1. A burn the job already sent: wait for it.
  if (b.status === 'sent' && b.txHash) {
    let receipt;
    try {
      receipt = await publicClient.getTransactionReceipt({ hash: b.txHash });
    } catch (err) {
      if (err.name === 'TransactionReceiptNotFoundError') return { waiting: `burn ${b.txHash} is not mined yet` };
      throw err;
    }
    if (receipt.status === 'success') {
      await store.markBurned(b, b.txHash);
      return { burned: true, txHash: b.txHash };
    }
    await store.resetBurn(b);
    return { error: `burn ${b.txHash} reverted; it is retried on the next run` };
  }
  if (!TREASURY) return { waiting: 'the treasury address is not set' };
  const treasury = TREASURY.toLowerCase();

  // 2. The treasury burned by hand: anything it sent to a burn address since this burn was recorded, minus the burns
  //    the burns already credited in that time (by the job or by hand), counts - so one hand burn is never used twice.
  const [sentByTreasury, all] = await Promise.all([
    store.transfersTotal({ to: BURN_ADDRESSES, from: [treasury], t0: b.createdAt }),
    store.listBurns(),
  ]);
  const credited = all
    .filter((x) => x.status === 'burned' && x.burnedAt && x.burnedAt >= b.createdAt)
    .reduce((s, x) => s + x.amountRaw, 0n);
  if (sentByTreasury.total - credited >= b.amountRaw) {
    await store.markBurned(b, null);
    return { burned: true, manual: true };
  }

  // 3. Burn it automatically. If the publisher wallet IS the treasury it burns with a plain transfer; otherwise it
  //    burns from the treasury through the allowance the treasury gave it (transferFrom).
  const account = publisherAccount();
  const owes = `the treasury owes a burn of ${fmt(b.amountRaw)} $CREATIONS for ${b.game} (${b.month})`;
  if (!account) return { waiting: `${owes}: set REVSHARE_PUBLISHER_KEY so the job can burn it` };
  const direct = account.address.toLowerCase() === treasury;
  const [balance, allowance] = await Promise.all([
    publicClient.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [TREASURY] }),
    direct
      ? Promise.resolve(b.amountRaw)
      : publicClient.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [TREASURY, account.address] }),
  ]);
  if (balance < b.amountRaw) return { waiting: `${owes}, but it holds ${fmt(balance)}` };
  if (allowance < b.amountRaw) {
    return {
      waiting: `${owes}: approve the publisher wallet ${account.address} to spend the treasury's $CREATIONS (at least ${fmt(b.amountRaw)}) and the job burns it on its next run`,
    };
  }

  const wallet = createWalletClient({ account, chain: robinhoodChain, transport: serverTransport({ fetchFn: patientFetch }) });
  try {
    const { request } = await publicClient.simulateContract({
      account,
      address: TOKEN_ADDRESS,
      abi: erc20Abi,
      ...(direct
        ? { functionName: 'transfer', args: [BURN_TO, b.amountRaw] }
        : { functionName: 'transferFrom', args: [TREASURY, BURN_TO, b.amountRaw] }),
    });
    const hash = await wallet.writeContract(request);
    await store.markBurnSent(b, hash); // recorded before waiting, so a run that dies here never burns twice
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      await store.resetBurn(b);
      return { error: `burn reverted in ${hash}` };
    }
    await store.markBurned(b, hash);
    return { burned: true, txHash: hash };
  } catch (err) {
    return { error: err.shortMessage || err.message };
  }
}

// Every recorded burn that isn't finished, oldest first. Payouts wait until this reports { done }.
async function settleBurns({ dryRun = false } = {}) {
  const open = await store.openBurns();
  if (!open.length) return { done: true };
  if (dryRun) {
    return { waiting: `${open.length} burn(s) still to finish`, open: open.map((b) => ({ ...b, amountRaw: b.amountRaw.toString() })) };
  }
  const done = [];
  for (const b of open) {
    const r = await burnOne(b);
    if (!r.burned) return { ...r, finished: done };
    done.push({ month: b.month, game: b.game, ...r });
  }
  return { done: true, burned: done };
}

// What the treasury can still pay through the contract, for the stats page and warnings.
export async function treasuryReadiness() {
  if (!REVSHARE_ADDRESS || !TREASURY) return null;
  const [balance, allowance] = await Promise.all([
    publicClient.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [TREASURY] }),
    publicClient.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [TREASURY, REVSHARE_ADDRESS] }),
  ]);
  return { balance, allowance };
}

// One step of the payout schedule. `dryRun` works the next month out and returns it without saving or publishing.
export async function settle({ dryRun = false } = {}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(START_MONTH)) return { waiting: 'REVSHARE_START_MONTH is not set' };

  // Burns owed from closed months come first: nothing is paid out, and no new month is closed, until they are done.
  const burns = await settleBurns({ dryRun });
  if (!burns.done && !dryRun) return { burn: burns, waiting: burns.waiting || burns.error };

  const epochs = await store.listEpochs();
  const pending = epochs.find((e) => e.status === 'computed');
  if (pending && !dryRun) return { month: pending.month, ...(await publish(pending)) };

  const month = epochs.length ? nextMonth(epochs[epochs.length - 1].month) : START_MONTH;
  if (monthEnd(month) * 1000 > Date.now()) return { waiting: `${month} has not finished yet` };

  // Every transfer up to the month's end, and the block that seeds the snapshots, must be in the copy.
  const seedBlock = await firstBlockAtOrAfter(monthEnd(month));
  const indexed = await indexedBlock();
  if (seedBlock === null || indexed === null || indexed < seedBlock) {
    return { waiting: `the transfer copy has not reached the end of ${month} yet` };
  }

  const e = await computeMonth(month, epochs, seedBlock);
  const { tree, claims, burns: owed, ...summary } = e;
  if (dryRun) {
    return { dryRun: true, ...summary, burns: owed.map((b) => ({ ...b, amountRaw: b.amountRaw.toString() })), openBurns: burns.done ? undefined : burns };
  }

  if (e.status === 'computed') await store.saveClaims(e.root, claims); // claims first: the root is useless without them
  await store.saveBurns(owed); // before the month is saved: a run that dies in between records them again next time
  await store.saveEpoch(e);
  const burned = await settleBurns();
  if (e.status === 'carried') return { month, carried: true, note: e.note, burn: burned };
  if (!burned.done) return { month, computed: e.root, burn: burned, waiting: burned.waiting || burned.error };
  return { month, computed: e.root, burn: burned, ...(await publish(e)) };
}

// One run of the daily job: copy new transfers, then close and publish the next finished month if the copy caught up
// early enough to leave the payout step the rest of the time limit. Used by the cron and by the admin page.
export async function runJob({ dryRun = false } = {}) {
  const started = Date.now();
  const index = await indexTransfers({ deadline: started + 120_000 });
  const result =
    index.caughtUp && Date.now() - started < 60_000
      ? await settle({ dryRun })
      : { waiting: 'still copying transfers; the payout step runs once the copy is caught up' };
  const treasury = await treasuryReadiness().catch(() => null);
  return { index, settle: result, treasury, ms: Date.now() - started };
}

// Everything the site shows about the economy: revenue from every game, burns, payouts, and the next payout.
export async function economyStats() {
  const decimals = TOKEN_ADDRESS ? await getDecimals() : 18;
  const [allRevenue, epochs, burned, saleBurns] = await Promise.all([
    revenueBetween(null, null, { strict: false }),
    store.listEpochs(),
    store.transfersTotal({ to: BURN_ADDRESSES }),
    store.listBurns().catch(() => []), // before supabase/revshare.sql's revshare_burns table exists
  ]);
  // A game's burns: what its burner contracts burned, plus the treasury burns made for its checkout sales.
  const burnedFor = (game) =>
    saleBurns.filter((b) => b.game === game && b.status === 'burned').reduce((s, b) => s + b.amountRaw, 0n);
  const gameBurns = await Promise.all(
    GAME_CONTRACTS.map(async (g) => ({
      game: g.game,
      raw:
        (await store.transfersTotal({ to: BURN_ADDRESSES, from: g.burners.map((a) => a.toLowerCase()) })).total +
        burnedFor(g.game),
    }))
  );

  // Revenue waiting for the next payout: carried months + everything after the last closed month.
  const lastClosed = epochs.length ? epochs[epochs.length - 1].month : null;
  const openFrom = lastClosed ? nextMonth(lastClosed) : START_MONTH || null;
  const open = openFrom ? await revenueBetween(iso(monthStart(openFrom)), null, { strict: false }) : null;
  const carried = unpaidMonths(epochs);
  const pendingCents = carried.reduce((s, e) => s + e.revenueUsdCents, 0) + (open?.usdCents || 0);
  const pendingRaw = carried.reduce((s, e) => s + e.revenueRaw, 0n) + (open?.raw || 0n);

  return {
    decimals,
    revenue: allRevenue,
    burned: { raw: burned.total, games: gameBurns },
    payouts: {
      months: epochs.filter((e) => e.status === 'published').length,
      paidRaw: epochs.filter((e) => e.status === 'published').reduce((s, e) => s + e.paidOutRaw, 0n),
    },
    next: {
      pendingUsdCents: pendingCents,
      minUsdCents: Math.round(REVSHARE_MIN_USD * 100),
      poolRaw: (pendingRaw * BigInt(REVSHARE_BPS)) / 10_000n, // what the next payout would take from the treasury
      awaitingPublish: epochs.some((e) => e.status === 'computed'),
    },
    epochs,
  };
}
