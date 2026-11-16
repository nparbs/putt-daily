// Solver bot: plays a hole by searching shots with simulateShot.
// Used by the generator to keep only fair holes (finishable in par, no easy ace,
// nowhere to get stuck). Deterministic: only + - * /, sqrt, round/floor, so every
// device makes the same decisions and so the same course.

import { BALL_R, MAX_SPEED, FRICTION, DRAG, DT, STOP_SPEED, TILE, simulateShot } from './physics.js';

const CELL = 5;          // field cell size, world units (half a tile)
const INF = 0x3fffffff;

// ---------------------------------------------------------------- roll table

let rollTable = null;    // rollTable[p] = flat-felt roll distance for power p

function rolls() {
  if (rollTable) return rollTable;
  rollTable = new Float64Array(1001);
  const fr = FRICTION * DT, dr = 1 - DRAG * DT;
  for (let p = 1; p <= 1000; p++) {
    let s = MAX_SPEED * p / 1000, d = 0;
    while (s >= STOP_SPEED) {
      s = (s - fr) * dr;
      if (s < 0) s = 0;
      d += s * DT;
    }
    rollTable[p] = d;
  }
  return rollTable;
}

/** Smallest power that rolls at least `dist` on flat felt (1..1000). */
export function powerFor(dist) {
  const t = rolls();
  if (dist <= t[1]) return 1;
  if (dist >= t[1000]) return 1000;
  let lo = 1, hi = 1000;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] >= dist) hi = mid; else lo = mid + 1;
  }
  return lo;
}

// ---------------------------------------------------------------- geometry helpers

function tileAt(hole, x, y) {
  const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
  if (r < 0 || r >= hole.rows || c < 0 || c >= hole.cols) return '#';
  return hole.tiles[r][c] || '#';
}

function segDist2(px, py, w) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
  const l2 = dx * dx + dy * dy;
  let u = l2 > 0 ? ((px - w.x1) * dx + (py - w.y1) * dy) / l2 : 0;
  if (u < 0) u = 0; else if (u > 1) u = 1;
  const ex = px - (w.x1 + dx * u), ey = py - (w.y1 + dy * u);
  return ex * ex + ey * ey;
}

function orient(ax, ay, bx, by, cx, cy) {
  const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

function onSeg(ax, ay, bx, by, px, py) {
  return Math.min(ax, bx) <= px && px <= Math.max(ax, bx) && Math.min(ay, by) <= py && py <= Math.max(ay, by);
}

/** Do segments AB and CD touch or cross? */
export function segsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const o1 = orient(ax, ay, bx, by, cx, cy), o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay), o4 = orient(cx, cy, dx, dy, bx, by);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(ax, ay, bx, by, cx, cy)) return true;
  if (o2 === 0 && onSeg(ax, ay, bx, by, dx, dy)) return true;
  if (o3 === 0 && onSeg(cx, cy, dx, dy, ax, ay)) return true;
  if (o4 === 0 && onSeg(cx, cy, dx, dy, bx, by)) return true;
  return false;
}

