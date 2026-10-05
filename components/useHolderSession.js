import { useCallback, useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { buildSignInMessage } from '../lib/authMessage';

// The holder sign-in the playtest area uses (a free signature, checked against the on-chain balance by
// /api/auth/verify), for other holder pages. A session counts without a wallet in this browser (it may have come from
// a hand-off link); connecting a DIFFERENT wallet signs it out.
export default function useHolderSession() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [mounted, setMounted] = useState(false);
  const [sessionAddress, setSessionAddress] = useState(null);
  const [checked, setChecked] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null); // { error } | { balance, required }

  useEffect(() => {
    setMounted(true);
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((d) => setSessionAddress(d.address))
      .catch(() => {})
      .finally(() => setChecked(true));
  }, []);

  const signOut = useCallback(() => {
    setSessionAddress(null);
    fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
  }, []);

  useEffect(() => {
    setResult(null);
    if (sessionAddress && isConnected && address && sessionAddress !== address.toLowerCase()) signOut();
  }, [address, isConnected, sessionAddress, signOut]);

  const verify = async () => {
    setVerifying(true);
    setResult(null);
    try {
      const issuedAt = new Date().toISOString();
      const signature = await signMessageAsync({ message: buildSignInMessage(address, issuedAt) });
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, issuedAt, signature }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSessionAddress(data.address.toLowerCase());
      else if (res.status === 403) setResult({ balance: data.balance, required: data.required });
      else setResult({ error: data.error || 'Verification failed.' });
    } catch (err) {
      setResult({ error: err.shortMessage || 'Signature request was cancelled.' });
    } finally {
      setVerifying(false);
    }
  };

  return { mounted, checked, address, isConnected, sessionAddress, verifying, result, verify, signOut };
}
