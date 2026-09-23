// The studio's games: what the home page lists, what /games/<slug> describes, and how the shop groups cosmetics.
//
// To add a game: append an entry, drop its art in /public/games/<slug>/, list its cosmetics in lib/catalog.js with
// `game` equal to this `name`. The name is what the game itself asks the cosmetics API for, so keep it stable.
export const GAMES = [
  {
    slug: 'my-favorite-sheep',
    name: 'My Favorite Sheep',
    tagline: "One of the flock is a wolf in sheep's clothing.",
    status: 'In development',
    players: '1 to 4 players, online',
    hero: '/games/my-favorite-sheep/hero.jpg',
    steam: null, // Steam store URL once the page is live
    blurb: [
      'Sixty-four sheep, a handful of farmers, and one wolf wearing a fleece. It kills when nobody is looking and blends back in before you turn around.',
      'Farmers read ear tags up close, examine bodies for clues, and pool their notebooks to narrow the suspects. Buy binoculars, a radar, a stun stick or a scarecrow from the tool shed, and watch the weather: fog, rain and heat each change the hunt.',
      "Online, one player is secretly dealt the wolf. Solo, you choose: hunt it, or be it against three farmhands. Once the disguise drops, it's a rampage - stop the wolf before the flock is gone.",
      'Between the scares there is a farm to live on: fish off the jetty, have a beer on the porch (and watch your footing after the third), and in solo games stop time for photo mode. Dress your farmer in hats, T-shirts, outfits and auras from the wardrobe.',
    ],
    shots: [
      { src: '/games/my-favorite-sheep/shot-cosmetics.jpg', alt: 'Farmers in hats, T-shirts, outfits and auras from the wardrobe' },
      { src: '/games/my-favorite-sheep/shot-pasture.jpg', alt: 'The pasture: sixty-four sheep, and one of them is not a sheep' },
      { src: '/games/my-favorite-sheep/shot-wolf.jpg', alt: 'The disguise is off: the wolf loose by the barn' },
      { src: '/games/my-favorite-sheep/shot-pond.jpg', alt: 'The pond, with a jetty to fish from' },
      { src: '/games/my-favorite-sheep/shot-field.jpg', alt: 'The crop field and the windmill' },
      { src: '/games/my-favorite-sheep/shot-barn.jpg', alt: 'Inside the barn' },
    ],
  },
];

export const findGame = (slug) => GAMES.find((g) => g.slug === slug) || null;
export const gameByName = (name) => GAMES.find((g) => g.name === name) || null;
