// Bot golfers for quiet days. Each picks the solver's best-looking shot from where
// the ball lies, then misses it a little by its skill level. Seeded, so a bot
// plays the same round wherever it is generated, and its shot list replays
// exactly like a player's.
import { createSim, shoot, step, simulateShot, STROKE_LIMIT } from './physics.js';
import { buildField, candidates, scoreAt } from './solver.js';
import { makeRng, hashInts } from './rng.js';

export const BOTS = [
  { name: 'Putt-o-Tron', aim: 0.012, power: 0.04 },
  { name: 'Caddie 3000', aim: 0.025, power: 0.07 },
  { name: 'Bogey Bot', aim: 0.045, power: 0.11 },
  { name: 'Lil Wedge', aim: 0.07, power: 0.16 },
  { name: 'Sir Chips', aim: 0.1, power: 0.22 },
];

const gauss = rng => (rng.next() + rng.next() + rng.next() - 1.5) * 2;   // about -3..3, sd ~1

function wobble(shot, rng, skill) {
  const e = gauss(rng) * skill.aim;
  let ax = shot.ax - shot.ay * e, ay = shot.ay + shot.ax * e;
  const m = Math.max(Math.abs(ax), Math.abs(ay));
  if (m > 1000) { ax = ax * 1000 / m; ay = ay * 1000 / m; }
  ax = Math.round(ax); ay = Math.round(ay);
  if (ax === 0 && ay === 0) ax = 1;
  const p = Math.max(1, Math.min(1000, Math.round(shot.p * (1 + gauss(rng) * skill.power))));
  return { ax, ay, p };
}

/** Shots for one hole: [{ax, ay, p}, ...]. */
export function botHole(hole, skill, seed) {
  const rng = makeRng(seed);
  const field = buildField(hole);
  const sim = createSim(hole);
  const shots = [];
  while (sim.state !== 'holed' && sim.strokes < STROKE_LIMIT) {
    const from = { x: sim.ball.x, y: sim.ball.y };
    let best = null, bestS = Infinity;
    for (const c of candidates(field, from.x, from.y)) {
      const r = simulateShot(hole, from, c);
      const s = r.holed ? -1 : r.water ? 1e9 : scoreAt(field, r.end.x, r.end.y);
      if (s < bestS) { bestS = s; best = c; }
    }
    if (!best) {   // nothing sensible: tap toward the cup
      const dx = hole.cup.x - from.x, dy = hole.cup.y - from.y, m = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
      best = { ax: Math.round(dx / m * 1000) || 1, ay: Math.round(dy / m * 1000), p: 300 };
    }
    const shot = wobble(best, rng, skill);
    shots.push(shot);
    shoot(sim, shot);
    let k = 0;
    while (sim.state === 'moving' && k++ < 200000) step(sim);
  }
  return shots;
}

/** A full round for bot `i` on `course`: { name, shots: [9 arrays] }. */
export function botRound(course, i) {
  const skill = BOTS[i];
  return { name: skill.name, shots: course.holes.map((h, k) => botHole(h, skill, hashInts(course.day, k, i, 0xb07))) };
}
