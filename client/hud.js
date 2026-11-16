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

// Sits at whichever end of the screen is away from the cup, so the trails that
// end there stay visible.
export function drawResult(ctx, label, sub, cupY = 0) {
  const y = cupY < 145 ? 262 : 30;
  panel(ctx, 22, y, 136, 42, 0.9);
  txt(ctx, label, 90, y + 6, label === 'Hole in one!' ? GOLD : '#ffffff', 'center', 'bold 14px monospace');
  txt(ctx, sub, 90, y + 27, SOFT, 'center', '8px monospace');
}
