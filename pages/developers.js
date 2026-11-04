import Head from 'next/head';
import Link from 'next/link';
import StoreSplit from '../components/StoreSplit';
import { TOKEN_TICKER } from '../lib/config';
import {
  ABANDON_BROKEN_NO_REPLY_DAYS,
  ABANDON_NO_REPLY_DAYS,
  ABANDON_NO_UPDATE_DAYS,
  ABANDON_REFUND_HOURS,
  DEV_APPLY_BURN_USD,
  DEV_BUY_CAP_BPS,
  ESCROW_HOURS,
  MIN_PAID_PRICE_USD,
  NEW_GAME_BURN_USD,
  REFUND_WINDOW_HOURS,
  SALE_COOLDOWN_DAYS,
  VEST_CLIFF_DAYS,
  VEST_LINEAR_DAYS,
} from '../lib/platform/config';

// The store for developers (PLATFORM_SPEC sections 4 to 13), written from the platform constants. Applications are
// not open yet (milestone 2); this page says how it will work.

const STEPS = [
  {
    title: 'Apply',
    body: `Tell us about you and your studio and burn $${DEV_APPLY_BURN_USD} of ${TOKEN_TICKER}, from your wallet or by card. Approval makes your account a developer account. If you're turned down, you get one free resubmission.`,
  },
  {
    title: 'Submit a game',
    body: `Each new game takes another $${NEW_GAME_BURN_USD} burn. Upload your Unity WebGL or HTML5 build with its store page: description, at least three screenshots, tags, age rating and price.`,
  },
  {
    title: 'Pass review',
    body: 'Every build is checked against the publishing guidelines. A rejection always comes with the rule it broke. Patches and updates are free and reviewed too, and your last approved build stays live until the patch passes.',
  },
  {
    title: 'Go live',
    body: 'Your game plays right in the browser, on its own domain, in a sandboxed frame, so it never touches the store or other games.',
  },
];

const TOPICS = [
  {
    title: 'Getting paid',
    body: [
      `Price your game in dollars: free, or at least $${MIN_PAID_PRICE_USD}. Players pay in USDG on Robinhood Chain or USDC on Solana, from their own wallet or by card.`,
      `Each sale waits ${ESCROW_HOURS} hours in escrow, then 80% goes to your payout wallet automatically. You can run sales, with at least ${SALE_COOLDOWN_DAYS} days between them.`,
    ],
  },
  {
    title: 'Refunds',
    body: [
      `Sales are final with two exceptions: a player who hasn't played at all can get a refund within ${REFUND_WINDOW_HOURS} hours, checked automatically from playtime, and sales from the last ${ABANDON_REFUND_HOURS} hours are refunded if a game is abandoned.`,
      'Refunds come out of escrow, before anything is paid out.',
    ],
  },
  {
    title: 'In-game shops',
    body: [
      'Sell items and DLC through the store SDK with no store fee: 100% of stablecoin payments goes to your payout wallet, straight away.',
      'If your game has its own token, players can also pay with it: the dollar price is burned in your token and the item is delivered.',
    ],
  },
  {
    title: 'Your own token (optional)',
    body: [
      `Launch a token for your game on PONS (Robinhood Chain) or pump.fun (Solana), signed by your own wallet: you are the creator and keep all creator fees. No game ever needs its token to play.`,
      `Your own buy is capped at ${DEV_BUY_CAP_BPS / 100}% of supply and is locked (a ${VEST_CLIFF_DAYS}-day cliff, then released over ${VEST_LINEAR_DAYS} days) or burned. Until then the token shows as unverified.`,
    ],
  },
  {
    title: 'Keeping a game alive',
    body: [
      `A game with no update for ${ABANDON_NO_UPDATE_DAYS} days gets a check-in. No reply in ${ABANDON_NO_REPLY_DAYS} days, or a broken game with no reply in ${ABANDON_BROKEN_NO_REPLY_DAYS}, moves it to the Abandoned shelf: sales and its shop pause, and so do token unlocks.`,
      'Ship a patch and, once it passes review, everything picks up again.',
    ],
  },
];

export default function Developers() {
  return (
    <>
      <Head>
        <title>Developers - Indie Creations</title>
        <meta name="description" content="Publish your web game on Indie Creations and keep 80% of every sale." />
      </Head>
      <div className="container page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Developers</p>
            <h1>Publish your game on Indie Creations.</h1>
            <p className="muted">
              A store for indie web games with crypto payments built in. You keep 80% of every sale, players pay in
              stablecoins, and your game runs right in the browser.
            </p>
          </div>
          <div className="actions">
            <Link href="/dev/apply" className="btn btn-primary">
              Apply
            </Link>
            <Link href="/dev/guidelines" className="btn btn-ghost">
              Read the guidelines
            </Link>
          </div>
        </div>

        <ol className="steps dev-steps">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <span className="step-num">{i + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p className="muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <h2 className="dev-head">Where each sale goes</h2>
        <StoreSplit />

        <div className="grid-2 dev-topics">
          {TOPICS.map((t) => (
            <div className="card" key={t.title}>
              <h3>{t.title}</h3>
              {t.body.map((p) => (
                <p className="muted" key={p}>
                  {p}
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
