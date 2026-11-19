// Putt Daily audio: everything synthesized with Web Audio, no files.
// Safe to call anything before unlockAudio() or without AudioContext.

const LS_MUSIC = 'puttdaily.music';
const LS_SFX = 'puttdaily.sfx';

let ctx = null;
let master = null, sfxBus = null, musicBus = null, ambBus = null;
let noiseBuf = null;
let unlocked = false;

function loadFlag(key) {
  try { const v = localStorage.getItem(key); return v === null ? true : v !== '0'; } catch (e) { return true; }
}
function saveFlag(key, v) {
  try { localStorage.setItem(key, v ? '1' : '0'); } catch (e) { /* ignore */ }
}
let musicOn = loadFlag(LS_MUSIC);
let sfxOn = loadFlag(LS_SFX);

export function isMusicOn() { return musicOn; }
export function isSfxOn() { return sfxOn; }

function applyGains() {
  if (!ctx) return;
  const t = ctx.currentTime;
  musicBus.gain.setTargetAtTime(musicOn ? 0.5 : 0, t, 0.05);
  sfxBus.gain.setTargetAtTime(sfxOn ? 1 : 0, t, 0.05);
  ambBus.gain.setTargetAtTime(sfxOn ? 1 : 0, t, 0.3);
}

export function setMusicOn(v) { musicOn = !!v; saveFlag(LS_MUSIC, musicOn); applyGains(); }
export function setSfxOn(v) { sfxOn = !!v; saveFlag(LS_SFX, sfxOn); applyGains(); }

export function unlockAudio() {
  try {
    if (unlocked) { if (ctx && ctx.state !== 'running' && !document.hidden) ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.3; musicBus.connect(master);
    ambBus = ctx.createGain(); ambBus.gain.value = 0.5; ambBus.connect(master);
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    unlocked = true;
    if (ctx.state === 'suspended') ctx.resume();
    applyGains();
    startAmbience();
    if (wantTrack >= 0) startScheduler();
  } catch (e) { ctx = null; unlocked = false; }
}

document.addEventListener('visibilitychange', () => {
  try {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  } catch (e) { /* ignore */ }
});

// ---------- helpers ----------
const clamp01 = (x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 1));

function env(g, t, a, peak, dur) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.01, dur));
}

function tone(type, f0, f1, t, dur, vol, dest, a = 0.003) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, a, vol, dur);
  o.connect(g); g.connect(dest || sfxBus);
  o.start(t); o.stop(t + dur + 0.05);
  return o;
}

function noise(t, dur, vol, ftype, f0, f1, q, dest, a = 0.003) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true;
  f.type = ftype; f.Q.value = q || 1;
  f.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, a, vol, dur);
  s.connect(f); f.connect(g); g.connect(dest || sfxBus);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}

// ---------- sfx ----------
const lastPlayed = {};
const MIN_GAP = { wall: 0.04, bumper: 0.05, putt: 0.05, lip: 0.08, ui: 0.03, sand: 0.1 };

