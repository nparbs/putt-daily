import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_R, createSim, shoot, step, simulateShot, replayRun, STROKE_LIMIT,
} from '../shared/physics.js';
import { TEST_HOLES } from '../shared/holes.js';

const [STRAIGHT, LHOLE] = TEST_HOLES;

// Seeded PRNG for tests (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randInt = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
function randShot(r) {
  let ax = 0, ay = 0;
  while (ax === 0 && ay === 0) { ax = randInt(r, -1000, 1000); ay = randInt(r, -1000, 1000); }
  return { ax, ay, p: randInt(r, 1, 1000) };
}

function dirs(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = 2 * Math.PI * i / n;
    out.push({ ax: Math.round(Math.cos(a) * 1000), ay: Math.round(Math.sin(a) * 1000) });
  }
  return out;
}

const waterHole = {
  id: 'water', par: 2, cols: 18, rows: 29,
  tiles: [
    '##################',
    ...Array(12).fill('#................#'),
    ...Array(3).fill('#wwwwwwwwwwwwwwww#'),
    ...Array(12).fill('#................#'),
    '##################',
  ],
  walls: [], bumpers: [],
  tee: { x: 90, y: 250 }, cup: { x: 90, y: 40 },
};

test('same shot twice is bit-identical', () => {
  for (const hole of TEST_HOLES) {
    const shot = { ax: -137, ay: -990, p: 873 };
    const a = simulateShot(hole, hole.tee, shot);
    const b = simulateShot(hole, hole.tee, shot);
    assert.deepEqual(a, b);
    assert.ok(Object.is(a.end.x, b.end.x) && Object.is(a.end.y, b.end.y));

    // Step-by-step sim matches simulateShot exactly.
    const sim = createSim(hole);
    shoot(sim, shot);
    while (sim.state === 'moving') step(sim);
    assert.equal(sim.ball.x, a.end.x);
    assert.equal(sim.ball.y, a.end.y);
  }
});

test('golden: shot end position is fixed', () => {
  const r = simulateShot(LHOLE, LHOLE.tee, { ax: -52, ay: -999, p: 1000 });
  assert.equal(r.holed, false);
  assert.deepEqual(r.end, GOLDEN_END);
});

test('golden: replayRun stroke count', () => {
  const shots = [
    { ax: 300, ay: -1000, p: 600 },   // into the side wall
    { ax: -200, ay: -1000, p: 900 },  // clips the top corner, comes back down
    { ax: 1000, ay: 150, p: 300 },
    { ax: -1000, ay: -650, p: 900 },  // bank off the angled wall and in
    { ax: 1000, ay: 0, p: 200 },      // ignored: already holed
  ];
  const a = replayRun(LHOLE, shots);
  const b = replayRun(LHOLE, shots);
  assert.deepEqual(a, b);
  assert.deepEqual(a, GOLDEN_REPLAY);
  assert.deepEqual(replayRun(LHOLE, [{ ax: -52, ay: -999, p: 1000 }, { ax: 998, ay: 70, p: 400 }]), { strokes: 2, holed: true });
});

test('water: ball returns to shot start with a penalty stroke', () => {
  const sim = createSim(waterHole);
  shoot(sim, { ax: 0, ay: -1000, p: 500 });
  let sawWater = false;
  while (sim.state === 'moving') {
    for (const e of step(sim)) if (e.type === 'water') sawWater = true;
  }
  assert.ok(sawWater);
  assert.equal(sim.state, 'rest');
  assert.equal(sim.strokes, 2);
  assert.deepEqual({ x: sim.ball.x, y: sim.ball.y }, waterHole.tee);
  assert.equal(sim.ball.vx, 0);

  const r = simulateShot(waterHole, waterHole.tee, { ax: 0, ay: -1000, p: 500 });
  assert.equal(r.water, true);
  assert.equal(r.strokesAdded, 2);
  assert.deepEqual(r.end, waterHole.tee);

  // Eight attempts into the water caps at the stroke limit.
  const many = Array(10).fill({ ax: 0, ay: -1000, p: 500 });
  assert.deepEqual(replayRun(waterHole, many), { strokes: STROKE_LIMIT, holed: false });
});

