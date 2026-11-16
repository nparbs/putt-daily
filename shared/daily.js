// Daily course: nine holes from the date. Hand-made templates (fairway shapes)
// varied by a seeded RNG, mirrored, then dressed with pieces (sand, water,
// slopes, bumpers, angled walls). Each hole is checked by the solver bot and
// regenerated from the next sub-seed until it passes. Pure and synchronous.

import { makeRng, hashInts } from './rng.js';
import { solveHole } from './solver.js';

export const DAY1 = '2026-11-11';
const DAY1_MS = Date.UTC(2026, 10, 11);
const DAY_MS = 86400000;

/** Day number for a date (Date, string or ms). 2026-11-11 UTC is day 1. */
export function dayNumber(date = new Date()) {
  const t = date instanceof Date ? date.getTime() : new Date(date).getTime();
  return Math.floor((t - DAY1_MS) / DAY_MS) + 1;
}

/** 'YYYY-MM-DD' for day n. */
export function dateOfDay(n) {
  return new Date(DAY1_MS + (n - 1) * DAY_MS).toISOString().slice(0, 10);
}

const COLS = 18, ROWS = 29;
const C0 = 1, C1 = COLS - 2, R0 = 1, R1 = ROWS - 2;   // playable interior
export const PARS = [2, 2, 2, 3, 3, 3, 3, 4, 4];
export const MAX_ATTEMPTS = 12;

// ---------------------------------------------------------------- grid helpers

const newGrid = () => Array.from({ length: ROWS }, () => Array(COLS).fill('#'));
const inside = (c, r) => c >= C0 && c <= C1 && r >= R0 && r <= R1;
const get = (g, c, r) => (inside(c, r) ? g[r][c] : '#');
const cheb = (c1, r1, c2, r2) => Math.max(Math.abs(c1 - c2), Math.abs(r1 - r2));
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

function fillRect(g, c0, r0, c1, r1, ch) {
  for (let r = Math.max(R0, Math.min(r0, r1)); r <= Math.min(R1, Math.max(r0, r1)); r++)
    for (let c = Math.max(C0, Math.min(c0, c1)); c <= Math.min(C1, Math.max(c0, c1)); c++) g[r][c] = ch;
}

const halfW = (w) => { const a = (w - 1) >> 1; return [a, w - 1 - a]; };

function carveLegs(g, pts, w) {
  const [a, b] = halfW(w);
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    fillRect(g, Math.min(x1, x2) - a, Math.min(y1, y2) - a, Math.max(x1, x2) + b, Math.max(y1, y2) + b, '.');
  }
}

/**
 * 45-degree chamfer of size k at a concave felt corner: cell (cx, cy) with walls
 * beyond it at +sx and +sy. Adds the angled wall and walls off the cut-off cells.
 */
function chamfer(g, walls, cx, cy, sx, sy, k) {
  for (let t = 0; t < k; t++) {
    if (get(g, cx - sx * t, cy) !== '.' || get(g, cx - sx * t, cy + sy) !== '#') return false;
    if (get(g, cx, cy - sy * t) !== '.' || get(g, cx + sx, cy - sy * t) !== '#') return false;
  }
  for (let i = 0; i < k; i++) for (let j = 0; i + j < k; j++) if (get(g, cx - sx * i, cy - sy * j) !== '.') return false;
  const X = cx * 10 + (sx > 0 ? 10 : 0), Y = cy * 10 + (sy > 0 ? 10 : 0);
  for (let i = 0; i < k; i++) for (let j = 0; i + j <= k - 2; j++) g[cy - sy * j][cx - sx * i] = '#';
  walls.push({ x1: X - sx * k * 10, y1: Y, x2: X, y2: Y - sy * k * 10 });
  return true;
}

