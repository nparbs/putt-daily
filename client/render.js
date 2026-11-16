// Course renderer. World is 180 x 320 units; the canvas backing store is k device
// pixels per unit (see view.js), so edges, the ball and text stay sharp on phones.
// The static parts of a hole go on a cached layer; slopes, water, flag, ball and
// weather animate per frame.
import { BALL_R } from '../shared/physics.js';
import { W, H } from './input.js';
import { HUD_H } from './hud.js';
import * as wx from './weather.js';

export const OY = HUD_H;   // world y -> screen y offset
const T = 10;
const TAU = Math.PI * 2;

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
const rect = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
function circle(c, col, x, y, r) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }

const PLAY = ch => ch !== '#';

function makeCanvas(k) {
  const cv = document.createElement('canvas');
  cv.width = W * k; cv.height = H * k;
  const c = cv.getContext('2d');
  c.setTransform(k, 0, 0, k, 0, 0);
  c.imageSmoothingEnabled = false;
  return { cv, c };
}

// Rough grass (or snow) outside the course, with tufts and the odd pebble.
function paintRough(c, p, snow) {
  rect(c, p.rough, 0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    const h = hash(i * 31, i * 17 + 5);
    const x = h % W, y = (h >>> 9) % H;
    rect(c, (h >>> 20) & 1 ? p.roughDark : p.roughLight, x, y, 1, snow ? 1 : 2);
  }
  for (let i = 0; i < 40; i++) {
    const h = hash(i * 97 + 3, i * 13);
    const x = h % W, y = (h >>> 8) % H;
    if ((h >>> 18) % 3 === 0) { circle(c, snow ? '#c3d1dc' : 'rgba(150,160,150,0.55)', x, y, 1.1); circle(c, snow ? '#e4ecf2' : 'rgba(200,205,195,0.5)', x - 0.3, y - 0.4, 0.6); }
    else if (!snow) { rect(c, '#e8e4c8', x, y, 1, 1); rect(c, '#f5d65a', x + 2, y + 1, 1, 1); }
  }
}

