// Browser-only: online multiplayer for community games. A game has no network of its own (it runs sandboxed), so the
// page around it relays: the game calls window.IC.net (the runtime in lib/creationAI.js), the runtime posts to this
// page, and this page talks to Supabase Realtime (broadcast + presence; no database tables are involved).
//
//   rooms     cg:<game id>:v<version>:<CODE>   one channel per room; presence = who is in it
//   lobby     cg:<game id>:v<version>:lobby    players in quick-match rooms say which room they are in, so the next
//                                              player can fill an open room before a new one is made
// Rooms joined with a code (an invite link) are kept out of the lobby: only people with the code find them.
// The host is the player who has been in the room longest; it changes when they leave.
//
// Trust: players can only reach other players of the same game version, and every message is size- and rate-limited
// here, but a determined player could still send anything through Realtime directly. Nothing of value may depend on a
// community game's multiplayer outcome.
import { createClient } from '@supabase/supabase-js';

// The project's public (anon) key: made for browsers. Every table has row level security with no policies, so this
// key can't read or write any data; it only opens Realtime channels.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kqystkgquuvrrlfqwhrf.supabase.co';
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxeXN0a2dxdXV2cnJsZnF3aHJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4NjM3MDcsImV4cCI6MjEwNTQzOTcwN30.1R0-6zJF_ZneSOfKUXr8Hj-DgGc2G5AELwGVuKoMxtM';

export const MAX_PLAYERS = 8;
const MAX_MESSAGE_BYTES = 8 * 1024;
const MAX_PER_SECOND = 20;
const LOBBY_WAIT_MS = 900;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
export const newRoomCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
export const isRoomCode = (s) => /^[A-HJ-NP-Z2-9]{5}$/.test(s || '');

// ------------------------------------------------------------------------------------------------- transports
// { open(name, key, onMessage, onPresence) -> { send(payload), track(meta), leave() } }. onPresence(list of metas).

let supabase = null;
const supabaseTransport = {
  open(name, key, onMessage, onPresence) {
    supabase ||= createClient(URL, KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 40 } },
    });
    const ch = supabase.channel(name, { config: { broadcast: { self: false }, presence: { key } } });
    let ready;
    const subscribed = new Promise((resolve, reject) => (ready = { resolve, reject }));
    ch.on('broadcast', { event: 'm' }, ({ payload }) => onMessage(payload));
    ch.on('presence', { event: 'sync' }, () => onPresence(Object.values(ch.presenceState()).map((metas) => metas[0])));
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') ready.resolve();
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') ready.reject(new Error(status));
    });
    return {
      subscribed,
      send: (payload) => ch.send({ type: 'broadcast', event: 'm', payload }),
      track: (meta) => ch.track(meta),
      leave: () => supabase.removeChannel(ch),
    };
  },
};

// Development and tests: tabs of the same browser talk over BroadcastChannel (NEXT_PUBLIC_NET_TRANSPORT=local).
const localTransport = {
  open(name, key, onMessage, onPresence) {
    const bc = new BroadcastChannel(name);
    const peers = new Map(); // key -> { meta, at }
    let mine = null;
    const emit = () => onPresence([...peers.values()].map((p) => p.meta));
    const prune = () => {
      let changed = false;
      for (const [k, p] of peers) if (k !== key && Date.now() - p.at > 2500) changed = peers.delete(k) || changed;
      if (changed) emit();
    };
    bc.onmessage = ({ data }) => {
      if (data.kind === 'm') onMessage(data.payload);
      if (data.kind === 'here' && data.key !== key) {
        const fresh = !peers.has(data.key);
        peers.set(data.key, { meta: data.meta, at: Date.now() });
        if (fresh) {
          emit();
          if (mine) bc.postMessage({ kind: 'here', key, meta: mine });
        }
      }
      if (data.kind === 'bye' && peers.delete(data.key)) emit();
    };
    const beat = setInterval(() => {
      if (mine) bc.postMessage({ kind: 'here', key, meta: mine });
      prune();
    }, 700);
    return {
      subscribed: Promise.resolve(),
      send: (payload) => bc.postMessage({ kind: 'm', payload }),
      track: (meta) => {
        mine = meta;
        peers.set(key, { meta, at: Date.now() });
        emit();
        bc.postMessage({ kind: 'here', key, meta });
      },
      leave: () => {
        clearInterval(beat);
        bc.postMessage({ kind: 'bye', key });
        bc.close();
      },
    };
  },
};

const transport = () => (process.env.NEXT_PUBLIC_NET_TRANSPORT === 'local' ? localTransport : supabaseTransport);

