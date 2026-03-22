
import { useWallet } from '@solana/wallet-adapter-react';
import { useState } from 'react';

export default function Playtest() {
  const { publicKey, signMessage } = useWallet();
  const [feedback, setFeedback] = useState('');

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

      <iframe src="/game/index.html" width="100%" height="600px" />

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
