import crypto from 'crypto';
import { listOwned } from '../../../lib/shop';

// GET ?game=<name>&ticket=<hex Steam session ticket>   (or &steamid=<SteamID64> while there is no Steam app yet)
//  -> the cosmetics that Steam account owns for that game, signed so the game can trust the list.
//
//   200 { payload: "c1|<steamid>|<unix expiry>|<game>|<item-id,item-id,...>", sig: "<base64 RSA-SHA256 of payload>" }
//
// The signature uses GAME_TICKET_KEY, the same key pair as the holder ticket, so the game verifies it with the public
// key it already ships with. The game MUST check that <steamid> is the account it is running under and that the
// expiry has not passed - that is what stops a list copied from another player from being replayed.
//
// With STEAM_PUBLISHER_KEY + STEAM_APP_ID set, the game proves who it is with a Steam session ticket
// (ISteamUser::GetAuthTicketForWebApi, identity "indiecreations") and a bare ?steamid= is refused. Until the game has
// a Steam app id, ?steamid= is accepted: what somebody owns is not secret, and the signed steamid keeps it honest.

const TTL_SECONDS = 15 * 60;

function privateKey() {
  const b64 = process.env.GAME_TICKET_KEY;
  return b64 ? crypto.createPrivateKey(Buffer.from(b64, 'base64').toString('utf8')) : null;
}

async function steamIdFromTicket(ticket) {
  const url =
    'https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/' +
    `?key=${process.env.STEAM_PUBLISHER_KEY}&appid=${process.env.STEAM_APP_ID}` +
    `&ticket=${ticket}&identity=indiecreations`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  const params = (await res.json())?.response?.params;
  return params?.result === 'OK' && /^\d{17}$/.test(params.steamid || '') ? params.steamid : null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const game = typeof req.query.game === 'string' ? req.query.game.slice(0, 120) : '';
  if (!game || game.includes('|')) return res.status(400).json({ error: 'Missing game.' });

  let key;
  try {
    key = privateKey();
  } catch {
    key = null;
  }
  if (!key) return res.status(503).json({ error: 'GAME_TICKET_KEY is not set.' });

  try {
    let steamId = null;
    if (process.env.STEAM_PUBLISHER_KEY && process.env.STEAM_APP_ID) {
      const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : '';
      if (!/^[0-9a-fA-F]{16,4096}$/.test(ticket)) return res.status(401).json({ error: 'Missing Steam ticket.' });
      steamId = await steamIdFromTicket(ticket);
      if (!steamId) return res.status(401).json({ error: 'Steam did not accept that ticket.' });
    } else {
      steamId = typeof req.query.steamid === 'string' ? req.query.steamid : '';
      if (!/^\d{17}$/.test(steamId)) return res.status(400).json({ error: 'Missing steamid.' });
    }

    const items = (await listOwned(steamId, game)).sort();
    const payload = `c1|${steamId}|${Math.floor(Date.now() / 1000) + TTL_SECONDS}|${game}|${items.join(',')}`;
    const sig = crypto.sign('RSA-SHA256', Buffer.from(payload, 'utf8'), key).toString('base64');
    return res.status(200).json({ payload, sig });
  } catch (err) {
    console.error('cosmetics lookup failed:', err);
    return res.status(500).json({ error: 'Could not load cosmetics.' });
  }
}
