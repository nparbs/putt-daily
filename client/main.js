import { createSim, shoot, step, MAX_SPEED, simulateShot } from '../shared/physics.js';
import { generateCourse, dayNumber, dateOfDay } from '../shared/daily.js';
import { W, H, createInput } from './input.js';
import { buildLayer, drawFrame, buildTitleLayer, drawTitleScene, buildTrails, drawTrails, OY } from './render.js';
import * as net from './net.js';
import * as wx from './weather.js';
import { drawResult, resultLabel, MAX_STROKES } from './hud.js';
import { unlockAudio, sfx, startMusic, setMusicOn, setSfxOn, isMusicOn, isSfxOn, setWeatherAmbience } from './audio.js';
import * as store from './store.js';
import { drawPlayHud, drawTitle, drawCard, drawArchive, drawSettings, drawBoard, drawShotHud, fmtDiff, ROW_H, VIEW_H, BOARD_ROW, BOARD_VIEW } from './screens.js';

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
function onGesture() {
  if (unlocked) { try { unlockAudio(); } catch (_) {} return; }   // resumes a suspended/interrupted context (iOS)
  unlocked = true;
  try { unlockAudio(); startMusic(today()); syncAmbience(); } catch (_) {}
}
for (const ev of ['pointerdown', 'pointerup', 'touchend']) addEventListener(ev, onGesture, true);

// Haptics (Android; iOS Safari has no vibrate). Follows the Effects switch.
function buzz(pattern) { try { if (isSfxOn() && navigator.vibrate) navigator.vibrate(pattern); } catch (_) {} }
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
  const rv = rivalFor(day), extra = rv ? [{ shots: rv.shots[holeNo - 1], rival: true }] : [];
  trailsKey = key; trails = buildTrails(h, [...extra, { shots: mine, mine: true }]); trailsAt = performance.now();
  net.getTrails(day, holeNo).then(r => {
    if (trailsKey !== key || !r.ok || !Array.isArray(r.body.trails)) return;
    trails = buildTrails(h, [...r.body.trails, ...extra, { shots: mine, mine: true }]);
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
  if (r.ok && r.body.ok) {
    store.setSubmit(day, { rank: r.body.rank, of: r.body.of, humans: r.body.humans, better: r.body.better, code: r.body.code || null });
    retryN = 0; loadAce();
  } else if (r.body.error === 'name') store.setSubmit(day, { err: 'name' });
  else if (r.status === 0 || r.status === 429 || r.status >= 500) {
    store.setSubmit(day, { err: 'offline' });
    clearTimeout(retryTimer);                       // try again later: 15 s, 45 s, 2 min, then every 5 min
    retryTimer = setTimeout(retrySubmit, [15e3, 45e3, 120e3][retryN++] || 300e3);
  } else store.setSubmit(day, { err: 'rejected' });
}
let retryN = 0, retryTimer = 0;
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
    if (e.type === 'holed') { lipped = false; play('cup', i); buzz([18, 50, 30]); }
    else if (e.type === 'water') { play('water', i); buzz(40); }
    else if ((e.type === 'wall' || e.type === 'bumper') && i > 0.35) { play(e.type, i); buzz(8); }
    else if (e.type === 'lip') { lipped = true; play('lip', i); }
    else if (e.type === 'stop') { if (lipped && sim.state !== 'holed') play('groan', 1); lipped = false; }
    else if (e.type === 'wall' || e.type === 'bumper' || e.type === 'sand' || e.type === 'water') play(e.type, i);
  }
}

function goCard() { screen = 'card'; }

