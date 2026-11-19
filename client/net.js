// Leaderboard and trails API. Every call fails soft: the game works offline.
async function call(url, opts = {}) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    let body = null;
    try { body = await r.json(); } catch (_) {}
    return { ok: r.ok, status: r.status, body: body || {} };
  } catch (_) {
    return { ok: false, status: 0, body: { error: 'offline' } };
  } finally { clearTimeout(to); }
}

export function submitRun(day, pid, nick, holes) {
  return call('/api/run', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ day, pid, nick, shots: holes }),
  });
}
export const getBoard = (day, pid) => call('/api/board?day=' + day + '&pid=' + encodeURIComponent(pid));
export const getTrails = (day, hole) => call('/api/trails?day=' + day + '&hole=' + hole);
export const getChallenge = (code, pid) => call('/api/challenge?c=' + encodeURIComponent(code) + '&pid=' + encodeURIComponent(pid));
export const getShot = day => call('/api/shot?day=' + day);