// ------------------------------------------------------------------------------------------------------ relay
// One per game frame. toGame(msg) posts to the game; onState({ room, players, host, me, public }) tells the page.
export function createNetRelay({ gameId, version, player, roomHint, toGame, onState }) {
  const base = `cg:${gameId}:v${version}`;
  let room = null; // { code, public, channel, lobby, players, host }
  let joining = null;
  let sentThisSecond = 0;
  let second = 0;

  const say = (ev, data) => toGame({ source: 'ic-page', type: 'net', ev, ...data });
  const sortPlayers = (metas) =>
    metas
      .filter((m) => m && m.id)
      .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1))
      .map((m) => ({ id: m.id, name: m.name }));
  const publish = () =>
    onState?.(room ? { room: room.code, public: room.public, players: room.players, host: room.host, me: player.id } : null);

  async function findOpenRoom(max) {
    // look at who is in quick-match rooms right now, and pick the fullest one that still has space
    let counts = {};
    const lobby = transport().open(`${base}:lobby`, player.id, () => {}, (metas) => {
      counts = {};
      for (const m of metas) if (m && m.room && m.id !== player.id) counts[m.room] = (counts[m.room] || 0) + 1;
    });
    await lobby.subscribed;
    await new Promise((r) => setTimeout(r, LOBBY_WAIT_MS));
    const open = Object.entries(counts)
      .filter(([, n]) => n < max)
      .sort((a, b) => b[1] - a[1]);
    return { code: open.length ? open[0][0] : newRoomCode(), lobby };
  }

  // fresh: skip the lobby and open a new quick-match room (the one we picked filled up first)
  async function join({ room: asked, maxPlayers, fresh = false } = {}) {
    const max = Math.max(2, Math.min(MAX_PLAYERS, Number(maxPlayers) || MAX_PLAYERS));
    if (room) leave(false);
    const code = fresh ? null : isRoomCode(asked) ? asked : isRoomCode(roomHint) ? roomHint : null;
    let lobby = null;
    let chosen = code;
    if (fresh) {
      chosen = newRoomCode();
      lobby = transport().open(`${base}:lobby`, player.id, () => {}, () => {});
      await lobby.subscribed;
    } else if (!chosen) ({ code: chosen, lobby } = await findOpenRoom(max));
    const me = { id: player.id, name: player.name, at: Date.now() };

    const r = { code: chosen, public: !code, players: [], host: null, max, lobby };
    let first = true;
    r.channel = transport().open(
      `${base}:${chosen}`,
      player.id,
      (payload) => {
        if (!payload || payload.f === player.id) return;
        say('message', { msgType: payload.t, data: payload.d, from: payload.f });
      },
      (metas) => {
        r.players = sortPlayers(metas);
        r.host = r.players[0]?.id || null;
        if (room !== r) return;
        if (first && r.players.some((p) => p.id === player.id)) {
          first = false;
          // a quick-match room that filled up while we were joining: take a fresh room instead
          if (r.public && r.players.length > r.max && r.players[r.players.length - 1].id === player.id) {
            leave(false);
            join({ maxPlayers: max, fresh: true });
            return;
          }
          say('joined', { room: r.code, me: player.id, players: r.players, host: r.host });
        } else if (!first) {
          say('players', { players: r.players, host: r.host });
        }
        publish();
      }
    );
    room = r;
    await r.channel.subscribed;
    await r.channel.track(me);
    if (r.public && lobby) await lobby.track({ id: player.id, room: chosen });
    else if (lobby) lobby.leave();
  }

  function leave(tell = true) {
    if (!room) return;
    const r = room;
    room = null;
    try { r.channel.leave(); } catch {}
    try { r.lobby?.leave(); } catch {}
    if (tell) say('left', {});
    publish();
  }

  function send(msgType, data) {
    if (!room) return;
    const now = Math.floor(Date.now() / 1000);
    if (now !== second) { second = now; sentThisSecond = 0; }
    if (++sentThisSecond > MAX_PER_SECOND) return; // too chatty: dropped
    let json;
    try { json = JSON.stringify(data ?? null); } catch { return; }
    if (typeof msgType !== 'string' || msgType.length > 40 || json.length > MAX_MESSAGE_BYTES) return;
    room.channel.send({ t: msgType, d: JSON.parse(json), f: player.id });
  }

  return {
    // a message from the game's runtime: { op: 'join' | 'send' | 'leave', ... }
    handle(msg) {
      if (msg.op === 'join') {
        if (joining) return;
        joining = join({ room: msg.room, maxPlayers: msg.maxPlayers })
          .catch((err) => say('error', { message: `Could not join a room: ${err.message || err}` }))
          .finally(() => (joining = null));
      } else if (msg.op === 'send') send(msg.msgType, msg.data);
      else if (msg.op === 'leave') leave();
    },
    dispose: () => leave(false),
  };
}

// This tab's player: a random id kept for the session, and a name (the signed-in wallet, or "Player 1234").
export function netPlayer(wallet) {
  let id;
  try {
    id = sessionStorage.getItem('ic_net_id');
    if (!/^[a-z0-9]{12}$/.test(id || '')) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
      sessionStorage.setItem('ic_net_id', id);
    }
  } catch {
    id = Math.random().toString(36).slice(2, 14).padEnd(12, '0');
  }
  const name = wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : `Player ${parseInt(id.slice(0, 4), 36) % 10000}`;
  return { id, name };
}
