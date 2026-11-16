import { createSim, shoot, step, MAX_SPEED } from '../shared/physics.js';
import { generateCourse, dayNumber, dateOfDay } from '../shared/daily.js';
import { W, H, createInput } from './input.js';
import { buildLayer, drawFrame } from './render.js';
import { drawResult, resultLabel, MAX_STROKES } from './hud.js';
import { unlockAudio, sfx, startMusic, setMusicOn, setSfxOn, isMusicOn, isSfxOn } from './audio.js';
import * as store from './store.js';
import { drawPlayHud, drawTitle, drawCard, drawArchive, fmtDiff, ROW_H, VIEW_H } from './screens.js';

const SITE = 'https://putt.parbs.online';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function fit() {
  const s = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
  canvas.style.width = W * s + 'px';
  canvas.style.height = H * s + 'px';
}
addEventListener('resize', fit);
fit();

// ---- state
let screen = 'title';              // title | play | card | archive
let ui = [];                       // buttons from the last drawn frame
let run = null, course = null, hole = null, sim = null, layer = null;
let result = null, resultAt = 0, lipped = false, swallow = false;
let card = null, copiedAt = -1e9, scroll = 0, note = '', noteAt = 0;
const courses = new Map();

function courseFor(day) {
  if (!courses.has(day)) courses.set(day, generateCourse(day));
  return courses.get(day);
}
const parTotal = c => c.holes.reduce((a, h) => a + h.par, 0);
const today = () => dayNumber();

// ---- audio (first pointerdown unlocks; nothing plays before)
let unlocked = false;
addEventListener('pointerdown', () => {
  if (unlocked) return;
  unlocked = true;
  try { unlockAudio(); startMusic(today()); } catch (_) {}
}, true);
const ui_sfx = () => { try { sfx('ui'); } catch (_) {} };
const play = (n, i) => { try { sfx(n, Math.max(0, Math.min(1, i))); } catch (_) {} };

// ---- runs
function startRun(day, mode) {
  course = courseFor(day);
  run = { day, mode, idx: 0, strokes: [], shots: [] };
  store.saveRun(mode, run);
  enterHole(); screen = 'play';
}
function resumeRun(r) {
  run = r; course = courseFor(r.day);
  enterHole(); screen = 'play';
}

function enterHole() {
  hole = course.holes[run.idx];
  sim = createSim(hole);
  layer = buildLayer(hole);
  result = null; lipped = false;
  try {
    for (const s of run.shots) {           // rebuild mid-hole progress after a reload
      shoot(sim, s);
      let k = 0;
      while (sim.state === 'moving' && k++ < 200000) step(sim);
    }
  } catch (_) { run.shots = []; sim = createSim(hole); }
  checkFinish(true);
}

function checkFinish(silent, now = performance.now()) {
  if (result) return;
  const holed = sim.state === 'holed';
  if (!(holed || (sim.state === 'rest' && sim.strokes >= MAX_STROKES))) return;
  const n = Math.min(sim.strokes, MAX_STROKES);
  const last = run.idx >= 8;
  run.strokes.push(n); run.shots = []; run.idx++;
  result = { label: resultLabel(n, hole.par, holed), final: last, strokes: n };
  resultAt = now;
  if (last) {
    const pt = parTotal(course);
    store.recordRun(run.day, run.mode, run.strokes, pt);
    store.saveRun(run.mode, null);
    card = { day: run.day, mode: run.mode, strokes: run.strokes.slice(), course };
  } else store.saveRun(run.mode, run);
  if (!silent && holed) {
    if (n === 1) play('cheer', 1);
    else if (n <= hole.par) play('applause', 1);
  }
}

function onEvents(evs) {
  for (const e of evs) {
    const i = (e.speed || 0) / MAX_SPEED;
    if (e.type === 'holed') { lipped = false; play('cup', i); }
    else if (e.type === 'lip') { lipped = true; play('lip', i); }
    else if (e.type === 'stop') { if (lipped && sim.state !== 'holed') play('groan', 1); lipped = false; }
    else if (e.type === 'wall' || e.type === 'bumper' || e.type === 'sand' || e.type === 'water') play(e.type, i);
  }
}

