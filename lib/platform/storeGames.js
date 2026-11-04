// Server-side only: games on the store (PLATFORM_SPEC sections 5 and 7).
//
// A game has an approved store page (games.listing) and a list of builds. Every build carries the store page it was
// submitted with; nothing a developer changes reaches players until a reviewer approves that build. States:
//   game:  draft (never approved) -> live -> abandoned; removed (taken down)
//   build: draft -> submitted -> approved | rejected; an approved build is superseded by the next approved one.
// The first build of a game needs the $50 new-game burn (taken when the game is created); patches are free.
import crypto from 'crypto';
import { rest } from '../supabase';
import { GAMES as STUDIO_GAMES } from '../games';
import { MIN_PAID_PRICE_USD } from './config';
import { ruleCodes } from './guidelines';
import { AGE_RATINGS, BROWSERS, EMPTY_LISTING, TAGS, listingProblems } from './listing';
import { StoreError } from './auth';
import { frameUrl } from './files';
import { spendBurn, unspendBurn, unusedBurn, verifyBurn } from './burns';
import { logAdmin } from './adminLog';
import {
  MAX_BUILD_BYTES,
  MAX_BUILD_FILES,
  buildPrefix,
  cleanBuildPath,
  listPrefix,
  storageMode,
} from './storage';

const q = encodeURIComponent;
const UUID = /^[0-9a-f-]{36}$/;

const RESERVED = new Set(['new', 'api', 'play', 'library', 'store', 'admin', 'dev', 'games', 'search', 'tags', 'abandoned', 'adult']);
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

// ---- store page

// Media must be a file this game uploaded to the store's own storage.
function isOwnMedia(gameId, url) {
  const u = String(url || '');
  const name = '[0-9a-f]{16,40}\\.(?:png|jpe?g|webp|gif)';
  const blob = new RegExp(`^https://[a-z0-9]+\\.public\\.blob\\.vercel-storage\\.com/games/${gameId}/media/${name}$`);
  const local = new RegExp(`^/api/store/local/games/${gameId}/media/${name}$`);
  return blob.test(u) || (storageMode === 'local' && local.test(u));
}

const text = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);

// Tidies what a developer typed, keeping only allowed values. Completeness is checked on submit.
export function cleanListing(gameId, input) {
  const l = { ...EMPTY_LISTING, ...(input || {}) };
  const price = Math.round(Number(l.priceUsdCents) || 0);
  if (price !== 0 && (price < MIN_PAID_PRICE_USD * 100 || price > 99_999)) {
    throw new StoreError(400, `Price: free, or between $${MIN_PAID_PRICE_USD} and $999.99.`);
  }
  const trailer = text(l.trailerUrl, 200);
  if (trailer && !/^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]{6,20}/.test(trailer)) {
    throw new StoreError(400, 'Trailer: a YouTube link (https://youtube.com/watch?v=... or https://youtu.be/...).');
  }
  const ageRating = AGE_RATINGS.some((a) => a.key === l.ageRating) ? l.ageRating : 'everyone';
  const adult = Boolean(l.adult) || ageRating === 'adults';
  const media = (u) => (isOwnMedia(gameId, u) ? String(u) : null);
  return {
    title: text(l.title, 60),
    tagline: text(l.tagline, 120),
    description: text(l.description, 5000),
    tags: [...new Set((Array.isArray(l.tags) ? l.tags : []).filter((t) => TAGS.includes(t)))].slice(0, 6),
    ageRating: adult ? 'adults' : ageRating,
    adult,
    adultDeclaration: adult && Boolean(l.adultDeclaration),
    priceUsdCents: price,
    browsers: [...new Set((Array.isArray(l.browsers) ? l.browsers : []).filter((b) => BROWSERS.includes(b)))],
    aiDisclosure: text(l.aiDisclosure, 500),
    trailerUrl: trailer,
    capsule: media(l.capsule) || '',
    screenshots: (Array.isArray(l.screenshots) ? l.screenshots : []).map(media).filter(Boolean).slice(0, 10),
  };
}

// ---- reading

