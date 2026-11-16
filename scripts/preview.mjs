// Print a day's nine holes as ASCII: node scripts/preview.mjs 3
// Legend: # wall  . felt  s sand  w water  ^v<> slope  T tee  O cup  o bumper  / \ angled wall

import { generateCourse, dayNumber } from '../shared/daily.js';

const day = process.argv[2] ? parseInt(process.argv[2], 10) : dayNumber();
const t0 = performance.now();
const course = generateCourse(day, { stats: true });
const ms = performance.now() - t0;

function render(hole) {
  const g = hole.tiles.map(row => row.split(''));
  for (const w of hole.walls) {
    const ch = (w.x2 - w.x1) * (w.y2 - w.y1) > 0 ? '\\' : '/';
    const n = Math.max(Math.abs(w.x2 - w.x1), Math.abs(w.y2 - w.y1)) / 2;
    for (let k = 0; k <= n; k++) {
      const x = w.x1 + (w.x2 - w.x1) * k / n, y = w.y1 + (w.y2 - w.y1) * k / n;
      // Nudge off exact tile corners toward the cell the segment crosses.
      const c = Math.floor((x + (k < n ? 0.5 * Math.sign(w.x2 - w.x1) : -0.5 * Math.sign(w.x2 - w.x1))) / 10);
      const r = Math.floor((y + (k < n ? 0.5 * Math.sign(w.y2 - w.y1) : -0.5 * Math.sign(w.y2 - w.y1))) / 10);
      if (g[r] && g[r][c] !== undefined && g[r][c] !== '#') g[r][c] = ch;
    }
  }
  for (const b of hole.bumpers) g[Math.floor(b.y / 10)][Math.floor(b.x / 10)] = 'o';
  g[Math.floor(hole.tee.y / 10)][Math.floor(hole.tee.x / 10)] = 'T';
  g[Math.floor(hole.cup.y / 10)][Math.floor(hole.cup.x / 10)] = 'O';
  return g.map(r => r.join(''));
}

console.log(`Day ${course.day} (${course.date}): ${course.name}   generated in ${ms.toFixed(0)} ms\n`);
const PER_ROW = 3, GAP = '   ';
for (let i = 0; i < 9; i += PER_ROW) {
  const group = course.holes.slice(i, i + PER_ROW);
  const pics = group.map(render);
  const heads = group.map((h, k) => {
    const s = course.stats[i + k];
    return `${i + k + 1}. ${h.name} (par ${h.par})`.slice(0, 22).padEnd(22) + GAP;
  });
  const subs = group.map((h, k) => {
    const s = course.stats[i + k];
    return `${s.kind}, try ${s.attempts}${s.fallback ? ' FALLBACK' : ''}, bot ${s.strokes ?? '-'}`.slice(0, 22).padEnd(22) + GAP;
  });
  console.log(heads.join(''));
  console.log(subs.join(''));
  for (let r = 0; r < pics[0].length; r++) console.log(pics.map(p => p[r].padEnd(22) + GAP).join(''));
  console.log('');
}
