import crypto from 'crypto';
import { SESSION_COOKIE, readSessionToken, sessionCookieHeader } from '../../../lib/session';
import { checkHolder } from '../../../lib/holder';
import { ACTIVE_BUILD } from '../../../lib/build';
import { MIN_TOKENS } from '../../../lib/config';

// GET -> a short-lived, RSA-signed "holder ticket" for the game itself.
//
// middleware.js keeps the build files behind the holder session, but a holder could still copy those files and host
// them somewhere else. So the game refuses to run until it has a ticket signed
// with GAME_TICKET_KEY, and asks for a fresh one every few minutes. Only this site holds the private key; the matching
// public key is compiled into the game. The balance is re-checked here each time, so a wallet that sells below the
// threshold is out within minutes rather than at the end of its 6 hour session.
//
//   200 { payload: "v1|<wallet>|<unix expiry>", sig: "<base64 RSA-SHA256 signature of payload>" }
//   401 no / expired session      403 no longer a holder      503 not configured or no build live

const TICKET_TTL_SECONDS = 15 * 60;

function privateKey() {
  const b64 = process.env.GAME_TICKET_KEY;
  if (!b64) return null;
  return crypto.createPrivateKey(Buffer.from(b64, 'base64').toString('utf8'));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const session = await readSessionToken(req.cookies[SESSION_COOKIE]);
  if (!session) return res.status(401).json({ error: 'No holder session.' });
  if (!ACTIVE_BUILD) return res.status(503).json({ error: 'No build is live.' });

  let key;
  try {
    key = privateKey();
  } catch (err) {
    console.error('GAME_TICKET_KEY is not a valid key:', err);
    key = null;
  }
  if (!key) return res.status(503).json({ error: 'GAME_TICKET_KEY is not set.' });

  try {
    const { holder, balance } = await checkHolder(session.address);
    if (!holder) {
      res.setHeader('Set-Cookie', sessionCookieHeader('', 0)); // sign them out: the pass is gone
      return res.status(403).json({ holder: false, balance, required: MIN_TOKENS });
    }
  } catch (err) {
    // An RPC hiccup must not throw a verified holder out mid-run: their session was checked at sign-in.
    console.error('ticket balance re-check failed (issuing anyway):', err);
  }

  const payload = `v1|${session.address}|${Math.floor(Date.now() / 1000) + TICKET_TTL_SECONDS}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(payload, 'utf8'), key).toString('base64');
  return res.status(200).json({ payload, sig });
}
