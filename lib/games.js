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
//
// Burns from checkout sales: `burnBps` (basis points, 2000 = 20%) of a game's checkout revenue is burned from the
// treasury when each month closes, before that month's holder payout is published (lib/revshareJob.js).
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
  {
    slug: 'deathrace3000',
    name: 'DeathRace3000',
    tagline: 'Outrun the wall. Cash out or double up.',
    status: 'Testnet beta',
    players: 'Free to play in the browser on desktop, phone and tablet. Heats race you against other players.',
    hero: '/games/deathrace3000/hero.jpg',
    steam: null,
    play: '/deathrace3000',
    shop: 'in-game',
    // On testnet for now: add its mainnet CosmeticShop (revenue) on launch day. The heat contract pays the treasury
    // its rake directly, so it is not listed here.
    chain: { revenue: [], burners: [] },
    playCard: {
      title: 'Play free in your browser',
      text:
        'Free play and the daily track cost nothing. Create a racer profile to get a game wallet, load it with $CREATIONS from MetaMask and enter $5 heats against other players: the top three split the pot. New cars and paints are bought in the workshop. Desktop, phones and tablets.',
      cta: 'Race now',
    },
    blurb: [
      'A wall of fire is eating the road behind you. Every metre you stay ahead of it scores, and every checkpoint raises your multiplier - but you only keep the score if you cash out before it catches you.',
      'The road never repeats: wasteland, red-rock canyons, alpine passes, rainforest, a neon megacity and a glass tunnel that dives under the sea, with flame vents, laser gates, rockfalls, avalanches, ramps and barrels to thread. Rain, sandstorms, blizzards and nightfall change the grip and the sightlines.',
      'Heats are one attempt each against the other players who entered, with nine AI pacers on the track for company. Every run is replayed on the server by the same deterministic simulation the game runs, so a score only counts if it really happened. Entries are pooled: the treasury takes 20%, the top three real racers split the rest 60/25/15, and if fewer than two players enter everyone is refunded.',
      'Between races, spend SCRAP from your runs on performance parts in the workshop. New cars and paint jobs are bought with $CREATIONS from your game wallet, and every sale goes to the Indie Creations treasury.',
      'The beta runs on Robinhood Chain testnet: heat entries and paints use test $CREATIONS from the in-game faucet.',
    ],
    shots: [
      { src: '/games/deathrace3000/shot-abyss.jpg', alt: 'Diving under the sea in the glass tunnel' },
      { src: '/games/deathrace3000/shot-snow.jpg', alt: 'The Frozen Pass under the Alps' },
      { src: '/games/deathrace3000/shot-city.jpg', alt: 'Night racing through the neon megacity' },
      { src: '/games/deathrace3000/shot-canyon.jpg', alt: 'Death Canyon at golden hour' },
    ],
  },
  {
    slug: 'youre-safe',
    name: "Don't Worry, You're Safe!",
    tagline: 'An interactive buddy that remembers everything.',
    status: 'Free to play in your browser',
    players: 'Single player. Plays in the browser on desktop, phone and tablet.',
    hero: '/games/youre-safe/hero.jpg',
    steam: null,
    play: '/youre-safe',
    shop: 'in-game',
    // Sales go through the site's checkout (the in-game CREATIONS shop pays the treasury), so nothing to list here.
    chain: { revenue: [], burners: [] },
    // 20% of every sale is burned from the treasury when the month closes, before holders are paid.
    burnBps: 2000,
    playCard: {
      title: 'Play free in your browser',
      text:
        'Your buddy, a room full of props and a hotbar of starter tools cost nothing, and simple weapons, food and toys are bought with coins you earn by playing. Guns, heavy ordnance, traps, disasters, new rooms, the map builder and the Inner Voice are bought in the CREATIONS shop and belong to your wallet. 20% of every sale is burned.',
      cta: 'Meet your buddy',
    },
    blurb: [
      "Your buddy is a small, soft, hopeful little figure in a quiet gray room. It trusts you. It sits on the couch, climbs the ladder, raids the fridge and waves when you come back. Then you pick up a hammer.",
      'Every limb is physically simulated, so it tumbles, braces, grabs ledges, limps and gets back up. Bruises bloom where it was hit and heal slowly. It sees you coming, hears the fuse, and dives for cover behind the crate you just placed.',
      "It remembers. The first time it meets a trap it pokes at it; once it knows what the saw does it gives it a wide berth and tells you so. Hurt it enough and it stops trusting you; take care of it and it forgives. Switch its mind off and it just stands there drooling.",
      'Katanas, 2x4s, shotguns, a minigun, mustard gas, plague jars, black holes, an orbital laser and a nuke. Buzz saws, crushers, lava pits and turrets you place yourself with the map builder. Earthquakes, tornadoes, floods and meteor showers. A kitchen, a lab, a moon base with low gravity, and a volcano.',
      'Mature mode (18+, off by default) adds blood, wounds and dismemberment, and a buddy that is terrified of its own blood. Photo mode, achievements, and a journal where your buddy writes down what you did to it.',
    ],
    shots: [
      { src: '/games/youre-safe/shot-chaos.jpg', alt: 'Buzz saws, a crusher, lava and a turret, all at once' },
      { src: '/games/youre-safe/shot-room.jpg', alt: 'The room: a couch, a crate, a fridge and a ladder' },
      { src: '/games/youre-safe/shot-shop.jpg', alt: 'The CREATIONS shop: heavy ordnance' },
      { src: '/games/youre-safe/shot-environments.jpg', alt: 'Kitchen, laboratory, moon base and volcano' },
    ],
  },
  {
    slug: 'snowmoon-forever',
    name: 'Snowmoon Forever',
    tagline: 'A city that runs on reputation. Walk it, vote in it, build in it.',
    status: 'Alpha · free in your browser',
    players: 'Plays in the browser on desktop, phone and tablet. Keyboard and mouse recommended.',
    hero: '/games/snowmoon-forever/hero.jpg',
    steam: null,
    play: '/snowmoon-forever',
    shop: 'in-game',
    // Alpha on Robinhood Chain testnet: nothing to list until it moves to mainnet.
    chain: { revenue: [], burners: [] },
    playCard: {
      title: 'Play the alpha in your browser',
      text:
        'Walk Kalimar for free, no download. Sign in with your wallet to keep your progress, your Rep and the home you build. The alpha runs on Robinhood Chain testnet. Desktop, phones and tablets.',
      cta: 'Enter Kalimar',
    },
    blurb: [
      'Snowmoon Forever is an open-world story set in Kalimar, a green city where your reputation follows you down every street. Talk to the people you pass, follow the Chronicle chapter by chapter, and earn XP as you go.',
      'The city runs on its own rules. Scan a building to see the land tax it pays (beautiful homes pay less). When sortition picks you, you vote on what gets built. Pull your hood up and you go anonymous, with only your Rep on your tag.',
      "Claim a plot on Badra Lane and build a home of your own. Hunt down every Hydrafill ad, because each one is a collectible. Then follow the story out of Kalimar: the Pafogai Du cafe, the mountain pyramid, the Minpentai arena, a taxi over the highways to Freetown, a citizens' assembly and a reputation-backed loan.",
      'Snowmoon Forever is based on Snowmoon by Vitalik Buterin (GPL-3.0). It is an unofficial fan adaptation by Indie Creations.',
    ],
    shots: [
      { src: '/games/snowmoon-forever/shot-city.jpg', alt: 'The path into the city, under the bridge' },
    ],
  },
];

export const findGame = (slug) => GAMES.find((g) => g.slug === slug) || null;
export const gameByName = (name) => GAMES.find((g) => g.name === name) || null;
