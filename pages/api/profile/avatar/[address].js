import { isAddress } from 'viem';
import { getAvatar, persistent } from '../../../../lib/profiles';

// GET -> the wallet's profile picture. Pages link it as ?v=<avatarVersion>, so each version can be cached for good.
export default async function handler(req, res) {
  const address = String(req.query.address || '');
  if (!isAddress(address) || !persistent) return res.status(404).end();
  try {
    const avatar = await getAvatar(address);
    if (!avatar) return res.status(404).end();
    res.setHeader('Content-Type', avatar.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'public, max-age=60');
    return res.status(200).send(avatar.bytes);
  } catch (err) {
    console.error('avatar read failed:', err);
    return res.status(404).end();
  }
}