// ---- challenge: a friend's run from a ?vs=<code> link
let rivalNote = '';
const rivalFor = day => { const r = store.getRival(); return r && r.day === day ? r : null; };
async function loadChallenge(code) {
  const r = await net.getChallenge(code, store.pid());
  if (!r.ok || !r.body || !Array.isArray(r.body.shots)) { rivalNote = 'That challenge link has expired or is wrong.'; noteAt = performance.now(); return; }
  if (r.body.self) { rivalNote = 'Your own challenge link: send it to a friend.'; noteAt = performance.now(); return; }
  const b = r.body;
  store.setRival({ code, day: b.day, nick: b.nick, total: b.total, par: b.par, diff: b.diff, strokes: b.strokes, shots: b.shots });
}
function vsText(total, rv) {
  const d = rv.total - total;
  return d > 0 ? 'You beat ' + rv.nick + ' by ' + d : d < 0 ? rv.nick + ' wins by ' + (-d) : 'Tied with ' + rv.nick;
}
function rivalTitle() {
  const rv = store.getRival();
  if (!rv) return null;
  const d = today(), sc = store.getScored(rv.day), score = rv.total + ' (' + fmtDiff(rv.diff) + ')';
  if (rv.day === d && sc) return { line1: 'You ' + sc.t + ' vs ' + rv.nick + ' ' + rv.total, line2: vsText(sc.t, rv) };
  if (rv.day === d) return { line1: 'Challenge: beat ' + rv.nick + "'s " + score, line2: "Tap to play today's round" };
  return { line1: 'Day ' + rv.day + ' challenge: ' + rv.nick + ' ' + score, line2: 'Tap to play it (practice, not scored)' };
}
function rivalClick() {
  const rv = store.getRival();
  if (!rv) return;
  if (rv.day === today()) doPlay(); else doPractice(rv.day);
}

// ---- shot of the day: today's once you've played, else yesterday's (no spoilers)
let ace = null, aceDay = 0, shotView = null;
function aceDayNow() { const d = today(); return store.getScored(d) ? d : d - 1; }
function loadAce() {
  const d = aceDayNow();
  if (d < 1) return;
  net.getShot(d).then(r => {
    if (!r.ok || aceDayNow() !== d) return;
    aceDay = d; ace = r.body.ace && r.body.ace.shot ? r.body.ace : null;
  });
}
function aceTitle() {
  if (!ace || aceDay !== aceDayNow()) return null;
  const h = courseFor(aceDay).holes[ace.hole - 1];
  return { line1: 'Shot of the day: ' + ace.nick + (ace.bot ? ' (bot)' : ''), line2: (aceDay === today() ? 'Today' : 'Yesterday') + ', hole ' + ace.hole + ': ' + h.name };
}
function openShot() {
  if (!ace) return;
  const h = courseFor(aceDay).holes[ace.hole - 1];
  let sh;
  try { sh = simulateShot(h, h.tee, ace.shot); } catch (_) { return; }
  shotView = { day: aceDay, hole: h, no: ace.hole, nick: ace.nick, bot: ace.bot, path: sh.path, holed: sh.holed, layer: buildLayer(h, K), t0: performance.now(), dropped: false };
  screen = 'shot';
}
function drawShotView(now) {
  const v = shotView, h = v.hole;
  if (v.layer.kind !== wx.current().kind) v.layer = buildLayer(h, K);
  const msPer = 4000 / 120;                         // the path keeps every 4th 1/120 s step
  const t = Math.max(0, now - v.t0) % (v.path.length * msPer + 1800);   // rAF time can trail the click
  const i = Math.floor(t / msPer), done = i >= v.path.length;
  if (done && !v.dropped) { v.dropped = true; if (v.holed) play('cup', 0.6); }
  if (!done) v.dropped = false;
  const pt = done ? h.cup : v.path[i];
  const fake = { ball: { x: pt.x, y: pt.y }, state: done && v.holed ? 'holed' : 'rest' };
  drawFrame(ctx, v.layer, h, fake, null, now);
  ctx.strokeStyle = 'rgba(255,214,90,0.8)'; ctx.lineWidth = 0.9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let j = 0; j <= Math.min(i, v.path.length - 1); j++) ctx[j ? 'lineTo' : 'moveTo'](v.path[j].x, OY + v.path[j].y);
  ctx.stroke();
  drawShotHud(ctx, ui, { day: v.day, hole: v.no, name: h.name, nick: v.nick, bot: v.bot, cupY: h.cup.y });
}
function cardState() {
  const c = card.course, scored = card.mode === 'daily';
  return {
    day: card.day, course: c.name, practice: !scored, strokes: card.strokes, pars: c.holes.map(h => h.par),
    streak: store.streak(today()), nick: store.getNick(),
    copied: performance.now() - copiedAt < 1500 ? copiedMsg : '',
    shareLabel: canShare() ? 'Share' : 'Copy result',
    vsLine: (() => { const rv = rivalFor(card.day); return rv ? vsText(card.strokes.reduce((a, b) => a + b, 0), rv) + ' (' + rv.total + ')' : ''; })(),
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
  const link = sub && sub.code ? SITE + '/?vs=' + sub.code : SITE;
  return 'Putt Daily #' + day + ' · ' + t + ' (' + fmtDiff(d) + ')' + rank + '\n' + sq.join('') + '\n' + link;
}
// The phone share sheet where there is one, else the clipboard.
const canShare = () => { try { return !!navigator.share && matchMedia('(pointer: coarse)').matches; } catch (_) { return false; } };
let copiedMsg = 'Copied!';
async function shareResult(text) {
  if (canShare()) {
    try { await navigator.share({ text }); return 'Shared!'; }
    catch (e) { if (e && e.name === 'AbortError') return ''; }
  }
  return (await copyText(text)) ? 'Copied!' : '';
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
    shareResult(shareText(card.day, card.strokes, c.holes.map(h => h.par))).then(msg => {
      copiedMsg = msg; copiedAt = msg ? performance.now() : -1e9;
    });
  } else if (id === 'rival') rivalClick();
  else if (id === 'rival:x') store.setRival(null);
  else if (id === 'shot') openShot(); else if (id.startsWith('day:')) doPractice(Number(id.slice(4)));
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
  if (screen === 'shot') { if (hit(p) === 'menu') click('menu'); return; }
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
    buzz(Math.round(6 + s.p / 1000 * 14));
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
    rival: rivalTitle(),
    ace: rivalNote && performance.now() - noteAt < 6000 ? { line1: rivalNote, line2: '' } : aceTitle(),
  };
}

