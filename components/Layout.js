import Head from 'next/head';
import Link from 'next/link';
import Logo from './Logo';
import AccountButton from './AccountButton';
import ThemeToggle from './ThemeToggle';
import SocialIcons from './Socials';
import { LINKS, TOKEN_TICKER } from '../lib/config';

const DESCRIPTION =
  'Indie Creations is an indie game store: play web games in your browser and pay with stablecoins. Developers keep 80% of every sale, and $CREATIONS holders and curators share in every sale.';

export default function Layout({ children }) {
  return (
    <>
      <Head>
        <title>Indie Creations</title>
        <meta name="description" content={DESCRIPTION} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content="Indie Creations" key="og:title" />
        <meta property="og:description" content={DESCRIPTION} key="og:description" />
        <meta property="og:image" content="https://www.indiecreations.fun/logo.png" key="og:image" />
        <meta name="twitter:card" content="summary" key="twitter:card" />
        <meta name="twitter:site" content="@IndieCreations_" />
      </Head>

      <header className="site-header">
        <div className="container header-inner">
          <Link href="/" aria-label="Indie Creations home">
            <Logo />
          </Link>

          <nav className="nav">
            <Link href="/games">Store</Link>
            <Link href="/community">Community</Link>
            <Link href="/create">Create</Link>
            <Link href="/developers">Developers</Link>
            <Link href="/rewards">Rewards</Link>
            <Link href="/token">Token</Link>
            <Link href="/shop">Shop</Link>
          </nav>

          <div className="header-actions">
            <SocialIcons />
            <ThemeToggle />
            <AccountButton />
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <div>
            <Logo />
            <p className="muted small footer-note">
              {TOKEN_TICKER} is the coin of the Indie Creations store and its games. Holder and curator rewards
              come from sales: they vary from month to month and can be zero. Crypto assets are risky and can lose
              value. Nothing on this site is financial advice.
            </p>
          </div>
          <div className="footer-links">
            <Link href="/games">Store</Link>
            <Link href="/community">Community games</Link>
            <Link href="/create">Make a game</Link>
            <Link href="/developers">Developers</Link>
            <Link href="/dev/guidelines">Guidelines</Link>
            <Link href="/token">Token</Link>
            <Link href="/playtest">Playtest</Link>
            <Link href="/shop">Shop</Link>
            <Link href="/rewards">Rewards</Link>
            <Link href="/reviews">Reviews</Link>
            <a href={LINKS.x} target="_blank" rel="noreferrer">
              X (Twitter)
            </a>
            <a href={LINKS.twitch} target="_blank" rel="noreferrer">
              Twitch
            </a>
            <a href={LINKS.tiktok} target="_blank" rel="noreferrer">
              TikTok
            </a>
            <a href={LINKS.pons} target="_blank" rel="noreferrer">
              PONS Launchpad
            </a>
            <a href={LINKS.coingecko} target="_blank" rel="noreferrer">
              CoinGecko
            </a>
            <a href={LINKS.tokenExplorer || LINKS.explorer} target="_blank" rel="noreferrer">
              Explorer
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
