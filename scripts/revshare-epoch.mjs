#!/usr/bin/env node
// Works out one month of holder revenue share and writes the files the /rewards page and the contract need.
//
//   node scripts/revshare-epoch.mjs --month 2026-10            # dry run: prints the result, writes nothing
//   node scripts/revshare-epoch.mjs --month 2026-10 --write    # updates public/revshare/tree.json + epochs.json
//
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (to read paid shop orders). Optional: RPC_URL, REVSHARE_BPS
// (default 2500 = 25%), NEXT_PUBLIC_REVSHARE_ADDRESS, REVSHARE_EXCLUDE / REVSHARE_INCLUDE (comma-separated wallets),
// REVSHARE_FROM_BLOCK (block the token was deployed in, to skip scanning empty history), REVSHARE_SNAPSHOTS (default 4).
//
// The split: REVSHARE_SNAPSHOTS snapshots of every balance are taken at random moments in the last 14 days of the
// month, and each wallet earns pool x (its balances added up over the snapshots) / (the same for all counted wallets).
// Holding through the whole fortnight catches every snapshot; holding for part of it catches some. Nobody locks or
// deposits anything.
//
// The moments are random but checkable: they come from the hash of the first block mined after the month ends,
// which nobody (the studio included) can know in advance, and anyone can recompute them from epochs.json.
//
// The payout itself comes from the treasury: publish() on the contract pulls the month's pool from it.
//
// Not counted: the treasury, the RevenueShare contract, the zero and dead addresses, REVSHARE_EXCLUDE, and every
// address with contract code (the trading pool, the Hoodlock lockers, the launchpad) unless listed in
// REVSHARE_INCLUDE. The excluded contracts are printed so they can be checked by eye.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPublicClient, encodePacked, erc20Abi, formatUnits, getAddress, http, isAddress, keccak256, parseAbiItem,
} from 'viem';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'revshare');
const TREE_FILE = path.join(OUT_DIR, 'tree.json');
const EPOCHS_FILE = path.join(OUT_DIR, 'epochs.json');

// Same defaults as lib/config.js and lib/shop.js (this script runs in plain Node, so it cannot import them).
const TOKEN = getAddress(process.env.NEXT_PUBLIC_TOKEN_ADDRESS || '0xB9195597f91f179EBB05D3F1765B35C3d8491aCb');
const TREASURY = getAddress(process.env.SHOP_TREASURY_ADDRESS || '0x901fC42f24adc138F73BaC931557Ab17AfCA7093');
const RPC = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
const BPS = BigInt(process.env.REVSHARE_BPS || 2500);
const REVSHARE = process.env.NEXT_PUBLIC_REVSHARE_ADDRESS || '';
const FROM_BLOCK = BigInt(process.env.REVSHARE_FROM_BLOCK || 0);
const SNAPSHOTS = Number(process.env.REVSHARE_SNAPSHOTS || 4);
const WINDOW_SECONDS = 14 * 24 * 60 * 60; // the last two weeks of the month

const addrList = (s) => (s || '').split(',').map((a) => a.trim()).filter((a) => isAddress(a)).map((a) => a.toLowerCase());
const EXCLUDE = new Set([
  '0x0000000000000000000000000000000000000000',
  '0x000000000000000000000000000000000000dead',
  TREASURY.toLowerCase(),
  TOKEN.toLowerCase(),
  ...(isAddress(REVSHARE) ? [REVSHARE.toLowerCase()] : []),
  ...addrList(process.env.REVSHARE_EXCLUDE),
]);
const INCLUDE = new Set(addrList(process.env.REVSHARE_INCLUDE));

const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const client = createPublicClient({ transport: http(RPC, { retryCount: 5 }) });

function args() {
  const a = process.argv.slice(2);
  const month = a[a.indexOf('--month') + 1];
  if (!a.includes('--month') || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) {
    console.error('Usage: node scripts/revshare-epoch.mjs --month YYYY-MM [--write]');
    process.exit(1);
  }
  return { month, write: a.includes('--write') };
}