const toBuild = (b) => ({
  id: b.id,
  version: b.version,
  status: b.status,
  listing: b.listing,
  entryUrl: b.entry_url ? frameUrl(b.id) : null,
  fileCount: b.file_count,
  sizeBytes: b.size_bytes == null ? null : Number(b.size_bytes),
  rejectionCodes: b.rejection_codes || [],
  reviewerNotes: b.reviewer_notes || null,
  createdAt: b.created_at,
  submittedAt: b.submitted_at,
  reviewedAt: b.reviewed_at,
});

const toGame = (g) => ({
  id: g.id,
  slug: g.slug,
  devId: g.dev_id,
  status: g.status,
  listing: g.listing,
  priceUsdCents: g.price_usd_cents,
  adult: g.adult,
  currentBuild: g.current_build,
  createdAt: g.created_at,
  lastUpdateAt: g.last_update_at,
});

async function ownGame(account, slug) {
  if (!SLUG_RE.test(String(slug))) throw new StoreError(404, 'No such game.');
  const [g] = await rest(`games?slug=eq.${q(slug)}&dev_id=eq.${q(account.id)}&select=*`);
  if (!g) throw new StoreError(404, 'No such game on your account.');
  return g;
}

async function openBuild(gameId) {
  const [b] = await rest(`builds?game_id=eq.${q(gameId)}&status=in.(draft,submitted)&select=*&limit=1`);
  return b || null;
}

export async function devGames(account) {
  const games = await rest(`games?dev_id=eq.${q(account.id)}&select=*&order=created_at.desc`);
  if (!games.length) return [];
  const builds = await rest(
    `builds?game_id=in.(${games.map((g) => q(g.id)).join(',')})&select=id,game_id,version,status,listing,rejection_codes&order=version.desc`
  );
  return games.map((g) => {
    const latest = builds.find((b) => b.game_id === g.id);
    return {
      ...toGame(g),
      title: g.listing?.title || latest?.listing?.title || g.slug,
      latestBuild: latest ? { id: latest.id, version: latest.version, status: latest.status, rejectionCodes: latest.rejection_codes || [] } : null,
    };
  });
}

export async function devGame(account, slug) {
  const g = await ownGame(account, slug);
  const builds = await rest(`builds?game_id=eq.${q(g.id)}&select=*&order=version.desc`);
  return { game: toGame(g), builds: builds.map(toBuild), storage: storageMode };
}

// ---- developer actions

// burn: { quoteId, tx } of a $50 burn, or nothing to use a verified burn not spent yet.
export async function createGame(account, { slug, title }, burn) {
  const s = String(slug || '').trim().toLowerCase();
  if (!SLUG_RE.test(s)) throw new StoreError(400, 'Web address: 3 to 40 lowercase letters, numbers and dashes.');
  if (RESERVED.has(s) || STUDIO_GAMES.some((g) => g.slug === s)) throw new StoreError(409, 'That web address is taken.');
  const [taken] = await rest(`games?slug=eq.${q(s)}&select=id`);
  if (taken) throw new StoreError(409, 'That web address is taken.');
  const name = text(title, 60);
  if (name.length < 2) throw new StoreError(400, 'Add a title.');

  if (burn?.quoteId && burn?.tx) await verifyBurn(account, { quoteId: burn.quoteId, tx: burn.tx, purpose: 'new_game' });
  const available = await unusedBurn(account, 'new_game');
  if (!available) throw new StoreError(402, 'A new game takes a $50 $CREATIONS burn.');
  const spent = await spendBurn(account, available.id, 'new_game');

  try {
    const [game] = await rest('games', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ slug: s, dev_id: account.id, burn_id: spent.id }),
    });
    await newDraft(game, { ...EMPTY_LISTING, title: name });
    return toGame(game);
  } catch (err) {
    await unspendBurn(spent.id);
    if (err.status === 409) throw new StoreError(409, 'That web address is taken.');
    throw err;
  }
}

async function newDraft(game, listing) {
  const [last] = await rest(`builds?game_id=eq.${q(game.id)}&select=version&order=version.desc&limit=1`);
  const id = crypto.randomUUID();
  const [b] = await rest('builds', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      id,
      game_id: game.id,
      version: (last?.version || 0) + 1,
      listing,
      storage_prefix: buildPrefix(game.id, id),
    }),
  });
  return b;
}

