import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { erc20Abi } from 'viem';
import { useAccount, useReadContract, useSwitchChain, useWriteContract } from 'wagmi';
import ConnectButton from '../components/ConnectButton';
import { Mark } from '../components/Logo';
import { LINKS, TOKEN_ADDRESS, TOKEN_TICKER, robinhoodChain, shortAddress } from '../lib/config';
import { GAMES, gameByName } from '../lib/games';
import { ITEM_TYPES } from '../lib/catalog';
import { REVSHARE_PERCENT } from '../lib/revshare';
import { dollars, tokens, useEconomyStats } from '../components/EconomyStats';
import PlayerCount, { usePlayerCounts } from '../components/PlayerCount';

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

// Items without art (titles, emotes, auras) get a tile that says what they are instead of an empty box.
function ItemArt({ item }) {
  if (item.image) return <img className="item-art" src={item.image} alt="" loading="lazy" />;
  if (item.type === 'title') {
    const title = item.name.replace(/^Title:\s*/i, '');
    return (
      <div className="item-art item-art-tile item-art-title" aria-hidden="true">
        <span className="item-art-player">Farmer</span>
        <span className="item-art-titletext">{title}</span>
      </div>
    );
  }
  const label = { emote: 'Emote', aura: 'Aura', skin: 'Tool skin' }[item.type];
  return (
    <div className={`item-art item-art-tile item-art-${item.type}`} aria-hidden="true">
      {label ? (
        <>
          <span className="item-art-kind">{label}</span>
          <span className="item-art-name">{item.name.replace(/^(Emote|Aura):\s*/i, '')}</span>
        </>
      ) : (
        <Mark size={56} />
      )}
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

// 25% of every sale goes to holders: the shop says so up front, with the live totals when there are any.
function RevenueShareBand() {
  const stats = useEconomyStats();
  const sold = stats?.revenue?.usdCents || 0;
  const paid = stats ? BigInt(stats.payouts?.paidRaw || 0) : 0n;
  return (
    <aside className="shop-revshare">
      <div className="shop-revshare-big">{REVSHARE_PERCENT}%</div>
      <div className="shop-revshare-text">
        <strong>of every cosmetic sale goes back to {TOKEN_TICKER} holders.</strong>
        <p className="muted small">
          Paid out automatically from the treasury, split across everyone holding {TOKEN_TICKER}. No staking, no
          locking. <Link href="/rewards">How holder rewards work</Link>
        </p>
      </div>
      {stats && (sold > 0 || paid > 0n) && (
        <dl className="shop-revshare-stats">
          <div>
            <dt>Sold so far</dt>
            <dd>{dollars(sold)}</dd>
          </div>
          <div>
            <dt>Paid to holders</dt>
            <dd>
              {tokens(paid, stats.decimals)} {TOKEN_TICKER}
            </dd>
          </div>
        </dl>
      )}
    </aside>
  );
}

// How buying works differs per game: in the game's own wardrobe (browser games), or here with Steam.
function HowItWorks({ inGame, gameInfo }) {
  const steps = inGame
    ? [
        [`Open ${gameInfo?.name || 'the game'}`, 'It plays free in your browser on desktop, phone or tablet. Sign in with your wallet, free and without a transaction.'],
        [`Pay in ${TOKEN_TICKER}`, `Pick a cosmetic in the wardrobe. Its dollar price is converted at the live ${TOKEN_TICKER} price and paid from your wallet.`],
        ['Yours in every game you play', 'It belongs to your wallet: sign in on any device and it is there. Nothing you buy changes how the game plays.'],
      ]
    : [
        ['Sign in through Steam', "You log in on Steam's own site. We only learn which Steam account is yours, never your password."],
        [`Pay in ${TOKEN_TICKER}`, `Items have a dollar price. At checkout it is converted at the live ${TOKEN_TICKER} price and held for ten minutes.`],
        ['Wear it in the game', 'Once the payment confirms, the cosmetic is tied to your Steam account and shows up the next time you launch the game.'],
      ];
  return (
    <section className="shop-how">
      <p className="eyebrow">How buying works</p>
      <div className="grid-3 shop-steps">
        {steps.map(([title, body], i) => (
          <div className="card" key={title}>
            <span className="card-index">0{i + 1}</span>
            <h3>{title}</h3>
            <p className="muted">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Shop() {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [steamFailed, setSteamFailed] = useState(false);
  const [sort, setSort] = useState('featured'); // featured (catalog order) | low | high
  const [kind, setKind] = useState('all'); // an ITEM_TYPES key, or all
  const counts = usePlayerCounts();

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
  const items = allGames.find(([name]) => name === current)?.[1] || [];
  const gameInfo = current ? gameByName(current) : null;
  const inGame = gameInfo?.shop === 'in-game' && Boolean(gameInfo?.play);
  const pickGame = (name) => {
    setKind('all');
    const slug = gameByName(name)?.slug;
    router.replace({ pathname: '/shop', query: slug ? { game: slug } : {} }, undefined, { shallow: true, scroll: false });
  };

  const steam = data?.steam;
  const open = data?.status?.open;

  // price sort keeps the catalog order among items that cost the same (Array sort is stable)
  const sorted = (list) =>
    sort === 'featured' ? list : [...list].sort((a, b) => (sort === 'low' ? a.usd - b.usd : b.usd - a.usd));
  const kinds = ITEM_TYPES.filter(([k]) => items.some((i) => i.type === k));
  const sections = kinds
    .filter(([k]) => kind === 'all' || kind === k)
    .map(([k, label]) => [k, label, sorted(items.filter((i) => i.type === k))]);

  const action = (item) => {
    if (inGame) return <span className="item-tag">In the game&apos;s wardrobe</span>;
    if (item.owned) return <span className="pill pill-solid">Owned</span>;
    if (!item.available) return <span className="pill">Coming soon</span>;
    if (!steam) {
      return (
        <a className="btn btn-ghost btn-sm" href="/api/steam/login">
          Sign in to buy
        </a>
      );
    }
    return (
      <button
        className="btn btn-primary btn-sm"
        disabled={!open || confirmation.state?.phase === 'confirming'}
        onClick={() => setSelected(item)}
      >
        Buy
      </button>
    );
  };

  return (
    <div className="container page">
      <div className="page-head shop-head">
        <div>
          <p className="eyebrow">Shop</p>
          <h1>Cosmetics</h1>
          <p className="muted">
            Hats, outfits, titles, emotes and auras for every Indie Creations game. Priced in dollars, paid in{' '}
            {TOKEN_TICKER}. Cosmetics are for looking good, never for winning.
          </p>
        </div>
      </div>

      <RevenueShareBand />

      {steamFailed && (
        <div className="banner banner-error">
          <p>Steam did not confirm the sign-in. Please try again.</p>
        </div>
      )}

      <PurchaseBanner state={confirmation.state} onDismiss={confirmation.clear} />

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

      {data && allGames.length === 0 && (
        <div className="card shop-empty">
          <Mark size={44} />
          <h3>The first drops are on the way</h3>
          <p className="muted">
            Every Indie Creations game will sell its cosmetics here. When the first ones land, this is where you get
            them.
          </p>
        </div>
      )}

      {current && (
        <section className="shop-game">
          <div className="shop-game-bar">
            <div>
              <h2>{current}</h2>
              <p className="muted small">
                {items.length} cosmetics
                {inGame ? ' · bought in the game with your wallet' : ' · delivered to your Steam account'}
                {gameInfo && (
                  <>
                    {' · '}
                    <Link href={`/games/${gameInfo.slug}`}>About the game</Link>
                  </>
                )}
              </p>
              {gameInfo?.play && <PlayerCount slug={gameInfo.slug} counts={counts} />}
            </div>
            {inGame ? (
              <a className="btn btn-primary" href={gameInfo.play}>
                Play and shop in the game
              </a>
            ) : (
              data &&
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
              ))
            )}
          </div>

          {!inGame && data && !open && (
            <div className="banner">
              <p>{data.status.reason} You can browse, and buying opens soon.</p>
            </div>
          )}

          <div className="shop-filters">
            <div className="shop-chips" role="group" aria-label="Show">
              {[['all', 'All'], ...kinds].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  className={`shop-sort-btn ${kind === k ? 'shop-sort-btn-on' : ''}`}
                  onClick={() => setKind(k)}
                >
                  {label}
                  <span className="shop-chip-n">{k === 'all' ? items.length : items.filter((i) => i.type === k).length}</span>
                </button>
              ))}
            </div>
            <label className="shop-sort-select">
              <span className="muted small">Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORTS.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {sections.map(([k, label, list]) => (
            <div className="shop-section" key={k}>
              {kind === 'all' && <h3 className="shop-section-head">{label}</h3>}
              <div className="item-grid">
                {list.map((item) => (
                  <article key={item.id} className="item">
                    <ItemArt item={item} />
                    <div className="item-body">
                      <h3>{item.name.replace(/^(Title|Emote|Aura):\s*/i, '')}</h3>
                      {item.description && <p className="muted small item-desc">{item.description}</p>}
                      <div className="item-foot">
                        <div className="item-price">
                          <strong>{usd(item.usd)}</strong>
                          {item.tokens && (
                            <span className="muted small">
                              ≈ {item.tokens.toLocaleString('en-US')} {TOKEN_TICKER}
                            </span>
                          )}
                        </div>
                        {action(item)}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <HowItWorks inGame={inGame} gameInfo={gameInfo} />

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
