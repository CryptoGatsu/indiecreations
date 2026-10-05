import { useCallback, useEffect, useRef, useState } from 'react';
import { erc20Abi } from 'viem';
import { useAccount, useReadContract, useSwitchChain, useWriteContract } from 'wagmi';
import ConnectButton from './ConnectButton';
import useProfile from './useProfile';
import { LINKS, TOKEN_ADDRESS, TOKEN_TICKER, robinhoodChain, shortAddress } from '../lib/config';
import { CREATOR_PERCENT, tileColors } from '../lib/creations';

// A community game's store: the items its creator sells, bought with $CREATIONS through the site's checkout (a quote,
// one transfer to the treasury, then /api/shop/confirm). What the player owns is handed to the game (window.IC), so a
// purchase unlocks in the game straight away. The creator's cut is paid to them with the monthly payout.
const POLL_MS = 3000;
const usd = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const whole = (n) => Math.ceil(Number(n)).toLocaleString('en-US');

// A payment that was sent but not confirmed yet survives a reload through this key (one per game).
const pendingKey = (gameId) => `ic_creation_pending_${gameId}`;
function readPending(gameId) {
  try {
    return JSON.parse(localStorage.getItem(pendingKey(gameId))) || null;
  } catch {
    return null;
  }
}
function writePending(gameId, value) {
  try {
    if (value) localStorage.setItem(pendingKey(gameId), JSON.stringify(value));
    else localStorage.removeItem(pendingKey(gameId));
  } catch {}
}

// The store's items and what this player owns, refreshed after a purchase or sign-in.
export function useCreatorStore(gameId) {
  const [data, setData] = useState(null); // { open, items, owned, player }
  const load = useCallback(async () => {
    if (!gameId) return;
    const res = await fetch(`/api/creations/${gameId}/items`, { cache: 'no-store' });
    if (res.ok) setData(await res.json());
  }, [gameId]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, reload: load };
}

function Checkout({ gameId, item, onClose, onPaid }) {
  const { address, isConnected, chainId } = useAccount();
  const profile = useProfile();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now());

  // the quote is for the signed-in wallet, so the connected wallet has to be the same one
  const signedIn = Boolean(profile.address && address && profile.address === address.toLowerCase());

  const { data: balance } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(address) },
  });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const getQuote = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/creations/${gameId}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not get a price.');
      setQuote(data);
    } catch (err) {
      setQuote(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [gameId, item.id]);

  useEffect(() => {
    setQuote(null);
    if (signedIn) getQuote();
  }, [signedIn, getQuote]);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await profile.signIn();
    } catch (err) {
      setError(err.shortMessage || err.message || 'Sign-in was cancelled.');
    } finally {
      setBusy(false);
    }
  };

  const secondsLeft = quote ? Math.max(0, Math.floor((Date.parse(quote.expiresAt) - now) / 1000)) : 0;
  const expired = quote && secondsLeft === 0;
  const short = quote && balance !== undefined && balance < BigInt(quote.amountRaw);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      if (chainId !== robinhoodChain.id) await switchChainAsync({ chainId: robinhoodChain.id });
      const txHash = await writeContractAsync({
        address: quote.token,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [quote.treasury, BigInt(quote.amountRaw)],
        chainId: robinhoodChain.id,
      });
      onPaid({ orderId: quote.orderId, txHash, itemName: item.name });
    } catch (err) {
      setError(err.shortMessage || 'The payment was cancelled.');
      setBusy(false);
    }
  };

  let action;
  if (!isConnected) action = <ConnectButton />;
  else if (!signedIn) {
    action = (
      <button className="btn btn-primary" onClick={signIn} disabled={busy}>
        {busy ? 'Check your wallet…' : 'Sign in to buy'}
      </button>
    );
  } else if (expired) {
    action = <button className="btn btn-primary" onClick={getQuote} disabled={busy}>Price expired. Refresh</button>;
  } else if (short) {
    action = <a className="btn btn-ghost" href={LINKS.pons} target="_blank" rel="noreferrer">Not enough {TOKEN_TICKER}. Get more</a>;
  } else {
    action = (
      <button className="btn btn-primary" onClick={pay} disabled={!quote || busy}>
        {busy && quote ? 'Check your wallet…' : quote ? `Pay ${whole(quote.amount)} ${TOKEN_TICKER}` : 'Pricing…'}
      </button>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{item.name}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        {item.description && <p className="muted small">{item.description}</p>}
        <dl className="receipt">
          <div><dt>Goes to</dt><dd>{signedIn ? shortAddress(address) : 'Your wallet, once signed in'}</dd></div>
          <div><dt>Price</dt><dd>{usd(item.usd)}{quote ? ` · ${whole(quote.amount)} ${TOKEN_TICKER}` : ''}</dd></div>
        </dl>
        {action}
        {quote && !expired && (
          <p className="muted small modal-error">
            Price held for {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}. You also pay a small
            network fee in ETH. {CREATOR_PERCENT}% of the price goes to the game&apos;s creator; the rest to Indie Creations,
            which shares its revenue with {TOKEN_TICKER} holders.
          </p>
        )}
        {error && <p className="error small modal-error">{error}</p>}
      </div>
    </div>
  );
}