/** Bevel a convex wall corner: wall cell (cx, cy) whose open sides face +sx and +sy. */
function bevel(g, walls, cx, cy, sx, sy) {
  if (get(g, cx, cy) !== '#' || get(g, cx + sx, cy) !== '.' || get(g, cx, cy + sy) !== '.' || get(g, cx + sx, cy + sy) !== '.') return false;
  if (get(g, cx - sx, cy) !== '#' || get(g, cx, cy - sy) !== '#') return false;
  g[cy][cx] = '.';
  const xo = cx * 10 + (sx > 0 ? 10 : 0), xi = cx * 10 + (sx > 0 ? 0 : 10);
  const yo = cy * 10 + (sy > 0 ? 10 : 0), yi = cy * 10 + (sy > 0 ? 0 : 10);
  walls.push({ x1: xo, y1: yi, x2: xi, y2: yo });
  return true;
}

/** Outer corner of a bend at pts[i]: the corner cell and its wall-side signs. */
function bendCorner(pts, i, w) {
  const [a, b] = halfW(w);
  const [px, py] = pts[i - 1], [vx, vy] = pts[i], [nx, ny] = pts[i + 1];
  const d1x = sign(vx - px), d1y = sign(vy - py), d2x = sign(nx - vx), d2y = sign(ny - vy);
  const sx = d1x || -d2x, sy = d1y || -d2y;
  let cx = vx + (sx > 0 ? b : -a), cy = vy + (sy > 0 ? b : -a);
  cx = Math.max(C0, Math.min(C1, cx)); cy = Math.max(R0, Math.min(R1, cy));
  return [cx, cy, sx, sy];
}

// ---------------------------------------------------------------- templates
// Each returns { kind, w, pts, tee, cup, rects?, build?(g, walls), chamferP, chamferK?, corners? }.
// pts: corridor centre line in tiles, tee near the bottom. Unmirrored; the
// generator mirrors half of them.

function straight(r) {
  const w = r.int(5, 7), [a, b] = halfW(w);
  const x = r.int(C0 + a + 1, C1 - b - 1), top = r.int(3, 7);
  const rects = r.next() < 0.5 ? [[x - a - 2, r.int(9, 12), x + b + 2, r.int(15, 19)]] : [];
  return { kind: 'straight', w, pts: [[x, 25], [x, top]], tee: [x, 25], cup: [x + r.int(1 - a, b - 1), top], rects, chamferP: 0 };
}

function jog(r) {
  const w = 5, x1 = r.int(3, 6), x2 = x1 + r.int(4, 7), ym = r.int(12, 18), top = r.int(3, 6);
  return { kind: 'jog', w, pts: [[x1, 25], [x1, ym], [x2, ym], [x2, top]], tee: [x1, 25], cup: [x2, top], chamferP: 0.6 };
}

function bowl(r) {
  const c0 = r.int(1, 3), c1 = r.int(14, 16), top = r.int(5, 9);
  const pts = [[c0 + 2, 24], [c0 + 2, top + 2], [c1 - 2, top + 2]];
  return {
    kind: 'bowl', w: 5, pts, tee: [c0 + r.int(2, 4), 24], cup: [c1 - r.int(2, 4), top + 2],
    rects: [[c0, top, c1, 26]], carve: false, chamferP: 0,
    corners: [[c0, top, -1, -1], [c1, top, 1, -1], [c0, 26, -1, 1], [c1, 26, 1, 1]], cornerP: 0.6,
  };
}

function shortL(r) {
  const w = 5, x1 = r.int(3, 6), top = r.int(6, 11), x2 = Math.min(14, x1 + r.int(6, 10));
  return { kind: 'shortL', w, pts: [[x1, 25], [x1, top], [x2, top]], tee: [x1, 25], cup: [x2, top], chamferP: 0.6 };
}

function ell(r) {
  const w = r.int(4, 5), x1 = r.int(3, 5), top = r.int(3, 5), x2 = r.int(12, 14);
  return { kind: 'L', w, pts: [[x1, 25], [x1, top], [x2, top]], tee: [x1, 25], cup: [x2, top], chamferP: 0.5 };
}

function dogleg(r) {
  const w = r.int(5, 6), x1 = r.int(3, 5), top = r.int(4, 7), x2 = r.int(12, 13);
  return { kind: 'dogleg', w, pts: [[x1, 25], [x1, top], [x2, top]], tee: [x1, 25], cup: [x2, top], chamferP: 1, chamferK: r.int(3, 4) };
}

