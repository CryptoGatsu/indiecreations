# Indie Creations Store — Phase 1 Platform Spec

> Spec for Claude Code. Turns **indiecreations.fun** (repo `CryptoGatsu/indiecreations`) into a crypto-friendly game store where third-party devs publish web games, sell them for stablecoins, and optionally launch a game token.

---

## 0. Instructions for Claude Code

- **Read the repo README first.** It is the source of truth for existing contracts, addresses, and env vars.
- **Do not break existing features.** Keep the holder gate, `/shop`, `/agentacus`, `/admin`, presence.js and the RSA game tickets working throughout.
- **Reuse existing patterns** instead of reinventing them:
  - Wallet signature → server verify → signed session cookie (`middleware.js`)
  - RSA-signed short-lived game tickets (`/api/game/ticket`, `GAME_TICKET_KEY`)
  - USD → token price quotes: DexScreener + GeckoTerminal must agree within 15%, quote held 10 min, random-wei tail, server matches the exact transfer (`lib/shop.js`)
  - Daily Vercel Cron + RevenueShare contract (`/api/cron/revshare`)
  - `/admin` sign-in via `ADMIN_WALLETS`
  - `lib/games.js` `chain: { revenue: [...], burners: [...] }` for revenue/burn tracking
- **Build in milestones (section 21).** Finish, test and commit each one before starting the next.
- **Testnet first.** Deploy every contract to Robinhood Chain testnet (46630) and Solana devnet before mainnet. **Ask before any mainnet deploy.**
- **Never commit secrets.** Keys and API keys go in Vercel env vars only.
- When a value is marked **VERIFY**, check it against official docs before writing code that depends on it.

---

## 1. Scope

**Phase 1 (this spec):** web games (Unity WebGL / HTML5), dev applications and burns, store and library, stablecoin checkout with escrow, holder and curator rewards, optional game tokens, game shops, abandonment, admin.

**Out of scope (phase 2+):** standalone downloads, the desktop launcher (Tauri), achievements, cloud saves, friends and chat, multiplayer services, workshop.

---

## 2. Constants

Put these in `lib/platform/config.ts`. Hardcode the token address and never resolve it by name or symbol.

| Key | Value |
|---|---|
| `CREATIONS_TOKEN` | `0xB9195597f91f179EBB05D3F1765B35C3d8491aCb` (Robinhood Chain 4663). Ignore the old Solana "Indie Creations" coin. |
| `CHAIN_RH` | 4663 (testnet 46630) |
| `STABLE_RH` | USDG on Robinhood Chain |
| `STABLE_SOL` | USDC on Solana |
| `BURN_ADDRESS_EVM` | `0x000000000000000000000000000000000000dEaD` |
| `DEV_APPLY_BURN_USD` | 50 |
| `NEW_GAME_BURN_USD` | 50 |
| `FREE_RESUBMISSIONS` | 1 per burn |
| `SPLIT_DEV` / `SPLIT_HOLDERS` / `SPLIT_CURATORS` / `SPLIT_PLATFORM` | 80% / 2% / 1% / 17% (basis points: 8000 / 200 / 100 / 1700) |
| `ESCROW_HOURS` | 72 |
| `REFUND_WINDOW_HOURS` | 72 |
| `ABANDON_REFUND_HOURS` | 24 |
| `MIN_PAID_PRICE_USD` | 0.99 |
| `SALE_COOLDOWN_DAYS` | 30 |
| `CURATOR_MIN_HOLD_USD` | 25 (7-day average price) |
| `CURATOR_MIN_REVIEWS` | 5 per month, max 2 for free games |
| `CURATOR_REVIEW_MIN_PLAYTIME_MIN` | 30 (15 for free games) |
| `CURATOR_REVIEW_MIN_WORDS` | 150 |
| `CURATOR_REVIEW_MATURITY_DAYS` | 7 |
| `CURATOR_MAX_POOL_SHARE` | 20% |
| `HOLDER_MIN_PAYOUT_USD` | 1 (smaller amounts roll over) |
| `DEV_BUY_CAP_PCT` | 5% of token supply |
| `VEST_CLIFF_DAYS` / `VEST_LINEAR_DAYS` | 30 / 180 |
| `DEXSCREENER_HOLD_PCT` | 10% of dev earnings |
| `DEXSCREENER_TARGET_USD` | 299 (**VERIFY** current price) |
| `SHOP_TWAP_MINUTES` | 30 |
| `SHOP_MIN_LIQUIDITY_USD` | 5000 |
| `TOKEN_CHECK_CACHE_MIN` | 10 |
| `ABANDON_NO_UPDATE_DAYS` | 90 |
| `ABANDON_NO_REPLY_DAYS` | 14 |
| `ABANDON_BROKEN_NO_REPLY_DAYS` | 7 |

