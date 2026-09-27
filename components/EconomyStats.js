import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { TOKEN_TICKER } from '../lib/config';
import { REVSHARE_PERCENT } from '../lib/revshare';

export const tokens = (raw, decimals = 18) =>
  Number(formatUnits(BigInt(raw || 0), decimals)).toLocaleString('en-US', { maximumFractionDigits: 0 });
export const dollars = (cents) =>
  (Number(cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

// The public economy numbers from /api/rewards/stats (null while loading or when unavailable).
export function useEconomyStats() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    fetch('/api/rewards/stats')
      .then((res) => res.json())
      .then((s) => setStats(s.unavailable ? null : s))
      .catch(() => setStats(null));
  }, []);
  return stats;
}

// Total revenue from every game, tokens burned, and what holders have been paid. Renders nothing until there is data.
export default function EconomyStats({ stats }) {
  if (!stats) return null;
  const d = stats.decimals;
  return (
    <dl className="facts economy-facts">
      <div>
        <dt>Revenue, all games</dt>
        <dd>{dollars(stats.revenue.usdCents)}</dd>
        <span className="muted small">
          {tokens(stats.revenue.raw, d)} {TOKEN_TICKER}
        </span>
      </div>
      <div>
        <dt>Burned</dt>
        <dd>
          {tokens(stats.burned.raw, d)} {TOKEN_TICKER}
        </dd>
        <span className="muted small">gone for good</span>
      </div>
      <div>
        <dt>Paid to holders</dt>
        <dd>
          {tokens(stats.payouts.paidRaw, d)} {TOKEN_TICKER}
        </dd>
        <span className="muted small">
          {stats.payouts.months} payout{stats.payouts.months === 1 ? '' : 's'}
        </span>
      </div>
      <div>
        <dt>Holder share</dt>
        <dd>{REVSHARE_PERCENT}% of revenue</dd>
        <span className="muted small">paid from the treasury</span>
      </div>
    </dl>
  );
}
