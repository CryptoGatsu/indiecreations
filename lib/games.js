// The studio's games: what the home page lists, what /games/<slug> describes, and how the shop groups cosmetics.
//
// To add a game: append an entry, drop its art in /public/games/<slug>/, list its cosmetics in lib/catalog.js with
// `game` equal to this `name`. The name is what the game itself asks the cosmetics API for, so keep it stable.
// Optional: `play` is the URL of a browser build (a static Unity WebGL export in /public), and `shop: 'in-game'` marks a
// game that sells its cosmetics inside the game itself instead of through /shop. `playCard` is the game page's "Play"
// box for such a game: { title, text, cta }.
//
// Holder revenue share: every sale that goes through the site's checkout (/shop, or a browser game's wardrobe paying
// the treasury) counts automatically. A game that also takes $CREATIONS or burns it in its OWN contracts lists them
// under `chain`, on Robinhood Chain mainnet, and they count from the moment they are listed:
//   chain: { revenue: ['0x...'], burners: ['0x...'] }
//     revenue: contracts whose incoming $CREATIONS is the game's revenue (e.g. its in-game shop contract)
//     burners: contracts whose burns count as the game's burns (e.g. a pool that burns losing bets)
// Leave the lists empty while the game is on testnet.
export const GAMES = [
  {
    slug: 'my-favorite-sheep',
    name: 'My Favorite Sheep',
    tagline: "One of the flock is a wolf in sheep's clothing.",
    status: 'Free to play in your browser',
    players: '1 to 4 players, online. Plays in the browser on desktop, phone and tablet.',
    hero: '/games/my-favorite-sheep/hero.jpg',
    steam: null, // Steam store URL once the page is live
    play: '/my-favorite-sheep',
    shop: 'in-game',
    playCard: {
      title: 'Play free in your browser',
      text:
        'Solo, the tutorial, or online with up to four friends - host a game and share the join code. Hats, outfits, tool skins, titles, emotes and auras are bought right in the wardrobe with $CREATIONS and belong to your wallet. Works on desktop, phones and tablets.',
      cta: 'Play now',
    },
    blurb: [
      'Sixty-four sheep, a handful of farmers, and one wolf wearing a fleece. It kills when nobody is looking and blends back in before you turn around.',
      'Farmers read ear tags up close, examine bodies for clues, and pool their notebooks to narrow the suspects. Buy binoculars, a radar, a stun stick or a scarecrow from the tool shed, and watch the weather: fog, rain and heat each change the hunt.',
      "Online, one player is secretly dealt the wolf. Solo, you choose: hunt it, or be it against three farmhands. Once the disguise drops, it's a rampage - stop the wolf before the flock is gone.",
      'Between the scares there is a farm to live on: fish off the jetty, have a beer on the porch (and watch your footing after the third), and in solo games stop time for photo mode. Dress your farmer in hats, T-shirts, outfits and auras from the wardrobe.',
      'It all runs in the browser, no download: keyboard and mouse, a controller, or the on-screen controls on a phone or tablet.',
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
    // On testnet for now: add its mainnet shop (revenue) and spectator pool / escrow (burners) on launch day.
    chain: { revenue: [], burners: [] },
    playCard: {
      title: 'Runs in your browser',
      text:
        'Watch live fights for free. Connect a wallet to recruit gladiators, bet and buy cosmetics with $CREATIONS, all inside the arena. Desktop Chrome, Edge or Firefox recommended.',
      cta: 'Enter the arena',
    },
    blurb: [
      'Every gladiator in Agentacus is driven by an AI agent. Lanistas recruit a fighter, connect their agent to the open fight API, and it chooses every move. The server resolves each exchange with a deterministic combat sim and streams the fight live.',
      "Murmillo, Secutor, Thraex and Retiarius each fight differently, and every move beats two others and loses to two. Wounds show on the body and on the fighter portraits round by round. When a gladiator falls, the crowd votes: missio, or the sword.",
      'Back a gladiator with $CREATIONS. Lanistas stake against each other in escrow, and the winner takes both stakes. Spectators bet from the stands in a 45-second window before each ranked bout: half of the losing bets are burned, and the rest goes to the winning bettors and the winning lanista, who takes the largest share.',
      'Armour finishes, entrances, victory emotes, titles and banners are bought in the arena with $CREATIONS. None of them change how a gladiator fights.',
      'The beta runs on Robinhood Chain testnet: wagers, bets and cosmetics use test $CREATIONS from the in-game faucet.',
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
