import { readPlayerWallet } from '../../../lib/session';
import { ownsSku, voiceUsedToday, logVoice, VOICE_PER_DAY } from '../../../lib/buddy';

// POST { kind: 'journal' | 'greet', summary } -> { ok, text }: the Inner Voice (a premium service in Don't Worry,
// You're Safe!). The buddy writes a short journal entry about the session, or says hello when you come back.
//
// The Anthropic key (ANTHROPIC_API_KEY) lives only in the server's environment. The game never sends a prompt: it sends
// numbers and item ids, which are checked against a fixed shape here and turned into a plain summary, so the route
// can't be used as a free general-purpose chatbot. Only a wallet that owns the Inner Voice can use it, within a daily
// allowance (BUDDY_VOICE_PER_DAY).

const MODEL = 'claude-haiku-4-5-20251001';
const KINDS = ['journal', 'greet'];
const MOODS = ['calm', 'happy', 'curious', 'wary', 'scared', 'angry', 'sulking', 'sleepy', 'hurt', 'playful'];
const ENVS = { env_room: 'the gray room', env_kitchen: 'the kitchen', env_lab: 'the laboratory', env_moon: 'the moon base', env_volcano: 'the volcano' };
const COUNTERS = {
  hits: 'times it was hit',
  explosions: 'explosions it was caught in',
  shots: 'times it was shot',
  burns: 'times it caught fire',
  gassed: 'times it was gassed',
  zapped: 'times it was electrocuted',
  frozen: 'times it was frozen solid',
  trapsHit: 'times a trap got it',
  limbsLost: 'limbs it lost (they grew back)',
  knockouts: 'times it was knocked out',
  disasters: 'disasters it lived through',
  fed: 'times it was fed',
  petted: 'times it was petted',
  healed: 'times it was patched up',
  played: 'times it played with a toy',
  naps: 'naps it took',
};

const int = (v, max = 1_000_000) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(max, Math.floor(Number(v)))) : 0);
const ids = (v, n) =>
  (Array.isArray(v) ? v : [])
    .filter((s) => typeof s === 'string' && /^[a-z0-9_]{1,24}$/.test(s))
    .slice(0, n)
    .map((s) => s.replace(/^env_/, '').replace(/_/g, ' '));

function describe(s) {
  const name = typeof s.name === 'string' && /^[A-Za-z0-9 '_-]{1,16}$/.test(s.name) ? s.name.trim() : 'Buddy';
  const lines = [
    `Your name: ${name}.`,
    `Days you have known the hand: ${int(s.day, 10_000)}.`,
    `How much you trust the hand, 0 to 100: ${int(s.trust, 100)}.`,
    `How you feel right now: ${MOODS.includes(s.mood) ? s.mood : 'calm'}.`,
    `Where you are: ${ENVS[s.env] || ENVS.env_room}.`,
  ];
  const today = s.today && typeof s.today === 'object' ? s.today : {};
  const counts = Object.entries(COUNTERS)
    .map(([k, label]) => [int(today[k]), label])
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${label}: ${n}`);
  lines.push(counts.length ? `Since last time: ${counts.join('; ')}.` : 'Since last time: nothing much happened.');
  const worst = ids(s.worst, 3);
  if (worst.length) lines.push(`What hurt you most: ${worst.join(', ')}.`);
  const learned = ids(s.learned, 5);
  if (learned.length) lines.push(`Things you have learned to be afraid of: ${learned.join(', ')}.`);
  const loves = ids(s.loves, 3);
  if (loves.length) lines.push(`Things you like: ${loves.join(', ')}.`);
  return { name, text: lines.join('\n') };
}

function systemPrompt(kind, mature) {
  return [
    "You are the inner voice of a small, soft, hopeful gray creature in a video game called Don't Worry, You're Safe!",
    'It lives in a room with a couch, a crate and a fridge. A giant hand (the player, always called "the hand" or "you") visits,',
    'sometimes to feed and pet it, and very often to hit, burn, shoot and blow it up. It heals every time. It remembers everything.',
    'Voice: first person, short simple sentences, childlike, sincere, a little funny without meaning to be. It wants to trust the hand.',
    'Low trust makes it guarded and hurt; high trust makes it warm, even after bad days. Never mention games, players, AI, or rules.',
    mature
      ? 'It may mention bruises, blood and losing limbs plainly, without graphic detail.'
      : 'Keep it gentle: bumps and bruises, never blood or gore.',
    kind === 'greet'
      ? 'Write ONE line (at most 20 words) it says out loud when the hand comes back. No quotation marks.'
      : 'Write a private journal entry of 2 to 4 short sentences (at most 70 words) about today. No title, no date, no quotation marks.',
    'Use only the facts given. Plain text only.',
  ].join(' ');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const wallet = await readPlayerWallet(req.cookies);
  if (!wallet) return res.status(401).json({ ok: false, error: 'Sign in with your wallet first.' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ ok: false, error: 'The Inner Voice is resting. Try again later.' });

  const { kind, summary } = req.body || {};
  if (!KINDS.includes(kind) || !summary || typeof summary !== 'object') {
    return res.status(400).json({ ok: false, error: 'Invalid request.' });
  }

  try {
    if (!(await ownsSku(wallet, 'buddy.inner_voice'))) {
      return res.status(403).json({ ok: false, error: 'The Inner Voice is in the shop under Services.' });
    }
    if ((await voiceUsedToday(wallet)) >= VOICE_PER_DAY) {
      return res.status(429).json({ ok: false, error: 'Your buddy has said enough for today. It will write again tomorrow.' });
    }

    const { text: facts } = describe(summary);
    const ai = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: kind === 'greet' ? 60 : 200,
        temperature: 0.9,
        system: systemPrompt(kind, summary.mature === true),
        messages: [{ role: 'user', content: facts }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!ai.ok) {
      console.error('inner voice: anthropic', ai.status, (await ai.text()).slice(0, 300));
      return res.status(502).json({ ok: false, error: 'Your buddy lost its train of thought. Try again.' });
    }
    const data = await ai.json();
    const text = (data.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/^["“]|["”]$/g, '')
      .trim()
      .slice(0, 600);
    if (!text) return res.status(502).json({ ok: false, error: 'Your buddy lost its train of thought. Try again.' });

    await logVoice(wallet, kind);
    return res.status(200).json({ ok: true, kind, text });
  } catch (err) {
    console.error('inner voice failed:', err);
    return res.status(500).json({ ok: false, error: 'Your buddy lost its train of thought. Try again.' });
  }
}
