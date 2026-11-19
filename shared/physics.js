// Putt Daily ball physics. Top-down, fixed step, deterministic.
// Determinism rule (docs/CONTRACT.md): only + - * /, Math.sqrt, Math.abs,
// Math.min/max, Math.floor/round inside a step. No frame time, no randomness.

export const TILE = 10;
export const DT = 1 / 120;

export const BALL_R = 2.5;          // ball radius, world units
export const CUP_R = 4.5;           // ball centre within this of the cup centre = over the cup
export const MAX_SPEED = 380;       // launch speed at p = 1000, px/s (rolls ~320 px on flat felt)
export const CAPTURE_SPEED = 130;   // over the cup slower than this drops; faster lips
export const STOP_SPEED = 4;        // below this (off slopes) the ball stops

export const FRICTION = 110;        // rolling friction, constant decel px/s^2
export const DRAG = 0.5;            // linear drag per second
export const SAND_FRICTION = 300;   // extra constant decel on sand
export const SAND_DRAG = 2.5;       // extra linear drag on sand
export const SLOPE_ACCEL = 160;     // slope push px/s^2 (beats friction, so balls never rest on slopes)
export const WALL_E = 0.72;         // wall restitution (normal)
export const WALL_T = 0.96;         // wall tangential keep
export const BUMPER_E = 1.0;        // bumper restitution (normal)
export const BUMPER_KICK = 45;      // extra normal speed from a bumper, px/s
export const LIP_KEEP = 0.8;        // speed kept after a lip-out
export const STROKE_LIMIT = 8;

const MAX_SUB_MOVE = 1;             // max distance per substep (px), well under BALL_R
const SLOPE_STUCK_STEPS = 60;       // slow on a slope this long (e.g. pinned on a wall) = stop
const MAX_STEPS = 120 * 30;         // hard cap per stroke
const EVENT_MIN = 8;                // wall/bumper hits slower than this make no event

// ---------------------------------------------------------------- geometry

const geoCache = new WeakMap();

function tileAt(hole, x, y) {
  const c = Math.floor(x / TILE);
  const r = Math.floor(y / TILE);
  if (r < 0 || r >= hole.rows || c < 0 || c >= hole.cols) return '#';
  return hole.tiles[r][c] || '#';
}

function isWallCell(hole, r, c) {
  if (r < 0 || r >= hole.rows || c < 0 || c >= hole.cols) return true;
  return (hole.tiles[r][c] || '#') === '#';
}

/** Wall segments for a hole: tile edges (collinear runs merged) plus hole.walls. Cached per hole object. */
export function holeSegments(hole) {
  let g = geoCache.get(hole);
  if (g) return g;
  const segs = [];
  // Horizontal edges: line y = r*TILE between row r-1 and row r.
  for (let r = 0; r <= hole.rows; r++) {
    let start = -1;
    for (let c = 0; c <= hole.cols; c++) {
      const edge = c < hole.cols && isWallCell(hole, r - 1, c) !== isWallCell(hole, r, c);
      if (edge && start < 0) start = c;
      if (!edge && start >= 0) {
        segs.push(makeSeg(start * TILE, r * TILE, c * TILE, r * TILE));
        start = -1;
      }
    }
  }
  // Vertical edges: line x = c*TILE between col c-1 and col c.
  for (let c = 0; c <= hole.cols; c++) {
    let start = -1;
    for (let r = 0; r <= hole.rows; r++) {
      const edge = r < hole.rows && isWallCell(hole, r, c - 1) !== isWallCell(hole, r, c);
      if (edge && start < 0) start = r;
      if (!edge && start >= 0) {
        segs.push(makeSeg(c * TILE, start * TILE, c * TILE, r * TILE));
        start = -1;
      }
    }
  }
  for (const w of hole.walls || []) segs.push(makeSeg(w.x1, w.y1, w.x2, w.y2));
  g = { segs, bumpers: (hole.bumpers || []).map(b => ({ x: b.x, y: b.y, r: b.r })) };
  geoCache.set(hole, g);
  return g;
}

function makeSeg(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  return { x1, y1, x2, y2, dx, dy, inv: len2 > 0 ? 1 / len2 : 0 };
}

// ---------------------------------------------------------------- sim

export function createSim(hole) {
  return {
    hole,
    geo: holeSegments(hole),
    ball: { x: hole.tee.x, y: hole.tee.y, vx: 0, vy: 0 },
    state: 'rest',
    strokes: 0,
    shotStart: { x: hole.tee.x, y: hole.tee.y },
    onSand: false,
    inCup: false,
    slowSteps: 0,
    steps: 0,
  };
}

