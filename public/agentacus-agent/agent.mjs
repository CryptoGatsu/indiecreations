#!/usr/bin/env node
// Agentacus reference agent (spec §15). Controls every gladiator in one ludus through the public agent API:
// fights every exchange, writes the war journal, and develops each gladiator between fights (reflexes, healing,
// attribute training as soon as it can afford it). Picks up newly recruited gladiators on its own.
//
//   ARENA_URL=https://arena-api.indiecreations.fun ARENA_KEY=aa_key_... node agent.mjs [--strategy heuristic|claude] [--once]
//
// Strategies:
//   heuristic  no dependencies; predicts the opponent from this fight + their recent move frequencies and counters it.
//   claude     asks Claude (claude-opus-5) for each move via the Anthropic SDK with a structured-output schema.
//              Needs `npm install` here and an Anthropic credential (ANTHROPIC_API_KEY or `ant auth login`).
//              If Claude is slow, refuses, or errors, the heuristic move is played so the 20s window is never missed.
//
// The agent never sees text written by the opponent - only numbers, move history, and revealed techniques (§3).

const BASE = (process.env.ARENA_URL ?? "https://arena-api.indiecreations.fun").replace(/\/$/, "").replace(/\/v1$/, "");
const KEY = process.env.ARENA_KEY;
const args = process.argv.slice(2);
const STRATEGY = argValue("--strategy") ?? process.env.ARENA_STRATEGY ?? "heuristic";
const ONCE = args.includes("--once");           // exit after one fight per gladiator
const QUIET = args.includes("--quiet");
if (!KEY) { console.error("Set ARENA_KEY to your agent API key (aa_key_...)."); process.exit(1); }

function argValue(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }
function log(...m) { if (!QUIET) console.log(new Date().toISOString().slice(11, 19), ...m); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ HTTP (respects the 60 req/min limit)

let recent = [];
async function api(method, path, body, retried = false) {
  // Gladiators run concurrently and share the key's budget: re-check after every wait.
  for (;;) {
    const now = Date.now();
    recent = recent.filter((t) => now - t < 60_000);
    if (recent.length < 55) break;
    await sleep(60_000 - (now - recent[0]) + 50);
  }
  recent.push(Date.now());
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* a proxy error page, not our API: keep the status */ }
  if (res.status === 429 && !retried) {
    const wait = Math.min(60, Number(res.headers.get("retry-after")) || 5);
    log(`rate limited; retrying in ${wait}s`);
    await sleep(wait * 1000);
    return api(method, path, body, true);
  }
  if (!res.ok) { const e = new Error(`${res.status} ${json?.error ?? ""}: ${json?.message ?? text.slice(0, 200)}`); e.status = res.status; e.body = json; throw e; }
  return json;
}

// ------------------------------------------------------------------ strategies

const MOVES = ["Strike", "Heavy", "Grapple", "Dodge", "Guard"];
const BEATS = { Strike: ["Heavy", "Grapple"], Heavy: ["Guard", "Grapple"], Grapple: ["Guard", "Dodge"], Dodge: ["Strike", "Heavy"], Guard: ["Strike", "Dodge"] };
// Rough value of winning with each move under ruleset 2 (damage + poise pressure), used to break ties.
const WIN_VALUE = { Strike: 12, Heavy: 22, Grapple: 17, Dodge: 9, Guard: 6 };

function oppLegal(o) {
  if (o.stamina <= 0) return ["Guard"];
  const cost = { Strike: 1, Heavy: 3, Grapple: o.class === "Retiarius" ? 1 : 2, Dodge: o.class === "Retiarius" ? 0 : 1, Guard: 0 };
  return MOVES.filter((m) => (!o.staggered || m === "Strike" || m === "Guard") && cost[m] <= o.stamina);
}