function sbend(r) {
  const w = 4, x1 = r.int(3, 4), x2 = r.int(12, 14), ym = r.int(12, 17), top = r.int(3, 5);
  return { kind: 'sbend', w, pts: [[x1, 25], [x1, ym], [x2, ym], [x2, top]], tee: [x1, 25], cup: [x2, top], chamferP: 0.6 };
}

function uturn(r, long = false) {
  const w = 4, x1 = r.int(3, 4), x2 = r.int(12, 14), top = r.int(3, 5);
  const cupRow = long ? r.int(20, 24) : r.int(15, 20);
  return { kind: long ? 'bigU' : 'uturn', w, pts: [[x1, 25], [x1, top], [x2, top], [x2, cupRow]], tee: [x1, 25], cup: [x2, cupRow], chamferP: long ? 1 : 0.6 };
}

function island(r) {
  const gx0 = r.int(6, 7), gx1 = gx0 + 3, gy0 = r.int(4, 6), gy1 = gy0 + r.int(3, 4);
  const side = r.next() < 0.5 ? -1 : 1;
  const br = r.int(gy0, gy1 - 2);
  const teeC = r.int(5, 12);
  return {
    kind: 'island', w: 5, pts: [[teeC, 24], [side < 0 ? 2 : 15, 24], [side < 0 ? 2 : 15, br + 1]],
    tee: [teeC, 24], cup: [gx0 + 1 + r.int(0, 1), gy0 + 1 + r.int(0, gy1 - gy0 - 2)],
    rects: [[1, 2, 16, 26]], carve: false, chamferP: 0,
    build(g) {
      fillRect(g, gx0 - 2, gy0 - 2, gx1 + 2, gy1 + 2, 'w');
      fillRect(g, gx0, gy0, gx1, gy1, '.');
      if (side < 0) fillRect(g, gx0 - 2, br, gx0 - 1, br + 2, '.');
      else fillRect(g, gx1 + 1, br, gx1 + 2, br + 2, '.');
    },
    corners: [[1, 2, -1, -1], [16, 2, 1, -1], [1, 26, -1, 1], [16, 26, 1, 1]], cornerP: 0.5,
    protect: [[gx0 - 3, gy0 - 3, gx1 + 3, gy1 + 3]],
  };
}

function split(r, kind = 'split') {
  const top = r.int(2, 4);
  const bx0 = r.int(5, 6), bx1 = r.int(11, 12), by0 = r.int(top + 5, top + 7), by1 = r.int(18, 20);
  const teeC = r.int(bx0 + 1, bx1 - 1), lane = r.next() < 0.5 ? 3 : 14;
  return {
    kind, w: 5,
    pts: [[teeC, 24], [lane, 24], [lane, top + 2]],
    tee: [teeC, 24], cup: [r.int(bx0 + 1, bx1 - 1), top + r.int(1, 2)],
    rects: [[1, top, 16, 26]], carve: false,
    build(g, walls) {
      fillRect(g, bx0, by0, bx1, by1, '#');
      bevel(g, walls, bx0, by0, -1, -1); bevel(g, walls, bx1, by0, 1, -1);
      bevel(g, walls, bx0, by1, -1, 1); bevel(g, walls, bx1, by1, 1, 1);
    },
    // Lanes either side of the block, for slope bands.
    lanes: [[[3, by1], [3, by0]], [[14, by1], [14, by0]]],
    corners: [[1, top, -1, -1], [16, top, 1, -1], [1, 26, -1, 1], [16, 26, 1, 1]], cornerP: 0.7,
    chamferP: 0,
  };
}

function zigzag(r, kind = 'zigzag') {
  const w = 4, xl = r.int(3, 4), xr = r.int(12, 14), y1 = r.int(19, 21), y2 = y1 - r.int(7, 8), top = r.int(3, 4);
  return { kind, w, pts: [[xl, 25], [xl, y1], [xr, y1], [xr, y2], [xl, y2], [xl, top]], tee: [xl, 25], cup: [xl + r.int(0, 1), top], chamferP: kind === 'zigzag' ? 0.7 : 1 };
}

