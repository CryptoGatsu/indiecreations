import { useCallback, useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import ConnectButton from '../components/ConnectButton';
import { Mark } from '../components/Logo';
import { buildSignInMessage } from '../lib/authMessage';
import { LINKS, TOKEN_ADDRESS, TOKEN_TICKER, MIN_TOKENS, shortAddress, isAllowlisted } from '../lib/config';
import { ACTIVE_BUILD, DOWNLOAD_BUILD } from '../lib/build';

function Gate({ title, children }) {
  return (
    <div className="gate">
      <Mark size={44} />
      <h1>{title}</h1>
      {children}
    </div>
  );
}

// Wallet in-app browsers (MetaMask and friends) can't rotate to landscape or go full screen. Holders verify there,
// then carry the session to their normal browser with a personal link that works for five minutes.
function PlayElsewhere() {
  const [link, setLink] = useState(null);
  const [note, setNote] = useState(null);

  const make = async () => {
    setNote(null);
    const res = await fetch('/api/auth/handoff', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setNote(data.error || 'Could not make a link.');
    setLink(data.url);
    try {
      if (navigator.share) await navigator.share({ title: 'Indie Creations playtest', url: data.url });
      else {
        await navigator.clipboard.writeText(data.url);
        setNote('Link copied. Paste it into Safari or Chrome.');
      }
    } catch {
      setNote('Copy the link below into Safari or Chrome.');
    }
  };

  return (
    <div className="card">
      <h3>Playing on a phone?</h3>
      <p className="muted small">
        Wallet browsers like MetaMask can't turn sideways or go full screen. Make a personal link and open it in
        Safari or Chrome: it signs that browser in as this wallet and starts the game full screen. The link works
        for 5 minutes, so don't share it.
      </p>
      <div className="actions">
        <a className="btn btn-primary" href="/play">Play full screen</a>
        <button type="button" className="btn btn-ghost" onClick={make}>Play in another browser</button>
      </div>
      {note && <p className="small">{note}</p>}
      {link && (
        <input className="link-box" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Personal play link" />
      )}
    </div>
  );
}

function ReviewForm() {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [status, setStatus] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setStatus({ type: 'pending' });

    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, feedback }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      setFeedback('');
      setRating(0);
      setStatus({ type: 'ok', text: 'Thanks. Your review is in.' });
    } else {
      setStatus({ type: 'error', text: data.error || 'Could not submit review.' });
    }
  };

  return (
    <form className="card review-form" onSubmit={submit}>
      <h3>Leave a review</h3>
      <p className="muted small">What worked, what felt off, what should come next?</p>

      <div className="stars" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} of 5`}
            className={n <= rating ? 'star star-on' : 'star'}
            onClick={() => setRating(n)}
          />
        ))}
      </div>

      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Your thoughts on this build"
        maxLength={2000}
        required
      />

      <div className="actions">
        <button className="btn btn-primary" disabled={!rating || status?.type === 'pending'}>
          Submit review
        </button>
        {status?.text && <span className={status.type === 'error' ? 'error small' : 'small'}>{status.text}</span>}
      </div>
    </form>
  );
}

// The download counter: public totals, or (for the studio's own wallets) the totals plus the recent log.
function useDownloadStats(detail) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    if (!DOWNLOAD_BUILD) return;
    fetch(detail ? '/api/playtest/stats?detail=1' : '/api/playtest/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && !d.unavailable && setStats(d))
      .catch(() => {});
  }, [detail]);
  return stats;
}

const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function DownloadCount({ stats }) {
  if (!stats || !stats.total) return null;
  return (
    <p className="download-stats">
      <strong>{plural(stats.total, 'download', 'downloads')}</strong>
      <span>{plural(stats.holders, 'holder', 'holders')}</span>
      {stats.lastDay > 0 && <span>{stats.lastDay.toLocaleString()} in the last 24 hours</span>}
    </p>
  );
}

function ago(date) {
  const s = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

// Only the studio's allowlisted wallets get this (the API checks too).
function DownloadLog({ stats }) {
  if (!stats || !stats.recent) return null;
  return (
    <div className="card download-log">
      <h3>Download tracker</h3>
      <p className="muted small">Only studio wallets see this. A repeat click within two minutes counts once.</p>
      <div className="download-log-totals">
        <div><strong>{stats.total.toLocaleString()}</strong><span>downloads</span></div>
        <div><strong>{stats.holders.toLocaleString()}</strong><span>holders</span></div>
        <div><strong>{stats.lastDay.toLocaleString()}</strong><span>last 24 hours</span></div>
      </div>
      {stats.recent.length > 0 ? (
        <table className="download-log-table">
          <thead><tr><th>Wallet</th><th>When</th></tr></thead>
          <tbody>
            {stats.recent.map((r, i) => (
              <tr key={i}>
                <td><a href={`${LINKS.explorer}/address/${r.wallet}`} target="_blank" rel="noreferrer">{shortAddress(r.wallet)}</a></td>
                <td title={new Date(r.date).toLocaleString()}>{ago(r.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted small">No downloads yet.</p>
      )}
    </div>
  );
}

// The playtest key art: what the gate is guarding, and a header once you're in.
function PlaytestBanner() {
  return (
    <img
      className="playtest-banner"
      src="/games/my-favorite-sheep/playtest-live.jpg"
      width={1600}
      height={893}
      alt="My Favorite Sheep - private online playtest, exclusive for $creations holders"
    />
  );
}

// A game that doesn't run in the browser: a personal download link, how to get going, and the review form.
function DownloadView({ address, onSignOut }) {
  const b = DOWNLOAD_BUILD;
  const studio = isAllowlisted(address);
  const stats = useDownloadStats(studio);
  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Playtest</p>
          <h1>{b.name}</h1>
          <p className="muted">{b.version} · {b.platform}</p>
        </div>
        <span className="pill pill-solid">Holder verified{address ? ` · ${shortAddress(address)}` : ''}</span>
      </div>

      <PlaytestBanner />

      <div className="card download-card">
        <h3>Download the playtest</h3>
        <p className="muted small">
          A {b.sizeMb} MB zip for {b.platform}. The link is made just for you and stops working after a few
          minutes, so if a download fails, come back here for a fresh one. Please don't share the build.
        </p>
        <div className="actions">
          <a className="btn btn-primary" href="/api/playtest/download">Download for Windows ({b.sizeMb} MB)</a>
          {onSignOut && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign out</button>
          )}
        </div>
        <DownloadCount stats={stats} />
      </div>

      {studio && <DownloadLog stats={stats} />}

      <div className="card howto">
        <h3>How to play</h3>
        <ol>
          <li>Unzip the download anywhere, open the <b>My Favorite Sheep</b> folder and run <b>MyFavoriteSheep.exe</b>.</li>
          <li>
            Windows may show <i>Windows protected your PC</i>, because playtest builds aren't signed yet. Click{' '}
            <b>More info</b>, then <b>Run anyway</b>.
          </li>
          <li>New to the farm? Start with <b>Tutorial</b> on the main menu - it takes about five minutes.</li>
          <li>
            To play together (2-4 players): one person opens <b>Play online</b> and picks <b>Host a game</b>, then
            shares the join code. Everyone else types it under <b>Join with a code</b>. One of you is secretly the wolf.
          </li>
          <li>Found a bug or have thoughts? Leave a review below - every one gets read.</li>
        </ol>
      </div>

      <ReviewForm />
    </div>
  );
}

export default function Playtest() {
  const { address, isConnected } = useAccount();
  const publicStats = useDownloadStats(false);
  const { signMessageAsync } = useSignMessage();

  const [mounted, setMounted] = useState(false);
  const [sessionAddress, setSessionAddress] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null); // { error } | { balance, required }

  useEffect(() => {
    setMounted(true);
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((d) => setSessionAddress(d.address))
      .catch(() => {});
  }, []);

  const signOut = useCallback(() => {
    setSessionAddress(null);
    fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
  }, []);

  // A session only counts for the wallet that is connected right now.
  const unlocked = Boolean(
    mounted && isConnected && sessionAddress && sessionAddress === address?.toLowerCase()
  );

  useEffect(() => {
    setResult(null);
    if (mounted && sessionAddress && address && sessionAddress !== address.toLowerCase()) signOut();
  }, [address, mounted, sessionAddress, signOut]);

  const verify = async () => {
    setVerifying(true);
    setResult(null);
    try {
      const issuedAt = new Date().toISOString();
      const signature = await signMessageAsync({ message: buildSignInMessage(address, issuedAt) });

      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, issuedAt, signature }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) setSessionAddress(data.address.toLowerCase());
      else if (res.status === 403) setResult({ balance: data.balance, required: data.required });
      else setResult({ error: data.error || 'Verification failed.' });
    } catch (err) {
      setResult({ error: err.shortMessage || 'Signature request was cancelled.' });
    } finally {
      setVerifying(false);
    }
  };

  if (!mounted) return <div className="container page" />;

  if (!TOKEN_ADDRESS) {
    return (
      <div className="container page">
        <Gate title="Playtests open at relaunch">
          <p className="muted">
            The playtest area unlocks for {TOKEN_TICKER} holders as soon as the token is live on
            Robinhood Chain. The contract address will be posted on the home page.
          </p>
          <a href={LINKS.pons} target="_blank" rel="noreferrer" className="btn btn-ghost">
            Open PONS Launchpad
          </a>
        </Gate>
      </div>
    );
  }

  // Signed in through a personal link: there is no wallet in this browser, and none is needed to play.
  if (sessionAddress && !isConnected && !ACTIVE_BUILD && DOWNLOAD_BUILD) {
    return <DownloadView address={sessionAddress} onSignOut={signOut} />;
  }
  if (sessionAddress && !isConnected && ACTIVE_BUILD) {
    return (
      <div className="container page">
        <Gate title={ACTIVE_BUILD.name}>
          <span className="pill pill-solid">Holder verified · {shortAddress(sessionAddress)}</span>
          <p className="muted">{ACTIVE_BUILD.version}. Turn your phone sideways for the best view.</p>
          <a className="btn btn-primary" href="/play">Play full screen</a>
          <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
        </Gate>
      </div>
    );
  }

  if (!unlocked) {
    const linkProblem = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('link') : null;
    return (
      <div className="container page">
        {DOWNLOAD_BUILD && <PlaytestBanner />}
        <Gate title="Holders only">
          <p className="muted">
            The playtest area is reserved for wallets holding at least {MIN_TOKENS.toLocaleString()}{' '}
            {TOKEN_TICKER} on Robinhood Chain.
          </p>
          <DownloadCount stats={publicStats} />

          {!isConnected ? (
            <ConnectButton />
          ) : (
            <>
              <button className="btn btn-primary" onClick={verify} disabled={verifying}>
                {verifying ? 'Check your wallet…' : 'Verify holdings'}
              </button>
              <p className="muted small">
                Connected as {shortAddress(address)}. Verifying is a free signature, not a transaction.
              </p>
            </>
          )}

          {linkProblem === 'expired' && <p className="error small">That play link has expired. Make a new one from your wallet's browser.</p>}
          {linkProblem === 'notholder' && <p className="error small">That wallet no longer holds enough {TOKEN_TICKER}.</p>}
          {result?.error && <p className="error small">{result.error}</p>}
          {result?.balance !== undefined && (
            <div className="notice">
              <p>
                This wallet holds {Number(result.balance).toLocaleString()} {TOKEN_TICKER}. You need{' '}
                {Number(result.required).toLocaleString()} to get in.
              </p>
              <a href={LINKS.pons} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                Get {TOKEN_TICKER}
              </a>
            </div>
          )}
        </Gate>
      </div>
    );
  }

  if (!ACTIVE_BUILD && DOWNLOAD_BUILD) return <DownloadView address={address} onSignOut={signOut} />;

  if (!ACTIVE_BUILD) {
    return (
      <div className="container page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Playtest</p>
            <h1>No playtest live right now</h1>
            <p className="muted">When a build goes live, it plays right here.</p>
          </div>
          <span className="pill pill-solid">Holder verified</span>
        </div>

        <div className="game-frame game-frame-empty">
          <Mark size={44} />
          <h3>Check back later</h3>
          <p className="muted">There is no playtest build live at the moment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Playtest</p>
          <h1>{ACTIVE_BUILD.name}</h1>
          <p className="muted">{ACTIVE_BUILD.version} · Click the game to capture input.</p>
        </div>
        <span className="pill pill-solid">Holder verified</span>
      </div>

      <iframe className="game-frame" src="/play" title={ACTIVE_BUILD.name} allow="fullscreen; gamepad" />

      <PlayElsewhere />
      <ReviewForm />
    </div>
  );
}
