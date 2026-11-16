import { createSim, shoot, step, MAX_SPEED } from '../shared/physics.js';
import { generateCourse, dayNumber, dateOfDay } from '../shared/daily.js';
import { W, H, createInput } from './input.js';
import { buildLayer, drawFrame, buildTitleLayer, drawTitleScene, buildTrails, drawTrails } from './render.js';
import * as net from './net.js';
import * as wx from './weather.js';
import { drawResult, resultLabel, MAX_STROKES } from './hud.js';
import { unlockAudio, sfx, startMusic, setMusicOn, setSfxOn, isMusicOn, isSfxOn, setWeatherAmbience } from './audio.js';
import * as store from './store.js';
import { drawPlayHud, drawTitle, drawCard, drawArchive, drawSettings, drawBoard, fmtDiff, ROW_H, VIEW_H, BOARD_ROW, BOARD_VIEW } from './screens.js';

const SITE = 'https://putt.parbs.online';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// The backing store is k device pixels per world unit (k a whole number), so pixel
// edges stay crisp and text is drawn at the screen's real resolution.
let K = 1;
function fit() {
  const dpr = window.devicePixelRatio || 1;
  const k = Math.max(1, Math.min(8, Math.floor(Math.min(innerWidth * dpr / W, innerHeight * dpr / H))));
  if (k !== K || canvas.width !== W * k) {
    K = k;
    canvas.width = W * k; canvas.height = H * k;
    if (hole) layer = buildLayer(hole, K);
    titleLayer = null;
  }
  canvas.style.width = (W * k / dpr) + 'px';
  canvas.style.height = (H * k / dpr) + 'px';
}
addEventListener('resize', fit);

// ---- state
let screen = 'title';              // title | play | card | archive
let ui = [];                       // buttons from the last drawn frame
let run = null, course = null, hole = null, sim = null, layer = null;
let result = null, resultAt = 0, lipped = false, swallow = false;
let card = null, copiedAt = -1e9, scroll = 0, note = '', noteAt = 0;
const courses = new Map();
let titleLayer = null;
fit();

// ---- weather (looks and sounds only)
wx.setThunderHandler(() => play('thunder', 0.6 + Math.random() * 0.4));
const syncAmbience = () => { try { setWeatherAmbience(wx.current()); } catch (_) {} };
wx.refresh().then(syncAmbience);
setTimeout(retrySubmit, 1500);
addEventListener('online', retrySubmit);
setInterval(() => wx.refresh().then(syncAmbience), 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) wx.refresh().then(syncAmbience); });

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
  try { unlockAudio(); startMusic(today()); syncAmbience(); } catch (_) {}
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
  trails = null; trailsKey = '';
  hole = course.holes[run.idx];
  sim = createSim(hole);
  layer = buildLayer(hole, K);
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
  const holeNo = run.idx + 1, mine = run.shots.slice();
  run.holes = Array.isArray(run.holes) ? run.holes : [];
  run.holes[run.idx] = mine;
  run.strokes.push(n); run.shots = []; run.idx++;
  loadTrails(run.day, holeNo, hole, mine);
  result = { label: resultLabel(n, hole.par, holed), final: last, strokes: n };
  resultAt = now;
  if (last) {
    const pt = parTotal(course);
    store.recordRun(run.day, run.mode, run.strokes, pt, run.holes.length === 9 ? run.holes : null);
    store.saveRun(run.mode, null);
    card = { day: run.day, mode: run.mode, strokes: run.strokes.slice(), course };
    if (run.mode === 'daily') submitScored(run.day);
  } else store.saveRun(run.mode, run);
  if (!silent && holed) {
    if (n === 1) play('cheer', 1);
    else if (n <= hole.par) play('applause', 1);
  }
}

// ---- other players
let trails = null, trailsAt = 0, trailsKey = '';
function loadTrails(day, holeNo, h, mine) {
  const key = day + ':' + holeNo;
  trailsKey = key; trails = buildTrails(h, [{ shots: mine, mine: true }]); trailsAt = performance.now();
  net.getTrails(day, holeNo).then(r => {
    if (trailsKey !== key || !r.ok || !Array.isArray(r.body.trails)) return;
    trails = buildTrails(h, [...r.body.trails, { shots: mine, mine: true }]);
    trailsAt = performance.now();
  });
}