function goCard() { screen = 'card'; }
function cardState() {
  const c = card.course, scored = card.mode === 'daily';
  return {
    day: card.day, course: c.name, practice: !scored, strokes: card.strokes, pars: c.holes.map(h => h.par),
    streak: store.streak(today()), nick: store.getNick(),
    copied: performance.now() - copiedAt < 1500,
  };
}

// ---- share
function shareText(day, strokes, pars) {
  const t = strokes.reduce((a, b) => a + b, 0), d = t - pars.reduce((a, b) => a + b, 0);
  const sq = strokes.map((s, i) => { const x = s - pars[i]; return x < 0 ? '\u{1F7E6}' : x === 0 ? '\u{1F7E9}' : x === 1 ? '\u{1F7E8}' : '\u{1F7E5}'; });
  return 'Putt Daily #' + day + ' · ' + t + ' (' + fmtDiff(d) + ')\n' + sq.join('') + '\n' + SITE;
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.className = 'offscreen';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (ok) return true;
  } catch (_) {}
  try { prompt('Copy your result:', text); } catch (_) {}
  return false;
}

// ---- nickname overlay (DOM, CSP-safe)
const nickBox = document.getElementById('nick');
const nickForm = document.getElementById('nickform');
const nickInput = document.getElementById('nickinput');
const nickMsg = document.getElementById('nickmsg');
let nickDone = null;
function askNick(cb) {
  nickDone = cb; nickMsg.textContent = '3-16 letters, digits, space, _ or -';
  nickBox.hidden = false; nickInput.value = store.getNick(); nickInput.focus();
}
nickForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!store.validNick(nickInput.value)) { nickMsg.textContent = 'Use 3-16 letters, digits, space, _ or -'; return; }
  store.setNick(nickInput.value); nickBox.hidden = true;
  const cb = nickDone; nickDone = null; if (cb) cb();
});
document.getElementById('nickcancel').addEventListener('click', () => { nickBox.hidden = true; nickDone = null; });

// ---- actions
function doPlay() {
  const d = today(), r = store.loadRun('daily');
  if (r) return resumeRun(r);
  const sc = store.getScored(d);
  if (sc) {
    const c = courseFor(d);
    card = { day: d, mode: 'daily', strokes: sc.s.slice(), course: c };
    return goCard();
  }
  if (!store.getNick()) return askNick(() => startRun(d, 'daily'));
  startRun(d, 'daily');
}
function doPractice(day) {
  const r = store.loadRun('practice');
  if (r && r.day === day) return resumeRun(r);
  startRun(day, 'practice');
}

function archiveDays() {
  const out = [];
  for (let n = today(); n >= 1; n--) out.push({ n, date: dateOfDay(n), best: store.getBest(n), scored: !!store.getScored(n) });
  return out;
}
const maxScroll = () => Math.max(0, today() * ROW_H - VIEW_H);

function click(id) {
  ui_sfx();
  if (id === 'menu') { screen = 'title'; scroll = 0; }
  else if (id === 'play') doPlay();
  else if (id === 'practice') doPractice(today());
  else if (id === 'again') doPractice(card.day);
  else if (id === 'archive') { screen = 'archive'; scroll = 0; }
  else if (id === 'music') setMusicOn(!isMusicOn());
  else if (id === 'sound') setSfxOn(!isSfxOn());
  else if (id === 'copy') {
    const c = card.course;
    copyText(shareText(card.day, card.strokes, c.holes.map(h => h.par))).then(ok => {
      copiedAt = performance.now(); if (!ok) copiedAt = -1e9;
    });
  } else if (id.startsWith('day:')) doPractice(Number(id.slice(4)));
}

