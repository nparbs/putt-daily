// Canvas screens in the same pixel style. Buttons are pushed to `ui`; main.js hit-tests them.
import { W, H } from './input.js';

export const GOLD = '#e8c26a', CREAM = '#f4efd8', SOFT = '#bcd8b0';

export function txt(ctx, s, x, y, color = CREAM, align = 'left', font = '8px monospace') {
  ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'top';
  ctx.fillStyle = '#000'; ctx.fillText(s, x + 1, y + 1);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}

export function fmtDiff(d) { return d === 0 ? 'E' : (d > 0 ? '+' : '') + d; }
export function diffColor(d) { return d < 0 ? '#7fc8ff' : d === 0 ? '#9be36b' : d === 1 ? '#f0d24a' : '#e5503c'; }

export function button(ctx, ui, id, x, y, w, h, label, enabled = true) {
  ctx.fillStyle = '#0c1f12'; ctx.fillRect(x + 1, y + 2, w, h);
  ctx.fillStyle = enabled ? GOLD : '#4d5a50'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = enabled ? '#2a6b3c' : '#24372b'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = enabled ? '#3a8a50' : '#2c4234'; ctx.fillRect(x + 1, y + 1, w - 2, 1);
  txt(ctx, label, x + w / 2, y + Math.round(h / 2) - 4, enabled ? '#ffffff' : '#7f8f84', 'center', 'bold 8px monospace');
  if (enabled) ui.push({ id, x, y, w, h });
}

function backdrop(ctx) {
  ctx.fillStyle = '#14301c'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1a3d25'; ctx.fillRect(4, 4, W - 8, H - 8);
  ctx.fillStyle = '#7a4b25'; ctx.fillRect(4, 4, W - 8, 1); ctx.fillRect(4, H - 5, W - 8, 1);
  ctx.fillRect(4, 4, 1, H - 8); ctx.fillRect(W - 5, 4, 1, H - 8);
}

export function drawPlayHud(ctx, ui, st) {
  ctx.fillStyle = '#14301c'; ctx.fillRect(0, 0, W, 24);
  ctx.fillStyle = '#0c1f12'; ctx.fillRect(0, 23, W, 1);
  let name = st.hole + '/9 ' + (st.name || '');
  if (name.length > 20) name = name.slice(0, 20);
  txt(ctx, name, 6, 3, CREAM, 'left', 'bold 8px monospace');
  txt(ctx, 'Par ' + st.par, 6, 13, SOFT);
  txt(ctx, 'Strokes ' + Math.min(st.strokes, 8), W - 6, 13, CREAM, 'right');
  if (st.practice) txt(ctx, 'PRACTICE', 92, 13, '#f0a05a', 'center');
  button(ctx, ui, 'menu', W - 44, 2, 38, 10, 'MENU');
}

export function drawTitle(ctx, ui, st) {
  backdrop(ctx);
  txt(ctx, 'PUTT DAILY', W / 2, 16, GOLD, 'center', 'bold 16px monospace');
  txt(ctx, 'Day ' + st.day, W / 2, 38, CREAM, 'center', 'bold 10px monospace');
  if (st.courseName) txt(ctx, st.courseName.slice(0, 30), W / 2, 52, SOFT, 'center');
  txt(ctx, st.todayLine, W / 2, 68, st.todayDone ? '#9be36b' : CREAM, 'center');
  txt(ctx, 'Streak ' + st.streak + (st.nick ? '  ' + st.nick : ''), W / 2, 80, SOFT, 'center');
  if (st.note) txt(ctx, st.note, W / 2, 92, '#f0a05a', 'center');
  // little green with a flag
  ctx.fillStyle = '#3f9d55'; ctx.fillRect(30, 112, 120, 56);
  ctx.fillStyle = '#7a4b25'; ctx.fillRect(30, 112, 120, 2); ctx.fillRect(30, 166, 120, 2);
  ctx.fillStyle = '#000'; ctx.fillRect(110, 152, 8, 3);
  ctx.fillStyle = '#e8e8e8'; ctx.fillRect(114, 130, 1, 23);
  ctx.fillStyle = '#d83a3a'; ctx.fillRect(115, 130, 7, 1); ctx.fillRect(115, 131, 5, 1); ctx.fillRect(115, 132, 3, 1);
  ctx.fillStyle = '#fff'; ctx.fillRect(56, 150, 5, 5);
  txt(ctx, 'Drag back from the ball to aim.', W / 2, 184, CREAM, 'center');
  txt(ctx, 'Release to putt. Longer = harder.', W / 2, 196, CREAM, 'center');
  txt(ctx, '9 holes, 8 strokes max a hole.', W / 2, 208, CREAM, 'center');
  button(ctx, ui, 'play', 8, 240, 80, 28, st.playLabel);
  button(ctx, ui, 'practice', 92, 240, 80, 28, st.practiceLabel);
  button(ctx, ui, 'archive', 8, 278, 56, 26, 'Archive');
  button(ctx, ui, 'music', 68, 278, 52, 26, 'Music ' + (st.music ? 'on' : 'off'));
  button(ctx, ui, 'sound', 124, 278, 48, 26, 'Sfx ' + (st.sfx ? 'on' : 'off'));
}