export function validShot(shot) {
  if (!shot) return false;
  const { ax, ay, p } = shot;
  return Number.isInteger(ax) && Number.isInteger(ay) && Number.isInteger(p) &&
    ax >= -1000 && ax <= 1000 && ay >= -1000 && ay <= 1000 &&
    !(ax === 0 && ay === 0) && p >= 1 && p <= 1000;
}

export function shoot(sim, shot) {
  if (sim.state !== 'rest') throw new Error('shoot: ball is not at rest (state ' + sim.state + ')');
  if (!validShot(shot)) throw new Error('shoot: invalid shot ' + JSON.stringify(shot));
  const len = Math.sqrt(shot.ax * shot.ax + shot.ay * shot.ay);
  const speed = MAX_SPEED * shot.p / 1000;
  const b = sim.ball;
  sim.shotStart = { x: b.x, y: b.y };
  b.vx = shot.ax / len * speed;
  b.vy = shot.ay / len * speed;
  sim.state = 'moving';
  sim.strokes += 1;
  sim.inCup = false;
  sim.slowSteps = 0;
  sim.steps = 0;
  sim.onSand = tileAt(sim.hole, b.x, b.y) === 's';
}

export function step(sim) {
  const events = [];
  if (sim.state !== 'moving') return events;
  const hole = sim.hole;
  const b = sim.ball;
  sim.steps++;

  // Forces from the tile under the ball centre.
  const t = tileAt(hole, b.x, b.y);
  let onSlope = false;
  if (t === '^') { b.vy -= SLOPE_ACCEL * DT; onSlope = true; }
  else if (t === 'v') { b.vy += SLOPE_ACCEL * DT; onSlope = true; }
  else if (t === '<') { b.vx -= SLOPE_ACCEL * DT; onSlope = true; }
  else if (t === '>') { b.vx += SLOPE_ACCEL * DT; onSlope = true; }

  const sand = t === 's';
  if (sand && !sim.onSand) events.push({ type: 'sand', speed: Math.sqrt(b.vx * b.vx + b.vy * b.vy) });
  sim.onSand = sand;

  let speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (speed > 0) {
    const fr = (FRICTION + (sand ? SAND_FRICTION : 0)) * DT;
    const dr = 1 - (DRAG + (sand ? SAND_DRAG : 0)) * DT;
    let ns = (speed - fr) * dr;
    if (ns < 0) ns = 0;
    const k = ns / speed;
    b.vx *= k; b.vy *= k;
    speed = ns;
  }

  // Move in substeps, colliding as we go.
  const n = Math.max(1, Math.floor(speed * DT / MAX_SUB_MOVE) + 1);
  const h = DT / n;
  for (let i = 0; i < n; i++) {
    const px = b.x, py = b.y;
    b.x += b.vx * h;
    b.y += b.vy * h;
    collide(sim, px, py, events);
    if (cupCheck(sim, events)) return events;
  }

  // Water: back to the shot's start spot, one-stroke penalty.
  if (tileAt(hole, b.x, b.y) === 'w') {
    events.push({ type: 'water', speed: Math.sqrt(b.vx * b.vx + b.vy * b.vy) });
    b.x = sim.shotStart.x; b.y = sim.shotStart.y;
    b.vx = 0; b.vy = 0;
    sim.strokes += 1;
    sim.state = 'rest';
    sim.onSand = false;
    return events;
  }

  // Stop.
  speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  const slopeNow = isSlope(tileAt(hole, b.x, b.y));
  let stop = false;
  if (speed < STOP_SPEED) {
    if (!slopeNow) stop = true;
    else if (++sim.slowSteps >= SLOPE_STUCK_STEPS) stop = true;
  } else {
    sim.slowSteps = 0;
  }
  if (sim.steps >= MAX_STEPS) stop = true;
  if (stop) {
    events.push({ type: 'stop', speed });
    b.vx = 0; b.vy = 0;
    sim.state = 'rest';
  }
  return events;
}

function isSlope(t) {
  return t === '^' || t === 'v' || t === '<' || t === '>';
}