const TEMPLATES = {
  straight, jog, bowl, shortL, L: ell, dogleg, sbend, uturn: (r) => uturn(r), bigU: (r) => uturn(r, true), island,
  split: (r) => split(r), zigzag: (r) => zigzag(r),
  grandSplit: (r) => split(r, 'grandSplit'), grandZigzag: (r) => zigzag(r, 'grandZigzag'),
};

const POOLS = [
  ['straight', 'bowl', 'jog'],
  ['jog', 'shortL', 'bowl', 'straight'],
  ['shortL', 'jog', 'bowl'],
  ['L', 'dogleg', 'sbend', 'island'],
  ['L', 'dogleg', 'sbend', 'uturn', 'island', 'split'],
  ['sbend', 'uturn', 'island', 'split', 'dogleg'],
  ['uturn', 'island', 'split', 'sbend'],
  ['zigzag', 'bigU', 'split'],
  ['grandSplit', 'grandZigzag'],
];

// Pieces per hole (before a +0/+1 roll) and which kinds are allowed.
const PIECES = [1, 1, 2, 2, 3, 3, 3, 4, 7];
const PIECE_KINDS = [
  ['sand', 'bumper', 'slope'],
  ['sand', 'bumper', 'slope', 'wall'],
  ['sand', 'bumper', 'slope', 'wall', 'water'],
];

// ---------------------------------------------------------------- pieces

function legsOf(spec) {
  const legs = [];
  const add = (pts) => { for (let i = 0; i + 1 < pts.length; i++) legs.push([pts[i], pts[i + 1]]); };
  add(spec.pts);
  for (const l of spec.lanes || []) add(l);
  return legs;
}

function anchorOf(ctx, r) {
  const { spec } = ctx;
  const roll = r.next();
  if (roll < 0.3) return spec.cup;
  if (roll < 0.65 && spec.pts.length > 2) return spec.pts[r.int(1, spec.pts.length - 2)];
  return [r.int(C0 + 1, C1 - 1), r.int(R0 + 1, R1 - 3)];
}

function nearProtected(ctx, c, r, teeR, cupR) {
  const [tc, tr] = ctx.spec.tee, [cc, cr] = ctx.spec.cup;
  if (cheb(c, r, tc, tr) <= teeR || cheb(c, r, cc, cr) <= cupR) return true;
  for (const [a, b, c2, d] of ctx.spec.protect || []) if (c >= a && c <= c2 && r >= b && r <= d) return true;
  return false;
}

function placeSand(ctx, r) {
  const { g } = ctx;
  for (let t = 0; t < 12; t++) {
    const w = r.int(2, 4), h = r.int(2, 3);
    const [ac, ar] = anchorOf(ctx, r);
    const c0 = ac - r.int(0, w - 1) + r.int(-1, 1), r0 = ar - r.int(0, h - 1) + r.int(-1, 1);
    let ok = true;
    for (let y = r0; y < r0 + h && ok; y++) for (let x = c0; x < c0 + w && ok; x++) {
      if (get(g, x, y) !== '.' || nearProtected(ctx, x, y, 1, 0)) ok = false;
    }
    if (!ok) continue;
    fillRect(g, c0, r0, c0 + w - 1, r0 + h - 1, 's');
    return true;
  }
  return false;
}

function placeWater(ctx, r) {
  const { g } = ctx;
  for (let t = 0; t < 12; t++) {
    const w = r.int(2, 3), h = r.int(2, 3);
    const [ac, ar] = anchorOf(ctx, r);
    const c0 = ac - r.int(0, w - 1) + r.int(-2, 2), r0 = ar - r.int(0, h - 1) + r.int(-2, 2);
    let ok = true;
    for (let y = r0; y < r0 + h && ok; y++) for (let x = c0; x < c0 + w && ok; x++) {
      if (get(g, x, y) !== '.' || nearProtected(ctx, x, y, 3, 2)) ok = false;
    }
    if (!ok) continue;
    const saved = g.map(row => row.slice());
    fillRect(g, c0, r0, c0 + w - 1, r0 + h - 1, 'w');
    if (dryPath(g, ctx.spec.tee, ctx.spec.cup)) return true;
    for (let y = 0; y < ROWS; y++) g[y] = saved[y];
  }
  return false;
}

