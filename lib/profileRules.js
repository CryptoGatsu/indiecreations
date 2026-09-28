// Rules for player profiles and comments, shared by the pages (to guide people) and the API (to enforce them).
import { GAMES } from './games';

export const NAME_RE = /^[A-Za-z0-9 _.-]{3,24}$/;
export const BIO_MAX = 280;
export const COMMENT_MAX = 1000;
export const AVATAR_PX = 256; // pictures are resized to this square in the browser before upload
export const AVATAR_MAX_BYTES = 100_000;
export const GAME_SLUGS = GAMES.map((g) => g.slug);

// Text as people typed it, minus invisible control characters, runs of blank lines and edge whitespace.
export function cleanText(s, max) {
  return String(s || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

// "Name", or the short wallet address for someone who has not picked one.
export const shownName = (profile, address) =>
  profile?.displayName || `${String(address).slice(0, 6)}…${String(address).slice(-4)}`;