const SFX = {
  putt(t, k) {
    const v = 0.25 + 0.55 * k;
    tone('sine', 300 + 150 * k, 120, t, 0.09, v);
    noise(t, 0.03, 0.15 * v, 'bandpass', 1800, 900, 1.5);
  },
  wall(t, k) {
    const v = 0.2 + 0.5 * k;
    tone('triangle', 180 + 60 * k, 90, t, 0.1, v);
    tone('sine', 420, 260, t, 0.05, v * 0.4);
    noise(t, 0.02, 0.2 * v, 'bandpass', 1200, 600, 2);
  },
  bumper(t, k) {
    const v = 0.3 + 0.4 * k;
    tone('sine', 220, 620, t, 0.18, v);
    tone('triangle', 440, 1240, t, 0.12, v * 0.3);
    tone('sine', 620, 330, t + 0.12, 0.14, v * 0.4);
  },
  sand(t, k) {
    noise(t, 0.28, 0.25 + 0.3 * k, 'lowpass', 2400, 500, 0.7, null, 0.04);
  },
  water(t, k) {
    const v = 0.4 + 0.3 * k;
    tone('sine', 300, 900, t, 0.12, v);
    tone('sine', 500, 1300, t + 0.07, 0.1, v * 0.5);
    noise(t + 0.05, 0.55, 0.35, 'bandpass', 3000, 700, 0.8, null, 0.03);
  },
  lip(t) {
    for (let i = 0; i < 6; i++) {
      const tt = t + i * (0.07 + i * 0.012), v = 0.35 * Math.pow(0.78, i);
      tone('triangle', 1500 - i * 60, 1300 - i * 60, tt, 0.07, v);
      tone('sine', 2900 - i * 90, 2700, tt, 0.05, v * 0.4);
    }
  },
  cup(t) {
    tone('triangle', 1100, 1000, t, 0.06, 0.4);
    tone('triangle', 800, 740, t + 0.12, 0.07, 0.4);
    tone('sine', 140, 70, t + 0.3, 0.25, 0.7);
    noise(t + 0.3, 0.06, 0.25, 'lowpass', 900, 400, 1);
  },
  applause(t, k) { clap(t, 1.6, 22, 0.28 + 0.1 * k, 1); },
  cheer(t) {
    clap(t, 2.8, 50, 0.35, 1.6);
    noise(t, 2.2, 0.35, 'bandpass', 1000, 1500, 1.2, null, 0.25);
    for (const f of [520, 700, 880]) tone('sawtooth', f, f * 1.15, t + 0.05, 1.5, 0.05, null, 0.2);
  },
  groan(t) {
    // formant-ish "ohh": noise through two resonant bandpasses falling in pitch
    const dur = 1.1;
    for (const [f0, f1, v] of [[500, 380, 0.5], [900, 650, 0.3]]) {
      noise(t, dur, v, 'bandpass', f0, f1, 7, null, 0.2);
    }
    tone('sawtooth', 190, 120, t, dur, 0.05, null, 0.2);
  },
  ui(t) { tone('square', 1400, 1000, t, 0.03, 0.12); },
  thunder(t, k) {
    noise(t, 0.25, 0.35 * k, 'lowpass', 1800, 300, 0.7, ambBus, 0.01);
    noise(t + 0.05, 3.2, 0.7 * k, 'lowpass', 180, 50, 0.9, ambBus, 0.12);
    noise(t + 0.6, 2.4, 0.4 * k, 'lowpass', 120, 40, 0.9, ambBus, 0.3);
  },
};

function clap(t, dur, count, vol, spread) {
  for (let i = 0; i < count; i++) {
    const tt = t + Math.random() * dur * 0.85;
    const fall = 1 - (tt - t) / dur * 0.6;
    noise(tt, 0.04, vol * (0.3 + Math.random() * 0.4) * fall * spread * 0.6, 'bandpass',
      1200 + Math.random() * 2200, 900, 1.2);
  }
}

export function sfx(name, intensity = 1) {
  try {
    if (!ctx || !sfxOn || ctx.state !== 'running') return;
    const fn = SFX[name];
    if (!fn) return;
    const now = ctx.currentTime;
    const gap = MIN_GAP[name] || 0.05;
    if (lastPlayed[name] !== undefined && now - lastPlayed[name] < gap) return;
    lastPlayed[name] = now;
    fn(now + 0.005, clamp01(intensity));
  } catch (e) { /* ignore */ }
}

// ---------- ambience ----------
// Follows the live weather: birds by day in fair weather, crickets on clear
// nights, rain hiss when wet, a stronger breeze when windy.
let ambTimer = null;
let breezeGain = null, rainGain = null, rainFilter = null;
let wxAmb = { birds: true, crickets: false, rain: 0, wind: 0.2 };

let lastWx = null;
export function setWeatherAmbience(w) {
  if (!w) return;
  lastWx = w;
  const wet = { drizzle: 0.35, rain: 0.7, heavy: 1, storm: 1 }[w.kind] || 0;
  const fair = w.kind === 'clear' || w.kind === 'partly' || w.kind === 'cloudy';
  wxAmb = {
    birds: fair && !w.night,
    crickets: fair && w.night && (w.tempC == null || w.tempC > 8),
    rain: wet,
    wind: Math.min(1, (w.windKmh || 0) / 45),
  };
  if (!ctx || !breezeGain) return;
  const t = ctx.currentTime;
  breezeGain.gain.setTargetAtTime(0.035 + wxAmb.wind * 0.11, t, 1.5);
  rainGain.gain.setTargetAtTime(wxAmb.rain * 0.22, t, 1.5);
}