function crossesWall(walls, ax, ay, bx, by) {
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (segsCross(ax, ay, bx, by, w.x1, w.y1, w.x2, w.y2)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- distance field

/**
 * Geodesic distance to the cup over a 5 px grid. Cells are passable where the
 * ball centre can sit (not wall, not water, clear of angled walls and bumpers).
 * Cost runs higher near walls (keeps routes central) and on sand.
 * dist is in tenths of a cell step (10 per 5 px), parent points toward the cup.
 */
export function buildField(hole) {
  const nx = hole.cols * 2, ny = hole.rows * 2, n = nx * ny;
  const walls = hole.walls || [], bumpers = hole.bumpers || [];
  const pass = new Uint8Array(n);
  const r2 = BALL_R * BALL_R;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = i * CELL + 2.5, y = j * CELL + 2.5;
      const t = tileAt(hole, x, y);
      if (t === '#' || t === 'w') continue;
      let ok = true;
      for (let k = 0; k < walls.length && ok; k++) if (segDist2(x, y, walls[k]) <= r2) ok = false;
      for (let k = 0; k < bumpers.length && ok; k++) {
        const b = bumpers[k], dx = x - b.x, dy = y - b.y, rr = b.r + BALL_R;
        if (dx * dx + dy * dy <= rr * rr) ok = false;
      }
      if (ok) pass[j * nx + i] = 1;
    }
  }
  const cost = new Uint8Array(n);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id = j * nx + i;
      if (!pass[id]) continue;
      let c = 10;
      let edge = false;
      for (let dj = -1; dj <= 1 && !edge; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny || !pass[jj * nx + ii]) { edge = true; break; }
      }
      if (edge) c += 6;
      if (tileAt(hole, i * CELL + 2.5, j * CELL + 2.5) === 's') c += 10;
      cost[id] = c;
    }
  }

  const dist = new Int32Array(n).fill(INF);
  const parent = new Int32Array(n).fill(-1);
  const ci = Math.floor(hole.cup.x / CELL), cj = Math.floor(hole.cup.y / CELL);
  const cupId = cj * nx + ci;
  const field = { hole, nx, ny, pass, dist, parent, walls, cupId };
  if (ci < 0 || cj < 0 || ci >= nx || cj >= ny || !pass[cupId]) { field.ok = false; return field; }

  // Dijkstra with a binary heap.
  const hk = [], hv = [];
  const push = (d, v) => {
    let k = hk.length; hk.push(d); hv.push(v);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hk[p] <= d) break;
      hk[k] = hk[p]; hv[k] = hv[p]; k = p;
    }
    hk[k] = d; hv[k] = v;
  };
  const pop = () => {
    const v = hv[0], lastK = hk.pop(), lastV = hv.pop();
    const len = hk.length;
    if (len > 0) {
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= len) break;
        if (c + 1 < len && hk[c + 1] < hk[c]) c++;
        if (hk[c] >= lastK) break;
        hk[k] = hk[c]; hv[k] = hv[c]; k = c;
      }
      hk[k] = lastK; hv[k] = lastV;
    }
    return v;
  };
  dist[cupId] = 0;
  push(0, cupId);
  while (hk.length) {
    const d = hk[0];
    const u = pop();
    if (d > dist[u]) continue;
    const ui = u % nx, uj = (u - ui) / nx;
    const ux = ui * CELL + 2.5, uy = uj * CELL + 2.5;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const vi = ui + di, vj = uj + dj;
        if (vi < 0 || vj < 0 || vi >= nx || vj >= ny) continue;
        const v = vj * nx + vi;
        if (!pass[v]) continue;
        if (di && dj && (!pass[uj * nx + vi] || !pass[vj * nx + ui])) continue;
        if (walls.length && crossesWall(walls, ux, uy, vi * CELL + 2.5, vj * CELL + 2.5)) continue;
        const nd = d + (di && dj ? (cost[v] * 14 / 10 | 0) : cost[v]);
        if (nd < dist[v]) { dist[v] = nd; parent[v] = u; push(nd, v); }
      }
    }
  }
  field.ok = true;
  return field;
}

function cellOf(field, x, y) {
  const i = Math.floor(x / CELL), j = Math.floor(y / CELL);
  if (i < 0 || j < 0 || i >= field.nx || j >= field.ny) return -1;
  return j * field.nx + i;
}

/** Field distance for a resting ball (INF if it is somewhere the cup can't be reached from). */
export function scoreAt(field, x, y) {
  const id = cellOf(field, x, y);
  if (id >= 0 && field.dist[id] < INF) return field.dist[id];
  // Ball centre can rest a hair inside a cell we marked closed (against a wall).
  let best = INF;
  const i0 = Math.floor(x / CELL), j0 = Math.floor(y / CELL);
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const i = i0 + di, j = j0 + dj;
    if (i < 0 || j < 0 || i >= field.nx || j >= field.ny) continue;
    const d = field.dist[j * field.nx + i];
    if (d < INF && d + 14 < best) best = d + 14;
  }
  return best;
}

/** Straight roll from A to B stays on open, dry cells and crosses no angled wall. */
export function clearLine(field, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  const n = Math.floor(len / 2.5) + 1;
  for (let k = 1; k <= n; k++) {
    const x = ax + dx * k / n, y = ay + dy * k / n;
    const id = cellOf(field, x, y);
    if (id < 0 || field.dist[id] >= INF) return false;
  }
  return !(field.walls.length && crossesWall(field.walls, ax, ay, bx, by));
}

// ---------------------------------------------------------------- candidate shots

// Fixed rotations (exact literals, so every engine agrees).
const ROT = [
  [1, 0],
  [0.9975640502598242, 0.0697564737441253],    // 4 deg
  [0.9975640502598242, -0.0697564737441253],
  [0.9902680687415704, 0.13917310096006544],   // 8 deg
  [0.9902680687415704, -0.13917310096006544],
];
const ROT_FINE = [
  [0.9993908270190958, 0.03489949670250097],   // 2 deg
  [0.9993908270190958, -0.03489949670250097],
];

function aim(dx, dy, rot, p) {
  const rx = dx * rot[0] - dy * rot[1], ry = dx * rot[1] + dy * rot[0];
  const len = Math.sqrt(rx * rx + ry * ry);
  let ax = Math.round(rx / len * 1000), ay = Math.round(ry / len * 1000);
  if (ax === 0 && ay === 0) ax = 1;
  return { ax, ay, p };
}

