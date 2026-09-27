import { useCallback, useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { useAccount, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import ConnectButton from '../components/ConnectButton';
import EconomyStats, { dollars, tokens, useEconomyStats } from '../components/EconomyStats';
import { LINKS, TOKEN_TICKER, robinhoodChain } from '../lib/config';
import { GAMES } from '../lib/games';
import { REVSHARE_ADDRESS, REVSHARE_MIN_USD, REVSHARE_PERCENT, REVSHARE_SNAPSHOTS, revshareAbi } from '../lib/revshare';

const exact = (raw, decimals) =>
  Number(formatUnits(BigInt(raw || 0), decimals)).toLocaleString('en-US', { maximumFractionDigits: 2 });
const monthName = (m) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const HOW = [
  {
    title: 'Every game earns',
    body: `Cosmetics and other sales across every Indie Creations game add to the month's revenue. ${REVSHARE_PERCENT}% of it becomes the holder pool, paid from the ${TOKEN_TICKER} treasury.`,
  },
  {
    title: 'Paid once it adds up',
    body: `A payout goes out once at least $${REVSHARE_MIN_USD.toLocaleString('en-US')} of revenue has built up. A quieter month simply rolls into the next one.`,
  },
  {
    title: 'Random snapshots decide the split',
    body: `${REVSHARE_SNAPSHOTS} snapshots of every wallet are taken at random moments in the last two weeks of the month. Your share of the pool matches your share of the holdings across them.`,
  },
  {
    title: 'Automatic, then claim any time',
    body: 'Nobody presses a button: the payout is worked out and published on-chain by itself after the month closes. Claim whenever you like; unclaimed payouts add up and never expire.',
  },
];

function Claim({ decimals }) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [mounted, setMounted] = useState(false);
  const [mine, setMine] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [txHash, setTxHash] = useState(null);

  useEffect(() => setMounted(true), []);

  const load = useCallback(() => {
    if (!address) return setMine(null);
    fetch(`/api/rewards/claim?address=${address}`)
      .then((res) => res.json())
      .then((c) => setMine(c.error ? null : c))
      .catch(() => setMine(null));
  }, [address]);
  useEffect(load, [load]);

  const { data: claimed, refetch } = useReadContract({
    address: REVSHARE_ADDRESS,
    abi: revshareAbi,
    functionName: 'claimed',
    args: [address],
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(REVSHARE_ADDRESS && address) },
  });
  const { isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash, chainId: robinhoodChain.id });

  useEffect(() => {
    if (confirmed) {
      refetch();
      setBusy(false);
    }
  }, [confirmed, refetch]);

  if (!mounted || !isConnected) {
    return (
      <div className="notice">
        <p>Connect your wallet to see what you have earned.</p>
        <ConnectButton />
      </div>
    );
  }

  const earned = mine ? BigInt(mine.cumulative) : 0n;
  const paid = claimed ?? 0n;
  const claimable = earned > paid ? earned - paid : 0n;

  const claim = async () => {
    setBusy(true);
    setError(null);
    try {
      if (chainId !== robinhoodChain.id) await switchChainAsync({ chainId: robinhoodChain.id });
      const hash = await writeContractAsync({
        address: REVSHARE_ADDRESS,
        abi: revshareAbi,
        functionName: 'claim',
        args: [address, earned, mine.proof],
        chainId: robinhoodChain.id,
      });
      setTxHash(hash);
    } catch (err) {
      setError(err.shortMessage || 'The claim was cancelled.');
      setBusy(false);
    }
  };

  return (
    <div className="notice rewards-claim">
      <dl className="receipt">
        <div>
          <dt>Earned so far</dt>
          <dd>
            {exact(earned, decimals)} {TOKEN_TICKER}
          </dd>
        </div>
        <div>
          <dt>Already claimed</dt>
          <dd>
            {exact(paid, decimals)} {TOKEN_TICKER}
          </dd>
        </div>
        <div>
          <dt>Ready to claim</dt>
          <dd>
            {exact(claimable, decimals)} {TOKEN_TICKER}
          </dd>
        </div>
      </dl>

      {claimable > 0n ? (
        <button className="btn btn-primary" onClick={claim} disabled={busy}>
          {busy ? (txHash ? 'Confirming…' : 'Check your wallet…') : `Claim ${exact(claimable, decimals)} ${TOKEN_TICKER}`}
        </button>
      ) : (
        <p className="muted small">
          {earned > 0n
            ? 'You have claimed everything so far. Your next share lands with the next payout.'
            : 'Nothing earned by this wallet yet. Hold through the last two weeks of a month to share in the next payout.'}
        </p>
      )}
      {confirmed && <p className="small">Claimed. The tokens are in your wallet.</p>}
      {error && <p className="error small">{error}</p>}
      <p className="muted small">Claiming costs a small network fee in ETH.</p>
    </div>
  );
}

