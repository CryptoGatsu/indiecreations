import { fallback, http } from 'viem';

// Server-side only: fetch for viem's HTTP transport that keeps under the RPC's request rate and waits and tries again
// when the RPC still says it is being asked too often. Public and private RPCs both limit bursts: Robinhood Chain's
// public RPC answers "Too Many Requests" (HTTP 429 or JSON-RPC 429), QuickNode "50/second request limit reached"
// (JSON-RPC -32007). viem does not retry the JSON-RPC forms itself.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Only a genuine rate limit: -32005 alone is not enough, because RPCs also use it for "that block range is too big",
// which must go straight back to the caller so it can ask for a smaller range.
const RATE_LIMITED = /"code"\s*:\s*(429|-32007)\b|too many requests|rate limit|request limit/i;

// JSON-RPC calls per second this server instance sends, counting every call inside a batch (providers do).
const MAX_RPS = Math.max(1, Number(process.env.RPC_MAX_RPS || 25));
let windowStart = 0;
let used = 0;
async function throttle(calls) {
  for (;;) {
    const now = Date.now();
    if (now - windowStart >= 1000) {
      windowStart = now;
      used = 0;
    }
    if (used === 0 || used + calls <= MAX_RPS) {
      used += calls;
      return;
    }
    await sleep(windowStart + 1000 - now + 5);
  }
}

const callsIn = (body) => {
  try {
    const parsed = JSON.parse(body);
    return Array.isArray(parsed) ? parsed.length : 1;
  } catch {
    return 1;
  }
};

export async function patientFetch(url, init) {
  const calls = callsIn(init?.body);
  let wait = 500;
  for (let attempt = 0; ; attempt++) {
    await throttle(calls);
    const res = await fetch(url, init);
    let limited = res.status === 429;
    if (!limited && res.ok) limited = RATE_LIMITED.test(await res.clone().text());
    if (!limited || attempt >= 6) return res;
    const retryAfter = Number(res.headers.get('retry-after')) * 1000;
    await sleep(retryAfter > 0 ? Math.min(retryAfter, 10_000) : wait + Math.random() * 250);
    wait = Math.min(wait * 2, 8_000); // 0.5, 1, 2, 4, 8, 8 s: about 25 s before giving up
  }
}

// The transport options every server-side chain client uses: paced, patient, and batching bursts of reads.
export const serverTransportOptions = { fetchFn: patientFetch, batch: { batchSize: 10, wait: 16 } };

export const PUBLIC_RPC = 'https://rpc.mainnet.chain.robinhood.com';

// RPC_URL (a private endpoint, e.g. QuickNode) first, Robinhood Chain's public RPC when it fails: an expired plan or
// an endpoint that stops answering ("fetch failed") then slows the site down instead of taking the rewards page,
// sign-in balances and the daily job down with it.
export function serverTransport(options = serverTransportOptions) {
  const url = process.env.RPC_URL;
  if (!url || url === PUBLIC_RPC) return http(PUBLIC_RPC, options);
  return fallback([http(url, options), http(PUBLIC_RPC, options)]);
}
