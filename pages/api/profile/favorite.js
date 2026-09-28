import { readPlayerWallet } from '../../../lib/session';
import { ProfileError, persistent, setFavorite } from '../../../lib/profiles';

// POST { game, favorite } -> marks or unmarks a game as one of the signed-in wallet's favorites.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');
  const address = await readPlayerWallet(req.cookies);
  if (!address) return res.status(401).json({ error: 'Sign in with your wallet first.' });
  if (!persistent) return res.status(503).json({ error: 'Profiles are not switched on yet.' });
  try {
    const { game, favorite } = req.body || {};
    return res.status(200).json({ favorites: await setFavorite(address, String(game || ''), Boolean(favorite)) });
  } catch (err) {
    if (err instanceof ProfileError) return res.status(err.status).json({ error: err.message });
    console.error('favorite failed:', err);
    return res.status(500).json({ error: 'Could not save. Try again.' });
  }
}
