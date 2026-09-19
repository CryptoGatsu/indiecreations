import { useCallback, useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import ConnectButton from '../components/ConnectButton';
import { Mark } from '../components/Logo';
import { buildSignInMessage } from '../lib/authMessage';
import { LINKS, TOKEN_ADDRESS, TOKEN_TICKER, MIN_TOKENS, shortAddress } from '../lib/config';

const GAME = 'My Slime Journey';

function Gate({ title, children }) {
  return (
    <div className="gate">
      <Mark size={44} />
      <h1>{title}</h1>
      {children}
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
      body: JSON.stringify({ game: GAME, rating, feedback }),
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

export default function Playtest() {
  const { address, isConnected } = useAccount();
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

  if (!unlocked) {
    return (
      <div className="container page">
        <Gate title="Holders only">
          <p className="muted">
            The playtest area is reserved for wallets holding at least {MIN_TOKENS.toLocaleString()}{' '}
            {TOKEN_TICKER} on Robinhood Chain.
          </p>

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

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Playtest</p>
          <h1>{GAME}</h1>
          <p className="muted">v0.1 · first playable build. Click the game to capture input.</p>
        </div>
        <span className="pill pill-solid">Holder verified</span>
      </div>

      <iframe className="game-frame" src="/game/index.html" title={GAME} allow="fullscreen; gamepad" />

      <ReviewForm />
    </div>
  );
}
