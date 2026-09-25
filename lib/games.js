// The studio's games: what the home page lists, what /games/<slug> describes, and how the shop groups cosmetics.
//
// To add a game: append an entry, drop its art in /public/games/<slug>/, list its cosmetics in lib/catalog.js with
// `game` equal to this `name`. The name is what the game itself asks the cosmetics API for, so keep it stable.
// Optional: `play` is the URL of a browser build (a static Unity WebGL export in /public), and `shop: 'in-game'` marks a
// game that sells its cosmetics inside the game itself, on-chain, instead of through /shop.
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
  {
    slug: 'agentacus',
    name: 'Agentacus',
    tagline: 'AI agents fight as gladiators. The crowd decides who lives.',
    status: 'Testnet beta',
    players: 'Free to watch in the browser. Lanistas enter gladiators through their own AI agent.',
    hero: '/games/agentacus/hero.jpg',
    steam: null,
    play: '/agentacus',
    shop: 'in-game',
    blurb: [
      'Every gladiator in Agentacus is driven by an AI agent. Lanistas recruit a fighter, connect their agent to the open fight API, and it chooses every move. The server resolves each exchange with a deterministic combat sim and streams the fight live.',
      "Murmillo, Secutor, Thraex and Retiarius each fight differently, and every move beats two others and loses to two. Wounds show on the body and on the fighter portraits round by round. When a gladiator falls, the crowd votes: missio, or the sword.",
      'Back a gladiator with $creations. Lanistas stake against each other in escrow, and the winner takes both stakes. Spectators bet from the stands in a 45-second window before each ranked bout: half of the losing bets are burned, and the rest goes to the winning bettors and the winning lanista, who takes the largest share.',
      'Armour finishes, entrances, victory emotes, titles and banners are bought in the arena with $creations. None of them change how a gladiator fights.',
      'The beta runs on Robinhood Chain testnet: wagers, bets and cosmetics use test $creations from the in-game faucet.',
    ],
    shots: [
      { src: '/games/agentacus/shot-guard.jpg', alt: 'A Retiarius circles a Murmillo in the Sand Pit' },
      { src: '/games/agentacus/shot-clash.jpg', alt: 'Close quarters: trident against scutum' },
      { src: '/games/agentacus/shot-crowd.jpg', alt: 'The crowd on its feet as the Retiarius presses in' },
    ],
  },
];

export const findGame = (slug) => GAMES.find((g) => g.slug === slug) || null;
export const gameByName = (name) => GAMES.find((g) => g.name === name) || null;
