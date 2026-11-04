import { AccountError, accountHolder, syncAccount } from '../../../lib/accounts';
import { privyEnabled, verifyPrivyLogin } from '../../../lib/privy';
import {
  accountCookieHeader,
  createAccountToken,
  createPlayerToken,
  createSessionToken,
  playerCookieHeader,
  sessionCookieHeader,
} from '../../../lib/session';
import { persistent } from '../../../lib/supabase';

// POST { identityToken } -> signs this browser in to the store account of a verified Privy login.
// Sets ic_account (the account), ic_player (its primary EVM wallet: profiles, comments, cosmetics) and, when a linked
// wallet holds enough $CREATIONS, ic_session (the holder gate). Returns { account, holder }.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  if (!privyEnabled) return res.status(404).json({ error: 'Account sign-in is not switched on.' });
  if (!persistent) return res.status(503).json({ error: 'Accounts are not switched on yet.' });

  let login;
  try {
    login = await verifyPrivyLogin(req.body?.identityToken);
  } catch (err) {
    return res.status(401).json({ error: 'That sign-in could not be checked. Sign in again.' });
  }

  try {
    const account = await syncAccount(login);
    const holder = await accountHolder(account);
    const cookies = [accountCookieHeader(await createAccountToken(account.id))];
    if (account.primaryWallet) cookies.push(playerCookieHeader(await createPlayerToken(account.primaryWallet)));
    else cookies.push(playerCookieHeader('', 0));
    if (holder.holder) cookies.push(sessionCookieHeader(await createSessionToken(holder.wallet)));
    else cookies.push(sessionCookieHeader('', 0));
    res.setHeader('Set-Cookie', cookies);
    return res.status(200).json({ account, holder: { holder: holder.holder, wallet: holder.wallet } });
  } catch (err) {
    if (err instanceof AccountError) return res.status(err.status).json({ error: err.message });
    console.error('account sign-in failed:', err);
    return res.status(500).json({ error: 'Could not sign you in. Try again shortly.' });
  }
}