export function drawCard(ctx, ui, st) {
  backdrop(ctx);
  txt(ctx, 'DAY ' + st.day + ' SCORECARD', W / 2, 10, GOLD, 'center', 'bold 10px monospace');
  if (st.course) txt(ctx, st.course.slice(0, 30), W / 2, 23, SOFT, 'center');
  if (st.practice) txt(ctx, 'PRACTICE - not scored', W / 2, 33, '#f0a05a', 'center');
  const y0 = 46;
  txt(ctx, 'Hole', 16, y0, SOFT); txt(ctx, 'Par', 74, y0, SOFT);
  txt(ctx, 'Strokes', 118, y0, SOFT, 'center'); txt(ctx, '+/-', 160, y0, SOFT, 'center');
  let tp = 0, ts = 0;
  for (let i = 0; i < 9; i++) {
    const y = y0 + 13 + i * 15, p = st.pars[i], s = st.strokes[i], d = s - p;
    tp += p; ts += s;
    if (i % 2 === 0) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(10, y - 3, W - 20, 14); }
    txt(ctx, String(i + 1), 20, y, CREAM); txt(ctx, String(p), 77, y, CREAM);
    txt(ctx, String(s), 118, y, CREAM, 'center');
    txt(ctx, fmtDiff(d), 160, y, diffColor(d), 'center', 'bold 8px monospace');
  }
  const yt = y0 + 13 + 9 * 15 + 4;
  ctx.fillStyle = GOLD; ctx.fillRect(10, yt - 3, W - 20, 1);
  txt(ctx, 'Total', 20, yt + 2, CREAM, 'left', 'bold 10px monospace');
  txt(ctx, String(ts), 118, yt + 2, CREAM, 'center', 'bold 10px monospace');
  txt(ctx, fmtDiff(ts - tp), 160, yt + 2, diffColor(ts - tp), 'center', 'bold 10px monospace');
  if (!st.practice) txt(ctx, 'Streak ' + st.streak + (st.nick ? '  ' + st.nick : ''), W / 2, yt + 22, SOFT, 'center');
  button(ctx, ui, 'menu', 8, 280, 76, 28, 'Menu');
  if (!st.practice) button(ctx, ui, 'copy', 96, 280, 76, 28, st.copied ? 'Copied!' : 'Copy result');
  else button(ctx, ui, 'again', 96, 280, 76, 28, 'Again');
}

export const ROW_H = 24, VIEW_Y = 26, VIEW_H = 244;

export function drawArchive(ctx, ui, st) {
  backdrop(ctx);
  txt(ctx, 'ARCHIVE', W / 2, 8, GOLD, 'center', 'bold 10px monospace');
  ctx.save();
  ctx.beginPath(); ctx.rect(8, VIEW_Y, W - 16, VIEW_H); ctx.clip();
  for (let i = 0; i < st.days.length; i++) {
    const d = st.days[i], y = VIEW_Y + i * ROW_H - st.scroll;
    if (y + ROW_H < VIEW_Y || y > VIEW_Y + VIEW_H) continue;
    ctx.fillStyle = i % 2 ? '#1f4a2c' : '#245434'; ctx.fillRect(8, y, W - 16, ROW_H - 2);
    txt(ctx, 'Day ' + d.n, 14, y + 4, CREAM, 'left', 'bold 8px monospace');
    txt(ctx, d.date, 14, y + 13, SOFT, 'left', '6px monospace');
    if (d.best) txt(ctx, 'Best ' + d.best.t + ' (' + fmtDiff(d.best.t - d.best.p) + ')', W - 14, y + 4, diffColor(d.best.t - d.best.p), 'right');
    else txt(ctx, 'not played', W - 14, y + 4, '#7f9a86', 'right');
    if (d.scored) txt(ctx, 'daily run', W - 14, y + 13, GOLD, 'right', '6px monospace');
    const top = Math.max(y, VIEW_Y), bot = Math.min(y + ROW_H - 2, VIEW_Y + VIEW_H);
    ui.push({ id: 'day:' + d.n, x: 8, y: top, w: W - 16, h: bot - top });
  }
  ctx.restore();
  txt(ctx, 'Tap a day to practice it', W - 8, 290, SOFT, 'right', '6px monospace');
  button(ctx, ui, 'menu', 8, 282, 76, 26, 'Back');
}
