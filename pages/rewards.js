import { useEffect, useState } from 'react';
import { erc20Abi, formatUnits } from 'viem';
import { useAccount, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import ConnectButton from '../components/ConnectButton';
import { LINKS, TOKEN_ADDRESS, TOKEN_TICKER, robinhoodChain } from '../lib/config';
import { REVSHARE_ADDRESS, REVSHARE_PERCENT, findClaim, revshareAbi } from '../lib/revshare';

const amountIn = (decimals) => (raw) =>
  Number(formatUnits(BigInt(raw || 0), decimals)).toLocaleString('en-US', { maximumFractionDigits: 2 });
const monthName = (m) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const HOW = [
  {
    title: 'Cosmetics sell',
    body: `Every cosmetic bought with ${TOKEN_TICKER} in the shop adds to the month's revenue. ${REVSHARE_PERCENT}% of it becomes the holder pool, paid from the ${TOKEN_TICKER} treasury.`,
  },
  {
    title: 'Random snapshots decide the split',
    body: 'Snapshots of every wallet are taken at random moments in the last two weeks of the month. Your share of the pool matches your share of the holdings across those snapshots. Hold through the fortnight to be in every one.',
  },
  {
    title: 'Claim whenever you like',
    body: `After each month closes, your cut is added to your total here. Claim it any time: unclaimed months add up and nothing expires.`,
  },
];

function Claim({ dump, amount }) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [txHash, setTxHash] = useState(null);

  useEffect(() => setMounted(true), []);

  const mine = address ? findClaim(dump, address) : null;
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

  const earned = mine ? mine.cumulative : 0n;
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
        args: [address, mine.cumulative, mine.proof],
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
            {amount(earned)} {TOKEN_TICKER}
          </dd>
        </div>
        <div>
          <dt>Already claimed</dt>
          <dd>
            {amount(paid)} {TOKEN_TICKER}
          </dd>
        </div>
        <div>
          <dt>Ready to claim</dt>
          <dd>
            {amount(claimable)} {TOKEN_TICKER}
          </dd>
        </div>
      </dl>

      {claimable > 0n ? (
        <button className="btn btn-primary" onClick={claim} disabled={busy}>
          {busy ? (txHash ? 'Confirming…' : 'Check your wallet…') : `Claim ${amount(claimable)} ${TOKEN_TICKER}`}
        </button>
      ) : (
        <p className="muted small">
          {earned > 0n
            ? 'You have claimed everything so far. The next share lands after the month closes.'
            : 'Nothing earned by this wallet yet. Hold during a month to earn from the next payout.'}
        </p>
      )}
      {confirmed && <p className="small">Claimed. The tokens are in your wallet.</p>}
      {error && <p className="error small">{error}</p>}
      <p className="muted small">Claiming costs a small network fee in ETH.</p>
    </div>
  );
}

export default function Rewards() {
  const [epochs, setEpochs] = useState(null);
  const [dump, setDump] = useState(null);

  // Published by scripts/revshare-epoch.mjs; missing until the first month has been paid out.
  useEffect(() => {
    fetch('/revshare/epochs.json')
      .then((res) => (res.ok ? res.json() : []))
      .then(setEpochs)
      .catch(() => setEpochs([]));
    fetch('/revshare/tree.json')
      .then((res) => (res.ok ? res.json() : null))
      .then(setDump)
      .catch(() => setDump(null));
  }, []);

  const { data: decimals } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'decimals',
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(TOKEN_ADDRESS) },
  });
  const amount = amountIn(decimals ?? 18);

  const live = Boolean(REVSHARE_ADDRESS);
  const totalPaid = (epochs || []).reduce((s, e) => s + BigInt(e.paidOutRaw), 0n);

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Holder rewards</p>
          <h1>A share of every cosmetic sold.</h1>
          <p className="muted">
            {REVSHARE_PERCENT}% of cosmetic sales goes back to {TOKEN_TICKER} holders every month, paid from the
            treasury and split by what you hold at random snapshots in the month&apos;s last two weeks. No staking and
            no locking: your tokens never leave your wallet.
          </p>
        </div>
      </div>

      {live ? (
        <Claim dump={dump} amount={amount} />
      ) : (
        <div className="notice">
          <p>Holder rewards start soon. Hold {TOKEN_TICKER} and your share will count from the first month.</p>
        </div>
      )}

      <div className="grid-3">
        {HOW.map((step, i) => (
          <div className="card" key={step.title}>
            <span className="card-index">0{i + 1}</span>
            <h3>{step.title}</h3>
            <p className="muted">{step.body}</p>
          </div>
        ))}
      </div>

      {epochs && epochs.length > 0 && (
        <>
          <h2 className="rewards-history-head">Payouts so far</h2>
          <dl className="facts">
            <div>
              <dt>Months paid</dt>
              <dd>{epochs.length}</dd>
            </div>
            <div>
              <dt>Paid to holders</dt>
              <dd>
                {amount(totalPaid)} {TOKEN_TICKER}
              </dd>
            </div>
            <div>
              <dt>Holders in last payout</dt>
              <dd>{epochs[epochs.length - 1].holders.toLocaleString('en-US')}</dd>
            </div>
            <div>
              <dt>Holder share</dt>
              <dd>{REVSHARE_PERCENT}% of sales</dd>
            </div>
          </dl>
          <div className="rewards-history">
            {[...epochs].reverse().map((e) => (
              <div className="rewards-row" key={e.month}>
                <span>{monthName(e.month)}</span>
                <span className="muted">
                  {e.orders} sale{e.orders === 1 ? '' : 's'} · {amount(e.revenueRaw)} {TOKEN_TICKER}
                </span>
                <strong>
                  {amount(e.paidOutRaw)} {TOKEN_TICKER} to {e.holders.toLocaleString('en-US')} holders
                </strong>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="muted small rewards-foot">
        Every month&apos;s numbers are public. The snapshot times come from the first block mined after the month ends,
        so nobody can know them in advance, and the full list of what each wallet is owed is published with the payout
        so anyone can check it.
        {live && (
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
