import crypto from 'crypto';

// GET -> the PUBLIC half of GAME_TICKET_KEY as a PEM "PUBLIC KEY", plain text.
// Games compile this in to verify holder tickets and owned-cosmetics lists. The private key never leaves the server.
export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const b64 = process.env.GAME_TICKET_KEY;
  if (!b64) return res.status(503).json({ error: 'GAME_TICKET_KEY is not set.' });
  try {
    const key = crypto.createPrivateKey(Buffer.from(b64, 'base64').toString('utf8'));
    const pem = crypto.createPublicKey(key).export({ type: 'spki', format: 'pem' });
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(pem);
  } catch (err) {
    console.error('GAME_TICKET_KEY is not a valid key:', err);
    return res.status(500).json({ error: 'The signing key is not valid.' });
  }
}
