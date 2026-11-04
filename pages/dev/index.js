import Head from 'next/head';
import Link from 'next/link';
import StoreGate from '../../components/StoreGate';
import { BUILD_STATUS, Codes, useDevState } from '../../components/devShared';
import { APPLICATION_REASONS } from '../../lib/platform/guidelines';

// The developer dashboard: your application, and once approved, your games and where each one stands.

function Application({ state }) {
  const app = state.application;
  if (!app) {
    return (
      <div className="card">
        <h3>Become a developer</h3>
        <p className="muted">
          Apply with your studio profile and a ${state.burnUsd.dev_apply} {'$CREATIONS'} burn. The studio reviews every
          application.
        </p>
        <Link href="/dev/apply" className="btn btn-primary">
          Apply
        </Link>
      </div>
    );
  }
  if (app.status === 'submitted') {
    return (
      <div className="card">
        <span className="pill">In review</span>
        <h3>Your application is with the studio.</h3>
        <p className="muted">
          Sent {new Date(app.createdAt).toLocaleDateString()} as <strong>{app.profile.studioName}</strong>. You&apos;ll
          see the decision here.
        </p>
      </div>
    );
  }
  if (app.status === 'rejected') {
    return (
      <div className="card">
        <span className="pill">Not approved</span>
        <h3>Your application was turned down.</h3>
        <Codes codes={app.rejectionCodes} list={APPLICATION_REASONS} />
        {app.note && <p className="notice small">Reviewer: {app.note}</p>}
        <p className="muted small">
          {state.needsBurn
            ? 'You have used your free resubmission, so applying again takes a new burn.'
            : 'Your next application is free (one free resubmission).'}
        </p>
        <Link href="/dev/apply" className="btn btn-primary">
          Apply again
        </Link>
      </div>
    );
  }
  return null;
}

function Games({ state }) {
  return (
    <>
      <div className="dev-games-head">
        <h2>Your games</h2>
        <Link href="/dev/games/new" className="btn btn-primary">
          New game
        </Link>
      </div>
      {!state.games.length ? (
        <p className="muted">
          No games yet. A new game takes a ${state.burnUsd.new_game} {'$CREATIONS'} burn; updates after that are free.
        </p>
      ) : (
        <div className="rewards-history">
          {state.games.map((g) => (
            <Link href={`/dev/games/${g.slug}`} className="rewards-row dev-game-row" key={g.id}>
              <span>
                <strong>{g.title}</strong> <span className="muted small mono">/{g.slug}</span>
              </span>
              <span className="muted">
                {g.status === 'live' ? 'On the store' : 'Not on the store yet'}
                {g.latestBuild ? ` · version ${g.latestBuild.version}: ${BUILD_STATUS[g.latestBuild.status]}` : ''}
              </span>
              <strong>Open</strong>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function DevDashboard() {
  return (
    <div className="container page">
      <Head>
        <title>Developer dashboard - Indie Creations</title>
      </Head>
      <StoreGate title="Developer dashboard">{() => <Dashboard />}</StoreGate>
    </div>
  );
}

function Dashboard() {
  const { state, error } = useDevState();
  if (error) return <p className="error">{error}</p>;
  if (!state) return <p className="muted">Loading…</p>;
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Developers</p>
          <h1>{state.isDeveloper ? state.profile?.studio_name || 'Your studio' : 'Developer dashboard'}</h1>
          <p className="muted">
            {state.isDeveloper
              ? 'Create games, upload builds and send them for review. Approved games appear on the store.'
              : 'Publish your games on Indie Creations.'}{' '}
            <Link href="/dev/guidelines">Guidelines</Link>
          </p>
        </div>
        {state.network?.testnet && <span className="pill">Testnet: burns use test {'$CREATIONS'}</span>}
      </div>
      {state.isDeveloper ? <Games state={state} /> : <Application state={state} />}
    </>
  );
}