// ---- pointer handling for the non-play screens
function pos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}
const hit = p => { for (let i = ui.length - 1; i >= 0; i--) { const b = ui[i]; if (p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h) return b.id; } return null; };
let press = null;
canvas.addEventListener('pointerdown', e => {
  const p = pos(e);
  if (screen === 'play') {
    const id = hit(p);
    if (id === 'menu') { swallow = true; click('menu'); }
    return;
  }
  press = { id: e.pointerId, sx: p.x, sy: p.y, ly: p.y, moved: 0 };
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
});
canvas.addEventListener('pointermove', e => {
  if (!press || e.pointerId !== press.id) return;
  const p = pos(e);
  press.moved = Math.max(press.moved, Math.abs(p.x - press.sx) + Math.abs(p.y - press.sy));
  if (screen === 'archive') scroll = Math.max(0, Math.min(maxScroll(), scroll - (p.y - press.ly)));
  press.ly = p.y;
});
canvas.addEventListener('pointerup', e => {
  swallow = false;
  if (!press || e.pointerId !== press.id) return;
  const p = pos(e), moved = press.moved; press = null;
  if (moved < 5) { const id = hit(p); if (id) click(id); }
});
canvas.addEventListener('pointercancel', () => { press = null; swallow = false; });
canvas.addEventListener('wheel', e => {
  if (screen === 'archive') { e.preventDefault(); scroll = Math.max(0, Math.min(maxScroll(), scroll + e.deltaY)); }
}, { passive: false });

const input = createInput(canvas, {
  canAim: () => screen === 'play' && !swallow && !result && sim.state === 'rest',
  onShot: s => {
    shoot(sim, s); run.shots.push(s); store.saveRun(run.mode, run);
    play('putt', s.p / 1000);
  },
  onTap: () => {
    if (screen !== 'play' || swallow || !result || performance.now() - resultAt < 350) return;
    ui_sfx();
    if (result.final) goCard(); else enterHole();
  },
});

// ---- frame loop
const DT = 1000 / 120;
let acc = 0, last = performance.now();

function titleState() {
  const d = today(), c = courseFor(d), sc = store.getScored(d), dr = store.loadRun('daily'), pr = store.loadRun('practice');
  let line = 'Today: not played yet', n = '';
  if (sc) line = 'Today: ' + sc.t + ' (' + fmtDiff(sc.t - sc.p) + ')';
  else if (dr) line = 'Round in progress: hole ' + (dr.idx + 1) + '/9';
  if (dr && dr.day !== d) n = 'Finishing Day ' + dr.day + ' (counts for that day)';
  return {
    day: d, courseName: c.name, todayLine: line, todayDone: !!sc, streak: store.streak(d), nick: store.getNick(), note: n,
    playLabel: dr ? 'Continue' : sc ? 'Scorecard' : 'Play',
    practiceLabel: pr && pr.day === d ? 'Practice*' : 'Practice',
    music: isMusicOn(), sfx: isSfxOn(),
  };
}

function frame(now) {
  acc += Math.min(100, now - last);
  last = now;
  ui = [];
  if (screen === 'play') {
    while (acc >= DT) {
      acc -= DT;
      if (sim.state === 'moving') onEvents(step(sim));
    }
    checkFinish(false, now);
    drawFrame(ctx, layer, hole, sim, input.aim(), now);
    const shown = result ? run.idx : run.idx + 1;   // run.idx already advanced once the hole is done
    drawPlayHud(ctx, ui, { hole: shown, name: hole.name || hole.id, par: hole.par, strokes: sim.strokes, practice: run.mode === 'practice' });
    if (result) drawResult(ctx, result.label, result.final ? 'Tap for scorecard' : 'Tap for next hole');
  } else {
    acc = 0;
    if (screen === 'title') drawTitle(ctx, ui, titleState());
    else if (screen === 'card') drawCard(ctx, ui, cardState());
    else if (screen === 'archive') drawArchive(ctx, ui, { days: archiveDays(), scroll });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
