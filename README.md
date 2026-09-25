
# Indie Creations

🌌 Indie Creations

Indie Creations is a small, independent development initiative focused on building unique, gameplay-first experiences from the ground up. Every project is driven by experimentation, learning, and a commitment to actually finishing and releasing games, no matter the size.

The goal is simple:
Create fun, evolving games while documenting the journey from idea → playable → polished.

🪙 $creations

Indie Creations is a tokenized indie game studio. $creations is a fixed-supply ERC-20 (1,000,000,000 supply) live on Robinhood Chain (chain ID 4663), launched through PONS Launchpad.

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

- `NEXT_PUBLIC_TOKEN_ADDRESS` (optional) — overrides the $creations CA, which is already the default in `lib/config.js`.
- `NEXT_PUBLIC_MIN_TOKENS` — tokens required to unlock playtests (default 5,000,000).
- `SESSION_SECRET` — long random string, required in production.
- `RPC_URL` (optional) — private RPC for balance checks.
- `NEXT_PUBLIC_WC_PROJECT_ID` (optional) — enables WalletConnect for mobile wallets.

- `GAME_TICKET_KEY` - base64 of the RSA private key that signs in-game holder tickets (`/api/game/ticket`). Required in production while a build with the in-game check is live; the matching public key is compiled into the game.

How the gate works: the holder connects a wallet and signs a free message, the server verifies the signature and the on-chain balance, then sets a signed session cookie. `middleware.js` blocks everything under `/game/` without that cookie, so the build cannot be loaded by URL alone. The game also checks for itself: it asks `/api/game/ticket` for a short-lived ticket signed with `GAME_TICKET_KEY` (the balance is re-checked each time) and refuses to run without one, so a copy of the build hosted elsewhere does not work and a wallet that sells below the threshold is out within minutes. Which build is live is set in `lib/build.js`; while it is `null`, holders see a "no build live" message and the game files stay closed.

🛍️ Cosmetics shop (`/shop`)

Every Indie Creations game sells its cosmetics here. Items are priced in USD, paid in $creations, and tied to the buyer's Steam account.

1. The buyer signs in through Steam (Steam's own OpenID login; the site only ever learns the SteamID).
2. At checkout the USD price is converted at the live $creations price (DexScreener and GeckoTerminal must agree within 15%, otherwise checkout pauses) and held for 10 minutes.
3. The buyer sends that exact amount of $creations from their wallet to `SHOP_TREASURY_ADDRESS`.
4. The server finds the transfer on Robinhood Chain and only then records the cosmetic against the SteamID. The payment must come from the quoted wallet, go to the treasury, match the amount to the wei (each order's amount ends in a few random wei), and be newer than the order. One transaction can settle one order, ever.

Payments go to the treasury wallet `0x901fC42f24adc138F73BaC931557Ab17AfCA7093` (the default in `lib/shop.js`; `SHOP_TREASURY_ADDRESS` overrides it). Checkout needs `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` and the tables from `supabase/shop.sql`; without them the shop is browse-only in production. Set `SITE_URL` in production so the Steam sign-in always returns to the real domain.

Adding cosmetics: edit `lib/catalog.js` (the rules are at the top of the file) and put the art in `public/shop/`. Only list cosmetics the game can actually show, because a purchase is a real payment. `SHOP_DEMO=1` shows sample items in local development only.

How a game reads what a player owns:

`GET /api/game/cosmetics?game=<game name>&steamid=<SteamID64>`
returns `{ payload: "c1|<steamid>|<unix expiry>|<game>|<item-id,item-id,...>", sig }`, where `sig` is a base64 RSA-SHA256 signature made with `GAME_TICKET_KEY`, the same key pair as the holder ticket, so the game verifies it with the public key it already ships with. The game must check the signature, that `<steamid>` is the account it is running under (`SteamUser.GetSteamID()`), and that the expiry has not passed, then unlock the listed item ids. Once the game has a Steam app, set `STEAM_APP_ID` + `STEAM_PUBLISHER_KEY`: the endpoint then requires `&ticket=<hex>` from `ISteamUser::GetAuthTicketForWebApi("indiecreations")` instead of a bare `steamid`, so only the real account holder can ask.

⚔️ Agent Arena (`/games/agent-arena`, game at `/arena/index.html`)

Agent Arena is a browser game: a Unity WebGL build in `public/arena`, open to everyone (no holder gate). It is built in
its own repo (Agentacus) and copied here with `node tools/publish_webgl.mjs Builds/WebGL <this repo>/public/arena`, which
splits the ~115 MB data file into parts under GitHub's 100 MB file limit (`Build/data-parts.json`); the page downloads
the parts in parallel and joins them. Build files are content-hashed and served with a one-year immutable cache
(`next.config.js`).

- Wallet, contracts and chain come from `public/arena/config.json` (Robinhood Chain testnet 46630 for now, with a mock
  $CREATIONS). It can be edited without rebuilding the game.
- The game server (fights, agents, wallet sign-in, bets) is a separate ASP.NET service. Set `ARENA_API_ORIGIN` (e.g.
  `https://arena-api.example.com`) in Vercel and `/v1/*` on this site is proxied to it. Without it the arena plays
  offline exhibition bouts.
- Agent Arena sells its cosmetics inside the game, on-chain, so it has no entry in `lib/catalog.js`.

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
