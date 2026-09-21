// Server-side only: the cosmetics shop. Turns a USD price into a $creations quote, and hands over the cosmetic only
// after the payment has been seen on Robinhood Chain.
//
// How a purchase is tied to its payment, without asking the buyer for anything but the transfer itself:
//   - the quote names the exact wallet that will pay, and an exact amount whose last few wei are random per order;
//   - the payment only counts if it is a $creations Transfer FROM that wallet TO the treasury of EXACTLY that amount,
//     mined after the quote was made;
//   - a transaction can settle one order, ever (unique index on tx_hash).
// So nobody can claim someone else's payment, replay an old one, or pay once and collect twice.
import crypto from 'crypto';
import { erc20Abi, formatUnits, getAddress, isAddress, parseEventLogs, parseUnits } from 'viem';
import { TOKEN_ADDRESS } from './config';
import { findItem } from './catalog';
import { getDecimals, publicClient } from './holder';
import { getTokenPriceUsd } from './price';
import * as store from './shopStore';

export const QUOTE_TTL_SECONDS = 10 * 60;
const CLOCK_SLACK_MS = 2 * 60 * 1000;

// The studio wallet that receives shop payments. It is a public address, so it lives here like the token's CA;
// SHOP_TREASURY_ADDRESS can override it (e.g. to test against another wallet).
const TREASURY_RAW = process.env.SHOP_TREASURY_ADDRESS || '0x901fC42f24adc138F73BaC931557Ab17AfCA7093';
export const TREASURY = isAddress(TREASURY_RAW) ? getAddress(TREASURY_RAW) : null;

export class ShopError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// { open: true } or { open: false, reason } - why nothing can be bought right now.
export function shopStatus() {
  if (!TOKEN_ADDRESS) return { open: false, reason: 'The token is not live yet.' };
  if (!TREASURY) return { open: false, reason: 'Checkout is not switched on yet.' };
  if (!store.persistent && process.env.NODE_ENV === 'production') {
    return { open: false, reason: 'Checkout is not switched on yet.' };
  }
  return { open: true };
}

// Whole tokens for a dollar amount at a given price, rounded up so rounding never short-changes the studio.
export const tokensForUsd = (usd, priceUsd) => Math.ceil(usd / priceUsd);

export async function createQuote({ steamId, itemId, wallet }) {
  const status = shopStatus();
  if (!status.open) throw new ShopError(503, status.reason);

  const item = findItem(itemId);
  if (!item) throw new ShopError(404, 'That item does not exist.');
  if (item.available === false) throw new ShopError(409, 'That item is not on sale yet.');
  if (!isAddress(wallet || '')) throw new ShopError(400, 'Connect a wallet first.');
  const payer = wallet.toLowerCase();

  if ((await store.listOwned(steamId)).includes(item.id)) {
    throw new ShopError(409, 'This Steam account already owns that item.');
  }

  const decimals = await getDecimals();
  const open = await store.findOpenOrder({ steamId, itemId: item.id, wallet: payer });
  if (open) return describe(open, item, decimals);

  const price = await getTokenPriceUsd();
  if (!price) throw new ShopError(503, 'Live pricing is unavailable right now. Try again in a minute.');

  const amount =
    parseUnits(String(tokensForUsd(item.usd, price.usd)), decimals) + BigInt(crypto.randomInt(1, 1_000_000));

  const now = Date.now();
  const order = {
    id: crypto.randomUUID(),
    steam_id: steamId,
    item_id: item.id,
    game: item.game,
    wallet: payer,
    usd_cents: Math.round(item.usd * 100),
    price_usd: price.usd,
    amount_raw: amount.toString(),
    treasury: TREASURY.toLowerCase(),
    status: 'pending',
    tx_hash: null,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + QUOTE_TTL_SECONDS * 1000).toISOString(),
    paid_at: null,
  };
  await store.createOrder(order);
  return describe(order, item, decimals);
}

function describe(order, item, decimals) {
  return {
    orderId: order.id,
    item: { id: item.id, name: item.name, game: item.game, usd: item.usd },
    token: TOKEN_ADDRESS,
    treasury: getAddress(order.treasury),
    wallet: getAddress(order.wallet),
    amountRaw: order.amount_raw,
    amount: formatUnits(BigInt(order.amount_raw), decimals),
    priceUsd: Number(order.price_usd),
    expiresAt: order.expires_at,
  };
}

// Returns { state: 'delivered' | 'pending' }, or throws a ShopError when the payment can't be accepted.
export async function confirmOrder({ orderId, txHash }) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId || '')) throw new ShopError(400, 'Invalid order.');
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash || '')) throw new ShopError(400, 'Invalid transaction hash.');
  const hash = txHash.toLowerCase();

  const order = await store.getOrder(orderId);
  if (!order) throw new ShopError(404, 'Order not found.');

  if (order.status === 'paid') {
    if (order.tx_hash !== hash) throw new ShopError(409, 'This order was already paid by another transaction.');
    await deliver(order); // finishes the job if an earlier attempt died between "paid" and "delivered"
    return { state: 'delivered' };
  }

  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash });
  } catch (err) {
    if (err.name === 'TransactionReceiptNotFoundError') return { state: 'pending' };
    throw err;
  }
  if (receipt.status !== 'success') {
    throw new ShopError(402, 'That transaction failed on-chain, so nothing was paid.');
  }

  const paid = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: receipt.logs }).some(
    (log) =>
      log.address.toLowerCase() === TOKEN_ADDRESS.toLowerCase() &&
      log.args.from.toLowerCase() === order.wallet &&
      log.args.to.toLowerCase() === order.treasury &&
      log.args.value === BigInt(order.amount_raw)
  );
  if (!paid) {
    throw new ShopError(402, 'That transaction is not the payment for this order (wrong wallet, recipient or amount).');
  }

  const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
  if (Number(block.timestamp) * 1000 < Date.parse(order.created_at) - CLOCK_SLACK_MS) {
    throw new ShopError(402, 'That transaction is older than this order.');
  }

  // A payment that lands after the quote expired is still honoured: the buyer paid what they were asked to.
  if ((await store.settleOrder(order.id, hash)) === 'tx-used') {
    throw new ShopError(409, 'That transaction has already been used for another order.');
  }
  await deliver(order);
  return { state: 'delivered' };
}

const deliver = (order) =>
  store.grantEntitlement({ steamId: order.steam_id, itemId: order.item_id, game: order.game, orderId: order.id });

export const listOwned = store.listOwned;