const SLOPE_CH = { '0,-1': '^', '0,1': 'v', '-1,0': '<', '1,0': '>' };

function placeSlope(ctx, r) {
  const { g, spec } = ctx;
  const legs = legsOf(spec);
  const [a, b] = halfW(spec.w);
  for (let t = 0; t < 10; t++) {
    const [[x1, y1], [x2, y2]] = r.pick(legs);
    const dx = sign(x2 - x1), dy = sign(y2 - y1);
    const L = Math.abs(x2 - x1) + Math.abs(y2 - y1);
    const bl = r.int(2, 3);
    if ((dx && dy) || L < bl + 3) continue;
    const s0 = r.int(1, L - bl - 1);
    const roll = r.next();
    let sx, sy;
    if (roll < 0.4) { sx = dx; sy = dy; } else if (roll < 0.7) { sx = -dx; sy = -dy; } else { const k = r.next() < 0.5 ? 1 : -1; sx = -dy * k; sy = dx * k; }
    const ch = SLOPE_CH[sx + ',' + sy];
    if (!ch) continue;
    const cells = [];
    let ok = true;
    for (let s = s0; s < s0 + bl && ok; s++) {
      for (let q = -a - 1; q <= b + 1 && ok; q++) {
        const c = x1 + dx * s + (dx ? 0 : q), rr = y1 + dy * s + (dy ? 0 : q);
        const v = get(g, c, rr);
        if (v === '#') continue;
        if (v !== '.' || nearProtected(ctx, c, rr, 2, 2)) ok = false;
        else cells.push([c, rr]);
      }
    }
    if (!ok || cells.length < 3) continue;
    for (const [c, rr] of cells) g[rr][c] = ch;
    return true;
  }
  return false;
}

function openAround(g, x, y, rad) {
  const c0 = Math.floor((x - rad) / 10), c1 = Math.floor((x + rad) / 10);
  const r0 = Math.floor((y - rad) / 10), r1 = Math.floor((y + rad) / 10);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (get(g, c, r) === '#') return false;
  return true;
}

function dryAround(g, x, y, rad) {
  const c0 = Math.floor((x - rad) / 10), c1 = Math.floor((x + rad) / 10);
  const r0 = Math.floor((y - rad) / 10), r1 = Math.floor((y + rad) / 10);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (get(g, c, r) === 'w') return false;
  return true;
}

function segPointDist2(w, px, py) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1, l2 = dx * dx + dy * dy;
  let u = ((px - w.x1) * dx + (py - w.y1) * dy) / l2;
  if (u < 0) u = 0; else if (u > 1) u = 1;
  const ex = px - w.x1 - dx * u, ey = py - w.y1 - dy * u;
  return ex * ex + ey * ey;
}

function pointFree(ctx, x, y, rad) {
  const { g, walls, bumpers, spec } = ctx;
  if (!openAround(g, x, y, rad + 13) || !dryAround(g, x, y, rad + 4)) return false;
  for (const [c, r] of [spec.tee, spec.cup]) {
    const dx = x - (c * 10 + 5), dy = y - (r * 10 + 5);
    if (dx * dx + dy * dy < (rad + 22) * (rad + 22)) return false;
  }
  for (const b of bumpers) {
    const dx = x - b.x, dy = y - b.y, m = b.r + rad + 14;
    if (dx * dx + dy * dy < m * m) return false;
  }
  for (const w of walls) if (segPointDist2(w, x, y) < (rad + 14) * (rad + 14)) return false;
  return true;
}

function placeBumpers(ctx, r) {
  const n = ctx.showpiece ? r.int(2, 3) : r.int(1, 2);
  let placed = 0;
  for (let t = 0; t < 30 && placed < n; t++) {
    const rad = r.int(4, 5);
    const [ac, ar] = placed ? [Math.floor(ctx.bumpers[ctx.bumpers.length - 1].x / 10), Math.floor(ctx.bumpers[ctx.bumpers.length - 1].y / 10)] : anchorOf(ctx, r);
    const x = (ac + r.int(-3, 3)) * 10 + r.pick([0, 5]), y = (ar + r.int(-3, 3)) * 10 + r.pick([0, 5]);
    if (!pointFree(ctx, x, y, rad)) continue;
    ctx.bumpers.push({ x, y, r: rad });
    placed++;
  }
  return placed > 0;
}

