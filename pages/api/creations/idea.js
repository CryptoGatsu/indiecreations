import { aiConfigured, GenerationError, inventGameIdea } from '../../../lib/creationAI';
import { ideasToday, persistent, saveIdea, titleKey, usedTitles } from '../../../lib/creationStore';
import { creatorStatus, holderWallet } from '../../../lib/creators';

// POST { mode: 'single' | 'multi' } -> { title, prompt }: a random game idea nobody has made yet, for the
// "Make a random game" buttons on /create (the page then makes it like any other prompt). Every idea is recorded, and
// one whose title was already used (by a game or an earlier idea) is thrown away and asked for again.
const IDEAS_PER_DAY = Number(process.env.CREATIONS_IDEAS_PER_DAY || 30);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const wallet = await holderWallet(req);
  if (!wallet) return res.status(401).json({ error: 'Verify your wallet first.' });
  if (!aiConfigured()) return res.status(503).json({ error: 'Game creation is switched off right now.' });
  if (!persistent && process.env.NODE_ENV === 'production') return res.status(503).json({ error: 'Game creation is not set up yet.' });
  const mode = req.body?.mode === 'multi' ? 'multi' : 'single';

  try {
    // no point inventing a game the wallet can't make
    const status = await creatorStatus(wallet);
    if (status.games.length >= status.slots) {
      return res.status(403).json({ error: 'All your game slots are in use. Delete a game, or hold more $CREATIONS for another.' });
    }
    if (status.usedToday >= status.perDay) {
      return res.status(429).json({ error: `That's your ${status.perDay} generations for today. Come back tomorrow.` });
    }
    if ((await ideasToday(wallet, IDEAS_PER_DAY + 1)) >= IDEAS_PER_DAY) {
      return res.status(429).json({ error: 'That is a lot of random ideas for one day. Try writing your own!' });
    }

    const used = await usedTitles();
    const taken = new Set(used.map(titleKey));
    for (let attempt = 0; attempt < 3; attempt++) {
      const idea = await inventGameIdea({ mode, used });
      if (taken.has(titleKey(idea.title))) {
        used.unshift(idea.title);
        continue;
      }
      if (await saveIdea({ wallet, mode, ...idea })) return res.status(200).json({ mode, ...idea });
      used.unshift(idea.title); // someone else got the same title a moment ago
      taken.add(titleKey(idea.title));
    }
    return res.status(503).json({ error: 'Could not come up with a new idea right now. Try again.' });
  } catch (err) {
    if (err instanceof GenerationError) return res.status(503).json({ error: err.message });
    console.error('creation idea failed:', err);
    return res.status(500).json({ error: 'Could not come up with an idea right now. Try again.' });
  }
}
