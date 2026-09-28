// Server-side only: player profiles, pictures, favourite games and game comments (supabase/profiles.sql).
// Every write is for the wallet signed in on this browser (the free sign-in message); the API routes check that.
import { erc20Abi, formatUnits, parseUnits } from 'viem';
import { MIN_TOKENS, TOKEN_ADDRESS } from './config';
import { getDecimals, publicClient } from './holder';
import { AVATAR_MAX_BYTES, BIO_MAX, COMMENT_MAX, GAME_SLUGS, NAME_RE, cleanText } from './profileRules';
import { rest, persistent } from './supabase';

export { persistent };

export class ProfileError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const q = encodeURIComponent;
const COLUMNS = 'address,display_name,bio,favorite_games,avatar_version,created_at';
const toProfile = (r) =>
  r && {
    address: r.address,
    displayName: r.display_name || null,
    bio: r.bio || '',
    favorites: (r.favorite_games || []).filter((g) => GAME_SLUGS.includes(g)),
    avatarVersion: r.avatar_version ? Number(r.avatar_version) : null,
    joinedAt: r.created_at,
  };

export async function getProfile(address) {
  const rows = await rest(`profiles?address=eq.${q(address.toLowerCase())}&select=${COLUMNS}`);
  return toProfile(rows[0]) || null;
}

// { [address]: profile } for comment authors.
export async function getProfiles(addresses) {
  const list = [...new Set(addresses.map((a) => a.toLowerCase()))];
  if (!list.length) return {};
  const rows = await rest(`profiles?address=in.(${list.map(q).join(',')})&select=${COLUMNS}`);
  return Object.fromEntries(rows.map((r) => [r.address, toProfile(r)]));
}

// Creates the profile row the first time, then merges the given fields.
async function upsert(address, fields) {
  try {
    await rest('profiles?on_conflict=address', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ address: address.toLowerCase(), ...fields, updated_at: new Date().toISOString() }),
    });
  } catch (err) {
    if (/profiles_display_name_key|23505/.test(err.message)) throw new ProfileError(409, 'That name is taken. Try another.');
    throw err;
  }
}

export async function updateProfile(address, { displayName, bio, favorites }) {
  const fields = {};
  if (displayName !== undefined) {
    const name = cleanText(displayName, 40).replace(/\s+/g, ' ');
    if (name && !NAME_RE.test(name)) {
      throw new ProfileError(400, 'Names are 3 to 24 letters, numbers, spaces, dots, dashes or underscores.');
    }
    fields.display_name = name || null;
  }
  if (bio !== undefined) {
    const text = cleanText(bio, BIO_MAX + 1);
    if (text.length > BIO_MAX) throw new ProfileError(400, `Bios are at most ${BIO_MAX} characters.`);
    fields.bio = text || null;
  }
  if (favorites !== undefined) {
    if (!Array.isArray(favorites)) throw new ProfileError(400, 'Invalid favourites.');
    fields.favorite_games = [...new Set(favorites.filter((g) => GAME_SLUGS.includes(g)))];
  }
  await upsert(address, fields);
  return getProfile(address);
}

export async function setFavorite(address, game, on) {
  if (!GAME_SLUGS.includes(game)) throw new ProfileError(400, 'Unknown game.');
  const current = (await getProfile(address))?.favorites || [];
  const next = on ? [...new Set([...current, game])] : current.filter((g) => g !== game);
  await upsert(address, { favorite_games: next });
  return next;
}

// ---- pictures
const MAGIC = {
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

// dataUrl: "data:image/webp;base64,..." from the browser (already resized to a small square).
export async function setAvatar(address, dataUrl) {
  const m = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new ProfileError(400, 'Upload a PNG, JPEG or WebP picture.');
  const [, mime, data] = m;
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length > AVATAR_MAX_BYTES) throw new ProfileError(413, 'That picture is too large.');
  if (!MAGIC[mime](bytes)) throw new ProfileError(400, 'That file is not the picture it says it is.');

  await upsert(address, {}); // make sure the profile exists
  const addr = address.toLowerCase();
  await rest('profile_avatars?on_conflict=address', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ address: addr, mime, data, updated_at: new Date().toISOString() }),
  });
  const version = Date.now();
  await upsert(address, { avatar_version: version });
  return version;
}