function placeDeflector(ctx, r) {
  for (let t = 0; t < 20; t++) {
    const [ac, ar] = anchorOf(ctx, r);
    const k = r.int(2, 3);
    const x1 = (ac + r.int(-3, 2)) * 10, y1 = (ar + r.int(-3, 2)) * 10;
    const dir = r.next() < 0.5 ? 1 : -1;
    const x2 = x1 + k * 10, y2 = y1 + dir * k * 10;
    let ok = true;
    for (let s = 0; s <= 4 && ok; s++) {
      const x = x1 + (x2 - x1) * s / 4, y = y1 + (y2 - y1) * s / 4;
      if (!pointFree(ctx, x, y, 1)) ok = false;
    }
    if (!ok) continue;
    ctx.walls.push({ x1, y1, x2, y2 });
    return true;
  }
  return false;
}

const PLACERS = { sand: placeSand, water: placeWater, slope: placeSlope, bumper: placeBumpers, wall: placeDeflector };

/** Tile route from tee to cup that keeps a tile clear of water on every side. */
function dryPath(g, tee, cup) {
  const ok = (c, r) => {
    const v = get(g, c, r);
    if (v === '#' || v === 'w') return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (get(g, c + dx, r + dy) === 'w') return false;
    return true;
  };
  if (!ok(tee[0], tee[1]) || !ok(cup[0], cup[1])) return false;
  const seen = new Uint8Array(COLS * ROWS);
  const q = [tee];
  seen[tee[1] * COLS + tee[0]] = 1;
  while (q.length) {
    const [c, r] = q.pop();
    if (c === cup[0] && r === cup[1]) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dx, nr = r + dy;
      if (!inside(nc, nr) || seen[nr * COLS + nc] || !ok(nc, nr)) continue;
      seen[nr * COLS + nc] = 1;
      q.push([nc, nr]);
    }
  }
  return false;
}

// ---------------------------------------------------------------- hole assembly

function assemble(spec, r, idx) {
  const g = newGrid();
  const walls = [], bumpers = [];
  if (spec.carve !== false) carveLegs(g, spec.pts, spec.w);
  for (const [a, b, c, d] of spec.rects || []) fillRect(g, a, b, c, d, '.');
  if (spec.build) spec.build(g, walls);

  // Angled walls at bends and corners.
  for (let i = 1; i + 1 < spec.pts.length && spec.carve !== false; i++) {
    if (r.next() >= spec.chamferP) continue;
    const k = spec.chamferK || r.int(2, Math.min(3, spec.w - 1));
    const [cx, cy, sx, sy] = bendCorner(spec.pts, i, spec.w);
    chamfer(g, walls, cx, cy, sx, sy, k);
  }
  for (const [cx, cy, sx, sy] of spec.corners || []) {
    if (r.next() < spec.cornerP) chamfer(g, walls, cx, cy, sx, sy, r.int(2, 3));
  }

  const showpiece = idx === 8;
  const ctx = { g, walls, bumpers, spec, showpiece };
  const counts = { sand: 0, water: 0, slope: 0, bumper: 0, wall: 0 };
  const kinds = PIECE_KINDS[idx < 2 ? 0 : idx < 4 ? 1 : 2];
  const want = PIECES[idx] + r.int(0, 1);
  // The showpiece gets one of everything first.
  const order = showpiece ? ['water', 'sand', 'slope', 'bumper', 'wall'] : [];
  while (order.length < want) order.push(r.pick(kinds));
  for (const k of order) if (PLACERS[k](ctx, r)) counts[k]++;
  if (spec.kind === 'island') counts.water += 2;
  return { g, walls, bumpers, counts };
}

