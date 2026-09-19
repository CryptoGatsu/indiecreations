import { useState } from 'react';
import { LINKS, TOKEN_ADDRESS, TOKEN_TICKER, MIN_TOKENS, robinhoodChain } from '../lib/config';

const STEPS = [
  { title: 'Get a wallet', body: 'Any EVM wallet works. Add Robinhood Chain and bridge a little ETH for gas.' },
  { title: `Pick up ${TOKEN_TICKER}`, body: 'Buy on PONS Launchpad using the contract address on this page.' },
  { title: 'Connect and verify', body: 'Sign a free message on the playtest page. No transaction, no approvals.' },
];

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

export default function TokenSection() {
  return (
    <section className="section">
      <div className="container token">
        <div>
          <p className="eyebrow">The token</p>
          <h2>{TOKEN_TICKER}</h2>
          <p className="muted">
            {TOKEN_TICKER} is the access pass to everything Indie Creations makes. It is a
            fixed-supply token live on Robinhood Chain, launched through PONS Launchpad.
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
  );
}
