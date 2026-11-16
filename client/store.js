// Device storage. Every access is wrapped; an in-memory copy keeps the game
// working when localStorage is blocked.
const KEYS = { nick: 'pd.nick', days: 'pd.days', runs: 'pd.runs' };
const mem = {};

function get(k, fallback) {
  if (k in mem) return mem[k];
  try {
    const v = localStorage.getItem(k);
    if (v != null) { mem[k] = JSON.parse(v); return mem[k]; }
  } catch (_) {}
  return fallback;
}
function set(k, v) {
  mem[k] = v;
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
}

export const NICK_RE = /^[A-Za-z0-9 _-]{3,16}$/;
export function validNick(s) { return typeof s === 'string' && NICK_RE.test(s.trim()); }
export function getNick() { const n = get(KEYS.nick, ''); return validNick(n) ? n : ''; }
export function setNick(n) { set(KEYS.nick, n.trim()); }

function days() { const d = get(KEYS.days, {}); return d && typeof d === 'object' ? d : {}; }
export function getDay(n) { return days()[n] || null; }
export function getScored(n) { const d = getDay(n); return d && d.sc ? d.sc : null; }   // { s:[9], t, p }
export function getBest(n) { const d = getDay(n); return d && d.b ? { t: d.b, p: d.bp } : null; }

// Random device id: the server keeps one scored run per id per day. No account.
export function pid() {
  let v = get('pd.pid', '');
  if (typeof v !== 'string' || !/^[a-f0-9]{16,32}$/.test(v)) {
    const b = new Uint8Array(12);
    try { crypto.getRandomValues(b); } catch (_) { for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256); }
    v = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    set('pd.pid', v);
  }
  return v;
}

// holes: the shot list of each hole, kept with the scored run so it can be
// (re)sent to the leaderboard.
export function recordRun(day, mode, strokes, parTotal, holes) {
  const all = days();
  const d = all[day] || {};
  const t = strokes.reduce((a, b) => a + b, 0);
  if (mode === 'daily' && !d.sc) d.sc = { s: strokes.slice(), t, p: parTotal, h: holes || null, sub: null };
  if (!d.b || t < d.b) { d.b = t; d.bp = parTotal; }
  all[day] = d;
  set(KEYS.days, all);
}

// Leaderboard result for the scored run: { rank, of, humans, better } or { err }.
export function setSubmit(day, sub) {
  const all = days();
  if (!all[day] || !all[day].sc) return;
  all[day].sc.sub = sub;
  set(KEYS.days, all);
}

// Consecutive days with a scored run, counting back from today (or yesterday
// if today is not played yet).
export function streak(today) {
  let n = getScored(today) ? today : today - 1, c = 0;
  while (n >= 1 && getScored(n)) { c++; n--; }
  return c;
}

// In-progress runs: slot 'daily' or 'practice'. { day, mode, idx, strokes, shots }
function okRun(r) {
  return r && Number.isInteger(r.day) && r.day >= 1 && Number.isInteger(r.idx) && r.idx >= 0 && r.idx < 9 &&
    Array.isArray(r.strokes) && r.strokes.length === r.idx && Array.isArray(r.shots);
}
export function loadRun(slot) {
  const r = (get(KEYS.runs, {}) || {})[slot];
  return okRun(r) ? r : null;
}
export function saveRun(slot, run) {
  const all = get(KEYS.runs, {}) || {};
  if (run) all[slot] = run; else delete all[slot];
  set(KEYS.runs, all);
}
