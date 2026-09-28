
# Indie Creations

🌌 Indie Creations

Indie Creations is a small, independent development initiative focused on building unique, gameplay-first experiences from the ground up. Every project is driven by experimentation, learning, and a commitment to actually finishing and releasing games, no matter the size.

The goal is simple:
Create fun, evolving games while documenting the journey from idea → playable → polished.

🪙 $CREATIONS

Indie Creations is a tokenized indie game studio. $CREATIONS is a fixed-supply ERC-20 (1,000,000,000 supply) live on Robinhood Chain (chain ID 4663), launched through PONS Launchpad.

Holders get:
- Access to the playtest area
- The ability to rate and review each build
- Free access to every game at release

Contract Address (CA):
0xB9195597f91f179EBB05D3F1765B35C3d8491aCb

PONS: https://www.ponsfamily.com/launchpad/0xB9195597f91f179EBB05D3F1765B35C3d8491aCb

X: https://x.com/IndieCreations_

🔧 Site setup

The site is a Next.js app. Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_TOKEN_ADDRESS` (optional) — overrides the $CREATIONS CA, which is already the default in `lib/config.js`.
- `NEXT_PUBLIC_MIN_TOKENS` — tokens required to unlock playtests (default 5,000,000).
- `SESSION_SECRET` — long random string, required in production.
- `RPC_URL` (optional) — private RPC for balance checks.
- `NEXT_PUBLIC_WC_PROJECT_ID` (optional) — enables WalletConnect for mobile wallets.

- `GAME_TICKET_KEY` - base64 of the RSA private key that signs in-game holder tickets (`/api/game/ticket`). Required in production while a build with the in-game check is live; the matching public key is compiled into the game.

How the gate works: the holder connects a wallet and signs a free message, the server verifies the signature and the on-chain balance, then sets a signed session cookie. `middleware.js` blocks everything under `/game/` without that cookie, so the build cannot be loaded by URL alone. The game also checks for itself: it asks `/api/game/ticket` for a short-lived ticket signed with `GAME_TICKET_KEY` (the balance is re-checked each time) and refuses to run without one, so a copy of the build hosted elsewhere does not work and a wallet that sells below the threshold is out within minutes. Which build is live is set in `lib/build.js`; while it is `null`, holders see a "no build live" message and the game files stay closed.

🛍️ Cosmetics shop (`/shop`)

Every Indie Creations game sells its cosmetics here. Items are priced in USD, paid in $CREATIONS, and tied to the buyer's Steam account.

1. The buyer signs in through Steam (Steam's own OpenID login; the site only ever learns the SteamID).
2. At checkout the USD price is converted at the live $CREATIONS price (DexScreener and GeckoTerminal must agree within 15%, otherwise checkout pauses) and held for 10 minutes.
3. The buyer sends that exact amount of $CREATIONS from their wallet to `SHOP_TREASURY_ADDRESS`.
4. The server finds the transfer on Robinhood Chain and only then records the cosmetic against the SteamID. The payment must come from the quoted wallet, go to the treasury, match the amount to the wei (each order's amount ends in a few random wei), and be newer than the order. One transaction can settle one order, ever.

Payments go to the treasury wallet `0x901fC42f24adc138F73BaC931557Ab17AfCA7093` (the default in `lib/shop.js`; `SHOP_TREASURY_ADDRESS` overrides it). Checkout needs `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` and the tables from `supabase/shop.sql`; without them the shop is browse-only in production. Set `SITE_URL` in production so the Steam sign-in always returns to the real domain.

Adding cosmetics: edit `lib/catalog.js` (the rules are at the top of the file) and put the art in `public/shop/`. Only list cosmetics the game can actually show, because a purchase is a real payment. `SHOP_DEMO=1` shows sample items in local development only.

How a game reads what a player owns:

`GET /api/game/cosmetics?game=<game name>&steamid=<SteamID64>`
returns `{ payload: "c1|<steamid>|<unix expiry>|<game>|<item-id,item-id,...>", sig }`, where `sig` is a base64 RSA-SHA256 signature made with `GAME_TICKET_KEY`, the same key pair as the holder ticket, so the game verifies it with the public key it already ships with. The game must check the signature, that `<steamid>` is the account it is running under (`SteamUser.GetSteamID()`), and that the expiry has not passed, then unlock the listed item ids. Once the game has a Steam app, set `STEAM_APP_ID` + `STEAM_PUBLISHER_KEY`: the endpoint then requires `&ticket=<hex>` from `ISteamUser::GetAuthTicketForWebApi("indiecreations")` instead of a bare `steamid`, so only the real account holder can ask.

🧸 Don't Worry, You're Safe! (`/youre-safe`)

A Unity WebGL build in `public/youre-safe/` (served at the clean URL by a rewrite in `next.config.js`, `<base href="/youre-safe/">`). Its page script `public/youre-safe/TemplateData/buddy.js` (`window.BuddyHost`) is the only thing the game talks to, and it uses the same routes as the other browser games:

- Wallet sign-in: `/api/game/signin` and `/api/game/me` (the free-signature `ic_player` cookie).
- Premium items: `/api/game/catalog`, then `/api/game/quote`, then an ERC-20 transfer to the treasury, then `/api/shop/confirm`. Items are the `ys-*` entries in `lib/catalog.js` with art in `public/shop/ys-*.png`. The game's SKU `buddy.<item_id>` maps to `ys-<item-id>` (underscores become hyphens). Sales count toward the revenue share like any other checkout sale. 20% of each sale is burned from the treasury (`burnBps: 2000` in `lib/games.js`, see the revenue share section). Simple weapons, food, toys and starter hazards cost in-game coins and are not on the site.
- Cloud save: `/api/buddy/save`, one row per wallet in `buddy_saves`.
- Inner Voice (a premium service): `/api/buddy/voice` writes the buddy's journal lines with Claude Haiku (`claude-haiku-4-5-20251001`). Only wallets that own `ys-inner-voice` can use it, with `BUDDY_VOICE_PER_DAY` lines per wallet per day (default 40). The game sends counters and item ids, never a prompt.

Setup: run `supabase/buddy.sql`, and set `ANTHROPIC_API_KEY` in the Vercel project's server environment (never as `NEXT_PUBLIC_`). Without the key the rest of the game works and the Inner Voice says it is resting.

Publishing a build: in Unity run **Buddy > Build > WebGL (Release)**. It writes `Builds/WebGL/youre-safe`, a gzip build that decompresses itself, so no special headers are needed. Copy that folder's contents into `public/youre-safe/`. If the data file is over 100 MB, split it into parts listed in `Build/data-parts.json` (the same scheme as My Favorite Sheep); the page loads the parts when that file exists.

💸 Holder revenue share and the economy numbers (`/rewards`)

25% of revenue from every Indie Creations game goes back to $CREATIONS holders, paid from the treasury wallet `0x901fC42f24adc138F73BaC931557Ab17AfCA7093`, fully automatically. Holders never stake, lock or deposit anything. The site also shows, live, total revenue from all games and total $CREATIONS burned (home page and `/rewards`).

How it runs: a Vercel Cron job (`vercel.json`, daily) calls `/api/cron/revshare`, which

1. copies every new $CREATIONS transfer from Robinhood Chain into Supabase (`token_transfers`); burns and balances are read from that copy;
2. once a month has closed, adds up its revenue: paid `/shop` orders (the site's shop and the browser games' wardrobes) plus $CREATIONS sent to each game's own revenue contracts (its `chain` entry in `lib/games.js`);
3. if the revenue since the last payout is under the minimum (`NEXT_PUBLIC_REVSHARE_MIN_USD`, default $100), saves the month as carried: nothing is paid and its revenue rolls into the next month;
4. otherwise takes 25% of it as the pool and splits it by what each wallet held at 4 random moments in the month's last 14 days. The moments come from the hash of the first block mined after the month ends, so nobody, the studio included, can know them in advance, and anyone can recompute them from the payout's `seed`;
5. stores every wallet's claim and publishes the new running totals on the RevenueShare contract from the publisher wallet. The contract pulls the pool from the treasury in the same transaction.

Holders claim on `/rewards` whenever they like; unclaimed payouts add up and never expire. The full list of what each wallet is owed is public at `/api/rewards/tree?month=YYYY-MM`. Each run does at most one month and every step is safe to repeat, so a failed or missed run just catches up the next day (e.g. if the treasury is short, the payout waits and is retried daily).

Not counted as holders: the treasury, the payout contract, burn addresses, `REVSHARE_EXCLUDE`, and every address with contract code (the trading pool, the Hoodlock lockers, the PONS liquidity locker, the launchpad) unless listed in `REVSHARE_INCLUDE`.

Guard rails on the contract, because the publisher key lives on a server: at most one payout every 20 days, never more than the treasury has approved, totals can only go up, no withdraw function, and the treasury can replace the publisher at any time (`transferOwnership` from the treasury wallet).

Deployed (see `contracts/deployments.json`): RevenueShare `0xF1b05A7177F0E466e613AF4A0817D6A0B0F0A003` on Robinhood Chain, owned by the publisher wallet `0x8f323DfFE45Bd36935B9fef599a0d2E80482C50B`, paying out from the treasury `0x901fC42f24adc138F73BaC931557Ab17AfCA7093`. First payout month: October 2026.

One-time setup:

1. Run `supabase/revshare.sql` in the Supabase SQL editor (after `supabase/shop.sql`).
2. Create a fresh wallet to be the publisher. It only needs a little ETH for gas. Keep its private key for step 5.
3. Deploy `contracts/RevenueShare.sol` on Robinhood Chain (Remix works: compile with 0.8.20+, deploy with the $CREATIONS CA, the treasury address and the publisher wallet's address).
4. From the treasury wallet, `approve` the contract on the $CREATIONS token. The allowance is the most the automation can ever pay out, so a few months' worth, topped up now and then, is safer than unlimited.
5. In Vercel, set: `NEXT_PUBLIC_REVSHARE_ADDRESS` (the contract), `REVSHARE_PUBLISHER_KEY` (the publisher's private key; server-only, never `NEXT_PUBLIC_`), `REVSHARE_START_MONTH` (the first month that pays, `YYYY-MM`), `REVSHARE_FROM_BLOCK` (the block $CREATIONS was deployed in), `CRON_SECRET` (a long random string), and optionally `NEXT_PUBLIC_REVSHARE_MIN_USD`. Set `RPC_URL` to a private RPC (the public one rate-limits Vercel's servers; every server-side chain request also waits and retries when told "Too Many Requests"). Transfer log queries use the public RPC unless `LOGS_RPC_URL` says otherwise, because it answers a query over the whole chain at once.
6. The first run copies the whole transfer history, which can take several runs. To speed it up, call the job by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://www.indiecreations.fun/api/cron/revshare` until `caughtUp` is true. Add `?dry=1` to see the next month's split without saving or publishing it.

