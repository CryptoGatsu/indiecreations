import { isGameId } from '../../../../lib/creations';
import { codeLines, getGame, listVersions, presenceStats, statsFor } from '../../../../lib/creationStore';
import { canManage, isPublic } from '../../../../lib/creators';

// GET -> the numbers under a game: who is playing it, how much, and how it was made (the prompts behind each version,
// unless its creator has hidden them). Public games for everyone; drafts for their owner and the studio. The studio
// page asks with ?owner=1, which is never cached, so the owner always sees their own prompts.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { id } = req.query;
  try {
    if (!isGameId(id)) return res.status(404).json({ error: 'Game not found.' });
    const game = await getGame(id);
    if (!game) return res.status(404).json({ error: 'Game not found.' });
    const asOwner = req.query.owner === '1';
    const { owner, admin } = asOwner || !isPublic(game) ? await canManage(req, game) : { owner: false, admin: false };
    const manager = owner || admin;
    if (!isPublic(game) && !manager) return res.status(404).json({ error: 'Game not found.' });

    const showPrompts = game.show_prompts !== false || manager;
    const [all, lines, versions] = await Promise.all([
      presenceStats(id),
      codeLines(id, game.version),
      showPrompts ? listVersions(id) : null,
    ]);
    const live = statsFor(all, id);
    const plays = Number(game.plays) || 0;

    res.setHeader('Cache-Control', asOwner || manager ? 'private, no-store' : 'public, max-age=0, s-maxage=15, stale-while-revalidate=30');
    return res.status(200).json({
      now: live.now,
      day: live.day,
      players: live.players,
      plays,
      minutes: live.minutes,
      avgMinutes: live.players ? Math.round((live.minutes / live.players) * 10) / 10 : 0,
      versions: game.versions,
      liveVersion: game.version,
      lines,
      createdAt: game.created_at,
      updatedAt: game.updated_at,
      promptsHidden: !showPrompts,
      // oldest first; the server keeps the newest 20 versions, so the first prompt always comes from the game itself
      prompts: versions && {
        first: game.prompt,
        firstKept: versions.length ? versions[versions.length - 1].version : null,
        list: [...versions].reverse(),
      },
    });
  } catch (err) {
    console.error('creation stats failed:', err);
    return res.status(500).json({ error: 'Could not load the stats.' });
  }
}
