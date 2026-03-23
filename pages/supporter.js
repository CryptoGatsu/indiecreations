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
      checkAccess(publicKey).then(setAccess);
    }
  }, [publicKey]);

  return (
    <div className="container">
      <h1 className="title">Supporter Portal</h1>

      {!connected && <WalletMultiButton />}

      {connected && !access && (
        <div className="card">
          <p>You need 0.5% of supply to access playtests.</p>
        </div>
      )}

      {access && (
        <button className="button" onClick={() => router.push('/playtest')}>
          Enter Playtest
        </button>
      )}
    </div>
  );
}
