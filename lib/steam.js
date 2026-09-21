// Server-side only: "Sign in through Steam" (Steam's OpenID 2.0 provider) and a best-effort profile lookup.
//
// The player types their Steam password on steamcommunity.com, never here. Steam then sends the browser back with a
// signed assertion of which SteamID64 just logged in, and we ask Steam itself whether that assertion is genuine.
// No API key is needed for the sign-in.

const OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
const RETURN_PATH = '/api/steam/return';

// Where Steam should send the player back to. SITE_URL pins it in production; otherwise it follows the request, so
// previews and localhost work without configuration.
export function siteOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}`;
}

export function steamLoginUrl(req, state) {
  const origin = siteOrigin(req);
  const params = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': `${origin}${RETURN_PATH}?state=${encodeURIComponent(state)}`,
    'openid.realm': origin,
    'openid.identity': `${OPENID_NS}/identifier_select`,
    'openid.claimed_id': `${OPENID_NS}/identifier_select`,
  });
  return `${OPENID_ENDPOINT}?${params}`;
}

// Returns the SteamID64 (string) when Steam confirms the assertion in `query`, otherwise null.
export async function verifySteamAssertion(req, query) {
  const get = (k) => (typeof query[k] === 'string' ? query[k] : '');

  if (get('openid.mode') !== 'id_res') return null;
  if (get('openid.op_endpoint') !== OPENID_ENDPOINT) return null;
  // the assertion must have been made for THIS site, not replayed from a login to somebody else's
  if (!get('openid.return_to').startsWith(`${siteOrigin(req)}${RETURN_PATH}`)) return null;

  const match = CLAIMED_ID.exec(get('openid.claimed_id'));
  if (!match || get('openid.identity') !== get('openid.claimed_id')) return null;

  // the fields that carry the identity have to be among the ones Steam actually signed
  const signed = get('openid.signed').split(',');
  for (const field of ['claimed_id', 'identity', 'return_to', 'response_nonce', 'op_endpoint']) {
    if (!signed.includes(field)) return null;
  }

  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('openid.') && typeof value === 'string') body.set(key, value);
  }
  body.set('openid.mode', 'check_authentication');

  const res = await fetch(OPENID_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  // Steam answers "is_valid:true" exactly once per assertion, so a captured return URL can't be replayed
  return res.ok && /^is_valid\s*:\s*true\s*$/m.test(text) ? match[1] : null;
}

// Display name + avatar for the header chip. Purely cosmetic: a failure here never blocks the sign-in.
export async function fetchSteamProfile(steamId) {
  try {
    const key = process.env.STEAM_WEB_API_KEY;
    if (key) {
      const res = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`,
        { signal: AbortSignal.timeout(5_000) }
      );
      const player = (await res.json())?.response?.players?.[0];
      if (player) return { name: clean(player.personaname), avatar: steamAvatar(player.avatarmedium) };
    }

    // no key: the public profile XML carries the same two fields
    const res = await fetch(`https://steamcommunity.com/profiles/${steamId}?xml=1`, {
      signal: AbortSignal.timeout(5_000),
    });
    const xml = await res.text();
    const name = /<steamID><!\[CDATA\[([\s\S]*?)\]\]><\/steamID>/.exec(xml)?.[1];
    const avatar = /<avatarMedium><!\[CDATA\[([\s\S]*?)\]\]><\/avatarMedium>/.exec(xml)?.[1];
    return { name: clean(name), avatar: steamAvatar(avatar) };
  } catch {
    return { name: null, avatar: null };
  }
}

const clean = (name) => (typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : null);

// only ever render avatars served by Steam's own CDNs
function steamAvatar(url) {
  try {
    const u = new URL(url);
    const ok = u.protocol === 'https:' && /(^|\.)(steamstatic\.com|akamaihd\.net|steamusercontent\.com)$/.test(u.hostname);
    return ok ? u.toString() : null;
  } catch {
    return null;
  }
}
