// The cosmetics on sale. Prices are in USD; the $creations amount is worked out at checkout from the live price.
//
// To add one: append an entry, drop its art in /public/shop, push.
//   id           permanent and unique, [a-z0-9-]. The game looks cosmetics up by this id, and it is what gets recorded
//                against the buyer's Steam account - so never rename or reuse one.
//   game         which game it belongs to (the game asks for its own cosmetics by this name)
//   usd          price in US dollars
//   image        optional, e.g. '/shop/game-neon-trail.png' (square works best); a checker tile is shown without one
//   available    false = shown as "Coming soon" and cannot be bought
//
// Only list cosmetics the game can actually show: a purchase is a real payment.
// My Favorite Sheep: listed now so people can see what is coming, but nothing sells until the game's Steam page is
// live. Flip this to true on that day. The ids are permanent and match Cosmetics.cs in the game.
const MFS_ON_SALE = false;
const MFS = 'My Favorite Sheep';

const ITEMS = [
  // ---- hats
  { id: 'mfs-hat-cowboy', game: MFS, name: 'Cowboy hat', description: 'Worn leather, curled brim. Somebody has to keep order out here.', usd: 5, image: '/shop/mfs-hat-cowboy.png', available: MFS_ON_SALE },
  { id: 'mfs-hat-beanie', game: MFS, name: 'Wool beanie', description: 'Knitted from the flock itself. Cosy on night watch.', usd: 5, image: '/shop/mfs-hat-beanie.png', available: MFS_ON_SALE },
  { id: 'mfs-hat-tophat', game: MFS, name: 'Top hat', description: 'For the farmer who takes the investigation very seriously.', usd: 5, image: '/shop/mfs-hat-tophat.png', available: MFS_ON_SALE },
  { id: 'mfs-hat-bucket', game: MFS, name: 'Bucket hat', description: 'Keeps the rain off. Mostly.', usd: 5, image: '/shop/mfs-hat-bucket.png', available: MFS_ON_SALE },
  { id: 'mfs-hat-cap', game: MFS, name: 'Red cap', description: 'A little too bright for sneaking up on anything.', usd: 5, image: '/shop/mfs-hat-cap.png', available: MFS_ON_SALE },

  // ---- outfits
  { id: 'mfs-outfit-vest', game: MFS, name: 'Leather vest', description: 'Brass buttons, deep pockets, no nonsense.', usd: 3, image: '/shop/mfs-outfit-vest.png', available: MFS_ON_SALE },
  { id: 'mfs-outfit-apron', game: MFS, name: "Butcher's apron", description: 'Sends a message to the flock.', usd: 3, image: '/shop/mfs-outfit-apron.png', available: MFS_ON_SALE },
  { id: 'mfs-outfit-bandana', game: MFS, name: 'Red bandana', description: 'Knotted at the neck, ready for dust.', usd: 3, image: '/shop/mfs-outfit-bandana.png', available: MFS_ON_SALE },
  { id: 'mfs-outfit-raincoat', game: MFS, name: 'Yellow raincoat', description: 'Bright as a warning. The wolf sees you coming, and so do your friends.', usd: 3, image: '/shop/mfs-outfit-raincoat.png', available: MFS_ON_SALE },

  // ---- tool skins (stick, pitchfork and axe all change together)
  { id: 'mfs-skin-gilded', game: MFS, name: 'Gilded tools', description: 'Walnut handles and gold-plated heads. Ridiculous on a farm.', usd: 2, image: '/shop/mfs-skin-gilded.png', available: MFS_ON_SALE },
  { id: 'mfs-skin-blackiron', game: MFS, name: 'Black iron tools', description: 'Charcoal and blackened iron, for a farmer who means it.', usd: 2, image: '/shop/mfs-skin-blackiron.png', available: MFS_ON_SALE },
  { id: 'mfs-skin-candycane', game: MFS, name: 'Candy cane tools', description: 'Peppermint red and white. Wolves hate it.', usd: 2, image: '/shop/mfs-skin-candycane.png', available: MFS_ON_SALE },
  { id: 'mfs-skin-frostbite', game: MFS, name: 'Frostbite tools', description: 'Pale ash and a blade that glows cold in the dark.', usd: 2, image: '/shop/mfs-skin-frostbite.png', available: MFS_ON_SALE },

  // ---- titles (shown after the player's name to everyone in the game)
  { id: 'mfs-title-shepherd', game: MFS, name: 'Title: Shepherd', description: 'Shown after your name to everyone in the game.', usd: 1, available: MFS_ON_SALE },
  { id: 'mfs-title-wolfsbane', game: MFS, name: 'Title: Wolfsbane', description: 'Shown after your name to everyone in the game.', usd: 1.5, available: MFS_ON_SALE },
  { id: 'mfs-title-sheriff', game: MFS, name: 'Title: Sheriff of the Pasture', description: 'Shown after your name to everyone in the game.', usd: 1.5, available: MFS_ON_SALE },
  { id: 'mfs-title-lambchop', game: MFS, name: 'Title: Lamb Chop', description: 'Shown after your name to everyone in the game.', usd: 1, available: MFS_ON_SALE },
  { id: 'mfs-title-nightwatch', game: MFS, name: 'Title: Night Watch', description: 'Shown after your name to everyone in the game.', usd: 1, available: MFS_ON_SALE },
  { id: 'mfs-title-counter', game: MFS, name: 'Title: Counts Sheep to Sleep', description: 'Shown after your name to everyone in the game.', usd: 1, available: MFS_ON_SALE },

  // ---- emotes (each adds a slice to the in-game emote wheel)
  { id: 'mfs-emote-wave', game: MFS, name: 'Emote: Wave', description: 'A big friendly wave.', usd: 5, image: '/shop/mfs-emote-wave.png', available: MFS_ON_SALE },
  { id: 'mfs-emote-jig', game: MFS, name: 'Emote: Jig', description: 'A little victory dance.', usd: 5, image: '/shop/mfs-emote-jig.png', available: MFS_ON_SALE },
  { id: 'mfs-emote-facepalm', game: MFS, name: 'Emote: Facepalm', description: 'For when the notebook says it was obvious.', usd: 5, image: '/shop/mfs-emote-facepalm.png', available: MFS_ON_SALE },
  { id: 'mfs-emote-bow', game: MFS, name: 'Emote: Bow', description: 'Take a bow.', usd: 5, image: '/shop/mfs-emote-bow.png', available: MFS_ON_SALE },
  // {
  //   id: 'game-neon-trail',
  //   game: 'Some Game',
  //   name: 'Neon Trail',
  //   description: 'A glowing trail that follows your character.',
  //   usd: 2.5,
  //   image: '/shop/game-neon-trail.png',
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
