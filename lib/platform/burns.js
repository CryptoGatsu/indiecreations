// Server-side only: the $50 burns that open a developer account and each new game (PLATFORM_SPEC section 4).
//
// The same pattern as the shop (lib/shop.js): the server prices the burn in $CREATIONS, holds the quote for 10 minutes,
// adds a few random wei so every quote is unique, and names the one linked wallet that must send it. The person sends
// exactly that amount to the burn address from their own wallet; the server then finds the transfer on chain (right
// token, right wallet, burn address, exact amount, inside the quote's window) and records it. A transaction counts
// once, ever.
import crypto from 'crypto';
import { getAddress, parseEventLogs, parseUnits, formatUnits, erc20Abi } from 'viem';
import { rest } from '../supabase';
import { BURN_ADDRESS_EVM, DEV_APPLY_BURN_USD, NEW_GAME_BURN_USD } from './config';
import { platformNetwork, platformTokenPrice } from './network';
import { StoreError } from './auth';

const q = encodeURIComponent;
const QUOTE_MINUTES = 10;
const CLOCK_SLACK_SECONDS = 120;
const DECIMALS = 18; // $CREATIONS and the testnet mock both use 18
export const BURN_USD = { dev_apply: DEV_APPLY_BURN_USD, new_game: NEW_GAME_BURN_USD };

const evmWallets = (account) => account.wallets.filter((w) => w.chain === 'evm').map((w) => w.address);

function toQuote(row) {
  const net = platformNetwork();
  return {
    id: row.id,
    purpose: row.purpose,
    wallet: row.wallet,
    to: BURN_ADDRESS_EVM,
    token: row.token,
    chainId: row.chain_id,
    chainName: net.chainName,
    testnet: net.testnet,
    explorer: net.explorer,
    amountRaw: String(row.amount_raw),
    tokens: formatUnits(BigInt(String(row.amount_raw)), DECIMALS),
    usd: row.usd_cents / 100,
    expiresAt: row.expires_at,
  };
}

export async function createBurnQuote(account, { purpose, wallet }) {
  const usd = BURN_USD[purpose];
  if (!usd) throw new StoreError(400, 'Unknown burn.');
  const net = platformNetwork();
  if (!net.token) throw new StoreError(503, 'Burns are not switched on yet.');
  const payer = String(wallet || account.primaryWallet || '').toLowerCase();
  if (!evmWallets(account).includes(payer)) throw new StoreError(400, 'Burn from a wallet linked to your account.');

  const price = await platformTokenPrice();
  if (!price) throw new StoreError(503, 'No reliable $CREATIONS price right now. Try again in a few minutes.');
  const whole = Math.ceil(usd / price);
  const amountRaw = parseUnits(String(whole), DECIMALS) + BigInt(crypto.randomInt(1, 1_000_000));

  const [row] = await rest('burn_quotes', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: account.id,
      purpose,
      chain_id: net.chainId,
      token: net.token,
      wallet: payer,
      amount_raw: amountRaw.toString(),
      usd_cents: Math.round(usd * 100),
      expires_at: new Date(Date.now() + QUOTE_MINUTES * 60_000).toISOString(),
    }),
  });
  return toQuote(row);
}

const toBurn = (r) => ({
  id: r.id,
  purpose: r.purpose,
  tx: r.tx,
  chainId: r.chain_id,
  from: r.from_addr,
  amountRaw: String(r.amount_raw),
  usd: r.usd_cents / 100,
  used: r.used,
  createdAt: r.created_at,
});

