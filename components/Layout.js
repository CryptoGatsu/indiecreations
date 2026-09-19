import Head from 'next/head';
import Link from 'next/link';
import Logo from './Logo';
import ConnectButton from './ConnectButton';
import { LINKS, TOKEN_TICKER } from '../lib/config';

const DESCRIPTION =
  'Indie Creations is a tokenized indie game studio. Hold $creations on Robinhood Chain to playtest, review, and play every release.';

export default function Layout({ children }) {
  return (
    <>
      <Head>
        <title>Indie Creations</title>
        <meta name="description" content={DESCRIPTION} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content="Indie Creations" />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:image" content="https://www.indiecreations.fun/logo.png" />
      </Head>

      <header className="site-header">
        <div className="container header-inner">
          <Link href="/" aria-label="Indie Creations home">
            <Logo />
          </Link>

          <nav className="nav">
            <Link href="/#games">Games</Link>
            <Link href="/#token">Token</Link>
            <Link href="/playtest">Playtest</Link>
            <Link href="/reviews">Reviews</Link>
          </nav>

          <ConnectButton className="btn btn-primary btn-sm" label="Connect" />
        </div>
      </header>

      <main>{children}</main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <div>
            <Logo />
            <p className="muted small footer-note">
              {TOKEN_TICKER} is a community access token for Indie Creations games. It is not an
              investment product and nothing on this site is financial advice.
            </p>
          </div>
          <div className="footer-links">
            <Link href="/playtest">Playtest</Link>
            <Link href="/reviews">Reviews</Link>
            <a href={LINKS.pons} target="_blank" rel="noreferrer">
              PONS Launchpad
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
