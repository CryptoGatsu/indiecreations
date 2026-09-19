
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

- `GAME_TICKET_KEY` - base64 of the RSA private key that signs in-game holder tickets (`/api/game/ticket`). Required in production while a build with the in-game check (Project TJR) is live; the matching public key is compiled into the game.

How the gate works: the holder connects a wallet and signs a free message, the server verifies the signature and the on-chain balance, then sets a signed session cookie. `middleware.js` blocks everything under `/game/` without that cookie, so the build cannot be loaded by URL alone. The game also checks for itself: it asks `/api/game/ticket` for a short-lived ticket signed with `GAME_TICKET_KEY` (the balance is re-checked each time) and refuses to run without one, so a copy of the build hosted elsewhere does not work and a wallet that sells below the threshold is out within minutes. Which build is live is set in `lib/build.js`; while it is `null`, holders see a "no build live" message and the game files stay closed.

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
