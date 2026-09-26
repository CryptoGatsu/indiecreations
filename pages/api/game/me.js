import { readPlayerWallet, playerCookieHeader } from '../../../lib/session';

// GET -> { address } of the wallet playing in this browser (null when signed out). DELETE -> sign out of the games.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', playerCookieHeader('', 0));
    return res.status(200).json({ address: null });
  }
  if (req.method !== 'GET') return res.status(405).end();
  return res.status(200).json({ address: await readPlayerWallet(req.cookies) });
}