// ---- revenue: paid shop orders in the month, straight from Supabase's REST API
async function monthRevenue(startIso, endIso) {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to read shop orders.');

  let total = 0n;
  let orders = 0;
  for (let offset = 0; ; offset += 1000) {
    const q = `shop_orders?select=amount_raw&status=eq.paid&paid_at=gte.${encodeURIComponent(startIso)}` +
      `&paid_at=lt.${encodeURIComponent(endIso)}&order=paid_at.asc&limit=1000&offset=${offset}`;
    const res = await fetch(`${base}/rest/v1/${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const rows = await res.json();
    for (const r of rows) total += BigInt(r.amount_raw);
    orders += rows.length;
    if (rows.length < 1000) break;
  }
  return { total, orders };
}

// ---- chain helpers
// Runs fn over items, at most `limit` at a time, so public RPCs do not rate-limit us.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const blockTime = new Map();
async function timestampOf(blockNumber) {
  if (!blockTime.has(blockNumber)) {
    const b = await client.getBlock({ blockNumber });
    blockTime.set(blockNumber, Number(b.timestamp));
  }
  return blockTime.get(blockNumber);
}

// First block whose timestamp is >= ts (or latest + 1 if the chain has not got there yet).
async function firstBlockAtOrAfter(ts) {
  const latest = await client.getBlockNumber();
  if ((await timestampOf(latest)) < ts) return latest + 1n;
  let lo = 0n;
  let hi = latest;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if ((await timestampOf(mid)) < ts) lo = mid + 1n;
    else hi = mid;
  }
  return lo;
}

// All Transfer logs of the token in [from, to], in order. Halves the range whenever the RPC refuses a big one.
async function transferLogs(from, to) {
  const out = [];
  let step = 50_000n;
  for (let start = from; start <= to; ) {
    const end = start + step - 1n > to ? to : start + step - 1n;
    try {
      out.push(...(await client.getLogs({ address: TOKEN, event: transferEvent, fromBlock: start, toBlock: end })));
      start = end + 1n;
      if (step < 1_000_000n) step *= 2n;
    } catch (err) {
      if (step <= 100n) throw err;
      step /= 2n;
    }
  }
  return out.sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1);
}

// ---- the split
async function main() {
  const { month, write } = args();
  const [y, m] = month.split('-').map(Number);
  const startTs = Date.UTC(y, m - 1, 1) / 1000;
  const endTs = Date.UTC(y, m, 1) / 1000;
  if (endTs * 1000 > Date.now()) throw new Error(`${month} has not finished yet.`);

  const history = fs.existsSync(EPOCHS_FILE) ? JSON.parse(fs.readFileSync(EPOCHS_FILE, 'utf8')) : [];
  if (history.some((e) => e.month === month)) throw new Error(`${month} is already in epochs.json.`);
  if (history.length && history[history.length - 1].month > month) {
    throw new Error(`Months must be run in order; the last one done is ${history[history.length - 1].month}.`);
  }

  const decimals = await client.readContract({
    address: TOKEN,
    abi: [parseAbiItem('function decimals() view returns (uint8)')],
    functionName: 'decimals',
  });
  const fmt = (raw) => Number(formatUnits(raw, decimals)).toLocaleString('en-US', { maximumFractionDigits: 2 });

  const revenue = await monthRevenue(new Date(startTs * 1000).toISOString(), new Date(endTs * 1000).toISOString());
  const pool = (revenue.total * BPS) / 10_000n;
  console.log(`${month}: ${revenue.orders} paid orders, ${fmt(revenue.total)} $creations revenue`);
  console.log(`Holder pool (${Number(BPS) / 100}%): ${fmt(pool)} $creations`);

  // The random snapshot moments, seeded by the first block after the month.
  const endBlock = await firstBlockAtOrAfter(endTs); // first block NOT in the month
  if (endBlock > (await client.getBlockNumber())) throw new Error('Wait for the first block after the month ends.');
  const seed = (await client.getBlock({ blockNumber: endBlock })).hash;
  const windowStart = endTs - WINDOW_SECONDS;
  const snapshots = Array.from({ length: SNAPSHOTS }, (_, i) =>
    windowStart + Number(BigInt(keccak256(encodePacked(['bytes32', 'uint256'], [seed, BigInt(i)]))) % BigInt(WINDOW_SECONDS))
  ).sort((a, b) => a - b);
  console.log(`Snapshots (seeded by block ${endBlock}, ${seed}):`);
  for (const t of snapshots) console.log(`  ${new Date(t * 1000).toISOString()}`);

  const windowBlock = await firstBlockAtOrAfter(windowStart);
  console.log('Reading transfers...');
  const logs = await transferLogs(FROM_BLOCK, endBlock - 1n);
  const windowBlocks = [...new Set(logs.filter((l) => l.blockNumber >= windowBlock).map((l) => l.blockNumber))];
  await mapLimit(windowBlocks, 8, timestampOf);

  // Replay every transfer in order. Each snapshot records every balance as it stood at that second: transfers mined
  // at or before it count, later ones do not. A wallet's weight is its balances added up over all the snapshots.
  const balance = new Map();
  const weight = new Map();
  let next = 0;
  const takeSnapshotsBefore = (t) => {
    for (; next < snapshots.length && snapshots[next] < t; next++) {
      for (const [a, b] of balance) if (b > 0n) weight.set(a, (weight.get(a) || 0n) + b);
    }
  };
  for (const log of logs) {
    if (log.blockNumber >= windowBlock) takeSnapshotsBefore(await timestampOf(log.blockNumber));
    const from = log.args.from.toLowerCase();
    const to = log.args.to.toLowerCase();
    balance.set(from, (balance.get(from) || 0n) - log.args.value);
    balance.set(to, (balance.get(to) || 0n) + log.args.value);
  }
  takeSnapshotsBefore(Infinity);

  // Drop the addresses that are not holders.
  const excludedContracts = [];
  let counted = [...weight.entries()].filter(([a, w]) => w > 0n && !EXCLUDE.has(a));
  const codes = await mapLimit(counted, 8, ([a]) =>
    INCLUDE.has(a) ? '0x' : client.getCode({ address: getAddress(a) }).then((c) => c || '0x'));
  counted = counted.filter(([a, w], i) => {
    if (codes[i] === '0x') return true;
    excludedContracts.push([a, w]);
    return false;
  });

  const totalWeight = counted.reduce((s, [, w]) => s + w, 0n);
  if (totalWeight === 0n) throw new Error('No holders to pay.');
  for (const [a, w] of excludedContracts.sort((x, y) => (x[1] < y[1] ? 1 : -1))) {
    console.log(`  not counted (contract): ${a}  avg balance ${fmt(w / BigInt(SNAPSHOTS))}`);
  }

  // Each holder's cut, rounded down, added to what previous months already owed them.
  const previous = new Map();
  if (fs.existsSync(TREE_FILE)) {
    for (const v of JSON.parse(fs.readFileSync(TREE_FILE, 'utf8')).values) {
      previous.set(v.value[0].toLowerCase(), BigInt(v.value[1]));
    }
  }
  const owed = new Map(previous);
  let paidOut = 0n;
  for (const [a, w] of counted) {
    const share = (pool * w) / totalWeight;
    if (share === 0n) continue;
    owed.set(a, (owed.get(a) || 0n) + share);
    paidOut += share;
  }
  const holders = counted.length;
  const totalAllocated = [...owed.values()].reduce((s, v) => s + v, 0n);

  const entries = [...owed.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([a, v]) => [getAddress(a), v.toString()]);
  const tree = StandardMerkleTree.of(entries, ['address', 'uint256']);

  console.log(`Holders counted: ${holders}`);
  console.log(`Paid out this month: ${fmt(paidOut)} $creations (rounding keeps ${fmt(pool - paidOut)})`);
  console.log('Top earners this month:');
  for (const [a, w] of [...counted].sort((x, y) => (x[1] < y[1] ? 1 : -1)).slice(0, 10)) {
    console.log(`  ${a}  ${((Number((w * 1_000_000n) / totalWeight)) / 10_000).toFixed(2)}%  ${fmt((pool * w) / totalWeight)}`);
  }
  console.log(`\nMerkle root:      ${tree.root}`);
  console.log(`Total allocated:  ${totalAllocated} (base units)`);

  // publish() pulls the month from the treasury: warn now if that would fail.
  if (isAddress(REVSHARE)) {
    const [held, allowed] = await Promise.all([
      client.readContract({ address: TOKEN, abi: erc20Abi, functionName: 'balanceOf', args: [TREASURY] }),
      client.readContract({ address: TOKEN, abi: erc20Abi, functionName: 'allowance', args: [TREASURY, REVSHARE] }),
    ]);
    if (held < paidOut) console.log(`\nWARNING: the treasury holds only ${fmt(held)} $creations.`);
    if (allowed < paidOut) {
      console.log(`\nWARNING: the treasury has approved the contract for only ${fmt(allowed)} $creations.` +
        ` Approve it (from the treasury wallet) before publishing.`);
    }
  }

  if (!write) {
    console.log('\nDry run: nothing written. Re-run with --write to save the files.');
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(TREE_FILE, JSON.stringify(tree.dump()));
  history.push({
    month,
    orders: revenue.orders,
    revenueRaw: revenue.total.toString(),
    bps: Number(BPS),
    poolRaw: pool.toString(),
    paidOutRaw: paidOut.toString(),
    holders,
    root: tree.root,
    totalAllocatedRaw: totalAllocated.toString(),
    seedBlock: endBlock.toString(),
    seed,
    snapshots: snapshots.map((t) => new Date(t * 1000).toISOString()),
  });
  fs.writeFileSync(EPOCHS_FILE, JSON.stringify(history, null, 2) + '\n');

  console.log(`\nWrote ${path.relative(ROOT, TREE_FILE)} and ${path.relative(ROOT, EPOCHS_FILE)}. Next:`);
  console.log(`  1. commit and push both files`);
  console.log(`  2. call publish(${tree.root}, ${totalAllocated}) from the owner wallet;`);
  console.log(`     it pulls ${fmt(paidOut)} $creations from the treasury ${TREASURY}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