export async function removeAvatar(address) {
  const addr = address.toLowerCase();
  await rest(`profile_avatars?address=eq.${q(addr)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  await upsert(address, { avatar_version: null });
}

export async function getAvatar(address) {
  const rows = await rest(`profile_avatars?address=eq.${q(address.toLowerCase())}&select=mime,data`);
  return rows[0] ? { mime: rows[0].mime, bytes: Buffer.from(rows[0].data, 'base64') } : null;
}

// ---- balance
// { raw, tokens, holder }: the wallet's $CREATIONS and whether it reaches the holder threshold.
export async function balanceOf(address) {
  if (!TOKEN_ADDRESS) return null;
  const [decimals, raw] = await Promise.all([
    getDecimals(),
    publicClient.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
  ]);
  return { raw: raw.toString(), tokens: formatUnits(raw, decimals), holder: raw >= parseUnits(String(MIN_TOKENS), decimals) };
}

// ---- comments
const toComment = (r) => ({ id: r.id, game: r.game, address: r.address, body: r.body, createdAt: r.created_at });

// Newest first, 20 at a time; `before` (an ISO time) pages back. Each comes with its author's profile.
export async function listComments(game, before = null, limit = 20) {
  const older = before ? `&created_at=lt.${q(before)}` : '';
  const rows = await rest(
    `game_comments?game=eq.${q(game)}&deleted_at=is.null${older}&select=id,game,address,body,created_at&order=created_at.desc&limit=${limit}`
  );
  const authors = await getProfiles(rows.map((r) => r.address));
  return rows.map((r) => ({ ...toComment(r), author: authors[r.address] || null }));
}

export async function commentsBy(address, limit = 10) {
  const rows = await rest(
    `game_comments?address=eq.${q(address.toLowerCase())}&deleted_at=is.null&select=id,game,address,body,created_at&order=created_at.desc&limit=${limit}`
  );
  return rows.map(toComment);
}

const WAIT_SECONDS = 20;
const PER_DAY = 30;

export async function addComment(address, game, body) {
  if (!GAME_SLUGS.includes(game)) throw new ProfileError(400, 'Unknown game.');
  const text = cleanText(body, COMMENT_MAX + 1);
  if (!text) throw new ProfileError(400, 'Write something first.');
  if (text.length > COMMENT_MAX) throw new ProfileError(400, `Comments are at most ${COMMENT_MAX} characters.`);

  const addr = address.toLowerCase();
  const dayAgo = new Date(Date.now() - 24 * 3600e3).toISOString();
  const recent = await rest(
    `game_comments?address=eq.${q(addr)}&created_at=gt.${q(dayAgo)}&select=created_at&order=created_at.desc&limit=${PER_DAY}`
  );
  if (recent[0] && Date.now() - Date.parse(recent[0].created_at) < WAIT_SECONDS * 1000) {
    throw new ProfileError(429, `Wait a few seconds between comments.`);
  }
  if (recent.length >= PER_DAY) throw new ProfileError(429, 'That is the daily comment limit. Come back tomorrow.');

  await upsert(address, {}); // everyone who comments has a profile to click through to
  const rows = await rest('game_comments', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ game, address: addr, body: text }),
  });
  return toComment(rows[0]);
}

// Authors delete their own comments; studio admins can delete any.
export async function deleteComment(id, by, { admin = false } = {}) {
  if (!/^[0-9a-f-]{36}$/.test(String(id))) throw new ProfileError(400, 'Invalid comment.');
  const rows = await rest(`game_comments?id=eq.${q(id)}&deleted_at=is.null&select=address`);
  if (!rows[0]) throw new ProfileError(404, 'That comment is already gone.');
  if (!admin && rows[0].address !== by.toLowerCase()) throw new ProfileError(403, 'You can only delete your own comments.');
  await rest(`game_comments?id=eq.${q(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ deleted_at: new Date().toISOString(), deleted_by: by.toLowerCase() }),
  });
}

// { [game slug]: count } of players who marked each game as a favourite.
export async function favoriteCounts() {
  const rows = await rest('rpc/game_favorite_counts', { method: 'POST', body: '{}' });
  return Object.fromEntries(rows.map((r) => [r.game, Number(r.favorites)]));
}
