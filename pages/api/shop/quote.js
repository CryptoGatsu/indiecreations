import { createQuote, ShopError } from '../../../lib/shop';
import { STEAM_COOKIE, readSteamToken } from '../../../lib/session';

// POST { itemId, wallet } -> a 10 minute quote: exactly how much $creations to send, from which wallet, to where.
// The cosmetic goes to the Steam account signed in on this browser.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const steam = await readSteamToken(req.cookies[STEAM_COOKIE]);
  if (!steam) return res.status(401).json({ error: 'Sign in with Steam first.' });

  try {
    const { itemId, wallet } = req.body || {};
    return res.status(200).json(await createQuote({ steamId: steam.steamId, itemId, wallet }));
  } catch (err) {
    if (err instanceof ShopError) return res.status(err.status).json({ error: err.message });
    console.error('quote failed:', err);
    return res.status(500).json({ error: 'Could not create a quote. Try again shortly.' });
  }
}
