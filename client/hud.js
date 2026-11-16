import { panel, txt, GOLD, SOFT } from './screens.js';

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

export function drawResult(ctx, label, sub) {
  panel(ctx, 22, 122, 136, 48, 0.9);
  txt(ctx, label, 90, 130, label === 'Hole in one!' ? GOLD : '#ffffff', 'center', 'bold 14px monospace');
  txt(ctx, sub, 90, 153, SOFT, 'center', '8px monospace');
}
