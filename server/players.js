// Other players: submitted runs, the daily leaderboard, shot trails and bots.
// SQLite file: $DATA_DIR/putt-daily.db (node:sqlite, no dependencies).
//
// POST /api/run    { day, pid, nick, shots: [9 x [{ax, ay, p}]] }
//                  The server replays every hole with the shared physics and uses
//                  its own stroke count. One scored run per device id per day.
// GET  /api/board?day=N&pid=X     top 50 + your row + counts
// GET  /api/trails?day=N&hole=K   up to 30 shot lists for that hole
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { generateCourse, dayNumber } from '../shared/daily.js';
import { replayRun, validShot, STROKE_LIMIT } from '../shared/physics.js';
import { botRound, BOTS } from '../shared/bot.js';
import { cleanNick } from './names.js';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(DATA_DIR, { recursive: true });
export const DB_FILE = path.join(DATA_DIR, 'putt-daily.db');
const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 3000;
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY,
    day INTEGER NOT NULL,
    pid TEXT NOT NULL,
    nick TEXT NOT NULL,
    total INTEGER NOT NULL,
    strokes TEXT NOT NULL,
    shots TEXT NOT NULL,
    bot INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL,
    UNIQUE (day, pid)
  );
  CREATE INDEX IF NOT EXISTS runs_board ON runs (day, total, bot, created);
