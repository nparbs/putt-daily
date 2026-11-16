import { W } from './input.js';

export const HUD_H = 24;
export const MAX_STROKES = 8;

export function resultLabel(strokes, par, holed) {
  if (!holed) return 'Max strokes';
  if (strokes === 1) return 'Hole in one!';
  const d = strokes - par;
  if (d <= -3) return 'Albatross';
  if (d === -2) return 'Eagle';
  if (d === -1) return 'Birdie';
  if (d === 0) return 'Par';
  if (d === 1) return 'Bogey';
  if (d === 2) return 'Double bogey';
  return '+' + d;
}

function text(ctx, s, x, y, color, align = 'left') {
  ctx.textAlign = align; ctx.textBaseline = 'top';
  ctx.fillStyle = '#000'; ctx.fillText(s, x + 1, y + 1);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}

export function drawHud(ctx, hole, name, strokes) {
  ctx.fillStyle = '#14301c'; ctx.fillRect(0, 0, W, HUD_H);
  ctx.fillStyle = '#0c1f12'; ctx.fillRect(0, HUD_H - 1, W, 1);
  ctx.font = 'bold 8px monospace';
  text(ctx, name, 6, 3, '#f4efd8');
  ctx.font = '8px monospace';
  text(ctx, 'Par ' + hole.par, 6, 13, '#bcd8b0');
  text(ctx, 'Strokes ' + Math.min(strokes, MAX_STROKES), W - 6, 13, '#f4efd8', 'right');
}

export function drawResult(ctx, label, sub) {
  ctx.fillStyle = 'rgba(10,25,14,0.8)';
  ctx.fillRect(20, 126, 140, 44);
  ctx.fillStyle = '#e8c26a'; ctx.fillRect(20, 126, 140, 1); ctx.fillRect(20, 169, 140, 1);
  ctx.font = 'bold 12px monospace';
  text(ctx, label, 90, 133, '#ffffff', 'center');
  ctx.font = '8px monospace';
  text(ctx, sub, 90, 154, '#bcd8b0', 'center');
}
