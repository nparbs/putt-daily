import { BALL_R } from '../shared/physics.js';
import { W, H } from './input.js';
import { HUD_H } from './hud.js';

export const OY = HUD_H;   // world y -> canvas y offset
const T = 10;

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
const rect = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h); };

function disc(c, col, cx, cy, r) {
  c.fillStyle = col;
  const ri = Math.ceil(r), ox = Math.round(cx), oy = Math.round(cy);
  for (let dy = -ri; dy <= ri; dy++)
    for (let dx = -ri; dx <= ri; dx++)
      if (dx * dx + dy * dy <= r * r + 0.5) c.fillRect(ox + dx, oy + dy, 1, 1);
}

function line(c, col, x1, y1, x2, y2, th) {
  const dx = x2 - x1, dy = y2 - y1;
  const n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy)));
  c.fillStyle = col;
  for (let i = 0; i <= n; i++)
    c.fillRect(Math.round(x1 + dx * i / n - th / 2), Math.round(y1 + dy * i / n - th / 2), th, th);
}

// Two chevrons pointing the slope direction.
function chevron(c, ch, x, y) {
  const dirs = { '^': [0, -1], 'v': [0, 1], '<': [-1, 0], '>': [1, 0] };
  const [dx, dy] = dirs[ch];
  c.fillStyle = '#2b7f40';
  for (const o of [-1, 4]) {
    for (let i = -3; i <= 3; i++) {
      const back = Math.abs(i);
      const along = o - back;                 // tip furthest forward
      const px = dx === 0 ? 5 + i : 5 + dx * along;
      const py = dy === 0 ? 5 + i : 5 + dy * along;
      c.fillRect(x + px, y + py, 1, 1);
    }
  }
}

function tile(c, ch, tx, ty) {
  const x = tx * T, y = OY + ty * T;
  if (ch === '#') {
    rect(c, '#7a4b25', x, y, T, T);
    for (let i = 0; i < 12; i++) {
      const h = hash(tx * 7 + i, ty * 3 + i);
      rect(c, h & 1 ? '#6a3f1e' : '#8c5a2e', x + h % 10, y + (h >> 4) % 10, 2, 1);
    }
    rect(c, '#a2713f', x, y, T, 1);
    rect(c, '#4f2d14', x, y + T - 1, T, 1);
    return;
  }
  if (ch === 's') {
    rect(c, '#e2c985', x, y, T, T);
    for (let i = 0; i < 14; i++) {
      const h = hash(tx * 13 + i, ty * 5 + i);
      rect(c, h & 1 ? '#c9ae6a' : '#f1dfa8', x + h % 10, y + (h >> 5) % 10, 1, 1);
    }
    return;
  }
  if (ch === 'w') { rect(c, '#2a6fc0', x, y, T, T); return; }
  // felt
  rect(c, ((tx + ty) & 1) ? '#3f9d55' : '#3a9650', x, y, T, T);
  for (let py = 0; py < T; py++)
    for (let px = 0; px < T; px++)
      if (((px + py + tx + ty) & 1) === 0 && (hash(x + px, y + py) & 7) === 0)
        rect(c, '#46a85d', x + px, y + py, 1, 1);
  if ('^v<>'.includes(ch)) chevron(c, ch, x, y);
}

export function buildLayer(hole) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  rect(c, '#14301c', 0, 0, W, H);
  const water = [];
  for (let ty = 0; ty < hole.rows; ty++)
    for (let tx = 0; tx < hole.cols; tx++) {
      const ch = hole.tiles[ty][tx];
      tile(c, ch, tx, ty);
      if (ch === 'w') water.push([tx, ty]);
    }
  for (const w of hole.walls || []) {
    line(c, '#4f2d14', w.x1, OY + w.y1 + 1, w.x2, OY + w.y2 + 1, 3);
    line(c, '#8c5a2e', w.x1, OY + w.y1, w.x2, OY + w.y2, 3);
    line(c, '#a2713f', w.x1, OY + w.y1 - 1, w.x2, OY + w.y2 - 1, 1);
  }
  for (const b of hole.bumpers || []) {
    disc(c, 'rgba(0,0,0,0.35)', b.x + 1, OY + b.y + 1, b.r);
    disc(c, '#b8322e', b.x, OY + b.y, b.r);
    disc(c, '#e8584f', b.x, OY + b.y, Math.max(1, b.r - 2));
    rect(c, '#ffd0c8', Math.round(b.x - b.r / 3), Math.round(OY + b.y - b.r / 2), 1, 1);
  }
  disc(c, '#1a1a1a', hole.cup.x, OY + hole.cup.y, 4);
  disc(c, '#000', hole.cup.x, OY + hole.cup.y, 3);
  return { canvas: cv, water };
}

export function drawFrame(ctx, layer, hole, sim, aim, t) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(layer.canvas, 0, 0);
  const f = Math.floor(t / 140);
  for (const [tx, ty] of layer.water)
    for (let k = 0; k < 3; k++) {
      const x = tx * T + 1 + ((f + k * 3 + ty * 2 + tx) % 7);
      rect(ctx, k === 1 ? '#8fc4f0' : '#5a9ae0', x, OY + ty * T + 2 + k * 3, 2, 1);
    }
  // flag
  const cx = Math.round(hole.cup.x), cy = Math.round(OY + hole.cup.y);
  rect(ctx, '#e8e8e8', cx, cy - 14, 1, 14);
  rect(ctx, '#d83a3a', cx + 1, cy - 14, 5, 1);
  rect(ctx, '#d83a3a', cx + 1, cy - 13, 4, 1);
  rect(ctx, '#d83a3a', cx + 1, cy - 12, 2, 1);
  const b = sim.ball, bx = b.x, by = OY + b.y;
  if (aim && sim.state === 'rest') {
    const len = Math.sqrt(aim.ax * aim.ax + aim.ay * aim.ay);
    const ux = aim.ax / len, uy = aim.ay / len;
    const reach = 10 + aim.p / 1000 * 44;
    for (let d = 5; d <= reach; d += 4)
      rect(ctx, '#ffffff', Math.round(bx + ux * d), Math.round(by + uy * d), 1, 1);
    rect(ctx, '#0c1f12', 10, 313, 160, 5);
    const frac = aim.p / 1000;
    rect(ctx, frac < 0.5 ? '#9be36b' : frac < 0.8 ? '#f0d24a' : '#e5503c', 11, 314, Math.round(158 * frac), 3);
  }
  if (sim.state !== 'holed') {
    disc(ctx, 'rgba(0,0,0,0.35)', bx + 1, by + 1, BALL_R);
    disc(ctx, '#ffffff', bx, by, BALL_R);
  }
}
