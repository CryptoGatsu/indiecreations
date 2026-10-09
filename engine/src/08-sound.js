// ------------------------------------------------------------------------------------------------------- sound
// Synthesised effects, generative music and ambient beds (Web Audio; starts on the first click, key or touch).
let actx = null;
let master = null;
let musicBus = null;
let sfxBus = null;
let ambBus = null;
let reverb = null;
function audio() {
  if (actx) return actx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  actx = new AC();
  master = actx.createGain();
  master.gain.value = 0.8;
  const comp = actx.createDynamicsCompressor();
  master.connect(comp).connect(actx.destination);
  // a small synthetic room
  reverb = actx.createConvolver();
  const len = actx.sampleRate * 2.2;
  const ir = actx.createBuffer(2, len, actx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  reverb.buffer = ir;
  const wet = actx.createGain();
  wet.gain.value = 0.22;
  reverb.connect(wet).connect(master);
  musicBus = actx.createGain();
  musicBus.gain.value = 0.35;
  musicBus.connect(master);
  musicBus.connect(reverb);
  sfxBus = actx.createGain();
  sfxBus.gain.value = 0.7;
  sfxBus.connect(master);
  ambBus = actx.createGain();
  ambBus.gain.value = 0.4;
  ambBus.connect(master);
  return actx;
}
const unlock = () => {
  const a = audio();
  if (a && a.state === 'suspended') a.resume();
};
['pointerdown', 'keydown', 'touchstart'].forEach((e) => addEventListener(e, unlock, { passive: true }));

let noiseBuf = null;
function noiseBuffer() {
  if (noiseBuf) return noiseBuf;
  const a = audio();
  noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function tone(type, f0, f1, dur, vol, bus = sfxBus, when = 0) {
  const a = audio();
  const t = a.currentTime + when;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(bus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}
function noiseHit(dur, vol, filter = 'lowpass', f0 = 2000, f1 = 200, when = 0) {
  const a = audio();
  const t = a.currentTime + when;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer();
  const fl = a.createBiquadFilter();
  fl.type = filter;
  fl.frequency.setValueAtTime(f0, t);
  fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl).connect(g).connect(sfxBus);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}
const SFX = {
  jump: (p) => tone('square', 220 * p, 520 * p, 0.18, 0.12),
  land: () => noiseHit(0.12, 0.25, 'lowpass', 600, 80),
  step: () => noiseHit(0.06, 0.08, 'bandpass', 900 + Math.random() * 400, 300),
  coin: (p) => {
    tone('square', 988 * p, 988 * p, 0.08, 0.1);
    tone('square', 1319 * p, 1319 * p, 0.25, 0.1, sfxBus, 0.07);
  },
  pickup: (p) => [523, 659, 784].forEach((f, i) => tone('triangle', f * p, f * p, 0.14, 0.14, sfxBus, i * 0.05)),
  powerup: (p) => [392, 494, 587, 784, 988].forEach((f, i) => tone('square', f * p, f * p * 1.02, 0.12, 0.08, sfxBus, i * 0.06)),
  hit: (p) => {
    noiseHit(0.15, 0.35, 'lowpass', 3000, 200);
    tone('sine', 160 * p, 60 * p, 0.15, 0.3);
  },
  hurt: (p) => tone('sawtooth', 300 * p, 90 * p, 0.3, 0.15),
  explosion: () => {
    noiseHit(1.2, 0.7, 'lowpass', 1800, 40);
    tone('sine', 90, 30, 0.8, 0.5);
  },
  laser: (p) => tone('sawtooth', 1400 * p, 180 * p, 0.2, 0.1),
  shoot: (p) => {
    noiseHit(0.12, 0.3, 'highpass', 4000, 800);
    tone('square', 400 * p, 120 * p, 0.1, 0.12);
  },
  swing: () => noiseHit(0.22, 0.25, 'bandpass', 600, 2400),
  whoosh: () => noiseHit(0.5, 0.2, 'bandpass', 300, 2000),
  click: (p) => tone('sine', 1200 * p, 900 * p, 0.04, 0.12),
  open: (p) => [440, 554, 659].forEach((f, i) => tone('sine', f * p, f * p, 0.25, 0.1, sfxBus, i * 0.04)),
  win: (p) => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone('square', f * p, f * p, 0.18, 0.09, sfxBus, i * 0.11)),
  lose: (p) => [392, 370, 330, 262].forEach((f, i) => tone('triangle', f * p, f * p * 0.98, 0.32, 0.14, sfxBus, i * 0.22)),
  magic: (p) => [880, 1175, 1568, 2093].forEach((f, i) => tone('sine', f * p, f * p * 1.5, 0.3, 0.06, sfxBus, i * 0.05)),
  splash: () => noiseHit(0.5, 0.35, 'lowpass', 2500, 300),
  bounce: (p) => tone('sine', 300 * p, 700 * p, 0.12, 0.2),
  engine: (p) => tone('sawtooth', 60 * p, 70 * p, 0.2, 0.06),
  bell: (p) => [1, 2.76, 5.4].forEach((m, i) => tone('sine', 660 * p * m, 660 * p * m, 1.2 / (i + 1), 0.08 / (i + 1))),
};

const SCALES = {
  calm: { root: 57, steps: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], tempo: 70, wave: 'triangle' },
  adventure: { root: 55, steps: [0, 2, 4, 5, 7, 9, 11], chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [-3, 0, 4]], tempo: 100, wave: 'triangle' },
  tense: { root: 52, steps: [0, 1, 3, 5, 7, 8, 10], chords: [[0, 3, 7], [1, 5, 8], [-2, 1, 5], [0, 3, 6]], tempo: 120, wave: 'sawtooth' },
  space: { root: 50, steps: [0, 2, 5, 7, 9], chords: [[0, 7, 14], [5, 12, 16], [-2, 5, 12], [3, 10, 14]], tempo: 60, wave: 'sine' },
  mystery: { root: 53, steps: [0, 2, 3, 5, 7, 8, 11], chords: [[0, 3, 7], [-4, 0, 3], [-1, 3, 7], [-5, -1, 2]], tempo: 75, wave: 'triangle' },
  upbeat: { root: 60, steps: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], tempo: 128, wave: 'square' },
};
let musicTimer = null;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
function music(style = 'adventure', o = {}) {
  stopMusic();
  if (!style || style === 'none') return;
  const a = audio();
  if (!a) return;
  const s = SCALES[style] || SCALES.adventure;
  const beat = 60 / (o.tempo || s.tempo);
  let bar = 0;
  let next = a.currentTime + 0.1;
  const r = rng(o.seed ?? 3);
  const pad = (note, t, dur) => {
    const osc = a.createOscillator();
    const fl = a.createBiquadFilter();
    const g = a.createGain();
    osc.type = s.wave === 'square' ? 'triangle' : 'sawtooth';
    osc.frequency.value = midi(note);
    osc.detune.value = (r() - 0.5) * 12;
    fl.type = 'lowpass';
    fl.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc.connect(fl).connect(g).connect(musicBus);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  };
  const pluck = (note, t, vol = 0.07) => {
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = s.wave;
    osc.frequency.value = midi(note);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 1.6);
    osc.connect(g).connect(musicBus);
    osc.start(t);
    osc.stop(t + beat * 1.7);
  };
  const schedule = () => {
    while (next < a.currentTime + 1.5) {
      const chord = s.chords[bar % s.chords.length];
      chord.forEach((n) => pad(s.root + n, next, beat * 4));
      pad(s.root + chord[0] - 12, next, beat * 4);
      for (let i = 0; i < 8; i++) {
        if (r() < (style === 'calm' || style === 'space' ? 0.35 : 0.6)) {
          const deg = s.steps[Math.floor(r() * s.steps.length)];
          pluck(s.root + 12 + deg + (r() < 0.2 ? 12 : 0), next + i * beat * 0.5, 0.05);
        }
      }
      if (style === 'tense' || style === 'upbeat' || style === 'adventure')
        for (let i = 0; i < 4; i++) {
          const t = next + i * beat;
          const osc = a.createOscillator();
          const g = a.createGain();
          osc.frequency.setValueAtTime(120, t);
          osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
          g.gain.setValueAtTime(i % 2 ? 0.08 : 0.18, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
          osc.connect(g).connect(musicBus);
          osc.start(t);
          osc.stop(t + 0.25);
        }
      next += beat * 4;
      bar++;
    }
  };
  schedule();
  musicTimer = setInterval(schedule, 400);
}
function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