// Asks the server about a sent payment until it is delivered or refused (the same flow as /shop).
function useConfirmation(gameId, onDelivered) {
  const [state, setState] = useState(null); // null | { phase: 'confirming' | 'delivered' | 'error', itemName, error }
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const watch = useCallback(
    (pending) => {
      clearTimeout(timer.current);
      writePending(gameId, pending);
      setState({ phase: 'confirming', itemName: pending.itemName });
      const ask = async () => {
        try {
          const res = await fetch('/api/shop/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: pending.orderId, txHash: pending.txHash }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.status === 200) {
            writePending(gameId, null);
            setState({ phase: 'delivered', itemName: pending.itemName });
            onDelivered();
            return;
          }
          if (res.status >= 400 && res.status < 500) {
            writePending(gameId, null);
            setState({ phase: 'error', itemName: pending.itemName, error: data.error });
            return;
          }
        } catch {}
        timer.current = setTimeout(ask, POLL_MS); // not mined yet, or a hiccup: the payment is safe, keep asking
      };
      ask();
    },
    [gameId, onDelivered]
  );

  useEffect(() => {
    const pending = readPending(gameId);
    if (pending?.orderId && pending?.txHash) watch(pending);
  }, [gameId, watch]);

  return { state, clear: () => setState(null), watch };
}

// focus: an item id the game asked to show (IC.openStore); onFocusDone clears it.
export default function CreatorStore({ gameId, store, reload, focus, onFocusDone }) {
  const [buying, setBuying] = useState(null);
  const section = useRef(null);
  const confirmation = useConfirmation(gameId, reload);
  const profile = useProfile();

  // signing in or out changes what this browser owns
  useEffect(() => {
    reload();
  }, [profile.address, reload]);

  useEffect(() => {
    if (focus === undefined || !store) return;
    section.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const item = focus && store.items.find((i) => i.id === focus);
    if (item && store.open && !store.owned.includes(item.id)) setBuying(item);
    onFocusDone();
  }, [focus, store, onFocusDone]);

  if (!store || !store.items.length) return null;
  const c = tileColors(gameId);

  return (
    <section className="card creations-store" ref={section} id="store">
      <div className="creations-store-head">
        <h2>Store</h2>
        <p className="muted small">
          Items made by this game&apos;s creator, paid in {TOKEN_TICKER}. They belong to your wallet and unlock in the game
          right away. {CREATOR_PERCENT}% of every sale goes to the creator.
        </p>
      </div>
      {confirmation.state && (
        <div className={`banner ${confirmation.state.phase === 'error' ? 'banner-error' : ''}`} role="status">
          <p>
            {confirmation.state.phase === 'confirming' && <><strong>Payment sent.</strong> Waiting for Robinhood Chain to confirm it. {confirmation.state.itemName} unlocks as soon as it does.</>}
            {confirmation.state.phase === 'delivered' && <><strong>{confirmation.state.itemName} is yours.</strong> It&apos;s unlocked in the game.</>}
            {confirmation.state.phase === 'error' && <><strong>That payment didn&apos;t go through.</strong> {confirmation.state.error}</>}
          </p>
          {confirmation.state.phase !== 'confirming' && (
            <button className="link-button small" onClick={confirmation.clear}>Dismiss</button>
          )}
        </div>
      )}
      <div className="creations-store-grid">
        {store.items.map((item) => {
          const owned = store.owned.includes(item.id);
          return (
            <article key={item.id} className="creations-store-item">
              <span className="creations-store-art" style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}>
                {item.name}
              </span>
              <h3>{item.name}</h3>
              {item.description && <p className="muted small">{item.description}</p>}
              <div className="creations-store-foot">
                <strong>{usd(item.usd)}</strong>
                {owned ? (
                  <span className="pill pill-solid">Owned</span>
                ) : !store.open || !item.available ? (
                  <span className="pill">Not on sale</span>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => setBuying(item)} disabled={confirmation.state?.phase === 'confirming'}>
                    Buy
                  </button>
                )}
              </div>
              {item.sold > 0 && <p className="muted small">Owned by {item.sold.toLocaleString('en-US')} player{item.sold === 1 ? '' : 's'}</p>}
            </article>
          );
        })}
      </div>
      {buying && (
        <Checkout
          gameId={gameId}
          item={buying}
          onClose={() => setBuying(null)}
          onPaid={(pending) => {
            setBuying(null);
            confirmation.watch(pending);
          }}
        />
      )}
    </section>
  );
}