// Starts an update (patch) for a game with no draft open: the new draft starts from the latest store page. Free.
export async function startUpdate(account, slug) {
  const g = await ownGame(account, slug);
  if (g.status === 'removed') throw new StoreError(403, 'This game was taken down.');
  if (await openBuild(g.id)) throw new StoreError(409, 'This game already has an update in progress.');
  const [last] = await rest(`builds?game_id=eq.${q(g.id)}&select=listing&order=version.desc&limit=1`);
  return toBuild(await newDraft(g, g.listing || last?.listing || EMPTY_LISTING));
}

async function draftOf(g) {
  const b = await openBuild(g.id);
  if (!b) throw new StoreError(409, 'Start an update first.');
  if (b.status !== 'draft') throw new StoreError(409, 'This version is waiting for review and can no longer be changed.');
  return b;
}

export async function saveListing(account, slug, input) {
  const g = await ownGame(account, slug);
  const b = await draftOf(g);
  const listing = cleanListing(g.id, input);
  const [row] = await rest(`builds?id=eq.${q(b.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ listing }),
  });
  return { build: toBuild(row), problems: listingProblems(listing) };
}

// After the browser has uploaded the build's files: checks what actually landed in storage and records it.
export async function finalizeBuild(account, slug) {
  const g = await ownGame(account, slug);
  const b = await draftOf(g);
  const files = await listPrefix(b.storage_prefix);
  if (!files.length) throw new StoreError(400, 'No build files uploaded yet.');
  if (files.length > MAX_BUILD_FILES) throw new StoreError(400, `A build can have at most ${MAX_BUILD_FILES} files.`);
  const rels = files.map((f) => f.pathname.slice(b.storage_prefix.length));
  if (rels.some((r) => !cleanBuildPath(r))) throw new StoreError(400, 'The build contains files the store does not allow.');
  const size = files.reduce((s, f) => s + f.size, 0);
  if (size > MAX_BUILD_BYTES) throw new StoreError(400, `A build can be at most ${Math.round(MAX_BUILD_BYTES / 1048576)} MB.`);
  const index = files.find((f) => f.pathname === `${b.storage_prefix}index.html`);
  if (!index) throw new StoreError(400, 'The build needs an index.html at its top level.');
  const [row] = await rest(`builds?id=eq.${q(b.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ entry_url: index.url, file_count: files.length, size_bytes: size }),
  });
  return toBuild(row);
}

export async function submitBuild(account, slug) {
  const g = await ownGame(account, slug);
  const b = await draftOf(g);
  if (!b.entry_url) throw new StoreError(400, 'Upload the game build first.');
  const listing = cleanListing(g.id, b.listing);
  const problems = listingProblems(listing);
  if (problems.length) throw new StoreError(400, problems.join(' '));
  const [row] = await rest(`builds?id=eq.${q(b.id)}&status=eq.draft`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'submitted', listing, submitted_at: new Date().toISOString() }),
  });
  if (!row) throw new StoreError(409, 'That version was already submitted.');
  return toBuild(row);
}

// Pulls a submitted version back to a draft (to fix something before review).
export async function withdrawBuild(account, slug) {
  const g = await ownGame(account, slug);
  const b = await openBuild(g.id);
  if (!b || b.status !== 'submitted') throw new StoreError(409, 'Nothing is waiting for review.');
  const [row] = await rest(`builds?id=eq.${q(b.id)}&status=eq.submitted`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'draft', submitted_at: null }),
  });
  return toBuild(row);
}

// Is this upload pathname something this account may write right now? (lib/platform/storage.js parseUploadPath)
export async function mayUpload(account, target) {
  if (!target || !UUID.test(target.gameId)) return false;
  const [g] = await rest(`games?id=eq.${q(target.gameId)}&dev_id=eq.${q(account.id)}&select=id,status`);
  if (!g || g.status === 'removed') return false;
  if (target.kind === 'media') return true;
  const [b] = await rest(`builds?id=eq.${q(target.buildId)}&game_id=eq.${q(g.id)}&status=eq.draft&select=id`);
  return Boolean(b);
}