let ambNodes = [];
// IC3D.sound.ambience('wind' | 'ocean' | 'rain' | 'forest' | 'cave' | 'fire' | 'space' | 'city' | 'none')
function ambience(kind = 'wind') {
  ambNodes.forEach((n) => {
    try {
      n.stop ? n.stop() : n.disconnect();
    } catch {}
  });
  ambNodes = [];
  if (!kind || kind === 'none') return;
  const a = audio();
  if (!a) return;
  const bed = (filter, freq, q, vol, lfoRate = 0.1, lfoDepth = 0.5) => {
    const src = a.createBufferSource();
    src.buffer = noiseBuffer();
    src.loop = true;
    const fl = a.createBiquadFilter();
    fl.type = filter;
    fl.frequency.value = freq;
    fl.Q.value = q;
    const g = a.createGain();
    g.gain.value = vol;
    const lfo = a.createOscillator();
    const lg = a.createGain();
    lfo.frequency.value = lfoRate;
    lg.gain.value = vol * lfoDepth;
    lfo.connect(lg).connect(g.gain);
    src.connect(fl).connect(g).connect(ambBus);
    src.start();
    lfo.start();
    ambNodes.push(src, lfo);
  };
  if (kind === 'wind') bed('bandpass', 500, 0.6, 0.5, 0.08, 0.8);
  if (kind === 'ocean') {
    bed('lowpass', 500, 0.5, 0.6, 0.12, 0.9);
    bed('highpass', 3000, 0.3, 0.06, 0.12, 0.9);
  }
  if (kind === 'rain') bed('highpass', 1800, 0.3, 0.35, 0.05, 0.2);
  if (kind === 'cave') bed('lowpass', 160, 1, 0.6, 0.05, 0.4);
  if (kind === 'fire') bed('bandpass', 1200, 0.4, 0.2, 3, 0.8);
  if (kind === 'space') {
    bed('lowpass', 90, 2, 0.5, 0.03, 0.5);
    const o = a.createOscillator();
    const g = a.createGain();
    o.frequency.value = 55;
    g.gain.value = 0.04;
    o.connect(g).connect(ambBus);
    o.start();
    ambNodes.push(o);
  }
  if (kind === 'city') bed('lowpass', 400, 0.4, 0.4, 0.07, 0.3);
  if (kind === 'forest') {
    bed('bandpass', 700, 0.5, 0.25, 0.08, 0.7);
    const chirp = () => {
      if (!ambNodes.length) return;
      const n = 2 + Math.floor(Math.random() * 4);
      const f = 2200 + Math.random() * 1800;
      for (let i = 0; i < n; i++) tone('sine', f, f * (1.1 + Math.random() * 0.3), 0.07, 0.03, ambBus, i * 0.09);
      const t = setTimeout(chirp, 1500 + Math.random() * 5000);
      ambNodes.push({ stop: () => clearTimeout(t) });
    };
    chirp();
  }
}

const sound = {
  // IC3D.sound.play(name, { volume, pitch }) — names: Object.keys(IC3D.sound.effects)
  play(name, o = {}) {
    const a = audio();
    if (!a || a.state !== 'running' || !SFX[name]) return;
    const prev = sfxBus.gain.value;
    if (o.volume !== undefined) sfxBus.gain.value = 0.7 * o.volume;
    SFX[name](o.pitch ?? 1);
    if (o.volume !== undefined) setTimeout(() => (sfxBus.gain.value = prev), 50);
  },
  effects: SFX,
  music,
  stopMusic,
  ambience,
  volume(v) {
    if (audio()) master.gain.value = v;
  },
  musicVolume(v) {
    if (audio()) musicBus.gain.value = v;
  },
  get context() {
    return audio();
  },
};