export function buildLayer(hole, k = 1, w = wx.current()) {
  const { cv, c } = makeCanvas(k);
  const p = wx.palette(w);
  const snow = w.kind === 'snow';
  const at = (tx, ty) => (ty < 0 || ty >= hole.rows || tx < 0 || tx >= hole.cols) ? '#' : hole.tiles[ty][tx];
  const solid = (tx, ty) => !PLAY(at(tx, ty));
  paintRough(c, p, snow);

  const water = [], slopes = [];
  // 1. surfaces
  for (let ty = 0; ty < hole.rows; ty++)
    for (let tx = 0; tx < hole.cols; tx++) {
      const ch = at(tx, ty);
      if (!PLAY(ch)) continue;
      const x = tx * T, y = OY + ty * T;
      if (ch === 's') {
        rect(c, p.sand, x, y, T, T);
        for (let i = 0; i < 9; i++) { const h = hash(tx * 13 + i, ty * 5 + i); rect(c, p.sandDot, x + h % 10, y + (h >>> 5) % 10, 1, 1); }
      } else if (ch === 'w') {
        rect(c, ((tx + ty) & 1) ? p.water : p.water2, x, y, T, T);
        rect(c, p.water, x, y, T, T);
        water.push([tx, ty]);
      } else {
        const stripe = (ty >> 1) & 1;
        const slope = '^v<>'.includes(ch);
        rect(c, slope ? (stripe ? p.slope : p.slope2) : (stripe ? p.felt : p.felt2), x, y, T, T);
        for (let i = 0; i < 4; i++) { const h = hash(tx * 7 + i, ty * 11 + i); rect(c, p.feltDot, x + h % 10, y + (h >>> 6) % 10, 1, 1); }
        if (slope) slopes.push([tx, ty, ch]);
      }
    }
  // 2. edges between surfaces: sand lip, water foam
  for (let ty = 0; ty < hole.rows; ty++)
    for (let tx = 0; tx < hole.cols; tx++) {
      const ch = at(tx, ty), x = tx * T, y = OY + ty * T;
      if (ch !== 's' && ch !== 'w') continue;
      const col = ch === 's' ? p.sandEdge : p.waterEdge;
      const n = [[0, -1, x, y, T, 1], [0, 1, x, y + T - 1, T, 1], [-1, 0, x, y, 1, T], [1, 0, x + T - 1, y, 1, T]];
      for (const [dx, dy, rx, ry, rw, rh] of n) {
        const o = at(tx + dx, ty + dy);
        if (o !== ch && PLAY(o)) rect(c, col, rx, ry, rw, rh);
      }
    }
  // 3. shade cast on the playing surface by rails above and left of it
  for (let ty = 0; ty < hole.rows; ty++)
    for (let tx = 0; tx < hole.cols; tx++) {
      if (solid(tx, ty)) continue;
      const x = tx * T, y = OY + ty * T;
      if (solid(tx, ty - 1)) rect(c, p.shade, x, y, T, 2);
      if (solid(tx - 1, ty)) rect(c, p.shade, x, y + (solid(tx, ty - 1) ? 2 : 0), 2, T - (solid(tx, ty - 1) ? 2 : 0));
    }
  // 4. rails: a 4-unit wooden kerb on the course side of each solid tile
  const R = 4;
  for (let ty = -1; ty <= hole.rows; ty++)
    for (let tx = -1; tx <= hole.cols; tx++) {
      if (!solid(tx, ty)) continue;
      const x = tx * T, y = OY + ty * T;
      const up = !solid(tx, ty - 1), dn = !solid(tx, ty + 1), lf = !solid(tx - 1, ty), rt = !solid(tx + 1, ty);
      const strips = [];
      if (up) strips.push([x, y, T, R]);
      if (dn) strips.push([x, y + T - R, T, R]);
      if (lf) strips.push([x, y, R, T]);
      if (rt) strips.push([x + T - R, y, R, T]);
      // inside corners: a play tile only diagonally adjacent
      if (!up && !lf && !solid(tx - 1, ty - 1)) strips.push([x, y, R, R]);
      if (!up && !rt && !solid(tx + 1, ty - 1)) strips.push([x + T - R, y, R, R]);
      if (!dn && !lf && !solid(tx - 1, ty + 1)) strips.push([x, y + T - R, R, R]);
      if (!dn && !rt && !solid(tx + 1, ty + 1)) strips.push([x + T - R, y + T - R, R, R]);
      if (!strips.length) continue;
      for (const s of strips) rect(c, p.railDark, s[0], s[1], s[2], s[3]);
      for (const s of strips) rect(c, p.rail, s[0] + 0.5, s[1] + 0.5, s[2] - 1, s[3] - 1);
      // wood grain
      for (const s of strips) for (let i = 0; i < 2; i++) {
        const h = hash(tx * 5 + i, ty * 9 + i);
        rect(c, p.railDark, s[0] + 1 + h % Math.max(1, s[2] - 3), s[1] + 1 + (h >>> 4) % Math.max(1, s[3] - 2), 1.5, 0.5);
      }
      // lit top edge
      for (const s of strips) rect(c, p.cap || p.railTop, s[0] + 0.5, s[1] + 0.5, s[2] - 1, p.cap ? 1.2 : 0.8);
    }
  // 5. angled walls
  c.lineCap = 'round';
  for (const s of hole.walls || []) {
    c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = 3.4;
    c.beginPath(); c.moveTo(s.x1 + 1.4, OY + s.y1 + 1.6); c.lineTo(s.x2 + 1.4, OY + s.y2 + 1.6); c.stroke();
    c.strokeStyle = p.railDark; c.lineWidth = 3.6;
    c.beginPath(); c.moveTo(s.x1, OY + s.y1); c.lineTo(s.x2, OY + s.y2); c.stroke();
    c.strokeStyle = p.rail; c.lineWidth = 2.6; c.stroke();
    c.strokeStyle = p.cap || p.railTop; c.lineWidth = p.cap ? 1.1 : 0.7;
    c.beginPath(); c.moveTo(s.x1, OY + s.y1 - 0.6); c.lineTo(s.x2, OY + s.y2 - 0.6); c.stroke();
  }
  // 6. bumpers
  for (const b of hole.bumpers || []) {
    const by = OY + b.y;
    circle(c, 'rgba(0,0,0,0.3)', b.x + 1.2, by + 1.5, b.r);
    circle(c, '#7d1714', b.x, by, b.r);
    circle(c, p.bumper, b.x, by, b.r - 0.6);
    c.strokeStyle = p.bumperRing; c.lineWidth = 0.9;
    c.beginPath(); c.arc(b.x, by, Math.max(1, b.r - 1.8), 0, TAU); c.stroke();
    circle(c, snow ? '#ffffff' : 'rgba(255,255,255,0.7)', b.x - b.r * 0.35, by - b.r * 0.4, Math.max(0.6, b.r * 0.22));
  }
  // 7. tee mat
  const tx0 = hole.tee.x, ty0 = OY + hole.tee.y;
  rect(c, 'rgba(0,0,0,0.12)', tx0 - 6, ty0 - 4, 12, 9);
  rect(c, p.mat, tx0 - 6, ty0 - 4.5, 12, 9);
  rect(c, 'rgba(255,255,255,0.18)', tx0 - 6, ty0 - 4.5, 12, 0.7);
  circle(c, '#f4f4f4', tx0 - 4.5, ty0, 0.8); circle(c, '#f4f4f4', tx0 + 4.5, ty0, 0.8);
  // 8. cup
  const cx = hole.cup.x, cy = OY + hole.cup.y;
  circle(c, 'rgba(255,255,255,0.5)', cx, cy, 5.4);
  circle(c, '#1d1d1d', cx, cy, 4.2);
  circle(c, '#050505', cx + 0.4, cy + 0.5, 3.4);
  return { canvas: cv, water, slopes, k, kind: w.kind };
}