function collide(sim, px, py, events) {
  const b = sim.ball;
  const { segs, bumpers } = sim.geo;
  const r2 = BALL_R * BALL_R;
  let wallHit = 0;
  // Two passes so concave corners settle.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      let u = ((b.x - s.x1) * s.dx + (b.y - s.y1) * s.dy) * s.inv;
      if (u < 0) u = 0; else if (u > 1) u = 1;
      const cx = s.x1 + s.dx * u, cy = s.y1 + s.dy * u;
      let nx = b.x - cx, ny = b.y - cy;
      const d2 = nx * nx + ny * ny;
      if (d2 >= r2) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-9) {
        // Centre exactly on the line: push back toward where it came from.
        nx = -s.dy; ny = s.dx;
        const l = Math.sqrt(nx * nx + ny * ny) || 1;
        nx /= l; ny /= l;
        if ((px - cx) * nx + (py - cy) * ny < 0) { nx = -nx; ny = -ny; }
        d = 0;
      } else {
        nx /= d; ny /= d;
      }
      b.x = cx + nx * BALL_R;
      b.y = cy + ny * BALL_R;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        const tx = b.vx - vn * nx, ty = b.vy - vn * ny;
        b.vx = tx * WALL_T - vn * WALL_E * nx;
        b.vy = ty * WALL_T - vn * WALL_E * ny;
        if (-vn > wallHit) wallHit = -vn;
      }
    }
  }
  if (wallHit >= EVENT_MIN) events.push({ type: 'wall', speed: wallHit });

  for (let i = 0; i < bumpers.length; i++) {
    const p = bumpers[i];
    let nx = b.x - p.x, ny = b.y - p.y;
    const rr = p.r + BALL_R;
    const d2 = nx * nx + ny * ny;
    if (d2 >= rr * rr) continue;
    let d = Math.sqrt(d2);
    if (d < 1e-9) { nx = px - p.x; ny = py - p.y; d = Math.sqrt(nx * nx + ny * ny); if (d < 1e-9) { nx = 0; ny = -1; d = 1; } }
    nx /= d; ny /= d;
    b.x = p.x + nx * rr;
    b.y = p.y + ny * rr;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      const out = -vn * BUMPER_E + BUMPER_KICK;
      b.vx = b.vx - vn * nx + out * nx;
      b.vy = b.vy - vn * ny + out * ny;
      const s = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (s > MAX_SPEED) { const k = MAX_SPEED / s; b.vx *= k; b.vy *= k; }
      events.push({ type: 'bumper', speed: -vn });
    }
  }
}

function cupCheck(sim, events) {
  const b = sim.ball;
  const cup = sim.hole.cup;
  const dx = b.x - cup.x, dy = b.y - cup.y;
  const over = dx * dx + dy * dy < CUP_R * CUP_R;
  if (!over) { sim.inCup = false; return false; }
  const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (speed < CAPTURE_SPEED) {
    events.push({ type: 'holed', speed });
    b.x = cup.x; b.y = cup.y; b.vx = 0; b.vy = 0;
    sim.state = 'holed';
    return true;
  }
  if (!sim.inCup) {
    sim.inCup = true;
    events.push({ type: 'lip', speed });
    // Deflect away from the cup centre, sideways to the direction of travel.
    const ux = b.vx / speed, uy = b.vy / speed;
    let side = dx * -uy + dy * ux;           // offset of ball from cup, across the travel line
    let sx = -uy, sy = ux;                   // left perpendicular
    if (side < 0) { sx = -sx; sy = -sy; side = -side; }
    const amt = 0.12 + 0.2 * (side / CUP_R);
    let nvx = ux + sx * amt, nvy = uy + sy * amt;
    const l = Math.sqrt(nvx * nvx + nvy * nvy);
    const ns = speed * LIP_KEEP;
    b.vx = nvx / l * ns; b.vy = nvy / l * ns;
  }
  return false;
}

// ---------------------------------------------------------------- helpers

export function simulateShot(hole, from, shot) {
  const sim = createSim(hole);
  sim.ball.x = from.x; sim.ball.y = from.y;
  shoot(sim, shot);
  const path = [{ x: from.x, y: from.y }];
  let water = false;
  let k = 0;
  while (sim.state === 'moving') {
    const ev = step(sim);
    for (const e of ev) if (e.type === 'water') water = true;
    k++;
    if (k % 4 === 0) path.push({ x: sim.ball.x, y: sim.ball.y });
  }
  const end = { x: sim.ball.x, y: sim.ball.y };
  const last = path[path.length - 1];
  if (last.x !== end.x || last.y !== end.y) path.push({ x: end.x, y: end.y });
  return { path, end, holed: sim.state === 'holed', water, strokesAdded: sim.strokes };
}

export function replayRun(hole, shots) {
  const sim = createSim(hole);
  let used = 0;
  for (const shot of shots) {
    if (sim.state === 'holed' || sim.strokes >= STROKE_LIMIT) break;
    shoot(sim, shot);
    used++;
    while (sim.state === 'moving') step(sim);
  }
  return { strokes: Math.min(sim.strokes, STROKE_LIMIT), holed: sim.state === 'holed', used };
}