let submitting = false;
async function submitScored(day) {
  const sc = store.getScored(day);
  if (!sc || submitting) return;
  if (!Array.isArray(sc.h) || sc.h.length !== 9 || sc.h.some(x => !Array.isArray(x) || !x.length)) {
    if (!sc.sub) store.setSubmit(day, { err: 'old' });
    return;
  }
  if (day < today() - 1) { if (!sc.sub) store.setSubmit(day, { err: 'late' }); return; }
  submitting = true;
  const r = await net.submitRun(day, store.pid(), store.getNick(), sc.h);
  submitting = false;
  if (r.ok && r.body.ok) store.setSubmit(day, { rank: r.body.rank, of: r.body.of, humans: r.body.humans, better: r.body.better });
  else if (r.body.error === 'name') store.setSubmit(day, { err: 'name' });
  else if (r.status === 0 || r.status === 429 || r.status >= 500) store.setSubmit(day, { err: 'offline' });
  else store.setSubmit(day, { err: 'rejected' });
}
function retrySubmit() {
  for (const d of [today(), today() - 1]) {
    const sc = d >= 1 && store.getScored(d);
    if (sc && (!sc.sub || sc.sub.err === 'offline')) submitScored(d);
  }
}

let board = { day: 1, data: null, loading: false, scroll: 0, err: '' };
function openBoard(day) {
  screen = 'board';
  board = { day, data: null, loading: true, scroll: 0, err: '' };
  net.getBoard(day, store.pid()).then(r => {
    if (board.day !== day) return;
    board.loading = false;
    if (r.ok) board.data = r.body;
    else board.err = r.status === 0 ? 'Offline: the leaderboard needs a connection.' : 'Could not load the leaderboard.';
  });
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
    ...rankInfo(card.day, scored),
  };
}
function rankInfo(day, scored) {
  if (!scored) return { rankLine: '', rankSub: '' };
  const sc = store.getScored(day), sub = sc && sc.sub;
  if (!sub) return { rankLine: 'Sending to the leaderboard...', rankSub: '' };
  if (sub.rank) return {
    rankLine: 'Rank ' + sub.rank + ' of ' + sub.of,
    rankSub: sub.better != null ? 'Better than ' + sub.better + '% of players' : 'First player on the board today',
  };
  if (sub.err === 'name') return { rankLine: 'That name is not allowed on the board', rankSub: '', nameErr: true };
  if (sub.err === 'offline') return { rankLine: 'Offline: will send when connected', rankSub: '' };
  if (sub.err === 'old') return { rankLine: 'Played before the leaderboard opened', rankSub: '' };
  return { rankLine: 'Not on the leaderboard', rankSub: '' };
}