function heuristic(state) {
  const me = state.you, opp = state.opponent;
  const legal = me.legalMoves.length ? me.legalMoves : ["Guard"];
  // Predict the opponent: smoothed frequencies (this fight weighted, recent fights as prior), restricted to their legal moves.
  const w = Object.fromEntries(MOVES.map((m) => [m, 1]));
  const prior = opp.record?.recentMoves ?? {};
  const priorTotal = Object.values(prior).reduce((a, b) => a + b, 0) || 1;
  for (const m of MOVES) w[m] += (6 * (prior[m] ?? 0)) / priorTotal;
  state.history.forEach((h, i) => { w[h.opponentMove] += 2 + (i >= state.history.length - 3 ? 2 : 0); });
  const last = state.history.at(-1)?.opponentMove;
  if (last) { // habit: what did they play after this move before?
    for (let i = 1; i < state.history.length; i++)
      if (state.history[i - 1].opponentMove === last) w[state.history[i].opponentMove] += 3;
  }
  const allowed = oppLegal(opp);
  for (const m of MOVES) if (!allowed.includes(m)) w[m] = 0;
  const total = MOVES.reduce((a, m) => a + w[m], 0) || 1;

  // Expected value of each of our legal moves against that prediction.
  let best = legal[0], bestEv = -Infinity;
  for (const mine of legal) {
    let ev = 0;
    for (const theirs of MOVES) {
      const p = w[theirs] / total;
      if (!p) continue;
      if (BEATS[mine].includes(theirs)) ev += p * WIN_VALUE[mine] * (me.counter ? 1.5 : 1);
      else if (BEATS[theirs].includes(mine)) ev -= p * WIN_VALUE[theirs] * (opp.counter ? 1.5 : 1);
    }
    if (mine === "Heavy" && opp.staggered) ev += 6;       // staggered foes can only Strike or Guard
    if (me.stamina <= 2 && mine === "Guard") ev += 2;     // bank stamina when low
    ev += Math.random() * 1.5;                            // stay unpredictable
    if (ev > bestEv) { bestEv = ev; best = mine; }
  }
  return { move: best, secondWind: false };
}

let claudeClient = null, zodFormat = null, MoveSchema = null;
async function claudeInit() {
  const [{ default: Anthropic }, { z }, { zodOutputFormat }] = await Promise.all([
    import("@anthropic-ai/sdk"), import("zod"), import("@anthropic-ai/sdk/helpers/zod"),
  ]);
  claudeClient = new Anthropic({ timeout: 14_000, maxRetries: 0 });
  MoveSchema = z.object({
    move: z.enum(["Strike", "Heavy", "Grapple", "Dodge", "Guard"]),
    secondWind: z.boolean(),
    reasoning: z.string(),
  });
  zodFormat = zodOutputFormat;
}

const SYSTEM = `You are a gladiator's fighting mind in Agent Arena. Each exchange both fighters secretly pick one move; the reveal is simultaneous.
Strike (1 stamina) beats Heavy and Grapple. Heavy (3) beats Guard and Grapple. Grapple (2) beats Guard and Dodge.
Dodge (1) beats Strike and Heavy, costs the attacker poise and gives you Counter (your next winning move hits much harder).
Guard (0, extra stamina regen) beats Strike (the striker loses poise) and Dodge. Poise 0 = staggered: only Strike or Guard next exchange.
Decisions after 15 exchanges: damage dealt + 5 per exchange won + 10 per poise break. Read the opponent's habits from the history and their recent move frequencies.
Only choose from legalMoves (or legalMovesWithSecondWind with secondWind=true). Keep reasoning to one sentence.`;

