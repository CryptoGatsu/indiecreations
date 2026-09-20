import { SESSION_COOKIE, readSessionToken } from '../../lib/session';
import { ACTIVE_BUILD } from '../../lib/build';
import { saveReview, listReviews } from '../../lib/feedbackStore';

// Reviews are kept in Supabase when it is configured (see lib/feedbackStore.js), in memory otherwise.

const MAX_LENGTH = 2000;

export default async function handler(req, res) {
  if (req.method === 'POST') {
    // Only verified holders can post; the wallet comes from the session, not the body.
    const session = await readSessionToken(req.cookies[SESSION_COOKIE]);
    if (!session) return res.status(401).json({ error: 'Verify your wallet first.' });

    if (!ACTIVE_BUILD) return res.status(409).json({ error: 'No build is live to review.' });

    const { rating, feedback } = req.body || {};
    const text = typeof feedback === 'string' ? feedback.trim() : '';
    const stars = Number(rating);

    if (!text || text.length > MAX_LENGTH) {
      return res.status(400).json({ error: `Review must be 1-${MAX_LENGTH} characters.` });
    }
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({ error: 'Rating must be 1-5.' });
    }

    try {
      await saveReview({
        wallet: session.address,
        game: `${ACTIVE_BUILD.name} ${ACTIVE_BUILD.version}`,
        rating: stars,
        feedback: text,
      });
    } catch (err) {
      console.error('saving review failed:', err);
      return res.status(502).json({ error: 'Could not save your review. Please try again.' });
    }

    return res.status(200).json({ success: true });
  }

  if (req.method === 'GET') {
    try {
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
      return res.status(200).json(await listReviews());
    } catch (err) {
      console.error('loading reviews failed:', err);
      return res.status(200).json([]);
    }
  }

  return res.status(405).end();
}