function startAmbience() {
  // rain: wide filtered noise, silent until the weather says otherwise
  {
    const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    hp.type = 'highpass'; hp.frequency.value = 900;
    lp.type = 'lowpass'; lp.frequency.value = 7000;
    g.gain.value = 0;
    s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(ambBus);
    s.start(0, 0.7);
    rainGain = g; rainFilter = lp;
  }
  // breeze
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true;
  f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.6;
  g.gain.value = 0.05;
  breezeGain = g;
  const lfo = ctx.createOscillator(), lg = ctx.createGain();
  lfo.frequency.value = 0.12; lg.gain.value = 0.03;
  lfo.connect(lg); lg.connect(g.gain);
  const lfo2 = ctx.createOscillator(), lg2 = ctx.createGain();
  lfo2.frequency.value = 0.08; lg2.gain.value = 200;
  lfo2.connect(lg2); lg2.connect(f.frequency);
  s.connect(f); f.connect(g); g.connect(ambBus);
  s.start(); lfo.start(); lfo2.start();
  scheduleChirp();
  setWeatherAmbience(lastWx);
}

function scheduleChirp() {
  ambTimer = setTimeout(() => {
    try {
      if (ctx && ctx.state === 'running' && sfxOn && wxAmb.crickets) {
        const base = ctx.currentTime + 0.02;
        for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
          const tt = base + i * 0.06;
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.setValueAtTime(4300 + Math.random() * 200, tt);
          env(g, tt, 0.005, 0.03, 0.04);
          o.connect(g); g.connect(ambBus); o.start(tt); o.stop(tt + 0.06);
        }
      } else if (ctx && ctx.state === 'running' && sfxOn && wxAmb.birds) {
        const base = ctx.currentTime + 0.02;
        const n = 1 + Math.floor(Math.random() * 4);
        const f = 2200 + Math.random() * 1800;
        const up = Math.random() < 0.5;
        for (let i = 0; i < n; i++) {
          const tt = base + i * (0.09 + Math.random() * 0.04);
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(f * (up ? 0.8 : 1.2), tt);
          o.frequency.exponentialRampToValueAtTime(f * (up ? 1.2 : 0.8), tt + 0.07);
          env(g, tt, 0.01, 0.05, 0.08);
          o.connect(g); g.connect(ambBus);
          o.start(tt); o.stop(tt + 0.12);
        }
      }
    } catch (e) { /* ignore */ }
    scheduleChirp();
  }, 1500 + Math.random() * 5000);
}

// ---------- music ----------
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const MAJ = [0, 2, 4, 5, 7, 9, 11];
const MIN = [0, 2, 3, 5, 7, 8, 10];
const PENT = [0, 2, 4, 7, 9];
const DOR = [0, 2, 3, 5, 7, 9, 10];

// Each track: key root (midi), scale, bpm, chord roots (scale degrees) per bar, bars, seed, lead duty/wave
const TRACKS = [
  { root: 60, scale: MAJ, bpm: 96, bars: 16, seed: 11, prog: [0, 4, 5, 3, 0, 4, 3, 4], lead: 'square', rest: 0.25 },
  { root: 57, scale: MIN, bpm: 84, bars: 32, seed: 23, prog: [0, 5, 3, 4, 0, 5, 6, 4, 0, 3, 5, 4, 0, 5, 3, 4], lead: 'triangle', rest: 0.3 },
  { root: 55, scale: DOR, bpm: 108, bars: 16, seed: 37, prog: [0, 3, 0, 4, 0, 3, 6, 4], lead: 'square', rest: 0.2 },
  { root: 62, scale: PENT, bpm: 72, bars: 24, seed: 53, prog: [0, 0, 2, 3, 4, 3, 2, 0], lead: 'triangle', rest: 0.35 },
];

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function degToMidi(tr, deg) {
  const n = tr.scale.length;
  const oct = Math.floor(deg / n), i = ((deg % n) + n) % n;
  return tr.root + tr.scale[i] + 12 * oct;
}