function toHole(id, par, g, walls, bumpers, spec, mirror) {
  const mx = (x) => (mirror ? COLS * 10 - x : x);
  const flipCh = { '<': '>', '>': '<' };
  const tiles = g.map(row => {
    const rr = mirror ? row.slice().reverse().map(ch => flipCh[ch] || ch) : row;
    return rr.join('');
  });
  return {
    id, par, cols: COLS, rows: ROWS, tiles,
    walls: walls.map(w => ({ x1: mx(w.x1), y1: w.y1, x2: mx(w.x2), y2: w.y2 })),
    bumpers: bumpers.map(b => ({ x: mx(b.x), y: b.y, r: b.r })),
    tee: { x: mx(spec.tee[0] * 10 + 5), y: spec.tee[1] * 10 + 5 },
    cup: { x: mx(spec.cup[0] * 10 + 5), y: spec.cup[1] * 10 + 5 },
  };
}

/** One candidate hole for (day, hole index, attempt). Not yet checked. */
export function candidateHole(day, idx, attempt, avoid = []) {
  const r = makeRng(hashInts(day, idx + 1, attempt));
  const pool = POOLS[idx].filter(k => !avoid.includes(k));
  const kind = r.pick(pool.length ? pool : POOLS[idx]);
  const spec = TEMPLATES[kind](r);
  const { g, walls, bumpers, counts } = assemble(spec, r, idx);
  const mirror = r.next() < 0.5;
  const hole = toHole(`d${day}-h${idx + 1}`, PARS[idx], g, walls, bumpers, spec, mirror);
  return { hole, kind, counts, dry: dryPath(g, spec.tee, spec.cup) };
}

// ---------------------------------------------------------------- fallbacks
// Fixed, plain holes known to pass the solver (checked in test/daily.test.js).

function fixedRng(values) {
  // Feeds the template/assembly a scripted "random" sequence (first value of each range).
  let i = 0;
  return { next: () => values[i++ % values.length], int: (lo) => lo, pick: (arr) => arr[0] };
}

const FALLBACK_KIND = ['straight', 'straight', 'shortL', 'L', 'L', 'sbend', 'sbend', 'bigU', 'grandZigzag'];

export function fallbackHole(day, idx) {
  const kind = FALLBACK_KIND[idx];
  const r = fixedRng([0.99]);
  const spec = TEMPLATES[kind](r);
  const g = newGrid();
  const walls = [], bumpers = [];
  if (spec.carve !== false) carveLegs(g, spec.pts, spec.w);
  for (const [a, b, c, d] of spec.rects || []) fillRect(g, a, b, c, d, '.');
  if (spec.build) spec.build(g, walls);
  const counts = { sand: 0, water: 0, slope: 0, bumper: 0, wall: 0 };
  // Plain dressing that leaves the route open.
  const [cc, cr] = spec.cup;
  if (idx >= 2 && get(g, cc, cr + 2) === '.') { g[cr + 2][cc] = 's'; counts.sand++; }
  const hole = toHole(`d${day}-h${idx + 1}`, PARS[idx], g, walls, bumpers, spec, false);
  return { hole, kind, counts };
}

// ---------------------------------------------------------------- names

const KIND_NAMES = {
  straight: ['The Straight', 'Easy Street', 'The Runway', 'Long Lane', 'Main Street'],
  jog: ['The Jog', 'Side Step', 'The Shuffle', 'Little Kink'],
  bowl: ['The Bowl', 'Open Green', 'The Commons', 'Wide Open'],
  shortL: ['Short Corner', 'Quick Turn', 'The Nook', 'Tight Corner'],
  L: ['The Corner', 'Round the Bend', 'The Elbow', 'Square Turn'],
  dogleg: ['The Dogleg', 'The Cutback', 'Bank Shot', 'Crooked Mile'],
  sbend: ['The S-Bend', 'Snake Lane', 'The Wiggle', 'Switchback'],
  uturn: ['The Hairpin', 'U-Turn', 'Round Trip', 'The Horseshoe'],
  bigU: ['The Long Way Home', 'Hairpin Hill', 'There and Back', 'The Paperclip'],
  island: ['Island Green', 'The Moat', 'Castaway', 'Lily Pad'],
  split: ['The Fork', 'Two Roads', 'Choose Wisely', 'The Split'],
  zigzag: ['The Zigzag', 'Back and Forth', 'Lightning Bolt', 'The Staircase'],
  grandSplit: ['The Gauntlet', 'Grand Finale', 'The Big One', 'Last Call', 'The Showcase'],
  grandZigzag: ['The Gauntlet', 'Grand Finale', 'The Long Haul', 'Last Call', 'The Maze'],
};
const PIECE_NAMES = {
  sand: ['Sand Trap Alley', 'The Beach', 'Sandy Corner', 'Dune Run'],
  water: ['Water Hazard', 'Lily Pond', 'Splash Zone', 'The Creek'],
  bumper: ['Pinball Lane', 'Bumper Cars', 'The Posts', 'Ping Pong'],
  slope: ['The Hill', 'Rolling Hills', 'Downhill Run', 'The Ramp'],
  wall: ['Bank Shot', 'Angle Alley', 'The Ricochet', 'Carom Corner'],
};

