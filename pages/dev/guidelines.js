import Head from 'next/head';
import Link from 'next/link';
import { RULES } from '../../lib/platform/guidelines';

export default function Guidelines() {
  return (
    <>
      <Head>
        <title>Publishing guidelines - Indie Creations</title>
        <meta name="description" content="What every game on Indie Creations must meet: the Q1 to Q8 review rules." />
      </Head>
      <div className="container page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Developers</p>
            <h1>Publishing guidelines.</h1>
            <p className="muted">
              Every build, patch and update is reviewed against these rules. A rejection always names the rule it
              broke, with a note when it helps, so you know exactly what to fix.
            </p>
          </div>
          <div className="actions">
            <Link href="/developers" className="btn btn-ghost">
              How publishing works
            </Link>
          </div>
        </div>

        <div className="rules">
          {RULES.map((r) => (
            <div className="rule" key={r.code}>
              <span className="rule-code">{r.code}</span>
              <div>
                <h3>{r.title}</h3>
                <p className="muted">{r.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid-2 dev-topics">
          <div className="card">
            <h3>Adult games</h3>
            <p className="muted">
              Games flagged adult go to their own review queue, with stricter checks on every build and patch. Players
              only see them after turning on adult content in their settings and confirming they are 18 or over, and
              they never appear in featured spots.
            </p>
            <p className="muted">
              Never approved, whatever the claimed ages: sexual content involving minors or characters who look or read
              as minors, real people or deepfakes, and non-consensual sexual content. Developers declare that every
              character is an adult, and reviewers check how they are actually shown.
            </p>
          </div>
          <div className="card">
            <h3>Game tokens</h3>
            <p className="muted">
              Adding a token to a game (paying in the shop with it, or token-gated cosmetics) is a reviewed patch. It
              is approved only once purchases, item delivery and burns are tested and working on the live token.
            </p>
            <p className="muted">
              A game never needs its token: every item can also be bought with stablecoins (Q5).
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