export function candidates(field, x, y) {
  const hole = field.hole;
  const out = [];
  const cx = hole.cup.x, cy = hole.cup.y;
  if (clearLine(field, x, y, cx, cy)) {
    const dx = cx - x, dy = cy - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    for (const roll of [d + 4, d + 12, d + 24, d + 40, d * 1.25 + 20, d * 1.5 + 40]) out.push(aim(dx, dy, ROT[0], powerFor(roll)));
    for (const rot of ROT_FINE) for (const roll of [d + 12, d + 30]) out.push(aim(dx, dy, rot, powerFor(roll)));
    return out;
  }
  // Follow the field toward the cup; aim at the farthest point we can see.
  const path = [];
  let id = cellOf(field, x, y);
  if (id < 0 || field.dist[id] >= INF) {
    // Start from the best neighbour cell.
    let best = -1, bd = INF;
    const i0 = Math.floor(x / CELL), j0 = Math.floor(y / CELL);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = i0 + di, j = j0 + dj;
      if (i < 0 || j < 0 || i >= field.nx || j >= field.ny) continue;
      const v = j * field.nx + i;
      if (field.dist[v] < bd) { bd = field.dist[v]; best = v; }
    }
    id = best;
  }
  if (id < 0) return out;
  while (id >= 0) { path.push(id); id = field.parent[id]; }
  let tgt = -1;
  for (let k = path.length - 1; k > 0; k--) {
    const v = path[k], vi = v % field.nx, vj = (v - vi) / field.nx;
    if (clearLine(field, x, y, vi * CELL + 2.5, vj * CELL + 2.5)) { tgt = v; break; }
  }
  if (tgt < 0) tgt = path[Math.min(1, path.length - 1)];
  const ti = tgt % field.nx, tj = (tgt - ti) / field.nx;
  const tx = ti * CELL + 2.5, ty = tj * CELL + 2.5;
  const dx = tx - x, dy = ty - y;
  const L = Math.sqrt(dx * dx + dy * dy);
  const rem = field.dist[tgt] / 2;  // roughly px left after the target
  const rl = [L * 0.8, L, L + Math.min(rem, 60), L + Math.min(rem, 140)];
  for (const rot of ROT) for (const roll of rl) out.push(aim(dx, dy, rot, powerFor(roll)));
  return out;
}

// ---------------------------------------------------------------- search

/**
 * Play a hole. Options: par (default hole.par), minStrokes (reject if the bot
 * holes out in fewer, e.g. 2 = no ace; default 1), beams (widths tried in order).
 * Returns { ok, strokes, shots, reason, sims }.
 */
export function solveHole(hole, opts = {}) {
  const par = opts.par || hole.par;
  const beams = opts.beams || [1, 3];
  const minStrokes = opts.minStrokes || 1;
  const field = opts.field || buildField(hole);
  let sims = 0;
  if (!field.ok) return { ok: false, reason: 'cup not open', sims };
  if (scoreAt(field, hole.tee.x, hole.tee.y) >= INF) return { ok: false, reason: 'tee cut off', sims };
  if (minStrokes > 1 && clearLine(field, hole.tee.x, hole.tee.y, hole.cup.x, hole.cup.y)) return { ok: false, reason: 'cup in sight of tee', sims };

  const seen = new Map();  // shot key from the tee -> result, reused across beam widths
  for (const B of beams) {
    let beam = [{ x: hole.tee.x, y: hole.tee.y, strokes: 0, shots: [] }];
    for (let depth = 1; depth <= par && beam.length; depth++) {
      const children = [];
      let win = null;
      for (const st of beam) {
        for (const shot of candidates(field, st.x, st.y)) {
          let r;
          const key = depth === 1 ? shot.ax + ',' + shot.ay + ',' + shot.p : null;
          if (key && seen.has(key)) r = seen.get(key);
          else { r = simulateShot(hole, { x: st.x, y: st.y }, shot); sims++; if (key) seen.set(key, r); }
          if (r.holed) {
            const total = st.strokes + r.strokesAdded;
            if (total < minStrokes) return { ok: false, reason: total === 1 ? 'ace' : 'too easy', sims };
            if (total <= par && (!win || total < win.strokes)) win = { strokes: total, shots: [...st.shots, shot] };
            if (win && depth >= minStrokes) return { ok: true, ...win, sims };
            continue;
          }
          if (r.water) continue;
          const s = scoreAt(field, r.end.x, r.end.y);
          if (s >= INF) return { ok: false, reason: 'stuck at ' + Math.round(r.end.x) + ',' + Math.round(r.end.y), sims };
          // Too far to finish with the strokes left (a full roll is about 320 px = 640 units).
          if (s > (par - depth) * 700) continue;
          children.push({ x: r.end.x, y: r.end.y, strokes: st.strokes + 1, shots: [...st.shots, shot], s });
        }
      }
      if (win) return { ok: true, ...win, sims };
      children.sort((a, b) => a.s - b.s);
      beam = [];
      for (const c of children) {
        if (beam.length >= B) break;
        if (beam.some(b => Math.abs(b.x - c.x) < 3 && Math.abs(b.y - c.y) < 3)) continue;
        beam.push(c);
      }
    }
  }
  return { ok: false, reason: 'no par route', sims };
}
