import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAccount } from 'wagmi';
import Avatar from '../components/Avatar';
import ConnectButton from '../components/ConnectButton';
import useProfile from '../components/useProfile';
import { MIN_TOKENS, TOKEN_TICKER, shortAddress } from '../lib/config';
import { GAMES } from '../lib/games';
import { AVATAR_MAX_BYTES, AVATAR_PX, BIO_MAX, NAME_RE, shownName } from '../lib/profileRules';

// Your own profile: sign in with your wallet, then set a name, bio, picture and favourite games, and see what you hold.

// Crops the chosen image to a centred square, shrinks it to AVATAR_PX and encodes it small (WebP, else JPEG).
async function toAvatarDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = AVATAR_PX;
  canvas
    .getContext('2d')
    .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
  for (const [type, quality] of [['image/webp', 0.86], ['image/webp', 0.7], ['image/jpeg', 0.82], ['image/jpeg', 0.65]]) {
    const url = canvas.toDataURL(type, quality);
    if (url.startsWith(`data:${type}`) && (url.length * 3) / 4 < AVATAR_MAX_BYTES) return url;
  }
  throw new Error('That picture could not be made small enough. Try another one.');
}

function Balance({ balance }) {
  if (!balance) return null;
  const tokens = Number(balance.tokens).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return (
    <section className="card profile-card">
      <p className="eyebrow">Your {TOKEN_TICKER}</p>
      <p className="profile-balance">
        {tokens} <span>{TOKEN_TICKER}</span>
      </p>
      {balance.holder ? (
        <p className="muted small">
          <span className="pill pill-solid">Holder</span> Playtests, reviews and free releases are unlocked.
        </p>
      ) : (
        <p className="muted small">
          Hold {MIN_TOKENS.toLocaleString('en-US')} {TOKEN_TICKER} to unlock playtests, reviews and free releases.{' '}
          <Link href="/token">Get {TOKEN_TICKER}</Link>
        </p>
      )}
      <p className="muted small">
        A share of every game&apos;s revenue goes to holders each month. <Link href="/rewards">See your rewards</Link>
      </p>
    </section>
  );
}

function Editor({ me }) {
  const { address, profile } = me;
  const [name, setName] = useState(profile?.displayName || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [favorites, setFavorites] = useState(profile?.favorites || []);
  const [status, setStatus] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);
  const file = useRef(null);

  const nameOk = !name.trim() || NAME_RE.test(name.trim());
  const toggle = (slug) => setFavorites((f) => (f.includes(slug) ? f.filter((g) => g !== slug) : [...f, slug]));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/profile/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name, bio, favorites }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Could not save.');
      me.update(out.profile);
      setStatus({ ok: true, text: 'Saved.' });
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const picture = async (f) => {
    if (!f) return;
    setBusy(true);
    setStatus(null);
    try {
      const dataUrl = await toAvatarDataUrl(f);
      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Could not save the picture.');
      me.update({ ...(profile || {}), address, avatarVersion: out.avatarVersion });
      setStatus({ ok: true, text: 'Picture updated.' });
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  const removePicture = async () => {
    setBusy(true);
    await fetch('/api/profile/avatar', { method: 'DELETE' }).catch(() => {});
    me.update({ ...(profile || {}), address, avatarVersion: null });
    setBusy(false);
  };

  return (
    <form className="card profile-card profile-form" onSubmit={save}>
      <div className="profile-picture">
        <Avatar address={address} profile={profile} size={96} />
        <div className="profile-picture-actions">
          <label className="btn btn-ghost btn-sm">
            {profile?.avatarVersion ? 'Change picture' : 'Add a picture'}
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => picture(e.target.files?.[0])} />
          </label>
          {profile?.avatarVersion && (
            <button type="button" className="link-button small" onClick={removePicture} disabled={busy}>
              Remove
            </button>
          )}
          <span className="muted small">Square pictures look best. Everyone can see it.</span>
        </div>
      </div>

      <label className="field">
        <span>Display name</span>
        <input className="admin-input" value={name} maxLength={24} placeholder={shortAddress(address)} onChange={(e) => setName(e.target.value)} />
        {!nameOk && <span className="error small">3 to 24 letters, numbers, spaces, dots, dashes or underscores.</span>}
      </label>

      <label className="field">
        <span>
          Bio <span className="muted small">{bio.length}/{BIO_MAX}</span>
        </span>
        <textarea value={bio} maxLength={BIO_MAX} rows={3} placeholder="Say something about yourself" onChange={(e) => setBio(e.target.value)} />
      </label>

      <fieldset className="field">
        <span>Favourite games</span>
        <div className="shop-chips profile-favorites">
          {GAMES.map((g) => (
            <button
              type="button"
              key={g.slug}
              aria-pressed={favorites.includes(g.slug)}
              className={`shop-sort-btn ${favorites.includes(g.slug) ? 'shop-sort-btn-on' : ''}`}
              onClick={() => toggle(g.slug)}
            >
              {favorites.includes(g.slug) ? '♥ ' : ''}
              {g.name}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="admin-row">
        <button className="btn btn-primary" type="submit" disabled={busy || !nameOk}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
        {status && <span className={status.ok ? 'small' : 'error small'}>{status.text}</span>}
      </div>
    </form>
  );
}

export default function Profile() {
  const me = useProfile();
  const { address: wallet, isConnected } = useAccount();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => setMounted(true), []);

  // after signing in from a "sign in to comment" link, go back to where they were
  const next = typeof router.query.next === 'string' && router.query.next.startsWith('/') ? router.query.next : null;

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await me.signIn();
      if (next) router.push(next);
    } catch (err) {
      setError(err.shortMessage || err.message);
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (!mounted || me.loading) {
    body = <p className="muted">Loading…</p>;
  } else if (!me.address) {
    body = (
      <div className="gate">
        <h1>Your profile</h1>
        <p className="muted">
          Sign in with your wallet to set a name, a picture and a bio, mark your favourite games, comment under games and
          see your {TOKEN_TICKER}. Signing in is a free message, not a transaction.
        </p>
        {isConnected ? (
          <button className="btn btn-primary" onClick={signIn} disabled={busy}>
            {busy ? 'Check your wallet…' : `Sign in as ${shortAddress(wallet)}`}
          </button>
        ) : (
          <ConnectButton />
        )}
        {error && <p className="error small">{error}</p>}
      </div>
    );
  } else {
    body = (
      <>
        <div className="page-head">
          <div className="profile-head">
            <Avatar address={me.address} profile={me.profile} size={64} />
            <div>
              <p className="eyebrow">Your profile</p>
              <h1>{shownName(me.profile, me.address)}</h1>
              <p className="muted small">
                <span className="mono">{shortAddress(me.address)}</span> ·{' '}
                <Link href={`/u/${me.address}`}>View public profile</Link> ·{' '}
                <button className="link-button" onClick={me.signOut}>
                  Sign out
                </button>
              </p>
            </div>
          </div>
        </div>
        {wallet && wallet.toLowerCase() !== me.address && (
          <p className="notice small">
            Your wallet is on {shortAddress(wallet)}, but this browser is signed in as {shortAddress(me.address)}.{' '}
            <button className="link-button" onClick={signIn}>
              Sign in as {shortAddress(wallet)}
            </button>
          </p>
        )}
        <div className="profile-grid">
          <Editor key={me.address} me={me} />
          <Balance balance={me.balance} />
        </div>
      </>
    );
  }

  return (
    <div className="container page">
      <Head>
        <title>Your profile · Indie Creations</title>
      </Head>
      {body}
    </div>
  );
}