Burns from checkout sales: a game with `burnBps` in `lib/games.js` (Don't Worry, You're Safe!: 2000, so 20%) owes that share of each month's checkout revenue as a burn. The job records it in `revshare_burns` when the month closes and burns it automatically, sending it to `0x000000000000000000000000000000000000dEaD` before that month's payout is published. Nothing is paid out until the burn is done. If the publisher wallet (`REVSHARE_PUBLISHER_KEY`) is the treasury, it burns with a plain transfer. Otherwise the treasury approves the publisher wallet for $CREATIONS once, and the job burns with `transferFrom`. Keep that allowance to a few months of burns and top it up, because the publisher key is a server secret. A burn the treasury sends by hand also counts. The holder pool is still `REVSHARE_BPS` of the full revenue.

New games join automatically: any sale through the site's checkout counts, whichever game it is for. A game that also sells or burns in its own contracts on mainnet (Agentacus at launch) lists them in its entry in `lib/games.js`: `chain: { revenue: [...], burners: [...] }` (`revenue` for contracts that receive its sales, `burners` for contracts whose burns count as its burns); they count from then on. Burns by anyone else still count in the total, shown as "Other burns".

🙂 Player profiles (`/profile`, `/u/<wallet>`)

Anyone can sign in with their wallet (a free signed message, the same sign-in the browser games use, 30 days) and get a profile: a display name (unique, 3 to 24 characters), a bio (280), a picture (resized in the browser to a 256 px square, stored small), favorite games, and their $CREATIONS balance with holder status. Without a picture, a tile pattern made from the wallet address shows instead. Public profiles at `/u/<wallet>` show the name, picture, bio, favorites, a holder badge and recent comments (the exact balance only shows to its owner).