---

## 3. Accounts and wallets

- **Auth:** Privy. Users sign up with email, and Privy creates **non-custodial embedded wallets** for both EVM (Robinhood Chain) and Solana. Users can also link MetaMask or Phantom.
- **The platform never holds user keys.** Do not generate or store private keys server-side.
- **Recovery:** via the email login (Privy).
- **Roles** (one account can hold several): `player`, `curator`, `developer`, `admin`. Admin is still gated by `ADMIN_WALLETS`.
- **Merge with the existing holder gate.** The session holds the Privy user plus linked wallets, and the holder balance check uses any linked EVM wallet.
- **Card funding:** use Privy's MoonPay funding flow to buy USDG on Robinhood Chain or USDC on Solana. **VERIFY** MoonPay availability by region; USDG is unavailable in NY and Canada.

---

## 4. Developer onboarding

1. The user opens `/dev/apply` and fills in a profile (studio name, links, contact email, past work).
2. **Burn $50 of $CREATIONS.**
   - **Wallet path:** quote USD → $CREATIONS (existing quote logic), and the user sends the exact amount to `BURN_ADDRESS_EVM`.
   - **Card path:** MoonPay buys USDG → swap USDG → $CREATIONS on the existing Uniswap v4 pool → burn to `BURN_ADDRESS_EVM`. One-click UX, but every step is signed by the user's own wallet.
   - The server verifies the burn transfer (amount, sender, single use) and stores `burn_tx` on the application.
3. The application goes to the admin queue. On approval the user gets the `developer` role. On rejection they get one free resubmission before another burn is required.
4. Add the burn address to `lib/games.js` burners so it rolls into the site's total-burned counter.

---

## 5. Game submission and review

### 5.1 Submission
- A new game requires a $50 $CREATIONS burn (same flow as section 4).
- Upload: a WebGL/HTML5 build zip plus store page assets (title, description, at least 3 screenshots, optional trailer, tags, age rating, adult flag, price, supported browsers).
- **Patches and updates are free** but still go through review. The previous approved build stays live until the patch is approved.

### 5.2 Build states
`draft → submitted → in_review → approved | rejected → (resubmitted → in_review) → live`
`live → abandoned → (reapply with patch) → in_review → live`

### 5.3 Quality bar (rejection codes)
Publish these on a public `/dev/guidelines` page. A rejection is one click with a code and an optional note.

| Code | Rule |
|---|---|
| Q1 | **Runs.** No crash on launch; loads in a reasonable time on a mid-range laptop; works in Chrome and Firefox. |
| Q2 | **Real game.** Paid games have a complete core loop and roughly 15+ minutes of content. Free games can be shorter but must be finished. |
| Q3 | **Honest store page.** Screenshots and trailer show the real game; the description matches. |
| Q4 | **Original.** No unmodified asset flips sold as a full game, no third-party IP; AI-generated art and audio disclosed. |
| Q5 | **Works without the token.** The game never requires buying the game token to play or progress, and any shop item has a stablecoin price. |
| Q6 | **Wallet-safe.** Signatures and payments only through the platform SDK. No raw wallet prompts, no external payment links. |
| Q7 | **Purchases through the SDK.** All in-game purchases use the platform SDK shop. Shop sales carry a 0% platform fee. |
| Q8 | **Content labeled.** Age rating declared; adult content flagged; illegal content rejected. |

### 5.4 Adult lane
- Builds flagged `adult` go to a separate review queue with stricter checks on every build and patch.
- **Hard bans, never approvable:**
  - any sexual content involving minors, or characters who look or read as minors, regardless of claimed age
  - real people and deepfakes
  - non-consensual sexual content
- Devs must declare that all characters are adults, and the reviewer checks how they're actually depicted.
- **Player side:** hidden by default. Visible only after the user opts in through a setting with an 18+ confirmation. Kept out of featured slots, the front page, and search unless opted in.
- **VERIFY before launch:** whether MoonPay, Privy and Vercel terms allow adult content, and whether US state age-verification laws apply. If card checkout isn't allowed for adult games, those games use wallet-only checkout.

