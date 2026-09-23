import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { erc20Abi } from 'viem';
import { useAccount, useReadContract, useSwitchChain, useWriteContract } from 'wagmi';
import ConnectButton from '../components/ConnectButton';
import { Mark } from '../components/Logo';
import { LINKS, TOKEN_ADDRESS, TOKEN_TICKER, robinhoodChain, shortAddress } from '../lib/config';
import { GAMES, gameByName } from '../lib/games';

// A payment that has been sent but not yet confirmed survives a reload / closed tab through this key.
const PENDING_KEY = 'ic_shop_pending';
const POLL_MS = 3000;

const usd = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const whole = (n) => Math.ceil(Number(n)).toLocaleString('en-US');

function readPending() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY)) || null;
  } catch {
    return null;
  }
}

function writePending(value) {
  try {
    if (value) localStorage.setItem(PENDING_KEY, JSON.stringify(value));
    else localStorage.removeItem(PENDING_KEY);
  } catch {}
}

// Asks the server about a sent payment until it is delivered or definitively refused.
function useConfirmation(onDelivered) {
  const [state, setState] = useState(null); // null | { phase: 'confirming' | 'delivered' | 'error', itemName, error }
  const timer = useRef(null);

  const stop = () => clearTimeout(timer.current);
  useEffect(() => stop, []);

  const watch = useCallback(
    (pending) => {
      stop();
      writePending(pending);
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
            writePending(null);
            setState({ phase: 'delivered', itemName: pending.itemName });
            onDelivered();
            return;
          }
          if (res.status >= 400 && res.status < 500) {
            writePending(null);
            setState({ phase: 'error', itemName: pending.itemName, error: data.error, txHash: pending.txHash });
            return;
          }
        } catch {}
        // 202 (not mined yet), a server hiccup or a dropped connection: the payment is safe, keep asking
        timer.current = setTimeout(ask, POLL_MS);
      };
      ask();
    },
    [onDelivered]
  );

  const clear = () => {
    stop();
    setState(null);
  };

  return { state, watch, clear };
}

function ItemArt({ item }) {
  if (item.image) return <img className="item-art" src={item.image} alt="" loading="lazy" />;
  return (
    <div className="item-art item-art-empty" aria-hidden="true">
      <Mark size={56} />
    </div>
  );
}

function Checkout({ item, steam, onClose, onPaid }) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now());

  const { data: balance } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(address) },
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const getQuote = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/shop/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, wallet: address }),
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
  }, [item.id, address]);

  // a quote is for one wallet: fetch it on connect, and again if the wallet changes
  useEffect(() => {
    setQuote(null);
    if (isConnected && address) getQuote();
  }, [isConnected, address, getQuote]);

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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{item.name}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="muted small">
          {item.game} · {usd(item.usd)}
        </p>

        <dl className="receipt">
          <div>
            <dt>Delivered to</dt>
            <dd>{steam.name || `Steam ${steam.steamId}`}</dd>
          </div>
          <div>
            <dt>Paying from</dt>
            <dd>{isConnected ? shortAddress(address) : 'No wallet connected'}</dd>
          </div>
          <div>
            <dt>Price</dt>
            <dd>{quote ? `${whole(quote.amount)} ${TOKEN_TICKER}` : busy ? 'Pricing…' : '—'}</dd>
          </div>
        </dl>

        {!isConnected ? (
          <ConnectButton />
        ) : expired ? (
          <button className="btn btn-primary" onClick={getQuote} disabled={busy}>
            Price expired. Refresh
          </button>
        ) : short ? (
          <a className="btn btn-ghost" href={LINKS.pons} target="_blank" rel="noreferrer">
            Not enough {TOKEN_TICKER}. Get more
          </a>
        ) : (
          <button className="btn btn-primary" onClick={pay} disabled={!quote || busy}>
            {busy && quote ? 'Check your wallet…' : quote ? `Pay ${whole(quote.amount)} ${TOKEN_TICKER}` : 'Pricing…'}
          </button>
        )}

        {quote && !expired && (
          <p className="muted small modal-error">
            Price held for {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}. You also pay a
            small network fee in ETH.
          </p>
        )}
        {error && <p className="error small modal-error">{error}</p>}
      </div>
    </div>
  );
}

