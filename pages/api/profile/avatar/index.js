import { readPlayerWallet } from '../../../../lib/session';
import { ProfileError, persistent, removeAvatar, setAvatar } from '../../../../lib/profiles';

// POST { dataUrl } -> sets the signed-in wallet's picture (a small square the page has already resized).
// DELETE -> removes it (the generated tile pattern shows again).
export const config = { api: { bodyParser: { sizeLimit: '256kb' } } };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const address = await readPlayerWallet(req.cookies);
  if (!address) return res.status(401).json({ error: 'Sign in with your wallet first.' });
  if (!persistent) return res.status(503).json({ error: 'Profiles are not switched on yet.' });
  try {
    if (req.method === 'POST') return res.status(200).json({ avatarVersion: await setAvatar(address, req.body?.dataUrl) });
    if (req.method === 'DELETE') {
      await removeAvatar(address);
      return res.status(200).json({ avatarVersion: null });
    }
    return res.status(405).end();
  } catch (err) {
    if (err instanceof ProfileError) return res.status(err.status).json({ error: err.message });
    console.error('avatar update failed:', err);
    return res.status(500).json({ error: 'Could not save the picture. Try again.' });
  }
}
