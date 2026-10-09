// Server-side only: who may create, edit, see and moderate community games.
import crypto from 'crypto';
import { ADMIN_COOKIE, SESSION_COOKIE, readAdminToken, readPlayerWallet, readSessionToken } from './session';
import { isAdmin } from './admin';
import { tokenBalance } from './holder';
import { nextTier, slotsFor } from './creations';
import { generationsSince, listByOwner } from './creationStore';
import { clientIp } from './presence';
import { DEV_WALLET } from './config';

// Model calls a wallet may start per 24 hours (new games and edits together), and for the whole site.
export const PER_DAY = Number(process.env.CREATIONS_PER_DAY || 15);
export const SITE_PER_DAY = Number(process.env.CREATIONS_SITE_PER_DAY || 400);

// The studio's dev wallet has no limits: any number of games, and generations without a daily or site-wide cap.
export const isUnlimitedCreator = (wallet) => String(wallet || '').toLowerCase() === DEV_WALLET.toLowerCase();

// The verified holder behind this request (the playtest sign-in), or null.
export async function holderWallet(req) {
  const session = await readSessionToken(req.cookies[SESSION_COOKIE]);
  return session ? session.address : null;
}

export async function adminWallet(req) {
  const token = await readAdminToken(req.cookies[ADMIN_COOKIE]);
  return token && isAdmin(token.address) ? token.address : null;
}

// Who may see a game that isn't public: its owner and the studio.
export async function canManage(req, game) {
  const [holder, admin] = await Promise.all([holderWallet(req), adminWallet(req)]);
  return { owner: Boolean(holder && holder === game.owner), admin: Boolean(admin) };
}

export const isPublic = (game) => Boolean(game && game.published && !game.hidden);

// A wallet's standing as a creator right now: what it holds, how many games that allows, and what it has used.
// For an unlimited wallet, slots and perDay are Infinity.
export async function creatorStatus(wallet) {
  const unlimited = isUnlimitedCreator(wallet);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [balance, games, usedToday] = await Promise.all([
    tokenBalance(wallet),
    listByOwner(wallet),
    generationsSince(since, { wallet, cap: PER_DAY + 1 }),
  ]);
  return {
    balance,
    unlimited,
    slots: unlimited ? Infinity : slotsFor(balance),
    next: unlimited ? null : nextTier(balance),
    games,
    usedToday,
    perDay: unlimited ? Infinity : PER_DAY,
  };
}

// The dev wallet's own generations don't use up the site's allowance for holders.
export async function siteUsedToday() {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  return generationsSince(since, { except: DEV_WALLET.toLowerCase(), cap: SITE_PER_DAY + 1 });
}

// Who is reporting a game: their wallet when signed in, otherwise a salted hash of their IP (never the IP itself).
export async function reporterId(req) {
  const wallet = await readPlayerWallet(req.cookies);
  if (wallet) return wallet;
  return `ip:${crypto.createHash('sha256').update(`${process.env.SESSION_SECRET || 'dev-only-salt'}:report:${clientIp(req)}`).digest('hex').slice(0, 32)}`;
}

// A visitor's IP, salted and hashed for the player counts (never stored as is).
export const presenceIpHash = (req) =>
  crypto.createHash('sha256').update(`${process.env.SESSION_SECRET || 'dev-only-salt'}:creations:${clientIp(req)}`).digest('hex');

// What the browser gets for a game. The original prompt is only shown here to its owner and the studio (the public
// sees prompts through the stats, when the creator allows it). `stats` adds the live player counts.
export function gameView(game, { full = false, stats = null } = {}) {
  const view = {
    id: game.id,
    title: game.title,
    description: game.description,
    owner: game.owner,
    version: game.version,
    plays: Number(game.plays) || 0,
    published: game.published,
    hidden: game.hidden,
    showPrompts: game.show_prompts !== false,
    versions: game.versions,
    createdAt: game.created_at,
    updatedAt: game.updated_at,
    // the cover screenshot, or null (the gallery then shows a colour tile); ?t= changes with every new cover
    thumb: game.thumb_at ? `/api/creations/${game.id}/thumbnail?t=${Date.parse(game.thumb_at)}` : null,
    thumbVersion: game.thumb_version ?? null,
    thumbManual: Boolean(game.thumb_manual),
  };
  if (full) Object.assign(view, { prompt: game.prompt, reports: game.reports });
  if (stats) view.stats = { now: stats.now, day: stats.day, players: stats.players };
  return view;
}