test('cannot shoot while moving; invalid shots rejected', () => {
  const sim = createSim(STRAIGHT);
  shoot(sim, { ax: 0, ay: -1000, p: 500 });
  step(sim);
  assert.equal(sim.state, 'moving');
  assert.throws(() => shoot(sim, { ax: 0, ay: -1000, p: 500 }));
  assert.equal(sim.strokes, 1);
  const fresh = createSim(STRAIGHT);
  assert.throws(() => shoot(fresh, { ax: 0, ay: 0, p: 500 }));
  assert.throws(() => shoot(fresh, { ax: 0, ay: -1000, p: 1001 }));
  assert.throws(() => shoot(fresh, { ax: 0.5, ay: -1000, p: 10 }));
});

test('typical putts settle in under 3 s, max power crosses the hole about once', () => {
  const r = rng(7);
  for (let i = 0; i < 200; i++) {
    const shot = randShot(r);
    shot.p = randInt(r, 1, 600);
    const res = simulateShot(STRAIGHT, STRAIGHT.tee, shot);
    assert.ok(res.path.length * 4 <= 3 * 120 + 8, 'settles in 3 s');
  }
  const long = {
    id: 'long', par: 2, cols: 18, rows: 200,
    tiles: Array.from({ length: 200 }, (_, i) => (i === 0 || i === 199 ? '#'.repeat(18) : '#' + '.'.repeat(16) + '#')),
    walls: [], bumpers: [], tee: { x: 90, y: 1980 }, cup: { x: -100, y: -100 },
  };
  const res = simulateShot(long, long.tee, { ax: 0, ay: -1000, p: 1000 });
  const dist = long.tee.y - res.end.y;
  assert.ok(dist > 260 && dist < 380, 'max power roll ' + dist);
});

function inside(hole, x, y) {
  const c = Math.floor(x / 10), r = Math.floor(y / 10);
  if (r < 0 || r >= hole.rows || c < 0 || c >= hole.cols) return false;
  if (hole.tiles[r][c] === '#') return false;
  // Every extra wall here closes off the region with x + y < x1 + y1 (the cut corner).
  for (const w of hole.walls) if (x + y < w.x1 + w.y1) return false;
  return true;
}

test('no escape through walls across thousands of random shots', () => {
  const r = rng(12345);
  for (const hole of TEST_HOLES) {
    const sim = createSim(hole);
    for (let i = 0; i < 1500; i++) {
      if (sim.state === 'holed') { sim.state = 'rest'; sim.ball.x = hole.tee.x; sim.ball.y = hole.tee.y; }
      const shot = randShot(r);
      if (i % 5 === 0) shot.p = 1000;
      shoot(sim, shot);
      while (sim.state === 'moving') {
        step(sim);
        const { x, y } = sim.ball;
        assert.ok(inside(hole, x, y), `${hole.id} shot ${i} escaped to ${x},${y}`);
      }
    }
  }
});

test('test holes are holeable in par (brute force)', () => {
  for (const hole of TEST_HOLES) {
    const firsts = [];
    let ace = null;
    for (const d of dirs(72)) {
      for (let p = 100; p <= 1000; p += 100) {
        const res = simulateShot(hole, hole.tee, { ...d, p });
        if (res.holed) { ace = ace || { ...d, p }; continue; }
        if (res.water) continue;
        firsts.push({ shot: { ...d, p }, end: res.end, dist: Math.hypot(res.end.x - hole.cup.x, res.end.y - hole.cup.y) });
      }
    }
    firsts.sort((a, b) => a.dist - b.dist);
    let found = ace ? [ace] : null;
    for (const f of firsts.slice(0, 10)) {
      if (found) break;
      for (const d of dirs(180)) {
        if (found) break;
        for (let p = 20; p <= 1000; p += 20) {
          if (simulateShot(hole, f.end, { ...d, p }).holed) { found = [f.shot, { ...d, p }]; break; }
        }
      }
    }
    assert.ok(found, hole.id + ' has a par solution');
    const rep = replayRun(hole, found);
    assert.ok(rep.holed && rep.strokes <= hole.par, hole.id + ' replay ' + JSON.stringify(rep));
  }
});

test('tile wall segments merge collinear runs', async () => {
  const { holeSegments } = await import('../shared/physics.js');
  const segs = holeSegments(STRAIGHT).segs;
  // Straight lane: two long sides, top, bottom.
  assert.equal(segs.length, 4);
  assert.equal(holeSegments(STRAIGHT), holeSegments(STRAIGHT));
  assert.ok(BALL_R > 0);
});

const GOLDEN_END = { x: 137.35051227446866, y: 37.02423540807416 };
const GOLDEN_REPLAY = { strokes: 4, holed: true };
