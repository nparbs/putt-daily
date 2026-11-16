import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCourse, dayNumber, dateOfDay, DAY1, PARS, fallbackHole } from '../shared/daily.js';
import { solveHole, buildField, scoreAt } from '../shared/solver.js';
import { makeRng, hashInts } from '../shared/rng.js';
import { simulateShot, replayRun } from '../shared/physics.js';

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}
const layout = (c) => JSON.stringify(c.holes.map(h => [h.tiles, h.walls, h.bumpers, h.tee, h.cup]));

test('rng is deterministic and in range', () => {
  const a = makeRng(hashInts(1, 2, 3)), b = makeRng(hashInts(1, 2, 3));
  for (let i = 0; i < 100; i++) {
    const v = a.next();
    assert.equal(v, b.next());
    assert.ok(v >= 0 && v < 1);
  }
  const r = makeRng(7);
  for (let i = 0; i < 200; i++) { const n = r.int(3, 5); assert.ok(n >= 3 && n <= 5 && Number.isInteger(n)); }
  assert.notEqual(hashInts(1, 0, 0), hashInts(1, 0, 1));
});

test('dayNumber / dateOfDay', () => {
  assert.equal(DAY1, '2026-11-11');
  assert.equal(dayNumber('2026-11-11T00:00Z'), 1);
  assert.equal(dayNumber('2026-11-11T23:59Z'), 1);
  assert.equal(dayNumber('2026-11-12T00:00Z'), 2);
  assert.equal(dayNumber(new Date(Date.UTC(2026, 10, 10, 23, 59))), 0);
  assert.equal(dateOfDay(1), '2026-11-11');
  assert.equal(dateOfDay(21), '2026-12-01');
  for (let n = 1; n < 400; n += 37) assert.equal(dayNumber(dateOfDay(n) + 'T12:00Z'), n);
});

test('generateCourse(5) is identical across calls', () => {
  const a = generateCourse(5), b = generateCourse(5);
  assert.deepEqual(a, b);
  assert.equal(a.day, 5);
  assert.equal(a.date, '2026-11-15');
  assert.equal(typeof a.name, 'string');
  assert.equal(a.holes.length, 9);
  a.holes.forEach((h, i) => {
    assert.equal(h.id, `d5-h${i + 1}`);
    assert.equal(h.par, PARS[i]);
    assert.ok(h.name.length > 2);
  });
});

test('golden: day 1 layout', () => {
  const c = generateCourse(1);
  assert.equal(c.name, 'Silver Dale Putt Club');
  assert.equal(fnv(layout(c)), GOLDEN_DAY1);
});

test('days 1-30: in budget, well formed, every hole passes the bot within par', () => {
  let max = 0;
  for (let n = 1; n <= 30; n++) {
    const t = performance.now();
    const c = generateCourse(n);
    const ms = performance.now() - t;
    if (ms > max) max = ms;
    const names = new Set();
    c.holes.forEach((h, i) => {
      assert.equal(h.cols, 18); assert.equal(h.rows, 29);
      assert.equal(h.tiles.length, 29);
      for (const row of h.tiles) {
        assert.equal(row.length, 18, h.id);
        assert.match(row, /^[#.swv^<>]+$/, h.id);
      }
      assert.equal(h.tiles[0], '#'.repeat(18)); assert.equal(h.tiles[28], '#'.repeat(18));
      assert.ok(h.tee.y > 200, h.id + ' tee near the bottom');
      names.add(h.name);
      const res = solveHole(h, { par: h.par, minStrokes: h.par - 1 });
      assert.ok(res.ok, `${h.id} ${h.name}: ${res.reason}`);
      const rep = replayRun(h, res.shots);
      assert.ok(rep.holed && rep.strokes <= h.par, h.id + ' replay');
    });
    assert.equal(names.size, 9, `day ${n} hole names are unique`);
  }
  // Generous margin for a loaded test machine; scripts/preview.mjs prints real timings.
  assert.ok(max < 500, `slowest course ${max.toFixed(0)} ms`);
});

test('days 1-10: random shots never leave the ball somewhere it cannot finish', () => {
  for (let n = 1; n <= 10; n++) {
    for (const h of generateCourse(n).holes) {
      const field = buildField(h);
      const r = makeRng(hashInts(n, h.par, 99));
      for (let k = 0; k < 24; k++) {
        const shot = { ax: r.int(-1000, 1000), ay: r.int(-1000, 1000) || 1, p: r.int(50, 1000) };
        const res = simulateShot(h, h.tee, shot);
        if (res.holed) continue;
        assert.ok(scoreAt(field, res.end.x, res.end.y) < 0x3fffffff, `${h.id} stuck at ${res.end.x},${res.end.y}`);
      }
    }
  }
});

test('fallback holes pass the bot', () => {
  for (let i = 0; i < 9; i++) {
    const { hole } = fallbackHole(1, i);
    const res = solveHole(hole, { par: PARS[i], minStrokes: PARS[i] - 1 });
    assert.ok(res.ok, `fallback ${i + 1}: ${res.reason}`);
  }
});

const GOLDEN_DAY1 = 'afa2286e';
