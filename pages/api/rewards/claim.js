import { isAddress } from 'viem';
import { publicClient } from '../../../lib/holder';
import { REVSHARE_ADDRESS, revshareAbi } from '../../../lib/revshare';
import { getClaim, persistent } from '../../../lib/revshareStore';

// GET ?address=0x... -> { root, cumulative, proof } for the payout that is live on the contract right now.
// `cumulative` is everything the wallet has earned so far ("0" and no proof if nothing yet).
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const address = String(req.query.address || '');
  if (!isAddress(address)) return res.status(400).json({ error: 'Bad address.' });
  if (!REVSHARE_ADDRESS || !persistent) return res.status(200).json({ root: null, cumulative: '0', proof: [] });

  try {
    const root = await publicClient.readContract({ address: REVSHARE_ADDRESS, abi: revshareAbi, functionName: 'merkleRoot' });
    const claim = await getClaim(root, address);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      root,
      cumulative: claim ? claim.cumulative.toString() : '0',
      proof: claim ? claim.proof : [],
    });
  } catch (err) {
    console.error('claim lookup failed:', err);
    return res.status(503).json({ error: 'Could not look up rewards right now.' });
  }
}
