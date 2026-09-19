import Link from 'next/link';
import { useState } from 'react';
import { LINKS, TOKEN_ADDRESS, TOKEN_TICKER, MIN_TOKENS, robinhoodChain } from '../lib/config';

const PERKS = [
  {
    title: 'Playtest access',
    body: 'Holders get into the playtest area and play builds while they are still being made.',
  },
  {
    title: 'Reviews that matter',
    body: 'Rate each build and leave feedback. Holder reviews decide what gets fixed and built next.',
  },
  {
    title: 'Every game, free',
    body: 'When a game ships, holders play it free. One bag, the whole catalogue.',
  },
];

const FEATURES = [
  'Third-person movement and lock-on combat',
  'Enemy AI and a full boss encounter',
  'EXP orbs, progression and ability unlocks',
  'Flame Trail and Slime Dash abilities',
];

const STEPS = [
  { title: 'Get a wallet', body: 'Any EVM wallet works. Add Robinhood Chain and bridge a little ETH for gas.' },
  { title: `Pick up ${TOKEN_TICKER}`, body: 'Buy on PONS Launchpad using the contract address on this page.' },
  { title: 'Connect and verify', body: 'Sign a free message on the playtest page. No transaction, no approvals.' },
];

// Decorative 5x5 board echoing the logo mark. 1 = ink tile.
const BOARD = [0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0];

function ContractAddress() {
  const [copied, setCopied] = useState(false);

  if (!TOKEN_ADDRESS) {
    return (
      <div className="ca">
        <span className="ca-value muted">Announced at launch</span>
        <span className="pill">Soon</span>
      </div>
    );
  }

  const copy = async () => {
    await navigator.clipboard.writeText(TOKEN_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="ca">
      <span className="ca-value">{TOKEN_ADDRESS}</span>
      <button className="btn btn-primary btn-sm" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export default function Home() {
  return (
    <>
      {/* HERO */}
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy">
            <span className="pill">
              <span className="dot" />
              Relaunching on Robinhood Chain
            </span>
            <h1>Indie games, shaped by the people who hold them.</h1>
            <p className="lead">
              Indie Creations is a tokenized indie game studio. Hold {TOKEN_TICKER} to get into
              playtests, review every build, and play each release free.
            </p>
            <div className="actions">
              <Link href="/playtest" className="btn btn-primary">
                Enter playtest
              </Link>
              <a href="#token" className="btn btn-ghost">
                Get {TOKEN_TICKER}
              </a>
            </div>
          </div>

          <div className="board" aria-hidden="true">
            {BOARD.map((on, i) => (
              <span key={i} className={on ? 'tile tile-on' : 'tile'} />
            ))}
          </div>
        </div>
      </section>

      {/* HOLDER PERKS */}
      <section className="section">
        <div className="container">
          <p className="eyebrow">What holders get</p>
          <h2>Hold {TOKEN_TICKER}. Get a seat in the studio.</h2>
          <div className="grid-3">
            {PERKS.map((perk, i) => (
              <div className="card" key={perk.title}>
                <span className="card-index">0{i + 1}</span>
                <h3>{perk.title}</h3>
                <p className="muted">{perk.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GAMES */}
      <section className="section section-soft" id="games">
        <div className="container">
          <p className="eyebrow">Games</p>
          <h2>In development</h2>

          <div className="game">
            <div className="game-art" aria-hidden="true">
              <span className="game-art-label">v0.1</span>
            </div>
            <div className="game-body">
              <div className="game-meta">
                <span className="pill pill-solid">Playable now</span>
                <span className="muted small">Action RPG · Unity</span>
              </div>
              <h3>My Slime Journey</h3>
              <p className="muted">
                A third-person action RPG where you play a slime that grows stronger by defeating
                enemies, absorbing experience and unlocking new abilities. v0.1 is the first fully
                playable build: a complete combat loop, progression and a boss.
              </p>
              <ul className="checklist">
                {FEATURES.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <Link href="/playtest" className="btn btn-primary">
                Play the build
              </Link>
            </div>
          </div>

          <div className="process">
            <div>
              <span className="card-index">Idea</span>
              <p className="muted small">Small, gameplay-first concepts.</p>
            </div>
            <div>
              <span className="card-index">Playable</span>
              <p className="muted small">Holders playtest early and review.</p>
            </div>
            <div>
              <span className="card-index">Polished</span>
              <p className="muted small">Shipped, and free for holders.</p>
            </div>
          </div>
        </div>
      </section>

      {/* TOKEN */}
      <section className="section" id="token">
        <div className="container token">
          <div>
            <p className="eyebrow">The token</p>
            <h2>{TOKEN_TICKER}</h2>
            <p className="muted">
              {TOKEN_TICKER} is the access pass to everything Indie Creations makes. It is
              relaunching as a fixed-supply token on Robinhood Chain through PONS Launchpad.
              Hold at least {MIN_TOKENS.toLocaleString()} to unlock the playtest area.
            </p>

            <p className="label">Contract address</p>
            <ContractAddress />

            <div className="actions">
              <a href={LINKS.pons} target="_blank" rel="noreferrer" className="btn btn-primary">
                Open PONS Launchpad
              </a>
              {LINKS.tokenExplorer && (
                <a href={LINKS.tokenExplorer} target="_blank" rel="noreferrer" className="btn btn-ghost">
                  View on explorer
                </a>
              )}
            </div>

            <dl className="facts">
              <div>
                <dt>Network</dt>
                <dd>{robinhoodChain.name}</dd>
              </div>
              <div>
                <dt>Chain ID</dt>
                <dd>{robinhoodChain.id}</dd>
              </div>
              <div>
                <dt>Launchpad</dt>
                <dd>PONS</dd>
              </div>
              <div>
                <dt>Gas</dt>
                <dd>ETH</dd>
              </div>
            </dl>
          </div>

          <ol className="steps">
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
        </div>
      </section>
    </>
  );
}
