// Browser-safe: what a store page holds and what it needs before it can be sent for review.

export const TAGS = [
  'Action', 'Adventure', 'Arcade', 'Casual', 'Card', 'Fighting', 'Horror', 'Idle', 'Multiplayer', 'Party',
  'Platformer', 'Puzzle', 'Racing', 'RPG', 'Sandbox', 'Shooter', 'Simulation', 'Sports', 'Story', 'Strategy',
  'Survival', 'Experimental',
];
export const AGE_RATINGS = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'teen', label: 'Teen (13+)' },
  { key: 'mature', label: 'Mature (17+)' },
  { key: 'adults', label: 'Adults only (18+)' },
];
export const BROWSERS = ['Chrome', 'Firefox', 'Edge', 'Safari'];
export const EMPTY_LISTING = {
  title: '', tagline: '', description: '', tags: [], ageRating: 'everyone', adult: false, adultDeclaration: false,
  priceUsdCents: 0, browsers: ['Chrome', 'Firefox'], aiDisclosure: '', trailerUrl: '', capsule: '', screenshots: [],
};

// What still stops a store page from being submitted (plain sentences), or [].
export function listingProblems(l) {
  const out = [];
  if (l.title.length < 2) out.push('Add a title.');
  if (l.tagline.length < 10) out.push('Add a one-line tagline (10 characters or more).');
  if (l.description.length < 100) out.push('Write a description of at least 100 characters.');
  if (!l.tags.length) out.push('Pick at least one tag.');
  if (!l.browsers.includes('Chrome') || !l.browsers.includes('Firefox')) out.push('Games must work in Chrome and Firefox (Q1).');
  if (!l.capsule) out.push('Upload a cover image.');
  if (l.screenshots.length < 3) out.push('Upload at least 3 screenshots.');
  if (l.adult && !l.adultDeclaration) out.push('Confirm that every character in the game is an adult.');
  return out;
}
