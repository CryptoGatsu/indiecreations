import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { checkAccess } from '../utils/checkAccess';

export default function Supporter() {
  const { publicKey, connected } = useWallet();
  const [access, setAccess] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (publicKey) {
      checkAccess(publicKey).then((hasAccess) => {
        setAccess(hasAccess);
      });
    }
  }, [publicKey]);

  return (
    <div style={{ padding: 40 }}>
      <h1>Supporter Portal</h1>

      {!connected && <WalletMultiButton />}

      {connected && !access && <p>You need 0.5% of supply.</p>}

      {access && (
        <button onClick={() => router.push('/playtest')}>
          Enter Playtest
        </button>
      )}
    </div>
  );
}