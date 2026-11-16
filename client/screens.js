// Canvas screens. Buttons are pushed to `ui`; main.js hit-tests them.
// Text is drawn at full device resolution (see view.js), so it stays sharp.
import { W, H } from './input.js';
import * as wx from './weather.js';

export const GOLD = '#f2c75c', CREAM = '#fbf6e4', SOFT = '#c6e2bb';
export const FAM = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export function txt(ctx, s, x, y, color = CREAM, align = 'left', font = '8px monospace') {
  ctx.font = font.replace('monospace', FAM); ctx.textAlign = align; ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(s, x + 0.6, y + 0.7);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
export function measure(ctx, s, font) { ctx.font = font.replace('monospace', FAM); return ctx.measureText(s).width; }

export function fmtDiff(d) { return d === 0 ? 'E' : (d > 0 ? '+' : '') + d; }
export function diffColor(d) { return d < 0 ? '#86d0ff' : d === 0 ? '#a7f070' : d === 1 ? '#ffd84a' : '#ff6a4d'; }

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
export function panel(ctx, x, y, w, h, alpha = 0.82) {
  rrect(ctx, x + 0.8, y + 1.2, w, h, 3); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
  rrect(ctx, x, y, w, h, 3); ctx.fillStyle = 'rgba(14,34,21,' + alpha + ')'; ctx.fill();
  ctx.strokeStyle = 'rgba(242,199,92,0.55)'; ctx.lineWidth = 0.7; ctx.stroke();
}

export function button(ctx, ui, id, x, y, w, h, label, enabled = true, style = 'normal') {
  const main = style === 'main', on = style === 'on';
  rrect(ctx, x + 0.5, y + 1.6, w, h, 3); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
  rrect(ctx, x, y, w, h, 3);
  ctx.fillStyle = !enabled ? '#3a463e' : main ? '#e9b949' : on ? '#3d9152' : '#2c6e3e'; ctx.fill();
  ctx.strokeStyle = !enabled ? '#56645a' : main ? '#fff0b8' : GOLD; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,' + (main ? 0.3 : 0.14) + ')'; ctx.fillRect(x + 2, y + 1, w - 4, 1);
  const fs = h >= 24 ? 10 : 8;
  ctx.font = 'bold ' + fs + 'px ' + FAM; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = main ? '#3a2a05' : !enabled ? '#8a978e' : '#ffffff';
  ctx.fillText(label, x + w / 2, y + h / 2 + 0.6);
  if (enabled) ui.push({ id, x, y, w, h });
}

// Weather line: icon + "Rain · 8°C".
export function weatherChip(ctx, x, y, align = 'center') {
  const w = wx.current();
  const t = wx.tempText(w);
  const s = wx.label(w) + (t ? ' · ' + t : '');
  const f = 'bold 8px monospace';
  const tw = measure(ctx, s, f) + 13;
  const x0 = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
  wx.drawIcon(ctx, x0 + 5, y + 4.5, w, 0.85);
  txt(ctx, s, x0 + 12, y, CREAM, 'left', f);
}

export function drawPlayHud(ctx, ui, st) {
  ctx.fillStyle = 'rgba(10,26,16,0.9)'; ctx.fillRect(0, 0, W, 24);
  ctx.fillStyle = 'rgba(242,199,92,0.5)'; ctx.fillRect(0, 23.4, W, 0.6);
  let name = st.hole + '/9  ' + (st.name || '');
  ctx.font = 'bold 8px ' + FAM;
  while (name.length > 4 && ctx.measureText(name).width > W - 58) name = name.slice(0, -1);
  txt(ctx, name, 5, 3, CREAM, 'left', 'bold 8px monospace');
  txt(ctx, 'Par ' + st.par, 5, 13.5, SOFT, 'left', 'bold 8px monospace');
  const w = wx.current();
  wx.drawIcon(ctx, 40, 17.5, w, 0.7);
  txt(ctx, wx.tempText(w), 46, 13.5, SOFT, 'left', '7px monospace');
  if (st.practice) txt(ctx, 'PRACTICE', 99, 13.5, '#ffb06a', 'center', 'bold 7px monospace');
  txt(ctx, 'Strokes ' + Math.min(st.strokes, 8), W - 5, 13.5, CREAM, 'right', 'bold 8px monospace');
  button(ctx, ui, 'menu', W - 42, 2, 37, 10, 'MENU');
}