const DIRS = { '^': [0, -1], 'v': [0, 1], '<': [-1, 0], '>': [1, 0] };

function drawSlopes(ctx, slopes, t, col) {
  const ph = (t / 55) % 10;
  ctx.strokeStyle = col; ctx.lineWidth = 1.1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [tx, ty, ch] of slopes) {
    const x = tx * T, y = OY + ty * T;
    const [dx, dy] = DIRS[ch];
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, T, T); ctx.clip();
    ctx.beginPath();
    for (const o of [-10, 0]) {
      const a = o + ph;                        // distance travelled along the slope
      const mx = x + 5 + dx * (a - 0), my = y + 5 + dy * (a - 0);
      // chevron tip at (mx, my) + dir*2, arms back 2.5 and out 3
      const tipx = mx + dx * 2, tipy = my + dy * 2;
      ctx.moveTo(tipx - dx * 2.5 + dy * 3, tipy - dy * 2.5 + dx * 3);
      ctx.lineTo(tipx, tipy);
      ctx.lineTo(tipx - dx * 2.5 - dy * 3, tipy - dy * 2.5 - dx * 3);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function drawWater(ctx, water, t, p) {
  const f = t / 1000;
  ctx.fillStyle = p.ripple;
  for (const [tx, ty] of water) {
    for (let k = 0; k < 2; k++) {
      const h = hash(tx * 3 + k, ty * 7);
      const ph = (f * 0.6 + (h % 100) / 100) % 1;
      const x = tx * T + 1.5 + (h % 5) + ph * 3, y = OY + ty * T + 2.5 + k * 4.5;
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.8;
      ctx.fillRect(x, y, 3, 0.7);
    }
  }
  ctx.globalAlpha = 1;
}

function drawFlag(ctx, cx, cy, t, w) {
  const side = wx.windSide(w), s = wx.windStrength(w);
  rect(ctx, 'rgba(0,0,0,0.25)', cx + 0.6, cy - 0.5, 6 * side, 0.9);   // pole shadow
  rect(ctx, '#3a3a3a', cx - 0.6, cy - 16, 1.2, 16);
  rect(ctx, '#f2f2f2', cx - 0.6, cy - 16, 0.6, 16);
  const len = 7, ht = 5, top = cy - 16;
  const wave = (0.4 + s * 1.3);
  ctx.fillStyle = '#e8382f';
  ctx.beginPath();
  ctx.moveTo(cx, top);
  for (let i = 1; i <= 6; i++) {
    const u = i / 6;
    ctx.lineTo(cx + side * len * u * (0.75 + s * 0.25), top + Math.sin(t / (160 - s * 70) - u * 3) * wave * u + u * ht * 0.5 * (1 - s * 0.6));
  }
  for (let i = 6; i >= 0; i--) {
    const u = i / 6;
    ctx.lineTo(cx + side * len * u * (0.75 + s * 0.25), top + ht - u * ht * 0.5 * (1 + s * 0.2) + Math.sin(t / (160 - s * 70) - u * 3) * wave * u);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(cx + (side > 0 ? 0.6 : -2), top + 0.5, 1.4, 1);
}

function drawBall(ctx, bx, by) {
  circle(ctx, 'rgba(0,0,0,0.32)', bx + 0.9, by + 1.2, BALL_R + 0.2);
  circle(ctx, '#1e2a22', bx, by, BALL_R + 0.55);
  circle(ctx, '#ffffff', bx, by, BALL_R);
  circle(ctx, '#d9dee0', bx + 0.6, by + 0.7, BALL_R * 0.55);
  circle(ctx, '#ffffff', bx - 0.3, by - 0.3, BALL_R * 0.6);
  circle(ctx, '#ffffff', bx - 0.8, by - 0.9, 0.55);
}

function drawAim(ctx, bx, by, aim) {
  const len = Math.sqrt(aim.ax * aim.ax + aim.ay * aim.ay);
  const ux = aim.ax / len, uy = aim.ay / len;
  const frac = aim.p / 1000;
  const reach = 10 + frac * 46;
  const col = frac < 0.5 ? '#a7f070' : frac < 0.8 ? '#ffd84a' : '#ff6a4d';
  for (let d = 6; d <= reach; d += 4) {
    const r = 1.1 - (d / reach) * 0.4;
    circle(ctx, 'rgba(0,0,0,0.55)', bx + ux * d, by + uy * d, r + 0.5);
    circle(ctx, d + 4 > reach ? col : '#ffffff', bx + ux * d, by + uy * d, r);
  }
  // arrow head at the end
  const ex = bx + ux * (reach + 3), ey = by + uy * (reach + 3);
  ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(ex + ux * 3, ey + uy * 3);
  ctx.lineTo(ex - uy * 2.4, ey + ux * 2.4);
  ctx.lineTo(ex + uy * 2.4, ey - ux * 2.4);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // power meter along the bottom edge
  rect(ctx, 'rgba(8,20,12,0.85)', 8, 312, W - 16, 7);
  rect(ctx, '#2a3a2e', 9, 313, W - 18, 5);
  rect(ctx, col, 9, 313, (W - 18) * frac, 5);
  rect(ctx, 'rgba(255,255,255,0.35)', 9, 313, (W - 18) * frac, 1);
  for (const m of [0.5, 0.8]) rect(ctx, 'rgba(0,0,0,0.5)', 9 + (W - 18) * m, 313, 0.6, 5);
}

export function drawFrame(ctx, layer, hole, sim, aim, t) {
  const w = wx.current();
  const p = wx.palette(w);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(layer.canvas, 0, 0, W, H);
  drawWater(ctx, layer.water, t, p);
  drawSlopes(ctx, layer.slopes, t, p.arrow);
  wx.drawGround(ctx, t, w);
  const cx = hole.cup.x, cy = OY + hole.cup.y;
  const b = sim.ball, bx = b.x, by = OY + b.y;
  wx.drawNight(ctx, [{ x: cx, y: cy - 4, r: 34, a: 0.4 }, { x: bx, y: by, r: 22, a: 0.3 }, { x: hole.tee.x, y: OY + hole.tee.y, r: 14, a: 0.15 }], w);
  drawFlag(ctx, cx, cy, t, w);
  if (aim && sim.state === 'rest') drawAim(ctx, bx, by, aim);
  if (sim.state !== 'holed') drawBall(ctx, bx, by);
  wx.drawSky(ctx, t, w);
}

// Title / menu backdrop: a little practice green in today's weather.
const TITLE_HOLE = (() => {
  const rows = new Array(29).fill('##################');
  rows[8] = '##......<<....s.##';
  rows[9] = '##......<<......##';
  rows[10] = '##..............##';
  rows[11] = '##..ww.......ss.##';
  return {
    cols: 18, rows: 29, tiles: rows,
    walls: [], bumpers: [{ x: 75, y: 112, r: 3.5 }],
    tee: { x: 40, y: 98 }, cup: { x: 140, y: 100 },
  };
})();

export function buildTitleLayer(k, w = wx.current()) { return buildLayer(TITLE_HOLE, k, w); }

export function drawTitleScene(ctx, layer, t) {
  const w = wx.current();
  ctx.drawImage(layer.canvas, 0, 0, W, H);
  drawWater(ctx, layer.water, t, wx.palette(w));
  drawSlopes(ctx, layer.slopes, t, wx.palette(w).arrow);
  wx.drawGround(ctx, t, w);
  const h = TITLE_HOLE, cx = h.cup.x, cy = OY + h.cup.y;
  // the ball rolls up to the cup and drops, on a loop
  const k = ((t / 4200) % 1);
  const e = Math.min(1, k / 0.6), ease = 1 - (1 - e) * (1 - e);
  const bx = h.tee.x + (cx - h.tee.x) * ease, by = OY + h.tee.y + (cy - OY - h.tee.y) * ease + Math.sin(ease * Math.PI) * -6;
  wx.drawNight(ctx, [{ x: cx, y: cy - 4, r: 34, a: 0.4 }, { x: bx, y: by, r: 18, a: 0.25 }], w);
  drawFlag(ctx, cx, cy, t, w);
  if (k < 0.6) drawBall(ctx, bx, by);
  wx.drawSky(ctx, t, w);
}