### 5.5 Token integration review
Adding a game token to a game (shop payments, token-gated cosmetics) is a **reviewed patch**. It's approved only if purchases, item delivery and burns are tested and working on the live token.

---

## 6. Game hosting

- **Separate domain** for game builds, never indiecreations.fun. **DECIDE** the domain name and buy it.
- Each game is served at `<game-slug>.<play-domain>` so every build is origin-isolated from the main site and from other games.
- **Storage:** object storage plus CDN (Cloudflare R2 recommended; Vercel isn't suited to large build files). Reuse the data-file splitting from `tools/publish_webgl.mjs`.
- **Security:**
  - The store embeds games in a sandboxed iframe (`allow-scripts allow-same-origin` scoped to the game's own subdomain only, no `allow-top-navigation`).
  - Strict CSP on the store origin.
  - The game talks to the store only through `postMessage` via the SDK (section 14).
- Every build includes `/presence.js` with a `data-game` slug for playtime tracking. This is already the convention.

---

## 7. Store and library

- **Pages:** store front, game page, dev page, search and tags, library, Abandoned category, Adult category (opt-in only), dev dashboard, curator dashboard.
- **Pricing rules:**
  - Free, or a paid minimum of $0.99. No pay-what-you-want in v1.
  - Devs can run sales, but at least 30 days must pass between sales.
- **Library:** tied to the account (Privy user), not to a single wallet.
- **Game page shows:**
  - price and reviews
  - curator reviews highlighted
  - an Abandoned banner if applicable
  - the token panel, if the game has a token (section 11)

---

## 8. Payments, escrow and refunds

### 8.1 Checkout
- Robinhood Chain games are priced in USD and paid in **USDG**; Solana checkout in **USDC**. A game can accept both.
- Payment methods: embedded or linked wallet, or **card via MoonPay**, which funds the stablecoin into the buyer's wallet before paying.

### 8.2 Escrow contracts
- **EVM (Solidity), Robinhood Chain:** `GameSaleEscrow`.
  - `purchase(gameId, amount)` pulls USDG into escrow and records buyer, game, amount and timestamp.
  - `release(saleId)` is callable by anyone once `ESCROW_HOURS` have passed. It splits 80% to the dev payout wallet, 2% to `HolderRewards`, 1% to `CuratorRewards`, and 17% to the platform treasury.
  - `refund(saleId, sig)` returns 100% to the buyer before release. It requires a refund authorization signed by the platform server key.
- **Solana (Anchor):** `game_sale_escrow` program with the same logic in USDC. The holder and curator shares go to the platform treasury on Solana, which pays them out in USDG on Robinhood Chain (section 9).
- **Release cron:** an hourly Vercel Cron releases all eligible sales on both chains.

### 8.3 Refunds (final otherwise)
1. **0 hours played**, requested within 72 hours of purchase. **Automatic:** the server confirms zero playtime from ticket and presence logs, then signs the refund.
2. **Dev abandons within 24 hours of the sale.** Bulk refunds triggered from `/admin` when a game is marked abandoned.
- Refunds go to the buyer's wallet in the stablecoin they paid with, not back to a card. State this at checkout.
- Shop purchases (section 12) are final and do not go through escrow.

---

## 9. Holder rewards (2%)

- **Eligibility:** holding $CREATIONS on Robinhood Chain.
- **Weighting:** time-weighted average balance. The daily cron samples balances of all holders, and each holder's monthly share is proportional to their average.
- **Excluded from sampling:** liquidity pools, the treasury, the burn address, escrow and reward contracts, and any other contract in an exclusion list.
- **Payout:** monthly on the 1st, in USDG, through the existing RevenueShare contract (adapt it if needed). Amounts under $1 roll over to the next month.
- **Cross-chain offset:** the holder share from Solana sales is paid from the Robinhood Chain treasury in USDG. Keep the Solana USDC as platform revenue. No bridging.
- **Migration:** end the old 25% studio revshare. It pays out through the end of the current month, and the 2% platform share starts at store launch. Add a public notice on the site.

---

## 10. Curators (1%)

### 10.1 Eligibility (checked at each monthly snapshot)
- Hold at least $25 of $CREATIONS, valued at the 7-day average price, in any linked wallet.
- At least 5 qualifying reviews in the month, with at most 2 of them for free games.

### 10.2 Qualifying review
- Verified playtime: 30 minutes, or 15 for free games, from ticket and presence logs.
- Structured sections: gameplay, performance, bugs found, who it's for, plus a rating.
- At least 150 words and at least one screenshot from the reviewer's own session (upload it; check the image is new to the platform).
- One review per game per account, approved games only.
- Must be at least 7 days old to count, so fakes can be voided first.

### 10.3 Scoring and payout
- `points = (10 + min(helpful_votes, 20)) × grade`, where grade is 0 (rejected), 1 (OK) or 1.5 (excellent), set in `/admin`.
- The monthly curator pool is split by points. No curator gets more than 20% of the pool; the excess is redistributed.
- Paid monthly on the 1st in USDG.
- **Anti-farming:**
  - block reviews from wallets linked to the game's dev or the dev's token-launch buyers
  - flag clusters of glowing reviews
  - run AI-filler detection and spot-check by hand

### 10.4 Curator dashboard
Live qualification status ("$31 held, qualified", "3/5 reviews"), points so far this month, and an estimated payout.

---

## 11. Game tokens (optional)

### 11.1 Rules
- **Optional.** A game never requires a token. A dev can launch one any time after the game is approved.
- **One token per game.** Unique DB constraint `game_id → token`, written once the launch transaction confirms. A retry is allowed only if the launch transaction failed.
- **The dev's own wallet signs the launch and is the creator.** The dev keeps 100% of creator fees. The platform never sets up fee sharing to itself.
- **Dev buy:** capped at 5% of supply. **No bundled multi-wallet buys.**
- **Lock or burn the dev buy:**
  - Lock: 30-day cliff, then linear release over 180 days.
  - Or burn: the dev can burn the locked tokens at any time.
  - The token shows **"unverified"** on the game page until the lock or burn transaction confirms.

### 11.2 PONS (Robinhood Chain)
- The dev's wallet calls the Pons factory **directly**, so the creator is the dev, not a platform router.
- **Second transaction:** deposit the dev buy into the platform vesting contract, or burn it.
- **VERIFY:** the Pons factory ABI and launch parameters (Mobula's integration docs and Pons docs); that the calling wallet is recorded as creator; how creator fees are claimed (paid in USDG).

### 11.3 pump.fun (Solana)
- The backend builds unsigned transactions: create, a single capped dev buy, and a deposit into the vesting program or a burn. The dev signs everything in one prompt (signAllTransactions).
- Use the pump.fun program directly or an open-source SDK. **VERIFY** current program instructions and creator-fee claim instructions.

### 11.4 Vesting contracts
- **EVM:** `GameTokenVesting`, based on OpenZeppelin VestingWallet: cliff plus linear release, a dev `burnLocked()` function, and `pause()`/`unpause()` callable only by the platform admin role while the game is Abandoned.
- **Solana:** an Anchor `game_token_vesting` program with the same features. Use a custom program, because third-party lockers can't pause on abandonment.
- These hold user funds, so they need extra tests and an external review before mainnet.

### 11.5 Dev dashboard: token panel
- Claimable creator fees with a **Claim** button that calls pump.fun's or Pons's own claim from the dev's wallet.
- Vesting status: locked, unlocked and next-unlock amounts.

### 11.6 Game page: token panel
Contract or mint address, chain, lock or burn status, dev wallet holdings, top-holder share, and a public flag on any sells from dev-linked wallets.

### 11.7 On-demand token safety check
- Any user can tap **"Check this token"** on a game page.
- **Robinhood Chain:** RobinScan API. **Solana:** RPC plus indexer data.
- **Report:**
  - launched through the platform flow (yes/no)
  - lock or burn status
  - top-holder concentration
  - bundle and sniper activity at launch
  - dev-linked sells
  - liquidity and graduation state
- Cache each result for 10 minutes and rate-limit per user. Label it "data, not advice." Show no "SAFE" badge.

### 11.8 DexScreener listing (optional, dev-funded)
- The dev opts in, and 10% of their game-sale earnings are held per release until $299 accrues.
- `/admin` flags the token as ready, the admin places the Enhanced Token Info order by hand, and the hold stops.
- One paid listing per token. Use the wording "funded by the dev's game sales."

---

## 12. Game shops (DLC and items)

- **0% platform fee.** Shop revenue never goes through escrow and isn't shared with holders or curators. Free-to-play games with shops are allowed.
- **Must use the platform SDK** (Q6/Q7) for wallet safety.
- Items are priced in USD, and the buyer picks how to pay:
  - **Stablecoin** (USDG or USDC): 100% goes directly to the dev's payout wallet.
  - **Game token:** a USD amount of the game's token is **burned** and the buyer receives the item.
- **Token pricing:**
  - Quote from a **30-minute TWAP** of the token's pool, held for 10 minutes, with exact-amount matching.
  - The token path is available only when pool liquidity is at least $5,000.
- **Card path for token payments:** MoonPay → stablecoin → swap → burn, the same pattern as section 4.
- **Item delivery:** after the payment or burn is verified, the server issues an RSA-signed ownership payload the game reads (same pattern as `/api/game/cosmetics`).
- Shop purchases are final.

---

## 13. Abandonment

- **Triggers** (any one):
  - no update for 90 days, and no reply to the platform check-in within 14 days
  - the game is broken, and the dev hasn't replied for 7 days
  - the dev declares it abandoned
- **Effects:**
  - The game moves to the Abandoned category with a banner.
  - New sales pause and the shop is disabled.
  - Vesting unlocks pause.
  - Sales from the last 24 hours become eligible for bulk refunds.
- **Reinstatement:** the dev submits a patch (free review), and on approval the game goes back to `live`, sales resume and vesting unpauses.

---

## 14. Platform SDK

A JS SDK for web games, with a Unity WebGL `.jslib` bridge. It communicates with the store frame via `postMessage`.

- `IC.init({ gameSlug })` gets an RSA-signed session ticket (extend `/api/game/ticket`).
- `IC.owns()`: does this user own the game.
- `IC.shop.list()`, `IC.shop.buy(itemId, { payWith: 'stable' | 'token' })`, `IC.shop.inventory()`.
- `IC.presence`: playtime heartbeat, wrapping presence.js.
- No direct wallet access from game code. All signing happens in the store frame with a clear confirmation UI.

---

## 15. Admin (`/admin`)

- **Queues:** dev applications, game builds, the adult lane, patches, token integrations, curator review grading.
- One-click approve, or reject with Q-codes and a note.
- **Abandonment:** flagged games, check-in status, mark abandoned or reinstated, bulk refunds.
- **Refunds:** an automatic-refund log and manual overrides.
- **Payouts:** monthly holder and curator snapshot previews and approval (keep the existing payout-approval flow).
- **DexScreener:** orders ready to place, and marking them placed.
- **Burns:** a log of every burn transaction.

---

## 16. Data model (Supabase)

Plan for row-level security on every table.

- `users` (privy_id, email, roles, adult_opt_in, created_at)
- `wallets` (user_id, chain, address, type: embedded/linked)
- `dev_profiles` (user_id, studio_name, links, payout_wallet_evm, payout_wallet_sol, status)
- `dev_applications` (user_id, profile_snapshot, burn_tx, status, rejection_codes, resubmissions_used)
- `games` (id, slug, dev_id, title, price_usd, accepted_chains, is_free, adult, age_rating, status, last_update_at, abandoned_at)
- `builds` (game_id, version, storage_path, burn_tx, status, rejection_codes, reviewer_notes, submitted_at, approved_at)
- `game_sales_windows` (game_id, starts_at, ends_at, discount_pct)
- `purchases` (id, user_id, game_id, chain, stable, amount, tx, escrow_sale_id, status: escrowed/released/refunded, created_at)
- `refunds` (purchase_id, reason: zero_play/abandoned, sig, tx, created_at)
- `playtime` (user_id, game_id, seconds, last_seen_at)
- `tokens` (game_id UNIQUE, chain, address_or_mint, launchpad, dev_buy_amount, lock_type: vest/burn, lock_tx, verified, launched_at)
- `vesting` (token_id, contract, cliff_at, end_at, paused)
- `token_checks` (token_id, report_json, created_at)
- `dexscreener_holds` (token_id, accrued_usd, status, order_placed_at)
- `shop_items` (game_id, item_key, name, price_usd, accepts_token, active)
- `shop_orders` (user_id, item_id, pay_with, amount, tx, status)
- `reviews` (user_id, game_id, sections_json, word_count, screenshot_path, playtime_seconds, grade, helpful_votes, status, created_at)
- `holder_samples` (date, address, balance)
- `payout_cycles` (month, type: holder/curator, pool_usd, status, tx)
- `payout_lines` (cycle_id, address, amount_usd, rolled_over)
- `burns` (purpose, user_id, amount, tx, created_at)
- `exclusions` (address, reason) for holder sampling

---

## 17. Contracts and programs

| Name | Chain | Purpose |
|---|---|---|
| `GameSaleEscrow` | Robinhood Chain | 72h escrow, split, signed refunds |
| `game_sale_escrow` | Solana (Anchor) | Same, in USDC |
| `GameTokenVesting` | Robinhood Chain | Dev-buy vesting, burn, admin pause |
| `game_token_vesting` | Solana (Anchor) | Same |
| `HolderRewards` / `CuratorRewards` | Robinhood Chain | Receive shares; monthly distribution (adapt the existing RevenueShare contract) |

Every contract needs unit tests, a testnet deploy, and an external review before mainnet.

---

## 18. API routes (Next.js)

- **Auth:** `/api/auth/*` (Privy session, existing holder gate)
- **Dev:** `/api/dev/apply`, `/api/dev/burn/quote`, `/api/dev/burn/verify`
- **Games:** `/api/games`, `/api/games/[slug]`, `/api/games/[slug]/builds` (upload URL plus submit)
- **Checkout:** `/api/checkout/quote`, `/api/checkout/confirm`
- **Refunds:** `/api/refunds/request` (automatic zero-play)
- **Tokens:** `/api/tokens/launch/prepare` (unsigned txs), `/api/tokens/launch/confirm`, `/api/tokens/[id]/check`
- **Shop:** `/api/shop/[game]/items`, `/api/shop/[game]/quote`, `/api/shop/[game]/confirm`, `/api/shop/[game]/inventory` (signed)
- **Reviews:** `/api/reviews` (create), `/api/reviews/[id]/helpful`
- **Game:** `/api/game/ticket` (extended), `/api/game/presence`
- **Admin:** `/api/admin/*` (queues, grading, abandonment, payouts)

---

## 19. Crons (Vercel)

| Schedule | Job |
|---|---|
| Hourly | Release eligible escrow sales (both chains) |
| Daily | Sample holder balances; update the 7-day $CREATIONS average; abandonment checks and check-in emails; DexScreener hold accrual |
| Monthly (1st) | Holder and curator snapshots → admin approval → payout |
| Every 5 min | Watch token launches for confirmation and lock transactions; flag dev-linked sells |

---

## 20. Security requirements

- Game builds only on the separate play domain, in sandboxed iframes, with no access to store cookies.
- All wallet actions happen in the store frame with explicit confirmation. Games never get signing access.
- Refund authorizations come from a dedicated server key, rotated, stored only in env vars.
- Price quotes resist manipulation: dual-source agreement for $CREATIONS, TWAP for game tokens, and short quote lifetimes.
- Rate-limit burns, checkout quotes, token checks and review submissions.
- Scan uploaded builds: file-type allowlist, size limit, and no executables in WebGL bundles.
- Log every burn, payout, refund and admin action.

---

## 21. Milestones

1. **Accounts:** Privy integration, wallets, roles, and merging the existing holder gate.
2. **Dev onboarding:** apply flow, $50 burn (wallet and card), admin queue.
3. **Submissions and hosting:** build upload, play domain, sandboxed player, Q1–Q8 review, adult lane, `/dev/guidelines` page.
4. **Store and library:** game pages, search, pricing rules, adult opt-in.
5. **Checkout and escrow:** contracts (EVM, then Solana), checkout, release cron, automatic refunds.
6. **SDK:** tickets, ownership, presence, shop calls; Unity bridge.
7. **Holder and curator rewards:** sampling, reviews, scoring, payouts; end the old revshare.
8. **Game tokens:** PONS and pump.fun launch flows, vesting contracts, token panels, safety check, DexScreener hold.
9. **Game shops:** stablecoin and token-burn purchases, TWAP pricing, signed inventory.
10. **Abandonment:** triggers, pauses, reinstatement.
11. **Hardening:** contract reviews, rate limits, logging, mainnet deploy (with approval).

---

## 22. Verify before building the affected milestone

- [ ] Pons factory ABI, launch parameters, creator recording and fee claim (M8)
- [ ] pump.fun create, dev buy and creator-fee claim instructions (M8)
- [ ] Privy support for Robinhood Chain (custom EVM chain) and Solana embedded wallets (M1)
- [ ] MoonPay USDG on Robinhood Chain and USDC on Solana through Privy funding (M2, M5)
- [ ] MoonPay, Privy and Vercel terms on adult content; US age-verification laws (M3)
- [ ] RobinScan API endpoints for the token check (M8)
- [ ] Current DexScreener Enhanced Token Info price (M8)
- [ ] Legal review of the 2% holder and 1% curator payouts (before M7 goes live)