export function drawTitle(ctx, ui, st) {
  panel(ctx, 8, 6, W - 16, 74);
  txt(ctx, 'PUTT DAILY', W / 2, 11, GOLD, 'center', 'bold 20px monospace');
  txt(ctx, 'Day ' + st.day, W / 2, 34, CREAM, 'center', 'bold 10px monospace');
  if (st.courseName) txt(ctx, st.courseName.slice(0, 34), W / 2, 48, SOFT, 'center', '8px monospace');
  weatherChip(ctx, W / 2, 63);

  panel(ctx, 8, 160, W - 16, 66);
  txt(ctx, st.todayLine, W / 2, 166, st.todayDone ? '#a7f070' : CREAM, 'center', 'bold 9px monospace');
  txt(ctx, 'Streak ' + st.streak + (st.nick ? '  ·  ' + st.nick : ''), W / 2, 179, SOFT, 'center', '8px monospace');
  if (st.note) txt(ctx, st.note, W / 2, 190, '#ffb06a', 'center', '7px monospace');
  txt(ctx, 'Drag back from the ball, release to putt.', W / 2, 201, CREAM, 'center', '7px monospace');
  txt(ctx, '9 holes · 8 strokes max a hole', W / 2, 212, SOFT, 'center', '7px monospace');

  button(ctx, ui, 'play', 8, 234, 96, 30, st.playLabel, true, 'main');
  button(ctx, ui, 'practice', 110, 234, 62, 30, st.practiceLabel);
  button(ctx, ui, 'archive', 8, 274, 80, 26, 'Archive');
  button(ctx, ui, 'settings', 92, 274, 80, 26, 'Settings');
}

export function drawSettings(ctx, ui, st) {
  panel(ctx, 8, 6, W - 16, 22);
  txt(ctx, 'SETTINGS', W / 2, 11, GOLD, 'center', 'bold 11px monospace');

  panel(ctx, 8, 34, W - 16, 64);
  txt(ctx, 'Sound', 16, 40, SOFT, 'left', 'bold 8px monospace');
  button(ctx, ui, 'music', 16, 52, 72, 24, 'Music ' + (st.music ? 'on' : 'off'), true, st.music ? 'on' : 'normal');
  button(ctx, ui, 'sound', 92, 52, 72, 24, 'Effects ' + (st.sfx ? 'on' : 'off'), true, st.sfx ? 'on' : 'normal');
  txt(ctx, 'Rain, birds and wind follow Effects.', W / 2, 83, SOFT, 'center', '6.5px monospace');

  panel(ctx, 8, 104, W - 16, 170);
  txt(ctx, 'Weather on the course', 16, 110, SOFT, 'left', 'bold 8px monospace');
  txt(ctx, 'Looks only: holes and scores never change.', 16, 121, SOFT, 'left', '6.5px monospace');
  const m = st.mode;
  button(ctx, ui, 'wx:live', 16, 132, 72, 24, 'Live', true, m === 'live' ? 'on' : 'normal');
  button(ctx, ui, 'wx:off', 92, 132, 72, 24, 'Always clear', true, m === 'off' ? 'on' : 'normal');
  const prev = m !== 'live' && m !== 'off';
  txt(ctx, 'Preview a look', 16, 164, SOFT, 'left', 'bold 7px monospace');
  button(ctx, ui, 'wx:prev', 16, 175, 26, 24, '◀');
  ctx.fillStyle = prev ? 'rgba(61,145,82,0.9)' : 'rgba(0,0,0,0.3)'; ctx.fillRect(46, 175, 88, 24);
  txt(ctx, prev ? st.previewLabel : '–', W / 2, 182, CREAM, 'center', 'bold 8px monospace');
  button(ctx, ui, 'wx:next', 138, 175, 26, 24, '▶');

  txt(ctx, 'Location', 16, 208, SOFT, 'left', 'bold 7px monospace');
  txt(ctx, st.locLine, 16, 219, CREAM, 'left', '6.5px monospace');
  button(ctx, ui, st.gps ? 'wx:forget' : 'wx:gps', 16, 232, 148, 24, st.gps ? 'Stop using phone location' : 'Use my phone location');
  txt(ctx, 'Rounded to about 10 km first.', W / 2, 261, SOFT, 'center', '6.5px monospace');

  button(ctx, ui, 'menu', 8, 282, 80, 26, 'Back');
  weatherChip(ctx, 132, 291);
}

