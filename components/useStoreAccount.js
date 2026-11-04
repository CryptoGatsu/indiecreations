import { useEffect, useState } from 'react';

// The store account signed in on this browser: { account, holder } from /api/auth/account, shared by every component
// that asks. account is null when signed out (or when accounts are switched off).
const shared = { data: undefined, loading: null, listeners: new Set() };

function publish(data) {
  shared.data = data;
  shared.listeners.forEach((fn) => fn(data));
}

export function refreshAccount() {
  if (!shared.loading) {
    shared.loading = fetch('/api/auth/account', { cache: 'no-store' })
      .then((r) => r.json())
      .then(publish)
      .catch(() => publish({ account: null }))
      .finally(() => {
        shared.loading = null;
      });
  }
  return shared.loading;
}

export const currentAccount = () => shared.data?.account || null;

export default function useStoreAccount() {
  const [data, setData] = useState(shared.data);
  useEffect(() => {
    shared.listeners.add(setData);
    if (shared.data === undefined) refreshAccount();
    else setData(shared.data);
    return () => shared.listeners.delete(setData);
  }, []);
  return {
    loading: data === undefined,
    account: data?.account || null,
    holder: data?.holder || null,
    refresh: refreshAccount,
  };
}
