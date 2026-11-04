import { useEffect, useState } from 'react';
import useProfile from './useProfile';
import useStoreAccount from './useStoreAccount';
import { privyEnabled } from '../lib/privyClient';

// Store pages that need an account: shows sign-in until there is one, then renders children(account).
export default function StoreGate({ title, children }) {
  const me = useProfile();
  const { account, loading } = useStoreAccount();
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => setMounted(true), []);

  if (!mounted || loading) return <p className="muted">Loading…</p>;
  if (account) return children(account);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await me.signIn();
    } catch (err) {
      setError(err.shortMessage || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <h1>{title}</h1>
      {privyEnabled ? (
        <>
          <p className="muted">Sign in with your email or a wallet to continue.</p>
          <button className="btn btn-primary" onClick={signIn} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </>
      ) : (
        <p className="muted">Store accounts are not switched on yet.</p>
      )}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
