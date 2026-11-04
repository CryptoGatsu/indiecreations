import { TOKEN_TICKER } from '../lib/config';
import {
  SPLIT_CURATORS_BPS,
  SPLIT_DEV_BPS,
  SPLIT_HOLDERS_BPS,
  SPLIT_PLATFORM_BPS,
} from '../lib/platform/config';

const pct = (bps) => `${bps / 100}%`;

// Where every store sale goes (PLATFORM_SPEC section 2), from the platform constants so the page can't drift.
export const SPLIT = [
  { share: pct(SPLIT_DEV_BPS), who: 'The developer', note: 'Paid out automatically once the 72-hour refund window closes.' },
  { share: pct(SPLIT_PLATFORM_BPS), who: 'The store', note: 'Hosting, payments, review and running Indie Creations.' },
  { share: pct(SPLIT_HOLDERS_BPS), who: `${TOKEN_TICKER} holders`, note: 'Shared monthly in USDG by how much each wallet held.' },
  { share: pct(SPLIT_CURATORS_BPS), who: 'Curators', note: 'Shared monthly by the players who write the reviews that help.' },
];

export default function StoreSplit() {
  return (
    <dl className="facts store-split">
      {SPLIT.map((s) => (
        <div key={s.who}>
          <dt>{s.who}</dt>
          <dd>{s.share}</dd>
          <p className="muted small">{s.note}</p>
        </div>
      ))}
    </dl>
  );
}