// ---- review (studio admin)

export async function reviewQueue({ adult }) {
  const builds = await rest(`builds?status=eq.submitted&select=*&order=submitted_at.asc&limit=100`);
  const filtered = builds.filter((b) => Boolean(b.listing?.adult) === Boolean(adult));
  if (!filtered.length) return [];
  const games = await rest(`games?id=in.(${[...new Set(filtered.map((b) => q(b.game_id)))].join(',')})&select=*`);
  const devIds = [...new Set(games.map((g) => g.dev_id))];
  const profiles = await rest(`dev_profiles?user_id=in.(${devIds.map(q).join(',')})&select=user_id,studio_name,contact_email`);
  return filtered.map((b) => {
    const g = games.find((x) => x.id === b.game_id);
    const p = profiles.find((x) => x.user_id === g?.dev_id);
    return {
      ...toBuild(b),
      game: g ? { slug: g.slug, status: g.status, live: g.status === 'live', currentListing: g.listing } : null,
      studio: p?.studio_name || null,
      contact: p?.contact_email || null,
      isUpdate: Boolean(g?.current_build),
    };
  });
}

export async function decideBuild(admin, buildId, { approve, codes = [], note = '' }) {
  if (!UUID.test(String(buildId))) throw new StoreError(400, 'Invalid build.');
  const cleanCodes = [...new Set((codes || []).filter((c) => ruleCodes.includes(c)))];
  const cleanNote = text(note, 2000) || null;
  if (!approve && !cleanCodes.length) throw new StoreError(400, 'Pick at least one rule (Q1 to Q8) the build breaks.');
  const now = new Date().toISOString();

  const [b] = await rest(`builds?id=eq.${q(buildId)}&status=eq.submitted`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      status: approve ? 'approved' : 'rejected',
      rejection_codes: approve ? [] : cleanCodes,
      reviewer_notes: cleanNote,
      reviewed_at: now,
      reviewed_by: admin,
    }),
  });
  if (!b) throw new StoreError(409, 'That build was already decided.');

  if (approve) {
    await rest(`builds?game_id=eq.${q(b.game_id)}&status=eq.approved&id=neq.${q(b.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'superseded' }),
    });
    const [g] = await rest(`games?id=eq.${q(b.game_id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        listing: b.listing,
        price_usd_cents: b.listing.priceUsdCents || 0,
        adult: Boolean(b.listing.adult),
        status: 'live',
        current_build: b.id,
        last_update_at: now,
        abandoned_at: null,
      }),
    });
    // the developer always has their own game in their library
    await rest('library?on_conflict=user_id,game_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: g.dev_id, game_id: g.id, source: 'developer' }),
    });
  }
  await logAdmin(admin, approve ? 'build.approve' : 'build.reject', b.id, { game: b.game_id, version: b.version, codes: cleanCodes, note: cleanNote });
  const [{ slug } = {}] = await rest(`games?id=eq.${q(b.game_id)}&select=slug`);
  return { ...toBuild(b), slug };
}

// ---- the storefront

async function studios(devIds) {
  if (!devIds.length) return {};
  const rows = await rest(`dev_profiles?user_id=in.(${devIds.map(q).join(',')})&select=user_id,studio_name`);
  return Object.fromEntries(rows.map((r) => [r.user_id, r.studio_name]));
}

const toStoreGame = (g, studio, build) => ({
  slug: g.slug,
  name: g.listing.title,
  tagline: g.listing.tagline,
  description: g.listing.description,
  tags: g.listing.tags,
  ageRating: g.listing.ageRating,
  adult: g.adult,
  priceUsdCents: g.price_usd_cents,
  browsers: g.listing.browsers,
  aiDisclosure: g.listing.aiDisclosure || '',
  trailerUrl: g.listing.trailerUrl || '',
  hero: g.listing.capsule,
  screenshots: g.listing.screenshots,
  studio: studio || 'Independent developer',
  status: g.status,
  lastUpdateAt: g.last_update_at,
  ...(build?.entry_url ? { entryUrl: frameUrl(build.id) } : {}),
  store: true,
});