`);

const q = {
  get: db.prepare('SELECT * FROM runs WHERE day = ? AND pid = ?'),
  insert: db.prepare('INSERT INTO runs (day, pid, nick, total, strokes, shots, bot, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  humans: db.prepare('SELECT COUNT(*) AS n FROM runs WHERE day = ? AND bot = 0'),
  bots: db.prepare('SELECT COUNT(*) AS n FROM runs WHERE day = ? AND bot = 1'),
  rank: db.prepare('SELECT COUNT(*) AS n FROM runs WHERE day = ? AND (bot = 0 OR ?) AND (total < ? OR (total = ? AND (bot < ? OR (bot = ? AND created < ?))))'),
  worseHumans: db.prepare('SELECT COUNT(*) AS n FROM runs WHERE day = ? AND bot = 0 AND total > ?'),
  top: db.prepare('SELECT nick, total, strokes, bot, pid FROM runs WHERE day = ? AND (bot = 0 OR ?) ORDER BY total, bot, created LIMIT 50'),
  trails: db.prepare('SELECT shots, bot FROM runs WHERE day = ? ORDER BY bot, RANDOM() LIMIT 60'),
};

// Bots fill the board only while fewer than this many people have played.
const QUIET = 10;

// ---- course cache
const courses = new Map();
function courseFor(day) {
  if (!courses.has(day)) {
    courses.set(day, generateCourse(day));
    if (courses.size > 4) courses.delete(courses.keys().next().value);
  }
  return courses.get(day);
}
const parOf = c => c.holes.reduce((a, h) => a + h.par, 0);

function ensureBots(day) {
  if (q.bots.get(day).n >= BOTS.length) return;
  const c = courseFor(day);
  // Bots "finish" through the day, after any real player with the same total.
  const base = Date.parse(c.date + 'T00:00:00Z');
  for (let i = 0; i < BOTS.length; i++) {
    const r = botRound(c, i);
    const strokes = r.shots.map((s, k) => replayRun(c.holes[k], s).strokes);
    try {
      q.insert.run(day, 'bot:' + i, r.name, strokes.reduce((a, b) => a + b, 0), JSON.stringify(strokes), JSON.stringify(r.shots), 1, base + (i + 1) * 3600e3);
    } catch (_) { /* already there */ }
  }
}

function withBots(day) { return q.humans.get(day).n < QUIET ? 1 : 0; }

function standing(day, row) {
  const bots = withBots(day);
  const rank = q.rank.get(day, bots, row.total, row.total, row.bot, row.bot, row.created).n + 1;
  const humans = q.humans.get(day).n;
  const others = humans - (row.bot ? 0 : 1);
  const better = others >= 1 ? Math.round(q.worseHumans.get(day, row.total).n / others * 100) : null;
  return { rank, of: humans + (bots ? BOTS.length : 0), humans, better, total: row.total };
}

// ---- rate limits (per IP, in memory)
const hits = new Map();
function limited(ip, key, max, windowMs) {
  const k = key + '|' + ip, now = Date.now();
  let b = hits.get(k);
  if (!b || now > b.reset) { b = { n: 0, reset: now + windowMs }; hits.set(k, b); }
  if (hits.size > 50000) for (const [kk, v] of hits) if (now > v.reset) hits.delete(kk);
  return ++b.n > max;
}

const PID_RE = /^[a-f0-9]{16,32}$/;

function checkRun(body) {
  const today = dayNumber();
  const day = body && body.day;
  if (!Number.isInteger(day) || day < today - 1 || day > today) return { err: 'day' };
  if (typeof body.pid !== 'string' || !PID_RE.test(body.pid)) return { err: 'pid' };
  if (!Array.isArray(body.shots) || body.shots.length !== 9) return { err: 'shots' };
  const c = courseFor(day);
  const strokes = [];
  for (let k = 0; k < 9; k++) {
    const list = body.shots[k];
    if (!Array.isArray(list) || list.length < 1 || list.length > STROKE_LIMIT) return { err: 'shots' };
    const clean = [];
    for (const s of list) {
      if (!s || !validShot(s)) return { err: 'shots' };
      clean.push({ ax: s.ax, ay: s.ay, p: s.p });
    }
    body.shots[k] = clean;
    const r = replayRun(c.holes[k], clean);
    if (!r.holed && r.strokes < STROKE_LIMIT) return { err: 'unfinished' };
    // every shot must have been played: none left over after the hole ended
    const used = replayRun(c.holes[k], clean.slice(0, -1));
    if (clean.length > 1 && (used.holed || used.strokes >= STROKE_LIMIT)) return { err: 'extra shots' };
    strokes.push(r.strokes);
  }
  return { day, strokes, total: strokes.reduce((a, b) => a + b, 0), course: c };
}

function readBody(req, limit = 16384) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', d => { size += d.length; if (size > limit) { reject(new Error('too big')); req.destroy(); } else chunks.push(d); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function intParam(url, name) { const raw = url.searchParams.get(name); if (raw == null || raw === '') return null; const v = Number(raw); return Number.isInteger(v) ? v : null; }

/** Returns { status, body } or null if the path isn't ours. */
export async function handlePlayers(req, url, pathname, ip) {
  if (pathname === '/api/run') {
    if (req.method !== 'POST') return { status: 405, body: { error: 'POST only' } };
    if (limited(ip, 'run', 12, 10 * 60e3)) return { status: 429, body: { error: 'slow down' } };
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return { status: 400, body: { error: 'bad json' } }; }
    const nick = cleanNick(body && body.nick);
    if (!nick) return { status: 400, body: { error: 'name' } };
    const v = checkRun(body);
    if (v.err) return { status: 400, body: { error: v.err } };
    ensureBots(v.day);
    let row = q.get.get(v.day, body.pid);
    let fresh = false;
    if (!row) {
      q.insert.run(v.day, body.pid, nick, v.total, JSON.stringify(v.strokes), JSON.stringify(body.shots), 0, Date.now());
      row = q.get.get(v.day, body.pid);
      fresh = true;
    }
    return { status: 200, body: { ok: true, fresh, strokes: JSON.parse(row.strokes), par: parOf(v.course), ...standing(v.day, row) } };
  }

  if (pathname === '/api/board') {
    if (limited(ip, 'read', 240, 60e3)) return { status: 429, body: { error: 'slow down' } };
    const today = dayNumber();
    const day = intParam(url, 'day') ?? today;
    if (day < 1 || day > today) return { status: 400, body: { error: 'day' } };
    ensureBots(day);
    const c = courseFor(day), par = parOf(c);
    const bots = withBots(day);
    const pid = url.searchParams.get('pid') || '';
    // Ties go to whoever finished first, so every row has its own rank.
    const entries = q.top.all(day, bots).map((row, i) => {
      return { r: i + 1, nick: row.nick, total: row.total, diff: row.total - par, bot: !!row.bot, you: !!pid && row.pid === pid, s: JSON.parse(row.strokes) };
    });
    let you = null;
    if (PID_RE.test(pid)) {
      const row = q.get.get(day, pid);
      if (row) you = { nick: row.nick, ...standing(day, row), s: JSON.parse(row.strokes) };
    }
    const humans = q.humans.get(day).n;
    return { status: 200, body: { day, name: c.name, par, humans, showsBots: !!bots, entries, you } };
  }

  if (pathname === '/api/trails') {
    if (limited(ip, 'read', 240, 60e3)) return { status: 429, body: { error: 'slow down' } };
    const today = dayNumber();
    const day = intParam(url, 'day'), hole = intParam(url, 'hole');
    if (day == null || day < 1 || day > today || hole == null || hole < 1 || hole > 9) return { status: 400, body: { error: 'bad params' } };
    ensureBots(day);
    const rows = q.trails.all(day);
    const humans = rows.filter(r => !r.bot);
    const pick = (humans.length >= 30 ? humans : rows).slice(0, 30);
    return { status: 200, body: { day, hole, trails: pick.map(r => ({ bot: !!r.bot, shots: JSON.parse(r.shots)[hole - 1] })) } };
  }
  return null;
}
