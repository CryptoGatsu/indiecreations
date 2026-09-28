import { readPlayerWallet } from '../../../lib/session';
import { ProfileError, balanceOf, getProfile, persistent, updateProfile } from '../../../lib/profiles';

// GET -> { address, profile, balance } for the wallet signed in on this browser ({ address: null } when signed out).
// PUT { displayName?, bio?, favorites? } -> saves them and returns the profile.
// Signing in and out use /api/game/signin and /api/game/me (the same wallet sign-in as the browser games).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const address = await readPlayerWallet(req.cookies);
  if (req.method === 'GET') {
    if (!address) return res.status(200).json({ address: null });
    const [profile, balance] = await Promise.all([
      persistent ? getProfile(address).catch(() => null) : null,
      balanceOf(address).catch(() => null),
    ]);
    return res.status(200).json({ address, profile, balance });
  }
  if (req.method !== 'PUT') return res.status(405).end();
  if (!address) return res.status(401).json({ error: 'Sign in with your wallet first.' });
  if (!persistent) return res.status(503).json({ error: 'Profiles are not switched on yet.' });
  try {
    const { displayName, bio, favorites } = req.body || {};
    return res.status(200).json({ profile: await updateProfile(address, { displayName, bio, favorites }) });
  } catch (err) {
    if (err instanceof ProfileError) return res.status(err.status).json({ error: err.message });
    console.error('profile update failed:', err);
    return res.status(500).json({ error: 'Could not save. Try again.' });
  }
}
