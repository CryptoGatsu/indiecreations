// Signed session cookie shared by the API routes (Node) and middleware (Edge),
// so it sticks to Web Crypto + btoa/atob and avoids Node-only APIs.

export const SESSION_COOKIE = 'ic_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 6;
// A hand-off link moves a verified session to another browser on the same device (wallet in-app browsers such as
// MetaMask's can't rotate to landscape or go full screen). Short-lived on purpose: it is a login link.
export const HANDOFF_TTL_SECONDS = 60 * 5;

const enc = new TextEncoder();

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== 'production') return 'dev-only-insecure-secret';
  throw new Error('SESSION_SECRET is not set');
}

function toBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey() {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signToken(data) {
  const payload = toBase64Url(enc.encode(JSON.stringify(data)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function createSessionToken(address) {
  return signToken({
    address: address.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });
}

export async function createHandoffToken(address) {
  return signToken({
    address: address.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + HANDOFF_TTL_SECONDS,
    use: 'handoff',
  });
}

// Returns { address } for a valid, unexpired hand-off token, otherwise null.
export async function readHandoffToken(token) {
  const data = await readToken(token);
  return data && data.address && data.use === 'handoff' ? data : null;
}

// --- Steam identity (cosmetics shop) ---------------------------------------
// Separate from the wallet session on purpose: signing in with Steam says nothing about what a wallet holds, and a
// Steam cookie must never open the playtest area. `use: 'steam'` keeps the two from being swapped for each other.
export const STEAM_COOKIE = 'ic_steam';
export const STEAM_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function createSteamToken({ steamId, name, avatar }) {
  return signToken({
    steamId,
    name: name || null,
    avatar: avatar || null,
    exp: Math.floor(Date.now() / 1000) + STEAM_TTL_SECONDS,
    use: 'steam',
  });
}

// Returns { steamId, name, avatar } for a valid, unexpired Steam token, otherwise null.
export async function readSteamToken(token) {
  const data = await readToken(token);
  return data && data.use === 'steam' && /^\d{17}$/.test(data.steamId || '') ? data : null;
}

export function steamCookieHeader(token, maxAge = STEAM_TTL_SECONDS) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${STEAM_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// Returns { address, exp } for a valid, unexpired SESSION token, otherwise null.
export async function readSessionToken(token) {
  const data = await readToken(token);
  // a hand-off link is not a session: it has to be redeemed (which re-checks the wallet) first
  return data && data.address && !data.use ? data : null;
}

async function readToken(token) {
  try {
    if (!token) return null;
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;

    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(),
      fromBase64Url(sig),
      enc.encode(payload)
    );
    if (!valid) return null;

    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (!data.exp || data.exp < Date.now() / 1000) return null;
    return data;
  } catch {
    return null;
  }
}

export function sessionCookieHeader(token, maxAge = SESSION_TTL_SECONDS) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