function holeName(r, kind, counts, idx, used) {
  let list = KIND_NAMES[kind];
  if (idx < 8 && kind !== 'island' && r.next() < 0.45) {
    let best = null;
    for (const k of ['water', 'sand', 'slope', 'bumper', 'wall']) if (counts[k] >= 2 || (counts[k] && k === 'water')) { best = k; break; }
    if (best) list = PIECE_NAMES[best];
  }
  const start = r.int(0, list.length - 1);
  for (let i = 0; i < list.length; i++) {
    const n = list[(start + i) % list.length];
    if (!used.has(n)) return n;
  }
  for (let i = 2; ; i++) if (!used.has(list[start] + ' ' + i)) return list[start] + ' ' + i;
}

const NAME_A = ['Maple', 'Cedar', 'Willow', 'Birch', 'Oak', 'Pine', 'Elm', 'Juniper', 'Aspen', 'Hazel', 'Cherry', 'Chestnut',
  'Sunny', 'Clover', 'Meadow', 'Fox', 'Robin', 'Heron', 'Bramble', 'Thistle', 'Rose', 'Lark', 'Copper', 'Silver', 'Golden', 'Mossy'];
const NAME_B = ['Hollow', 'Ridge', 'Creek', 'Meadow', 'Valley', 'Brook', 'Glen', 'Hill', 'Park', 'Point', 'Grove', 'Springs',
  'Field', 'Bay', 'Lake', 'Dale', 'Heights', 'Gardens', 'Pond', 'Bend', 'Crossing'];
const NAME_C = ['Links', 'Mini Golf', 'Putting Green', 'Golf Garden', 'Greens', 'Putt Club', 'Fairways'];

function courseName(day) {
  const r = makeRng(hashInts(day, 0x5eed));
  const a = r.pick(NAME_A);
  let b = r.pick(NAME_B);
  if (b === a) b = 'Hollow';
  return `${a} ${b} ${r.pick(NAME_C)}`;
}

// ---------------------------------------------------------------- course

/** Build one checked hole. Returns { hole, kind, attempts, fallback, solve }. */
export function makeHole(day, idx, avoid = []) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const c = candidateHole(day, idx, attempt, avoid);
    if (!c.dry) continue;
    const res = solveHole(c.hole, { par: PARS[idx], minStrokes: PARS[idx] - 1 });
    if (res.ok) return { ...c, attempts: attempt + 1, fallback: false, solve: res };
  }
  return { ...fallbackHole(day, idx), attempts: MAX_ATTEMPTS, fallback: true, solve: null };
}

/** The course for day n: { day, date, name, holes: [9] }. Same on every device. */
export function generateCourse(n, opts = {}) {
  const holes = [];
  const usedKinds = [], usedNames = new Set();
  const stats = [];
  for (let idx = 0; idx < 9; idx++) {
    const made = makeHole(n, idx, usedKinds);
    usedKinds.push(made.kind);
    const name = holeName(makeRng(hashInts(n, idx + 1, 0x4e41)), made.kind, made.counts, idx, usedNames);
    usedNames.add(name);
    holes.push({ ...made.hole, name });
    stats.push({ kind: made.kind, attempts: made.attempts, fallback: made.fallback, strokes: made.solve?.strokes, sims: made.solve?.sims });
  }
  const course = { day: n, date: dateOfDay(n), name: courseName(n), holes };
  if (opts.stats) Object.defineProperty(course, 'stats', { value: stats, enumerable: false });
  return course;
}
