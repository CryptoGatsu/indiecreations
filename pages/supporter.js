
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useEffect, useState } from 'react';
import { checkAccess } from '../utils/checkAccess';

export default function Supporter() {
  const { publicKey, connected } = useWallet();
  const [access, setAccess] = useState(false);

  useEffect(() => {
    if (publicKey) {
      checkAccess(publicKey).then(setAccess);
    }
  }, [publicKey]);

  return (
    <div style={{ padding: 40 }}>
      <h1>Supporter Portal</h1>

      {!connected && <WalletMultiButton />}

      {connected && !access && <p>You need 0.5% of supply.</p>}

      {access && <a href="/playtest">Enter Playtest</a>}
    </div>
  );
}
