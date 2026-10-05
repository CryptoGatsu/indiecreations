// Community games: holders describe a game in a prompt, Claude writes it as one Three.js HTML file, and anyone can
// play it at /community/<id>. This file is safe for the browser too (the create page shows the tiers); the storage is
// in lib/creationStore.js and the generator in lib/creationAI.js, both server-only.

// How many games a wallet may have at once, by the $CREATIONS it holds when it creates or edits one. Highest first.
// Studio wallets on the allowlist (lib/config.js) get the top tier.
export const CREATOR_TIERS = [
  { min: 10_000_000, games: 5 },
  { min: 5_000_000, games: 4 },
  { min: 1_000_000, games: 3 },
  { min: 500_000, games: 2 },
  { min: 100_000, games: 1 },
];
export const MIN_CREATOR_TOKENS = CREATOR_TIERS[CREATOR_TIERS.length - 1].min;

export const slotsFor = (balance) => (CREATOR_TIERS.find((t) => balance >= t.min) || { games: 0 }).games;

// The next tier up from a balance, or null at the top: { min, games }.
export const nextTier = (balance) => [...CREATOR_TIERS].reverse().find((t) => balance < t.min) || null;

export const PROMPT_MAX = 2000;
export const TITLE_MAX = 60;

// Game ids are 10 characters of [0-9A-Za-z]: hard to guess, so an unpublished game stays private by obscurity too.
export const isGameId = (id) => /^[0-9A-Za-z]{10}$/.test(id || '');

// The sandboxed game file. Always load it through this URL: its response headers are what keep the game away from the
// site's cookies and wallets (pages/api/creations/[id]/raw.js).
export const rawUrl = (id, version) => `/api/creations/${id}/raw${version ? `?v=${version}` : ''}`;

// What the iframe needs: scripts and pointer lock only. No same-origin, forms, popups, modals or top navigation.
export const SANDBOX = 'allow-scripts allow-pointer-lock';

// Community games have no cover art: each gets a colour pair of its own, worked out from its id.
export function tileColors(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = h % 360;
  return { from: `hsl(${a} 70% 52%)`, to: `hsl(${(a + 50) % 360} 75% 38%)` };
}