Every game page has a comments section and a favorite button with its count. Comments are plain text (markup shows as text), at most 1,000 characters, one every 20 seconds and 30 a day per wallet. Authors delete their own; a studio admin signed in on `/admin` gets a delete button on every comment. Tables: `supabase/profiles.sql`.

👥 Players per game

Each browser game page includes `<script src="/presence.js" data-game="<slug>" defer></script>`. Once the game has loaded, it pings `/api/presence` once a minute while its tab is in front and for 5 minutes after the player switches to another tab with an anonymous id kept in the browser (no wallet; the IP is stored only as a salted hash, and at most 3 ids per IP count). The game cards, each game's page and `/admin` show players right now (last 2 minutes), in the last 24 hours and in the last 30 days. Table and counting function: `supabase/presence.sql`.

**When republishing a Unity build, keep that script line in its `index.html`** (it sits just before `</body>`), or put it in the game repo's WebGL template so it is always there. A new browser game only needs the same line with its own slug.

🔑 Studio admin (`/admin`)

A private page for the studio (not linked from the site, and hidden from search engines). Sign in with the treasury wallet, the dev wallet, or any wallet listed in `ADMIN_WALLETS`, by signing a free message; the admin session lasts 2 hours. It shows anything that would stop the next payout, and lets you:

- **Approve payouts:** with the treasury wallet connected, set how much $CREATIONS the payout contract may take from the treasury (or revoke it). Setting it replaces the previous amount.
- **Watch the payouts:** revenue waiting for the next payout, what it would take from the treasury, when the contract allows the next one, what holders have claimed, and every closed month with its transaction and public tree.
- **Run the daily job now,** or preview the next payout without saving anything.
- **Check the payout wallet:** its ETH for gas, and that the key in Vercel belongs to it. With the treasury connected, replace it if its key may have leaked.
- **See recent shop orders and playtest downloads.**

⚔️ Agentacus (`/games/agentacus`, game at `/agentacus`)

Agentacus is a browser game: a Unity WebGL build in `public/agentacus`, open to everyone (no holder gate). It is built in
its own repo (Agentacus) and copied here with `MSYS_NO_PATHCONV=1 node tools/publish_webgl.mjs Builds/WebGL <this repo>/public/agentacus --base /agentacus/`, which
splits the ~115 MB data file into parts under GitHub's 100 MB file limit (`Build/data-parts.json`); the page downloads
the parts in parallel and joins them. Build files are content-hashed and served with a one-year immutable cache
(`next.config.js`).

- Wallet, contracts and chain come from `public/agentacus/config.json` (Robinhood Chain testnet 46630 for now, with a mock
  $CREATIONS). It can be edited without rebuilding the game.
- The game server (fights, agents, wallet sign-in, bets) is a separate ASP.NET service on a DigitalOcean droplet at
  `https://arena-api.indiecreations.fun`; the game calls it directly (`apiBase` in `config.json`). Optionally,
  `ARENA_API_ORIGIN` in Vercel proxies `/v1/*` on this site to a server instead.
- Agentacus sells its cosmetics inside the game, on-chain, so it has no entry in `lib/catalog.js`.

🚀 Vision
Build and ship multiple indie games
Continuously improve systems, design, and feel
Share progress openly
Blend creativity with emerging tech (where it makes sense)

🎮 Past Project (no longer in development)

🟢 My Slime Journey - v0.1

🎮 Overview

My Slime Journey is a third-person action RPG where you play as a slime that grows stronger by defeating enemies, absorbing experience, and unlocking new abilities.

Version 0.1 represents the first fully playable build, featuring a complete combat loop, progression system, and boss encounter.

✨ Features (v0.1)

🧪 Core Gameplay
Third-person movement system
Lock-on targeting system
Basic melee combat
Enemy AI with combat behavior
Boss fight

🧠 Progression
Experience (EXP) system
EXP orbs dropped from enemies
Ability unlock system
Ability toggle menu

⚡ Abilities
Flame Trail (unlockable ability)
Slime Dash (mobility ability with cooldown)

🖥️ UI
Player health bar
Enemy & boss health bars
EXP display
Death screen + restart system
Ability menu + unlock popup

🔁 Gameplay Loop

Fight enemies → Collect EXP orbs → Grow stronger → Unlock abilities → Defeat boss → Repeat

⚠️ Notes (v0.1)
This is an early version focused on core gameplay systems
Visuals and level design are placeholder
Combat feel and camera will be improved in future updates

🚀 Roadmap (v0.2 Preview)
Improved camera + lock-on system
Enhanced combat feel (impact, feedback)
Additional enemy types
Expanded level design
More abilities

🛠️ Built With
Unity
Playmaker (visual scripting)
Emerald AI

💬 Developer Notes

This is the first completed playable version of the game.
The focus was on building a full gameplay loop and proving out the core systems.

Future versions will focus on game feel, level design, and content expansion.

🙌 Thanks for Playing

If you’re trying the game, feedback is appreciated as development continues!