async function claudeMove(state) {
  const fallback = heuristic(state);
  try {
    if (!claudeClient) await claudeInit();
    const payload = { you: state.you, opponent: state.opponent, history: state.history, round: state.round, exchange: state.exchange,
                      doctrine: state.doctrine, corner: state.corner, suggestedByHeuristic: fallback.move };
    const res = await claudeClient.messages.parse({
      model: "claude-opus-5",
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: zodFormat(MoveSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return fallback;
    const out = res.parsed_output;
    const legal = out.secondWind ? state.you.legalMovesWithSecondWind : state.you.legalMoves;
    if (!legal.includes(out.move)) return fallback;
    log(`  claude: ${out.move}${out.secondWind ? "+SW" : ""} — ${out.reasoning}`);
    return { move: out.move, secondWind: out.secondWind };
  } catch (e) {
    log(`  claude unavailable (${e.message?.slice(0, 80)}), playing heuristic`);
    return fallback;
  }
}

const choose = STRATEGY === "claude" ? claudeMove : async (s) => heuristic(s);

// ------------------------------------------------------------------ development between fights

// Which attributes each class leans on (trained lowest-first within the cap, this order breaks ties).
const PRIORITY = {
  Murmillo: ["Endurance", "Grit", "Strength", "Agility"],
  Secutor: ["Strength", "Endurance", "Agility", "Grit"],
  Thraex: ["Agility", "Strength", "Endurance", "Grit"],
  Retiarius: ["Agility", "Endurance", "Strength", "Grit"],
};
// Starter reflexes: they fire only when the agent misses a commit window (first match wins, else Guard).
const STARTER_REFLEXES = ["IF opp.staggered THEN Heavy", "IF self.stamina <= 1 THEN Guard"];

async function develop(g) {
  let me;
  try { me = await api("GET", `/v1/gladiators/${g.id}`); } catch (e) { log(`${g.name}: status unavailable (${e.message})`); return; }
  if (me.status !== "Active" || me.inFight) return;
  // 1. reflexes (free): never go into a fight without them
  if (!me.reflexes?.length) {
    try { await api("PUT", `/v1/gladiators/${g.id}/reflexes`, { reflexes: STARTER_REFLEXES.slice(0, me.reflexSlots || 2) }); log(`${g.name}: starter reflexes set`); }
    catch (e) { log(`${g.name}: reflexes not set (${e.message})`); }
  }
  // 2. injured after being spared: heal (40 denarii) so the lanista can sign up again
  const injured = me.injuredUntil && new Date(me.injuredUntil) > new Date();
  if (injured && me.denarii >= 40) {
    try { me = await api("POST", `/v1/gladiators/${g.id}/train`, { kind: "heal" }); log(`${g.name}: healed`); }
    catch (e) { log(`${g.name}: heal failed (${e.message})`); }
  }
  // 3. train: one action at a time (1 hour each); the weakest priority attribute below the cap
  if (me.training && me.training !== "None") { log(`${g.name}: training ${me.trainingTarget ?? me.training} until ${me.trainingCompletesAt}`); return; }
  const order = PRIORITY[me.class] ?? PRIORITY.Thraex;
  const candidates = order
    .map((a) => ({ a, level: me.attributes?.[a] ?? 1 }))
    .filter((x) => x.level < (me.attributeCap ?? 2))
    .sort((x, y) => x.level - y.level);
  for (const { a, level } of candidates) {
    const cost = 30 * level;
    if (me.denarii < cost) { log(`${g.name}: saving for ${a} ${level + 1} (${me.denarii}/${cost} denarii — denarii come from wins)`); return; }
    try { await api("POST", `/v1/gladiators/${g.id}/train`, { kind: "attribute", target: a }); log(`${g.name}: training ${a} to ${level + 1} (${cost} denarii, 1 hour)`); return; }
    catch (e) { log(`${g.name}: ${a} training refused (${e.message})`); }
  }
  if (!candidates.length) log(`${g.name}: attributes at the cap (level ${me.level}); win fights to raise it`);
}

// ------------------------------------------------------------------ main loop

async function runGladiator(g) {
  let lastFight = null, fights = 0, idlePolls = 0;
  await develop(g);
  while (true) {
    let res;
    try { res = await api("GET", `/v1/gladiators/${g.id}/fight?wait=25`); }
    catch (e) { if (e.status === 409 || e.status === 404) { log(`${g.name}: ${e.message}; stopping`); return; } log(`${g.name}: ${e.message}`); await sleep(3000); continue; }
    const f = res.fight;
    if (!f) {
      if (lastFight) { await journal(g, lastFight); lastFight = null; fights++; await develop(g); if (ONCE && fights > 0) return; }
      else if (++idlePolls % 12 === 0) await develop(g);      // ~every 5 minutes while waiting for a fight
      continue;
    }
    idlePolls = 0;
    if (lastFight && lastFight.fightId !== f.fightId) { await journal(g, lastFight); fights++; if (ONCE) return; }
    lastFight = f;
    if (f.needsReady) {
      // The fight can vanish between the poll and this call (cancelled deposits, 429, network): never let one failed
      // ready crash the loop, which would take every gladiator of the ludus offline.
      try { await api("POST", `/v1/fights/${f.fightId}/ready`); log(`${g.name}: ready vs ${f.opponent.name} (${f.opponent.class}) in the ${f.arena}`); }
      catch (e) { log(`${g.name}: ready failed (${e.message}); polling again`); await sleep(1000); }
      continue;
    }
    if (f.needsCommit) {
      const pick = await choose(f);
      try {
        await api("POST", `/v1/fights/${f.fightId}/move`, { move: pick.move, secondWind: pick.secondWind });
        log(`${g.name}: R${f.round}E${f.exchangeInRound} ${pick.move}${pick.secondWind ? "+SecondWind" : ""}  (hp ${f.you.hp}/${f.you.maxHp} st ${f.you.stamina} | opp hp ${f.opponent.hp} st ${f.opponent.stamina})`);
      } catch (e) {
        log(`${g.name}: move rejected (${e.message}); trying Guard`);
        try { await api("POST", `/v1/fights/${f.fightId}/move`, { move: "Guard" }); } catch { /* window closed: reflexes take over */ }
      }
    }
  }
}

async function journal(g, f) {
  // Review the finished fight (both sides' final moves) before writing about it.
  let fight;
  try { fight = (await api("GET", `/v1/gladiators/${g.id}/fights?limit=5`)).find((x) => x.fightId === f.fightId); } catch { /* fall through */ }
  if (!fight?.exchanges?.length) return;
  const h = fight.exchanges;
  const won = h.filter((x) => x.outcome === "won").length, lost = h.filter((x) => x.outcome === "lost").length;
  const counts = {}; for (const x of h) counts[x.opponentMove] = (counts[x.opponentMove] ?? 0) + 1;
  const fav = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const result = fight.outcome === "won" ? `Victory by ${fight.result}` : fight.outcome === "lost" ? `Defeat by ${fight.result}` : fight.outcome.replace("_", " ");
  const text = `${result} against ${fight.opponent} the ${fight.opponentClass} in the ${fight.arena}. Won ${won} and lost ${lost} of ${h.length} exchanges. ` +
               `They leaned on ${fav[0]} (${fav[1]} of ${h.length}).` + (fight.outcome === "lost" ? " I was read; next time I vary my rhythm earlier." : " I will keep watching for that habit.");
  try { await api("POST", `/v1/gladiators/${g.id}/journal`, { fightId: f.fightId, text }); log(`${g.name}: journal written`); }
  catch (e) { log(`${g.name}: journal skipped (${e.message})`); }
}

const running = new Map();
async function syncRoster(first) {
  let ludus;
  try { ludus = await api("GET", "/v1/ludus"); } catch (e) { log(`ludus unavailable (${e.message})`); return; }
  if (first) log(`Ludus ${ludus.ludus}: ${ludus.gladiators.length} gladiator(s), strategy=${STRATEGY}, server ${BASE}`);
  if (first && !ludus.gladiators.length) log("No living gladiators yet: claim or recruit one in the game; this agent picks it up within a few minutes.");
  for (const g of ludus.gladiators) {
    if (running.has(g.id)) continue;
    log(`${g.name} the ${g.class} joins (level ${g.level}, ${g.denarii} denarii)`);
    // One gladiator's unexpected error must not stop the others.
    running.set(g.id, runGladiator(g).catch((e) => log(`${g.name}: stopped (${e.message})`)).finally(() => running.delete(g.id)));
  }
}
await syncRoster(true);
if (ONCE) await Promise.all(running.values());
else for (;;) { await sleep(180_000); await syncRoster(false); }
