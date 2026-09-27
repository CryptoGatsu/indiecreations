// Server-side only: fetch for viem's HTTP transport that waits and tries again when the RPC says it is being asked
// too often. Robinhood Chain's public RPC answers bursts from shared servers (like Vercel's) with "Too Many Requests",
// sometimes as HTTP 429 and sometimes as a JSON-RPC error with code 429 - and viem does not retry the latter.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Only a genuine rate limit: -32005 alone is not enough, because RPCs also use it for "that block range is too big",
// which must go straight back to the caller so it can ask for a smaller range.
const RATE_LIMITED = /"code"\s*:\s*429\b|too many requests|rate limit/i;

export async function patientFetch(url, init) {
  let wait = 500;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    let limited = res.status === 429;
    if (!limited && res.ok) limited = RATE_LIMITED.test(await res.clone().text());
    if (!limited || attempt >= 6) return res;
    const retryAfter = Number(res.headers.get('retry-after')) * 1000;
    await sleep(retryAfter > 0 ? Math.min(retryAfter, 10_000) : wait + Math.random() * 250);
    wait = Math.min(wait * 2, 8_000); // 0.5, 1, 2, 4, 8, 8 s: about 25 s before giving up
  }
}

// The transport options every server-side chain client uses: patient, and batching bursts of reads into one request.
export const serverTransportOptions = { fetchFn: patientFetch, batch: { batchSize: 20, wait: 16 } };
