import { ImageResponse } from 'next/og';
import { isGameId, tileColors } from '../../../../lib/creations';
import { getGame, getThumb, presenceStats, statsFor } from '../../../../lib/creationStore';
import { isPublic } from '../../../../lib/creators';
import { shortAddress } from '../../../../lib/config';

// GET -> the game's share card: a 1200x630 PNG with its cover, title, creator, how many players have played it and how
// many prompts made it. Link previews (og:image on /community/<id>) and the share button use it. Public games only.
const WIDTH = 1200;
const HEIGHT = 630;

// tileColors gives hsl(); the card renderer's gradients only take hex
function hex(hsl) {
  const [h, s, l] = hsl.match(/[\d.]+/g).map(Number);
  const k = (m) => (m + h / 30) % 12;
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (m) => Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k(m) - 3, 9 - k(m), 1))));
  return `#${[0, 8, 4].map((m) => f(m).toString(16).padStart(2, '0')).join('')}`;
}

const n = (v) => Number(v || 0).toLocaleString('en-US');

function Stat({ value, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '18px 28px', borderRadius: 20, background: 'rgba(255,255,255,0.14)', border: '2px solid rgba(255,255,255,0.22)' }}>
      <div style={{ fontSize: 54, lineHeight: 1, color: '#fff' }}>{value}</div>
      <div style={{ fontSize: 24, marginTop: 8, color: 'rgba(255,255,255,0.8)' }}>{label}</div>
    </div>
  );
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { id } = req.query;
  try {
    if (!isGameId(id)) return res.status(404).end();
    const game = await getGame(id);
    if (!isPublic(game)) return res.status(404).end();
    const [thumb, all] = await Promise.all([getThumb(id), presenceStats(id).catch(() => ({}))]);
    const players = statsFor(all, id).players;
    const prompts = Number(game.versions) || 1; // the first prompt plus one per change
    const [from, to] = Object.values(tileColors(id)).map(hex);
    const title = game.title.length > 48 ? `${game.title.slice(0, 46)}…` : game.title;

    const image = new ImageResponse(
      (
        <div style={{ width: WIDTH, height: HEIGHT, display: 'flex', position: 'relative', background: `linear-gradient(135deg, ${from}, ${to})`, fontFamily: 'sans-serif' }}>
          {thumb && (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img src={`data:image/jpeg;base64,${thumb.image}`} width={WIDTH} height={HEIGHT} style={{ position: 'absolute', top: 0, left: 0, width: WIDTH, height: HEIGHT, objectFit: 'cover' }} />
          )}
          <div style={{ position: 'absolute', top: 0, left: 0, width: WIDTH, height: HEIGHT, display: 'flex', background: 'linear-gradient(180deg, rgba(8,8,16,0.15) 0%, rgba(8,8,16,0.35) 40%, rgba(8,8,16,0.88) 100%)' }} />
          <div style={{ position: 'absolute', top: 40, left: 56, right: 56, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 28, color: '#fff' }}>
              <div style={{ width: 34, height: 34, marginRight: 14, display: 'flex', flexWrap: 'wrap', background: '#fff' }}>
                <div style={{ width: 17, height: 17, background: '#111' }} />
                <div style={{ width: 17, height: 17 }} />
                <div style={{ width: 17, height: 17 }} />
                <div style={{ width: 17, height: 17, background: '#111' }} />
              </div>
              Indie Creations
            </div>
            <div style={{ display: 'flex', fontSize: 24, color: '#fff', padding: '8px 18px', borderRadius: 999, background: 'rgba(8,8,16,0.55)' }}>Community game · made with Claude</div>
          </div>
          <div style={{ position: 'absolute', left: 56, right: 56, bottom: 48, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 76, lineHeight: 1.05, color: '#fff', letterSpacing: -1 }}>{title}</div>
            <div style={{ fontSize: 28, marginTop: 12, color: 'rgba(255,255,255,0.82)' }}>{`by ${shortAddress(game.owner)} · play it free at indiecreations.fun`}</div>
            <div style={{ display: 'flex', marginTop: 30, gap: 20 }}>
              <Stat value={n(players)} label={Number(players) === 1 ? 'player has played' : 'players have played'} />
              <Stat value={n(prompts)} label={prompts === 1 ? 'prompt to make it' : 'prompts to make it'} />
            </div>
          </div>
        </div>
      ),
      { width: WIDTH, height: HEIGHT }
    );
    const png = Buffer.from(await image.arrayBuffer());
    res.setHeader('Content-Type', 'image/png');
    // the URL carries the version and cover time, so only the numbers can go stale, and only by a few minutes
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600, stale-while-revalidate=86400');
    return res.status(200).send(png);
  } catch (err) {
    console.error('creation card failed:', err);
    return res.status(500).end();
  }
}