function buildTrack(tr) {
  const r = rng(tr.seed);
  const steps = [];
  const sc = tr.scale.length;
  let deg = sc; // start an octave up
  const pro = tr.prog;
  // melody: per bar 8 eighth-note steps; phrases repeat every 4 bars with variation
  const phrases = {};
  for (let bar = 0; bar < tr.bars; bar++) {
    const chord = pro[bar % pro.length];
    const phraseKey = Math.floor(bar / 4) % 2 + '|' + (bar % 4);
    let notes = phrases[phraseKey];
    if (!notes || r() < 0.3) {
      notes = [];
      for (let s = 0; s < 8; s++) {
        if (s > 0 && r() < tr.rest) { notes.push(null); continue; }
        const strong = s % 4 === 0;
        if (strong) {
          const tones = [chord, chord + 2, chord + 4].map((d) => d + sc);
          deg = tones.reduce((best, d) => Math.abs(d - deg) < Math.abs(best - deg) ? d : best, tones[0]);
          if (r() < 0.3) deg = tones[Math.floor(r() * 3)];
        } else {
          deg += Math.floor(r() * 5) - 2;
        }
        deg = Math.max(sc - 2, Math.min(sc * 2 + 2, deg));
        notes.push(deg);
      }
      phrases[phraseKey] = notes;
    }
    for (let s = 0; s < 8; s++) {
      steps.push({
        lead: notes[s] === null ? null : degToMidi(tr, notes[s]),
        bass: s % 2 === 0 ? degToMidi(tr, chord - sc) : null,
        bassLen: 2,
        arp: s % 2 === 1 ? degToMidi(tr, chord + [2, 4, 7, 4][(s >> 1) % 4]) : null,
        hat: s % 2 === 1,
        kick: s === 0 || s === 4,
      });
    }
  }
  return steps;
}

let wantTrack = -1;
let cur = null, stepIdx = 0, nextTime = 0, schedTimer = null;

function playStep(tr, st, t, spb) {
  const d = spb; // eighth duration
  if (st.lead !== null) {
    tone(tr.lead, mtof(st.lead), 0, t, d * 0.9, 0.16, musicBus, 0.005);
  }
  if (st.bass !== null) tone('triangle', mtof(st.bass), 0, t, d * 1.8, 0.3, musicBus, 0.005);
  if (st.arp !== null) tone('square', mtof(st.arp), 0, t, d * 0.5, 0.05, musicBus, 0.003);
  if (st.hat) noise(t, 0.03, 0.08, 'highpass', 6000, 0, 1, musicBus, 0.001);
  if (st.kick) tone('sine', 120, 45, t, 0.12, 0.3, musicBus, 0.002);
}

function pump() {
  schedTimer = null;
  if (!ctx || !cur || wantTrack < 0) return;
  if (ctx.state === 'running') {
    const spb = 60 / cur.tr.bpm / 2;
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.2) {
      playStep(cur.tr, cur.steps[stepIdx], nextTime, spb);
      nextTime += spb;
      stepIdx = (stepIdx + 1) % cur.steps.length;
    }
  }
  schedTimer = setTimeout(pump, 40);
}

function startScheduler() {
  if (!ctx) return;
  if (schedTimer) clearTimeout(schedTimer);
  const tr = TRACKS[wantTrack];
  cur = { tr, steps: buildTrack(tr) };
  stepIdx = 0;
  nextTime = ctx.currentTime + 0.1;
  pump();
}

export function startMusic(dayNumber) {
  try {
    const n = Math.floor(Number(dayNumber));
    const idx = (((Number.isFinite(n) ? n : 1) - 1) % 4 + 4) % 4;
    wantTrack = idx;
    if (ctx) startScheduler();
  } catch (e) { /* ignore */ }
}

export function stopMusic() {
  try {
    wantTrack = -1;
    cur = null;
    if (schedTimer) { clearTimeout(schedTimer); schedTimer = null; }
  } catch (e) { /* ignore */ }
}
