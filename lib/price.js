// Server-side only: the live USD price of $creations, used to turn a cosmetic's dollar price into a token amount.
//
// $creations trades on a Uniswap v4 pool against USDG on Robinhood Chain. Two independent indexers watch that pool;
// we ask both and only quote when they tell the same story. The pool is small, so a single source being wrong (or a
// momentary spike) must pause checkout rather than mis-price an order.
import { TOKEN_ADDRESS } from './config';

const CACHE_MS = 60_000;
const MAX_DISAGREEMENT = 0.15; // sources further apart than this -> no quote
const MIN_LIQUIDITY_USD = 1_000; // ignore dust pools that anyone could move with pocket change

let cache = { at: 0, value: null };

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6_000) });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).hostname}`);
  return res.json();
}

async function fromDexScreener() {
  const data = await getJson(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS}`);
  const pairs = (data.pairs || [])
    .filter(
      (p) =>
        p.chainId === 'robinhood' &&
        p.baseToken?.address?.toLowerCase() === TOKEN_ADDRESS.toLowerCase() &&
        (p.liquidity?.usd || 0) >= MIN_LIQUIDITY_USD
    )
    .sort((a, b) => b.liquidity.usd - a.liquidity.usd);
  return positive(pairs[0]?.priceUsd);
}

async function fromGeckoTerminal() {
  const data = await getJson(
    `https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/${TOKEN_ADDRESS.toLowerCase()}`
  );
  const attrs = data?.data?.attributes || {};
  if (Number(attrs.total_reserve_in_usd || 0) < MIN_LIQUIDITY_USD) return null;
  return positive(attrs.price_usd);
}

function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Returns { usd, sources } or null when there is no price we are willing to sell at.
export async function getTokenPriceUsd() {
  if (!TOKEN_ADDRESS) return null;
  if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;

  const results = await Promise.allSettled([fromDexScreener(), fromGeckoTerminal()]);
  const names = ['dexscreener', 'geckoterminal'];
  const prices = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) prices.push({ source: names[i], usd: r.value });
    else if (r.status === 'rejected') console.error(`price source ${names[i]} failed:`, r.reason?.message);
  });

  let value = null;
  if (prices.length === 2) {
    const [a, b] = prices.map((p) => p.usd);
    if (Math.abs(a - b) / Math.min(a, b) <= MAX_DISAGREEMENT) {
      value = { usd: (a + b) / 2, sources: names };
    } else {
      console.error('price sources disagree, not quoting:', prices);
    }
  } else if (prices.length === 1) {
    value = { usd: prices[0].usd, sources: [prices[0].source] };
  }

  // a failed lookup is not cached, so checkout comes back as soon as the sources do
  if (value) cache = { at: Date.now(), value };
  return value;
}
