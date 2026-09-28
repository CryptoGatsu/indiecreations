import { isAddress } from 'viem';
import { balanceOf, commentsBy, getProfile, persistent } from '../../../lib/profiles';

// GET -> a wallet's public profile: { address, profile, holder, comments }. The exact balance stays on the owner's own
// page; others see only whether the wallet is a holder.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const address = String(req.query.address || '');
  if (!isAddress(address)) return res.status(400).json({ error: 'Bad address.' });
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  const [profile, balance, comments] = await Promise.all([
    persistent ? getProfile(address).catch(() => null) : null,
    balanceOf(address).catch(() => null),
    persistent ? commentsBy(address).catch(() => []) : [],
  ]);
  return res.status(200).json({ address: address.toLowerCase(), profile, holder: Boolean(balance?.holder), comments });
}
