import { readPlayerWallet } from '../../../lib/session';
import { loadSave, storeSave, MAX_SAVE_BYTES } from '../../../lib/buddy';

// Cloud save for Don't Worry, You're Safe!, kept per signed-in wallet so a buddy (its name, memories, coins) follows the
// player to another browser. Premium items are NOT in here: those come from the orders the site has seen on-chain.
//   GET                          -> { ok, version, state, updatedAt }   (state null when there is no cloud save yet)
//   POST { version, state }      -> { ok, updatedAt }                   (state is the game's save object, max 256 KB)
export const config = { api: { bodyParser: { sizeLimit: '300kb' } } };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const wallet = await readPlayerWallet(req.cookies);
  if (!wallet) return res.status(401).json({ ok: false, error: 'Sign in with your wallet first.' });

  try {
    if (req.method === 'GET') {
      const row = await loadSave(wallet);
      return res.status(200).json({
        ok: true,
        version: row ? row.version : 0,
        state: row ? row.state : null,
        updatedAt: row ? row.updated_at : null,
      });
    }
    if (req.method !== 'POST') return res.status(405).end();

    const { version, state } = req.body || {};
    if (!Number.isInteger(version) || version < 1 || version > 1000 || !state || typeof state !== 'object' || Array.isArray(state)) {
      return res.status(400).json({ ok: false, error: 'Invalid save.' });
    }
    if (Buffer.byteLength(JSON.stringify(state), 'utf8') > MAX_SAVE_BYTES) {
      return res.status(413).json({ ok: false, error: 'That save is too large.' });
    }
    const row = await storeSave(wallet, version, state);
    return res.status(200).json({ ok: true, updatedAt: row.updated_at });
  } catch (err) {
    console.error('buddy save failed:', err);
    return res.status(500).json({ ok: false, error: 'Could not reach the cloud save. Your local save is safe.' });
  }
}
