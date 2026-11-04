import { requireAccount, sendError } from '../../../lib/platform/auth';
import { devState } from '../../../lib/platform/devs';
import { devGames } from '../../../lib/platform/storeGames';
import { publicNetwork } from '../../../lib/platform/network';
import { BURN_USD } from '../../../lib/platform/burns';

// GET -> where this account stands as a developer: its application, profile, games, and the network burns run on.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();
  const account = await requireAccount(req, res);
  if (!account) return;
  try {
    const state = await devState(account);
    const games = state.isDeveloper ? await devGames(account) : [];
    return res.status(200).json({ account, ...state, games, network: publicNetwork(), burnUsd: BURN_USD });
  } catch (err) {
    return sendError(res, err, 'developer state');
  }
}