function PurchaseBanner({ state, onDismiss }) {
  if (!state) return null;
  return (
    <div className={`banner ${state.phase === 'error' ? 'banner-error' : ''}`} role="status">
      {state.phase === 'confirming' && (
        <p>
          <strong>Payment sent.</strong> Waiting for it to confirm on Robinhood Chain. {state.itemName} will be added to
          your Steam account automatically. You can leave this page.
        </p>
      )}
      {state.phase === 'delivered' && (
        <p>
          <strong>{state.itemName} is yours.</strong> It is on your Steam account now and will show up in the game the
          next time you launch it.
        </p>
      )}
      {state.phase === 'error' && (
        <p>
          <strong>{state.itemName} was not delivered.</strong> {state.error} If you were charged, send this transaction
          to us on X: <span className="mono">{state.txHash}</span>
        </p>
      )}
      {state.phase !== 'confirming' && (
        <button className="btn btn-ghost btn-sm" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}

const SORTS = [
  ['featured', 'Featured'],
  ['low', 'Price: low to high'],
  ['high', 'Price: high to low'],
];

export default function Shop() {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [steamFailed, setSteamFailed] = useState(false);
  const [sort, setSort] = useState('featured'); // featured (catalog order) | low | high

  const load = useCallback(() => {
    fetch('/api/shop/catalog')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ items: [], status: { open: false, reason: 'The shop could not be loaded.' } }));
  }, []);

  const confirmation = useConfirmation(load);

  useEffect(() => {
    load();

    // set by /api/steam/return when Steam refused the sign-in (kept out of the URL on purpose)
    if (document.cookie.includes('ic_steam_error=1')) {
      document.cookie = 'ic_steam_error=; Path=/; Max-Age=0';
      setSteamFailed(true);
    }

    const pending = readPending();
    if (pending?.orderId && pending?.txHash) confirmation.watch(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    await fetch('/api/steam/session', { method: 'DELETE' }).catch(() => {});
    load();
  };

  // Every game has its own shop: items grouped by game, in the studio's game order, picked with tabs (?game=<slug>).
  const router = useRouter();
  const allGames = useMemo(() => {
    const byGame = new Map();
    for (const item of data?.items || []) {
      if (!byGame.has(item.game)) byGame.set(item.game, []);
      byGame.get(item.game).push(item);
    }
    const order = (name) => {
      const i = GAMES.findIndex((g) => g.name === name);
      return i < 0 ? GAMES.length : i;
    };
    return [...byGame.entries()].sort((a, b) => order(a[0]) - order(b[0]));
  }, [data]);
  const wanted = typeof router.query.game === 'string' ? router.query.game : null;
  const current = allGames.find(([name]) => gameByName(name)?.slug === wanted)?.[0] || allGames[0]?.[0] || null;
  const games = allGames.filter(([name]) => name === current);
  const pickGame = (name) => {
    const slug = gameByName(name)?.slug;
    router.replace({ pathname: '/shop', query: slug ? { game: slug } : {} }, undefined, { shallow: true, scroll: false });
  };

  const steam = data?.steam;
  const open = data?.status?.open;

  // price sort keeps the catalog order among items that cost the same (Array sort is stable)
  const sorted = (items) =>
    sort === 'featured' ? items : [...items].sort((a, b) => (sort === 'low' ? a.usd - b.usd : b.usd - a.usd));

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Shop</p>
          <h1>Cosmetics</h1>
          <p className="muted">
            Priced in dollars, paid in {TOKEN_TICKER}, delivered straight to your Steam account.
          </p>
        </div>

        {data &&
          (steam ? (
            <div className="steam-chip">
              {steam.avatar && <img src={steam.avatar} alt="" width={32} height={32} />}
              <div>
                <strong>{steam.name || 'Steam account'}</strong>
                <span className="muted small">{steam.steamId}</span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={signOut}>
                Sign out
              </button>
            </div>
          ) : (
            <a className="btn btn-primary" href="/api/steam/login">
              Sign in through Steam
            </a>
          ))}
      </div>

      {steamFailed && (
        <div className="banner banner-error">
          <p>Steam did not confirm the sign-in. Please try again.</p>
        </div>
      )}

      <PurchaseBanner state={confirmation.state} onDismiss={confirmation.clear} />

      {data && !open && games.length > 0 && (
        <div className="banner">
          <p>{data.status.reason} You can browse, and buying opens soon.</p>
        </div>
      )}

      {allGames.length > 1 && (
        <div className="shop-tabs" role="tablist">
          {allGames.map(([name]) => (
            <button
              key={name}
              role="tab"
              aria-selected={name === current}
              className={`shop-tab ${name === current ? 'shop-tab-on' : ''}`}
              onClick={() => pickGame(name)}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {data && games.length === 0 && (
        <div className="card shop-empty">
          <Mark size={44} />
          <h3>The first drops are on the way</h3>
          <p className="muted">
            Every Indie Creations game will sell its cosmetics here. When the first ones land, this is where you get
            them.
          </p>
        </div>
      )}

      {games.map(([game, items]) => (
        <section key={game} className="shop-game">
          <div className="shop-game-head">
            <h2>{game}</h2>
            <div className="shop-game-tools">
              <div className="shop-sort" role="group" aria-label="Sort items">
                <span className="muted small">Sort</span>
                {SORTS.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={sort === key}
                    className={`shop-sort-btn ${sort === key ? 'shop-sort-btn-on' : ''}`}
                    onClick={() => setSort(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {gameByName(game) && (
                <Link href={`/games/${gameByName(game).slug}`} className="muted small">
                  About the game
                </Link>
              )}
            </div>
          </div>
          <div className="item-grid">
            {sorted(items).map((item) => (
              <article key={item.id} className="item">
                <ItemArt item={item} />
                <div className="item-body">
                  <h3>{item.name}</h3>
                  {item.description && <p className="muted small">{item.description}</p>}
                  <div className="item-price">
                    <strong>{usd(item.usd)}</strong>
                    {item.tokens && (
                      <span className="muted small">
                        ≈ {item.tokens.toLocaleString('en-US')} {TOKEN_TICKER}
                      </span>
                    )}
                  </div>

                  {item.owned ? (
                    <span className="pill pill-solid">Owned</span>
                  ) : !item.available ? (
                    <span className="pill">Coming soon</span>
                  ) : !steam ? (
                    <a className="btn btn-ghost btn-sm" href="/api/steam/login">
                      Sign in to buy
                    </a>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={!open || confirmation.state?.phase === 'confirming'}
                      onClick={() => setSelected(item)}
                    >
                      Buy
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <section className="shop-how">
        <p className="eyebrow">How it works</p>
        <div className="grid-3 shop-steps">
          <div className="card">
            <span className="card-index">01</span>
            <h3>Sign in through Steam</h3>
            <p className="muted">
              You log in on Steam's own site. We only learn which Steam account is yours, never your password.
            </p>
          </div>
          <div className="card">
            <span className="card-index">02</span>
            <h3>Pay in {TOKEN_TICKER}</h3>
            <p className="muted">
              Items have a dollar price. At checkout it is converted at the live {TOKEN_TICKER} price and held for ten
              minutes.
            </p>
          </div>
          <div className="card">
            <span className="card-index">03</span>
            <h3>Wear it in game</h3>
            <p className="muted">
              Once the payment confirms, the cosmetic is tied to your Steam account and shows up the next time you
              launch the game.
            </p>
          </div>
        </div>
      </section>

      {selected && steam && (
        <Checkout
          item={selected}
          steam={steam}
          onClose={() => setSelected(null)}
          onPaid={(pending) => {
            setSelected(null);
            confirmation.watch(pending);
          }}
        />
      )}
    </div>
  );
}