function NextPayout({ next }) {
  const pct = Math.min(100, Math.round((next.pendingUsdCents / Math.max(1, next.minUsdCents)) * 100));
  const ready = next.pendingUsdCents >= next.minUsdCents;
  return (
    <div className="card next-payout">
      <div className="next-payout-head">
        <h3>Next payout</h3>
        <span className="muted small">
          {dollars(next.pendingUsdCents)} of {dollars(next.minUsdCents)} minimum
        </span>
      </div>
      <div className="meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="muted small">
        {next.awaitingPublish
          ? 'The latest payout is worked out and being published on-chain.'
          : ready
            ? 'The minimum is reached: this revenue pays out after the current month closes.'
            : 'Revenue since the last payout. It pays out after the first month-end where it is over the minimum.'}
      </p>
    </div>
  );
}

function ByGame({ stats }) {
  const d = stats.decimals;
  const revenue = new Map(stats.revenue.games.map((g) => [g.game, g]));
  const burns = new Map(stats.burned.games.map((g) => [g.game, BigInt(g.raw)]));
  const gameBurned = [...burns.values()].reduce((s, v) => s + v, 0n);
  const otherBurned = BigInt(stats.burned.raw) - gameBurned;
  return (
    <div className="rewards-history">
      {GAMES.map((game) => {
        const r = revenue.get(game.name);
        const b = burns.get(game.name) || 0n;
        const testnet = game.shop === 'in-game' && !r && b === 0n;
        return (
          <div className="rewards-row" key={game.slug}>
            <span>{game.name}</span>
            <span className="muted">
              {testnet
                ? 'On testnet: sales and burns count from mainnet launch'
                : `${r ? r.orders : 0} sale${r?.orders === 1 ? '' : 's'} · ${tokens(b, d)} ${TOKEN_TICKER} burned`}
            </span>
            <strong>{testnet ? '—' : `${dollars(r?.usdCents)} revenue`}</strong>
          </div>
        );
      })}
      {otherBurned > 0n && (
        <div className="rewards-row">
          <span>Other burns</span>
          <span className="muted">Sent to burn addresses outside the games</span>
          <strong>
            {tokens(otherBurned, d)} {TOKEN_TICKER} burned
          </strong>
        </div>
      )}
    </div>
  );
}

export default function Rewards() {
  const stats = useEconomyStats();
  const decimals = stats?.decimals ?? 18;
  const history = (stats?.epochs || []).slice().reverse();

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Holder rewards</p>
          <h1>A share of everything the games earn.</h1>
          <p className="muted">
            {REVSHARE_PERCENT}% of revenue from every Indie Creations game goes back to {TOKEN_TICKER} holders, paid
            automatically from the treasury. No staking and no locking: your tokens never leave your wallet.
          </p>
        </div>
      </div>

      {REVSHARE_ADDRESS ? (
        <Claim decimals={decimals} />
      ) : (
        <div className="notice">
          <p>Holder rewards start soon. Hold {TOKEN_TICKER} and you will be in the first payout&apos;s snapshots.</p>
        </div>
      )}

      {stats && (
        <>
          <EconomyStats stats={stats} />
          <NextPayout next={stats.next} />
        </>
      )}

      <div className="grid-2 rewards-how">
        {HOW.map((step, i) => (
          <div className="card" key={step.title}>
            <span className="card-index">0{i + 1}</span>
            <h3>{step.title}</h3>
            <p className="muted">{step.body}</p>
          </div>
        ))}
      </div>

      {stats && (
        <>
          <h2 className="rewards-history-head">By game</h2>
          <ByGame stats={stats} />
        </>
      )}

      {history.length > 0 && (
        <>
          <h2 className="rewards-history-head">Month by month</h2>
          <div className="rewards-history">
            {history.map((e) => (
              <div className="rewards-row" key={e.month}>
                <span>{monthName(e.month)}</span>
                <span className="muted">
                  {dollars(e.revenueUsdCents)} revenue · {e.orders} sale{e.orders === 1 ? '' : 's'}
                </span>
                <strong>
                  {e.status === 'carried'
                    ? 'Under the minimum, carried over'
                    : `${tokens(e.paidOutRaw, decimals)} ${TOKEN_TICKER} to ${e.holders.toLocaleString('en-US')} holders`}
                  {e.status === 'computed' && ' (publishing)'}
                </strong>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="muted small rewards-foot">
        Every payout can be checked. The snapshot times come from the first block mined after the month ends, so
        nobody can know them in advance, and the full list of what each wallet is owed is public at
        /api/rewards/tree?month=YYYY-MM.
        {REVSHARE_ADDRESS && (
          <>
            {' '}
            <a href={`${LINKS.explorer}/address/${REVSHARE_ADDRESS}`} target="_blank" rel="noreferrer">
              View the rewards contract
            </a>
            .
          </>
        )}
      </p>
    </div>
  );
}
