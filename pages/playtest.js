import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { checkAccess } from '../utils/checkAccess';

export default function Playtest() {
  const { publicKey, connected, signMessage } = useWallet();
  const [feedback, setFeedback] = useState('');
  const [allowed, setAllowed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!connected) {
      router.push('/supporter');
      return;
    }

    if (publicKey) {
      checkAccess(publicKey).then((hasAccess) => {
        if (!hasAccess) {
          router.push('/supporter');
        } else {
          setAllowed(true);
        }
      });
    }
  }, [publicKey, connected]);

  if (!allowed) {
    return <p style={{ padding: 40 }}>Checking access...</p>;
  }

  const submit = async () => {
    if (!publicKey || !signMessage) return;

    const msg = `Feedback: ${feedback}`;
    const sig = await signMessage(new TextEncoder().encode(msg));

    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: publicKey.toString(),
        feedback,
        signature: Buffer.from(sig).toString('base64')
      })
    });

    alert('Submitted!');
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>Playtest</h1>

      <iframe
        src="/game/index.html"
        style={{ width: '100%', height: '80vh', border: 'none' }}
      />

      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Your feedback"
        style={{ width: '100%', height: 120 }}
      />

      <button onClick={submit}>Submit Feedback</button>
    </div>
  );
}