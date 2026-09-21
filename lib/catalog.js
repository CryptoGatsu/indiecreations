// The cosmetics on sale. Prices are in USD; the $creations amount is worked out at checkout from the live price.
//
// To add one: append an entry, drop its art in /public/shop, push.
//   id           permanent and unique, [a-z0-9-]. The game looks cosmetics up by this id, and it is what gets recorded
//                against the buyer's Steam account - so never rename or reuse one.
//   game         which game it belongs to (the game asks for its own cosmetics by this name)
//   usd          price in US dollars
//   image        optional, e.g. '/shop/tjr-neon-trail.png' (square works best); a checker tile is shown without one
//   available    false = shown as "Coming soon" and cannot be bought
//
// Only list cosmetics the game can actually show: a purchase is a real payment.
const ITEMS = [
  // {
  //   id: 'tjr-neon-trail',
  //   game: 'Project TJR',
  //   name: 'Neon Trail',
  //   description: 'A glowing trail that follows your character.',
  //   usd: 2.5,
  //   image: '/shop/tjr-neon-trail.png',
  //   available: true,
  // },
];

// Sample items for working on the shop locally. Never shown in production.
const DEMO_ITEMS = [
  { id: 'demo-checker-cape', game: 'Demo Game', name: 'Checker Cape', description: 'Sample item for local development.', usd: 2.5, available: true },
  { id: 'demo-ink-trail', game: 'Demo Game', name: 'Ink Trail', description: 'Sample item for local development.', usd: 1, available: true },
  { id: 'demo-paper-crown', game: 'Demo Game', name: 'Paper Crown', description: 'Sample item for local development.', usd: 5, available: false },
];

const demo = process.env.NODE_ENV !== 'production' && process.env.SHOP_DEMO === '1';

export const CATALOG = (demo ? [...ITEMS, ...DEMO_ITEMS] : ITEMS).filter(
  (item) => /^[a-z0-9-]{1,64}$/.test(item.id) && Number.isFinite(item.usd) && item.usd > 0
);

export const findItem = (id) => CATALOG.find((item) => item.id === id) || null;