// Live games for the store pages. Adult games only for accounts that opted in.
export async function liveGames({ adult = false } = {}) {
  const rows = await rest(`games?status=in.(live,abandoned)&select=*&order=last_update_at.desc&limit=200`);
  const visible = rows.filter((g) => g.listing && (adult || !g.adult));
  const names = await studios([...new Set(visible.map((g) => g.dev_id))]);
  return visible.map((g) => toStoreGame(g, names[g.dev_id]));
}

export async function liveGame(slug, { withBuild = false } = {}) {
  if (!SLUG_RE.test(String(slug))) return null;
  const [g] = await rest(`games?slug=eq.${q(slug)}&status=in.(live,abandoned)&select=*`);
  if (!g || !g.listing) return null;
  const names = await studios([g.dev_id]);
  let build = null;
  if (withBuild && g.current_build) [build] = await rest(`builds?id=eq.${q(g.current_build)}&select=id,entry_url`);
  return { ...toStoreGame(g, names[g.dev_id], build), id: g.id, devId: g.dev_id };
}

// ---- library

export async function libraryOf(account) {
  const rows = await rest(`library?user_id=eq.${q(account.id)}&select=game_id,source,created_at&order=created_at.desc`);
  if (!rows.length) return [];
  const games = await rest(`games?id=in.(${rows.map((r) => q(r.game_id)).join(',')})&select=*`);
  const names = await studios([...new Set(games.map((g) => g.dev_id))]);
  return rows
    .map((r) => {
      const g = games.find((x) => x.id === r.game_id);
      return g && g.listing ? { ...toStoreGame(g, names[g.dev_id]), source: r.source, addedAt: r.created_at } : null;
    })
    .filter(Boolean);
}

export async function ownsGame(account, gameId) {
  if (!account) return false;
  const [row] = await rest(`library?user_id=eq.${q(account.id)}&game_id=eq.${q(gameId)}&select=source`);
  return Boolean(row);
}

// Adds a free game to the account's library (paid games arrive here through checkout, milestone 5).
export async function addFreeGame(account, slug) {
  const g = await liveGame(slug);
  if (!g || g.status !== 'live') throw new StoreError(404, 'That game is not on the store.');
  if (g.priceUsdCents > 0) throw new StoreError(402, 'This game is paid. Checkout opens soon.');
  if (g.adult && !account.adultOptIn) throw new StoreError(403, 'Turn on adult content in your profile first.');
  await rest('library?on_conflict=user_id,game_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: account.id, game_id: g.id, source: 'free' }),
  });
  return true;
}


// For player counts: is this slug a live store game? Cached for 5 minutes per slug.
const playableCache = new Map();
export async function isPlayableStoreGame(slug) {
  if (!SLUG_RE.test(String(slug))) return false;
  const hit = playableCache.get(slug);
  if (hit && Date.now() - hit.at < 300_000) return hit.ok;
  const [g] = await rest(`games?slug=eq.${q(slug)}&status=eq.live&select=id`);
  playableCache.set(slug, { at: Date.now(), ok: Boolean(g) });
  if (playableCache.size > 5000) playableCache.clear();
  return Boolean(g);
}

// What /play needs: the build to load, if this visitor may play it ({ game } or { error, status }).
export async function playable(account, slug) {
  const g = await liveGame(slug, { withBuild: true });
  if (!g || !g.entryUrl) return { status: 404, error: 'That game is not on the store.' };
  if (g.status !== 'live') return { status: 410, error: 'This game was abandoned by its developer and is not sold right now.' };
  if (g.adult && !account?.adultOptIn) return { status: 403, error: 'This game is for adults. Turn on adult content in your profile to see it.' };
  const owned = account ? await ownsGame(account, g.id) : false;
  if (g.priceUsdCents > 0 && !owned && account?.id !== g.devId) {
    return { status: 402, error: 'This game is paid. Checkout opens soon.' };
  }
  if (account && !owned && g.priceUsdCents === 0) await addFreeGame(account, slug).catch(() => {});
  return { game: { slug: g.slug, name: g.name, studio: g.studio, entryUrl: g.entryUrl } };
}
