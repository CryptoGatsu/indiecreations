import { AccountError, accountHolder, getAccount, setAdultOptIn, setPrimaryWallet } from '../../../lib/accounts';
import {
  ACCOUNT_COOKIE,
  accountCookieHeader,
  createPlayerToken,
  createSessionToken,
  playerCookieHeader,
  readAccountToken,
  sessionCookieHeader,
} from '../../../lib/session';
import { persistent } from '../../../lib/supabase';

// GET -> { account, holder } for the store account signed in on this browser ({ account: null } when signed out).
// PUT { primaryWallet } -> makes another linked EVM wallet the one the site acts as (profile, comments, cosmetics).
// PUT { adultOptIn, confirm18 } -> shows or hides adult games for this account.
// DELETE -> signs out of the account, the player sign-in and the holder session.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', [accountCookieHeader('', 0), playerCookieHeader('', 0), sessionCookieHeader('', 0)]);
    return res.status(200).json({ account: null });
  }

  const token = await readAccountToken(req.cookies[ACCOUNT_COOKIE]);
  if (!token || !persistent) {
    if (req.method === 'GET') return res.status(200).json({ account: null });
    return res.status(401).json({ error: 'Sign in first.' });
  }

  try {
    if (req.method === 'GET') {
      const account = await getAccount(token.uid);
      if (!account) {
        res.setHeader('Set-Cookie', accountCookieHeader('', 0));
        return res.status(200).json({ account: null });
      }
      const holder = await accountHolder(account);
      return res.status(200).json({ account, holder: { holder: holder.holder, wallet: holder.wallet, balances: holder.balances } });
    }
    if (req.method === 'PUT' && typeof req.body?.adultOptIn === 'boolean') {
      const account = await setAdultOptIn(token.uid, req.body.adultOptIn, req.body.confirm18 === true);
      return res.status(200).json({ account });
    }
    if (req.method === 'PUT') {
      const account = await setPrimaryWallet(token.uid, req.body?.primaryWallet);
      const holder = await accountHolder(account);
      res.setHeader('Set-Cookie', [
        playerCookieHeader(await createPlayerToken(account.primaryWallet)),
        holder.holder ? sessionCookieHeader(await createSessionToken(holder.wallet)) : sessionCookieHeader('', 0),
      ]);
      return res.status(200).json({ account, holder: { holder: holder.holder, wallet: holder.wallet } });
    }
    return res.status(405).end();
  } catch (err) {
    if (err instanceof AccountError) return res.status(err.status).json({ error: err.message });
    console.error('account request failed:', err);
    return res.status(500).json({ error: 'Something went wrong. Try again shortly.' });
  }
}