// Checks the burn transaction against its quote and records it. Safe to call again with the same transaction.
export async function verifyBurn(account, { quoteId, tx, purpose }) {
  if (!/^[0-9a-f-]{36}$/.test(String(quoteId))) throw new StoreError(400, 'Invalid burn quote.');
  const hash = String(tx || '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) throw new StoreError(400, 'That is not a transaction hash.');

  const [quote] = await rest(`burn_quotes?id=eq.${q(quoteId)}&user_id=eq.${q(account.id)}&select=*`);
  if (!quote) throw new StoreError(404, 'That burn quote is not yours or does not exist.');
  if (purpose && quote.purpose !== purpose) throw new StoreError(400, 'That burn was for something else.');

  const [existing] = await rest(`burns?tx=eq.${q(hash)}&select=*`);
  if (existing) {
    if (existing.user_id === account.id && existing.quote_id === quote.id) return toBurn(existing);
    throw new StoreError(409, 'That transaction has already been used.');
  }
  if (quote.used_tx && quote.used_tx !== hash) throw new StoreError(409, 'That quote was already paid with another transaction.');

  const net = platformNetwork();
  if (quote.chain_id !== net.chainId) throw new StoreError(400, 'That quote is for another network.');
  let receipt;
  try {
    receipt = await net.client.getTransactionReceipt({ hash });
  } catch {
    throw new StoreError(404, 'The transaction is not confirmed yet. Give it a moment and check again.');
  }
  if (receipt.status !== 'success') throw new StoreError(400, 'That transaction failed on chain.');

  const transfers = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: receipt.logs });
  const match = transfers.find(
    (l) =>
      l.address.toLowerCase() === quote.token &&
      l.args.from.toLowerCase() === quote.wallet &&
      l.args.to.toLowerCase() === BURN_ADDRESS_EVM.toLowerCase() &&
      l.args.value === BigInt(String(quote.amount_raw))
  );
  if (!match) {
    throw new StoreError(
      400,
      `That transaction doesn't burn exactly the quoted amount from ${getAddress(quote.wallet)}. Send the exact amount shown.`
    );
  }

  const block = await net.client.getBlock({ blockNumber: receipt.blockNumber });
  const at = Number(block.timestamp);
  const from = Date.parse(quote.created_at) / 1000 - CLOCK_SLACK_SECONDS;
  const until = Date.parse(quote.expires_at) / 1000 + CLOCK_SLACK_SECONDS;
  if (at < from) throw new StoreError(400, 'That transaction is older than the quote.');
  if (at > until) throw new StoreError(400, 'That burn came after the quote expired. Get a new quote.');

  let row;
  try {
    [row] = await rest('burns', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: account.id,
        purpose: quote.purpose,
        quote_id: quote.id,
        chain_id: quote.chain_id,
        token: quote.token,
        from_addr: quote.wallet,
        amount_raw: String(quote.amount_raw),
        usd_cents: quote.usd_cents,
        tx: hash,
        block: Number(receipt.blockNumber),
      }),
    });
  } catch (err) {
    if (err.status === 409) throw new StoreError(409, 'That transaction has already been used.');
    throw err;
  }
  await rest(`burn_quotes?id=eq.${q(quote.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ used_tx: hash }),
  });
  return toBurn(row);
}

// Marks a verified, unused burn of this account as spent; returns it, or throws if it isn't available.
export async function spendBurn(account, burnId, purpose) {
  if (!/^[0-9a-f-]{36}$/.test(String(burnId))) throw new StoreError(400, 'Invalid burn.');
  const rows = await rest(
    `burns?id=eq.${q(burnId)}&user_id=eq.${q(account.id)}&purpose=eq.${q(purpose)}&used=eq.false`,
    { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ used: true }) }
  );
  if (!rows.length) throw new StoreError(400, 'That burn is not available (already used, or not yours).');
  return toBurn(rows[0]);
}

// Gives a spent burn back (when what it paid for could not be saved).
export async function unspendBurn(burnId) {
  await rest(`burns?id=eq.${q(burnId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ used: false }) });
}

// An unspent verified burn this account already has for this purpose (a burn that went through but whose form
// didn't save), so it isn't asked to burn twice.
export async function unusedBurn(account, purpose) {
  const [row] = await rest(
    `burns?user_id=eq.${q(account.id)}&purpose=eq.${q(purpose)}&used=eq.false&select=*&order=created_at.asc&limit=1`
  );
  return row ? toBurn(row) : null;
}

export async function burnLog(limit = 100) {
  const rows = await rest(`burns?select=*&order=created_at.desc&limit=${limit}`);
  return rows.map((r) => ({ ...toBurn(r), userId: r.user_id }));
}