export function drawCard(ctx, ui, st) {
  panel(ctx, 8, 6, W - 16, 268);
  txt(ctx, 'DAY ' + st.day + ' SCORECARD', W / 2, 12, GOLD, 'center', 'bold 11px monospace');
  if (st.course) txt(ctx, st.course.slice(0, 34), W / 2, 26, SOFT, 'center', '8px monospace');
  if (st.practice) txt(ctx, 'PRACTICE · not scored', W / 2, 36, '#ffb06a', 'center', 'bold 7px monospace');
  const y0 = 48;
  txt(ctx, 'Hole', 16, y0, SOFT, 'left', 'bold 7px monospace'); txt(ctx, 'Par', 74, y0, SOFT, 'left', 'bold 7px monospace');
  txt(ctx, 'Strokes', 118, y0, SOFT, 'center', 'bold 7px monospace'); txt(ctx, '+/-', 158, y0, SOFT, 'center', 'bold 7px monospace');
  let tp = 0, ts = 0;
  for (let i = 0; i < 9; i++) {
    const y = y0 + 13 + i * 15, p = st.pars[i], s = st.strokes[i], d = s - p;
    tp += p; ts += s;
    if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(12, y - 3, W - 24, 14); }
    txt(ctx, String(i + 1), 20, y, CREAM, 'left', '9px monospace'); txt(ctx, String(p), 77, y, CREAM, 'left', '9px monospace');
    txt(ctx, String(s), 118, y, CREAM, 'center', 'bold 9px monospace');
    ctx.fillStyle = diffColor(d); ctx.globalAlpha = 0.22; ctx.fillRect(146, y - 2, 24, 12); ctx.globalAlpha = 1;
    txt(ctx, fmtDiff(d), 158, y, diffColor(d), 'center', 'bold 9px monospace');
  }
  const yt = y0 + 13 + 9 * 15 + 4;
  ctx.fillStyle = GOLD; ctx.fillRect(12, yt - 3, W - 24, 0.8);
  txt(ctx, 'Total', 20, yt + 2, CREAM, 'left', 'bold 11px monospace');
  txt(ctx, String(ts), 118, yt + 2, CREAM, 'center', 'bold 11px monospace');
  txt(ctx, fmtDiff(ts - tp), 158, yt + 2, diffColor(ts - tp), 'center', 'bold 11px monospace');
  if (!st.practice) txt(ctx, 'Streak ' + st.streak + (st.nick ? '  ·  ' + st.nick : ''), W / 2, yt + 22, SOFT, 'center', '8px monospace');
  button(ctx, ui, 'menu', 8, 282, 76, 28, 'Menu');
  if (!st.practice) button(ctx, ui, 'copy', 92, 282, 80, 28, st.copied ? 'Copied!' : 'Copy result', true, 'main');
  else button(ctx, ui, 'again', 92, 282, 80, 28, 'Again', true, 'main');
}

export const ROW_H = 24, VIEW_Y = 30, VIEW_H = 244;

export function drawArchive(ctx, ui, st) {
  panel(ctx, 8, 6, W - 16, 20);
  txt(ctx, 'ARCHIVE', W / 2, 10, GOLD, 'center', 'bold 11px monospace');
  panel(ctx, 6, VIEW_Y - 2, W - 12, VIEW_H + 4, 0.55);
  ctx.save();
  ctx.beginPath(); ctx.rect(8, VIEW_Y, W - 16, VIEW_H); ctx.clip();
  for (let i = 0; i < st.days.length; i++) {
    const d = st.days[i], y = VIEW_Y + i * ROW_H - st.scroll;
    if (y + ROW_H < VIEW_Y || y > VIEW_Y + VIEW_H) continue;
    ctx.fillStyle = i % 2 ? 'rgba(30,74,44,0.92)' : 'rgba(38,88,54,0.92)'; ctx.fillRect(8, y, W - 16, ROW_H - 2);
    txt(ctx, 'Day ' + d.n, 14, y + 3, CREAM, 'left', 'bold 9px monospace');
    txt(ctx, d.date, 14, y + 13, SOFT, 'left', '6.5px monospace');
    if (d.best) txt(ctx, 'Best ' + d.best.t + ' (' + fmtDiff(d.best.t - d.best.p) + ')', W - 14, y + 3, diffColor(d.best.t - d.best.p), 'right', 'bold 8px monospace');
    else txt(ctx, 'not played', W - 14, y + 3, '#9fb6a5', 'right', '8px monospace');
    if (d.scored) txt(ctx, 'daily run', W - 14, y + 13, GOLD, 'right', '6.5px monospace');
    const top = Math.max(y, VIEW_Y), bot = Math.min(y + ROW_H - 2, VIEW_Y + VIEW_H);
    ui.push({ id: 'day:' + d.n, x: 8, y: top, w: W - 16, h: bot - top });
  }
  ctx.restore();
  button(ctx, ui, 'menu', 8, 282, 76, 26, 'Back');
  txt(ctx, 'Tap a day to practice it', W - 8, 291, CREAM, 'right', '7px monospace');
}
