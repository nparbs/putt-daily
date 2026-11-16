// Leaderboard API: replay check, one run per device, cheat rejections, bots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'putt-test-'));
const { handlePlayers } = await import('../server/players.js');
const { cleanNick } = await import('../server/names.js');
const { generateCourse, dayNumber } = await import('../shared/daily.js');
const { botRound } = await import('../shared/bot.js');
const { replayRun } = await import('../shared/physics.js');

const day = dayNumber();
const course = generateCourse(day);
const good = botRound(course, 1).shots;
const goodTotal = good.reduce((a, s, k) => a + replayRun(course.holes[k], s).strokes, 0);

function fakeReq(body) {
  const listeners = {};
  const req = {
    method: 'POST',
    on(ev, fn) { listeners[ev] = fn; return req; },
    destroy() {},
  };
  setImmediate(() => { listeners.data?.(Buffer.from(JSON.stringify(body))); listeners.end?.(); });
  return req;
}
let ipN = 0;
const post = (body, ip = 'ip' + ipN++) => handlePlayers(fakeReq(body), new URL('http://x/api/run'), '/api/run', ip);
const get = (p, ip = 'reader') => handlePlayers({ method: 'GET' }, new URL('http://x' + p), new URL('http://x' + p).pathname, ip);

test('a real run is scored by the server replay', async () => {
  const r = await post({ day, pid: 'a'.repeat(16), nick: 'Tester', shots: good });
  assert.equal(r.status, 200);
  assert.equal(r.body.total, goodTotal);
  assert.equal(r.body.fresh, true);
});

test('one scored run per device per day', async () => {
  const other = botRound(course, 4).shots;
  const r = await post({ day, pid: 'a'.repeat(16), nick: 'Tester', shots: other });
  assert.equal(r.status, 200);
  assert.equal(r.body.fresh, false);
  assert.equal(r.body.total, goodTotal);   // first run stands
});

test('unfinished holes, extra shots, old days and bad names are rejected', async () => {
  const pid = 'c'.repeat(16);
  assert.equal((await post({ day, pid, nick: 'Cheat', shots: good.map(s => s.slice(0, 1)) })).body.error, 'unfinished');
  assert.equal((await post({ day, pid, nick: 'Cheat', shots: good.map(s => [...s, { ax: 1, ay: 0, p: 5 }]) })).body.error, 'extra shots');
  assert.equal((await post({ day: day - 3, pid, nick: 'Late', shots: good })).body.error, 'day');
  assert.equal((await post({ day, pid, nick: 'sh1t head', shots: good })).body.error, 'name');
  assert.equal((await post({ day, pid, nick: 'Cheat', shots: good.map(s => s.map(x => ({ ...x, p: 5000 }))) })).body.error, 'shots');
});

test('board ranks by total then finish time, with tagged bots on a quiet day', async () => {
  await post({ day, pid: 'b'.repeat(16), nick: 'Pal', shots: botRound(course, 3).shots });
  const r = await get('/api/board?pid=' + 'a'.repeat(16));
  assert.equal(r.status, 200);
  const e = r.body.entries;
  assert.equal(r.body.humans, 2);
  assert.ok(e.some(x => x.bot) && e.filter(x => !x.bot).length === 2);
  for (let i = 1; i < e.length; i++) assert.ok(e[i - 1].total <= e[i].total);
  assert.equal(e.find(x => x.you).nick, 'Tester');
  assert.equal(r.body.you.rank, e.find(x => x.you).r);
});

test('trails return shot lists for one hole', async () => {
  const r = await get(`/api/trails?day=${day}&hole=3`);
  assert.equal(r.status, 200);
  assert.ok(r.body.trails.length >= 2);
  for (const t of r.body.trails) assert.ok(Array.isArray(t.shots) && t.shots.length >= 1);
});

test('name filter: blocks abuse, keeps ordinary names', () => {
  for (const n of ['Cucumber', 'Essex Ed', 'Peacock', 'Torpedo', 'Grape', 'Raccoon', 'Hancock']) assert.equal(cleanNick(n), n);
  for (const n of ['f u c k', 'N1gg4', 'big ass', 'ab', 'x'.repeat(17)]) assert.equal(cleanNick(n), null);
});
