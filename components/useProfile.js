import { useCallback, useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';

// The signed-in player on this browser: { address, profile, balance } from /api/profile/me, shared by every
// component that asks (header, profile page, comments), with sign in / sign out / refresh.
// Signing in is the free wallet message the browser games use too, so one sign-in covers both.
const shared = { data: undefined, loading: null, listeners: new Set() };

function publish(data) {
  shared.data = data;
  shared.listeners.forEach((fn) => fn(data));
}

export function refreshProfile() {
  if (!shared.loading) {
    shared.loading = fetch('/api/profile/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then(publish)
      .catch(() => publish({ address: null }))
      .finally(() => {
        shared.loading = null;
      });
  }
  return shared.loading;
}

export default function useProfile() {
  const [data, setData] = useState(shared.data);
  const { address: wallet } = useAccount();
  const { signMessageAsync } = useSignMessage();

  useEffect(() => {
    shared.listeners.add(setData);
    if (shared.data === undefined) refreshProfile();
    else setData(shared.data);
    return () => shared.listeners.delete(setData);
  }, []);

  const signIn = useCallback(async () => {
    if (!wallet) throw new Error('Connect your wallet first.');
    const n = await fetch(`/api/game/signin?address=${wallet}`).then((r) => r.json());
    if (!n.message) throw new Error(n.error || 'Could not start signing in.');
    const signature = await signMessageAsync({ message: n.message });
    const res = await fetch('/api/game/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: wallet, issuedAt: n.issuedAt, signature }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'Sign-in failed.');
    await refreshProfile();
  }, [wallet, signMessageAsync]);

  const signOut = useCallback(async () => {
    await fetch('/api/game/me', { method: 'DELETE' }).catch(() => {});
    await refreshProfile();
  }, []);

  return {
    loading: data === undefined,
    address: data?.address || null,
    profile: data?.profile || null,
    balance: data?.balance || null,
    signIn,
    signOut,
    refresh: refreshProfile,
    update: (profile) => publish({ ...shared.data, profile }),
  };
}