// One bad frame must not freeze the game: log it and keep the loop going.
function frame(now) {
  try { drawOnce(now); } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}
function drawOnce(now) {
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
    if (result) {
      const rv = rivalFor(run.day), done = run.idx;   // holes finished so far
      let extra = '';
      if (rv) {
        const lead = rv.strokes.slice(0, done).reduce((a, b) => a + b, 0) - run.strokes.reduce((a, b) => a + b, 0);
        extra = rv.nick.slice(0, 12) + ' took ' + rv.strokes[done - 1] + (lead > 0 ? ' \u00B7 you lead by ' + lead : lead < 0 ? ' \u00B7 down ' + (-lead) : ' \u00B7 level');
      }
      drawResult(ctx, result.label, result.final ? 'Tap for scorecard' : 'Tap for next hole', hole.cup.y, extra);
    }
  } else if (screen === 'shot' && shotView) {
    acc = 0;
    drawShotView(now);
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
  const qs = new URLSearchParams(location.search);
  const hq = Number(qs.get('hole'));
  if (qs.has('dev') && hq >= 1 && hq <= 9) { startRun(today(), 'practice'); run.idx = hq - 1; enterHole(); }
  const vs = qs.get('vs');
  if (vs && /^[a-zA-Z0-9]{8}$/.test(vs)) {
    loadChallenge(vs);
    qs.delete('vs');                                   // a reload shouldn't fetch it again
    history.replaceState(null, '', location.pathname + (qs.toString() ? '?' + qs : ''));
  }
} catch (_) {}
loadAce();
document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadAce(); retrySubmit(); } });
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
requestAnimationFrame(frame);