// ---- share
function shareText(day, strokes, pars) {
  const t = strokes.reduce((a, b) => a + b, 0), d = t - pars.reduce((a, b) => a + b, 0);
  const sq = strokes.map((s, i) => { const x = s - pars[i]; return x < 0 ? '\u{1F7E6}' : x === 0 ? '\u{1F7E9}' : x === 1 ? '\u{1F7E8}' : '\u{1F7E5}'; });
  const sc = store.getScored(day), sub = sc && sc.sub;
  const rank = sub && sub.rank ? ' · #' + sub.rank + ' of ' + sub.of : '';
  return 'Putt Daily #' + day + ' · ' + t + ' (' + fmtDiff(d) + ')' + rank + '\n' + sq.join('') + '\n' + SITE;
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
const boardMax = () => Math.max(0, ((board.data && board.data.entries.length) || 0) * BOARD_ROW - BOARD_VIEW);

function click(id) {
  ui_sfx();
  if (id === 'menu') { screen = 'title'; scroll = 0; }
  else if (id === 'play') doPlay();
  else if (id === 'practice') doPractice(today());
  else if (id === 'again') doPractice(card.day);
  else if (id === 'archive') { screen = 'archive'; scroll = 0; }
  else if (id === 'settings') screen = 'settings';
  else if (id === 'board') openBoard(screen === 'card' && card ? card.day : today());
  else if (id === 'board:prev') { if (board.day > 1) openBoard(board.day - 1); }
  else if (id === 'board:next') { if (board.day < today()) openBoard(board.day + 1); }
  else if (id === 'rename') askNick(() => { const d = card.day; store.setSubmit(d, null); submitScored(d); });
  else if (id === 'music') setMusicOn(!isMusicOn());
  else if (id === 'sound') setSfxOn(!isSfxOn());
  else if (id === 'copy') {
    const c = card.course;
    copyText(shareText(card.day, card.strokes, c.holes.map(h => h.par))).then(ok => {
      copiedAt = performance.now(); if (!ok) copiedAt = -1e9;
    });
  } else if (id.startsWith('day:')) doPractice(Number(id.slice(4)));
  else if (id.startsWith('wx:')) weatherClick(id.slice(3));
}

function weatherClick(a) {
  const m = wx.getMode(), P = wx.PREVIEWS;
  if (a === 'live' || a === 'off') wx.setMode(a);
  else if (a === 'prev' || a === 'next') {
    const i = P.indexOf(m);
    const j = i < 0 ? (a === 'next' ? 0 : P.length - 1) : (i + (a === 'next' ? 1 : P.length - 1)) % P.length;
    wx.setMode(P[j]);
  } else if (a === 'gps') {
    wx.useMyLocation().then(ok => { gpsNote = ok ? '' : 'Location not allowed'; syncAmbience(); });
    gpsNote = 'Asking for location...';
  } else if (a === 'forget') { wx.forgetLocation(); gpsNote = ''; }
  syncAmbience();
}
let gpsNote = '';
const PREVIEW_NAMES = { clear: 'Sunny', night: 'Night', partly: 'Partly cloudy', cloudy: 'Cloudy', fog: 'Fog', rain: 'Rain', heavy: 'Heavy rain', snow: 'Snow', storm: 'Thunderstorm', windy: 'Windy' };
function settingsState() {
  const m = wx.getMode(), src = wx.liveSource();
  let loc = src === 'gps' ? 'Using your phone location.' : src === 'ip' ? 'Rough area from your connection.' : 'Unknown, showing clear skies.';
  if (gpsNote) loc = gpsNote;
  return { music: isMusicOn(), sfx: isSfxOn(), mode: m, previewLabel: PREVIEW_NAMES[m] || m, gps: wx.hasGps(), locLine: loc };
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
  if (screen === 'board') board.scroll = Math.max(0, Math.min(boardMax(), board.scroll - (p.y - press.ly)));
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
  if (screen === 'board') { e.preventDefault(); board.scroll = Math.max(0, Math.min(boardMax(), board.scroll + e.deltaY)); }
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
  ctx.setTransform(K, 0, 0, K, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const kind = wx.current().kind;
  if (layer && layer.kind !== kind) layer = buildLayer(hole, K);
  if (screen === 'play') {
    while (acc >= DT) {
      acc -= DT;
      if (sim.state === 'moving') onEvents(step(sim));
    }
    checkFinish(false, now);
    drawFrame(ctx, layer, hole, sim, input.aim(), now);
    if (result && trails) drawTrails(ctx, trails, now - trailsAt);
    const shown = result ? run.idx : run.idx + 1;   // run.idx already advanced once the hole is done
    drawPlayHud(ctx, ui, { hole: shown, name: hole.name || hole.id, par: hole.par, strokes: sim.strokes, practice: run.mode === 'practice' });
    if (result) drawResult(ctx, result.label, result.final ? 'Tap for scorecard' : 'Tap for next hole', hole.cup.y);
  } else {
    acc = 0;
    if (!titleLayer || titleLayer.kind !== kind) titleLayer = buildTitleLayer(K);
    drawTitleScene(ctx, titleLayer, now);
    if (screen === 'title') drawTitle(ctx, ui, titleState());
    else if (screen === 'settings') drawSettings(ctx, ui, settingsState());
    else if (screen === 'board') drawBoard(ctx, ui, { ...board, today: today() });
    else if (screen === 'card') drawCard(ctx, ui, cardState());
    else if (screen === 'archive') drawArchive(ctx, ui, { days: archiveDays(), scroll });
  }
  requestAnimationFrame(frame);
}
try {
  const sq = new URLSearchParams(location.search).get('screen');
  if (sq === 'settings' || sq === 'archive') screen = sq;
  if (sq === 'board') openBoard(today());
  // ?dev=1: a tiny hook for automated playtests (the server replays every run, so it grants nothing).
  if (new URLSearchParams(location.search).has('dev')) window.__putt = {
    state: () => ({ screen, idx: run && run.idx, sim: sim && sim.state, result: !!result, trails: trails ? trails.length : 0, card: screen === 'card' ? cardState() : null }),
    play: doPlay,
    shoot: s => { shoot(sim, s); run.shots.push(s); store.saveRun(run.mode, run); },
    next: () => { if (result.final) goCard(); else enterHole(); },
    course: () => course,
  };
  const hq = Number(new URLSearchParams(location.search).get('hole'));
  if (hq >= 1 && hq <= 9) { startRun(today(), 'practice'); run.idx = hq - 1; enterHole(); }
} catch (_) {}
requestAnimationFrame(frame);
