// Server-side only: who is calling a store API route. Store actions need a store account (Privy sign-in,
// lib/accounts.js); some need a role on it.
import { getAccount } from '../accounts';
import { ACCOUNT_COOKIE, readAccountToken } from '../session';
import { persistent } from '../supabase';

export async function readAccount(req) {
  if (!persistent) return null;
  const token = await readAccountToken(req.cookies[ACCOUNT_COOKIE]);
  return token ? getAccount(token.uid) : null;
}

// The signed-in account, or null with the response already sent.
export async function requireAccount(req, res, { role } = {}) {
  if (!persistent) {
    res.status(503).json({ error: 'The store is not switched on yet.' });
    return null;
  }
  const account = await readAccount(req);
  if (!account) {
    res.status(401).json({ error: 'Sign in first.' });
    return null;
  }
  if (role && !account.roles.includes(role)) {
    res.status(403).json({ error: role === 'developer' ? 'This needs an approved developer account.' : 'Not allowed.' });
    return null;
  }
  return account;
}

export class StoreError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Sends a StoreError as its status, anything else as a logged 500.
export function sendError(res, err, what) {
  if (err instanceof StoreError) return res.status(err.status).json({ error: err.message });
  console.error(`${what} failed:`, err);
  return res.status(500).json({ error: 'Something went wrong. Try again shortly.' });
}
