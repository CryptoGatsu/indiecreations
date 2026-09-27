// Server-side only: copies every $CREATIONS Transfer from Robinhood Chain into Supabase (token_transfers), picking up
// where the last run stopped. Balances at any moment, burns and on-chain game revenue are all read from that copy.
import { getAddress, parseAbiItem } from 'viem';
import { TOKEN_ADDRESS } from './config';
import { publicClient } from './holder';
import * as store from './revshareStore';

const INDEX_ID = 'creations';
const CONFIRMATIONS = 10n; // stay a few blocks behind the tip
const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

// Runs fn over items, at most `limit` at a time, so the RPC does not rate-limit us.
export async function mapLimit(items, limit, fn) {
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

// The last block copied so far (null before the first run).
export const indexedBlock = () => store.getIndexedBlock(INDEX_ID);

// Copies transfers until caught up or `deadline` (ms timestamp) passes. Returns what it did.
export async function indexTransfers({ deadline }) {
  let last = await store.getIndexedBlock(INDEX_ID);
  if (last === null) {
    const from = process.env.REVSHARE_FROM_BLOCK;
    if (!from) throw new Error('Set REVSHARE_FROM_BLOCK to the block $CREATIONS was deployed in.');
    last = BigInt(from) - 1n;
  }
  const head = (await publicClient.getBlockNumber()) - CONFIRMATIONS;
  const startedAt = last;
  let saved = 0;
  let step = 20_000n;

  while (last < head && Date.now() < deadline) {
    const from = last + 1n;
    const to = from + step - 1n < head ? from + step - 1n : head;
    let logs;
    try {
      logs = await publicClient.getLogs({ address: TOKEN_ADDRESS, event: transferEvent, fromBlock: from, toBlock: to });
    } catch (err) {
      if (step <= 50n) throw err;
      step /= 2n; // the RPC refused the range: ask for less
      continue;
    }

    const times = new Map();
    const blocks = [...new Set(logs.map((l) => l.blockNumber))];
    await mapLimit(blocks, 8, async (n) => {
      times.set(n, new Date(Number((await publicClient.getBlock({ blockNumber: n })).timestamp) * 1000).toISOString());
    });
    await store.saveTransfers(
      logs.map((l) => ({
        block_number: Number(l.blockNumber),
        log_index: l.logIndex,
        block_time: times.get(l.blockNumber),
        tx_hash: l.transactionHash.toLowerCase(),
        from_addr: getAddress(l.args.from).toLowerCase(),
        to_addr: getAddress(l.args.to).toLowerCase(),
        value: l.args.value.toString(),
      }))
    );
    await store.setIndexedBlock(INDEX_ID, to);
    saved += logs.length;
    last = to;
    if (step < 500_000n) step *= 2n;
  }

  return { from: (startedAt + 1n).toString(), to: last.toString(), head: head.toString(), saved, caughtUp: last >= head };
}
