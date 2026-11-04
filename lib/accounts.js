// Server-side only: store accounts (supabase/accounts.sql). An account is one Privy user plus every wallet linked to
// it; the site's existing features stay keyed by wallet, through the account's primary EVM wallet.
import { STORED_ROLES } from './platform/config';
import { isAdmin } from './adminList';
import { checkHolder } from './holder';
import { rest } from './supabase';

const q = encodeURIComponent;

export class AccountError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// The wallet the site acts as by default: a wallet the person linked themselves (that is usually where their
// $CREATIONS is), otherwise the embedded one Privy made for them.
export function defaultPrimary(wallets) {
  const evm = wallets.filter((w) => w.chain === 'evm');
  return (evm.find((w) => w.type === 'linked') || evm[0] || null)?.address || null;
}

function toAccount(user, wallets) {
  const evm = wallets.filter((w) => w.chain === 'evm').map((w) => w.address);
  const roles = [...new Set(user.roles || ['player'])].filter((r) => STORED_ROLES.includes(r));
  if (evm.some(isAdmin)) roles.push('admin');
  return {
    id: user.id,
    privyId: user.privy_id,
    email: user.email || null,
    roles,
    adultOptIn: Boolean(user.adult_opt_in),
    primaryWallet: user.primary_wallet || null,
    wallets: wallets.map((w) => ({ chain: w.chain, address: w.address, type: w.type })),
    createdAt: user.created_at,
  };
}

export async function getAccount(userId) {
  if (!/^[0-9a-f-]{36}$/.test(String(userId))) return null;
  const [users, wallets] = await Promise.all([
    rest(`users?id=eq.${q(userId)}&select=*`),
    rest(`wallets?user_id=eq.${q(userId)}&select=chain,address,type&order=created_at.asc`),
  ]);
  return users[0] ? toAccount(users[0], wallets) : null;
}

// Creates or refreshes the account for a verified Privy login and makes its wallet list match what Privy says is
// linked now (wallets unlinked in Privy are dropped; a wallet now linked to this account moves here).
export async function syncAccount({ privyId, email, wallets }) {
  const now = new Date().toISOString();
  const [user] = await rest('users?on_conflict=privy_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ privy_id: privyId, ...(email ? { email } : {}), updated_at: now }),
  });

  const keep = new Set(wallets.map((w) => `${w.chain}:${w.address}`));
  const current = await rest(`wallets?user_id=eq.${q(user.id)}&select=id,chain,address`);
  const gone = current.filter((w) => !keep.has(`${w.chain}:${w.address}`)).map((w) => w.id);
  if (gone.length) {
    await rest(`wallets?id=in.(${gone.map(q).join(',')})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  }
  if (wallets.length) {
    await rest('wallets?on_conflict=chain,address', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(wallets.map((w) => ({ user_id: user.id, chain: w.chain, address: w.address, type: w.type }))),
    });
  }

  // keep the primary wallet if it is still linked, otherwise pick the default
  const evm = new Set(wallets.filter((w) => w.chain === 'evm').map((w) => w.address));
  if (!user.primary_wallet || !evm.has(user.primary_wallet)) {
    await rest(`users?id=eq.${q(user.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ primary_wallet: defaultPrimary(wallets), updated_at: now }),
    });
  }
  return getAccount(user.id);
}

export async function setPrimaryWallet(userId, address) {
  const account = await getAccount(userId);
  if (!account) throw new AccountError(401, 'Sign in first.');
  const wallet = String(address || '').toLowerCase();
  if (!account.wallets.some((w) => w.chain === 'evm' && w.address === wallet)) {
    throw new AccountError(400, 'That wallet is not linked to your account.');
  }
  await rest(`users?id=eq.${q(userId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ primary_wallet: wallet, updated_at: new Date().toISOString() }),
  });
  return { ...account, primaryWallet: wallet };
}

// Adult games stay hidden unless the account turns this on and confirms it is 18 or over (PLATFORM_SPEC 5.4).
export async function setAdultOptIn(userId, on, confirmed18) {
  if (on && !confirmed18) throw new AccountError(400, 'Confirm that you are 18 or over.');
  await rest(`users?id=eq.${q(userId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ adult_opt_in: Boolean(on), updated_at: new Date().toISOString() }),
  });
  return getAccount(userId);
}

// The holder gate across every linked EVM wallet: { holder, wallet, balance } for the first wallet that holds enough
// (the primary first), otherwise { holder: false, balances }.
export async function accountHolder(account) {
  const evm = account.wallets.filter((w) => w.chain === 'evm').map((w) => w.address);
  const order = [account.primaryWallet, ...evm.filter((a) => a !== account.primaryWallet)].filter(Boolean);
  const balances = {};
  for (const wallet of order) {
    try {
      const { holder, balance } = await checkHolder(wallet);
      balances[wallet] = balance;
      if (holder) return { holder: true, wallet, balance, balances };
    } catch (err) {
      balances[wallet] = null; // RPC trouble: treat as not holding for now, try again next sign-in
      console.error('holder check failed for', wallet, err.message);
    }
  }
  return { holder: false, wallet: null, balance: null, balances };
}
