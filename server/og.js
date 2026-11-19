// Link-preview image (1200 x 630 PNG) for a day: the signature hole 9 drawn from
// the tile map, plus the title, day and course name in a small pixel font.
// No dependencies: a tiny RGB raster and PNG encoder on node:zlib.
import zlib from 'node:zlib';

const IW = 1200, IH = 630;

// ---- 5 x 7 pixel font (bit 4 = left column)
const FONT = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 17, 10, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
  3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 2, 12],
  '#': [10, 10, 31, 10, 31, 10, 10], '-': [0, 0, 0, 31, 0, 0, 0], '+': [0, 4, 4, 31, 4, 4, 0],
  '.': [0, 0, 0, 0, 0, 12, 12], "'": [4, 4, 8, 0, 0, 0, 0], '?': [14, 17, 1, 2, 4, 0, 4],
  ':': [0, 12, 12, 0, 12, 12, 0], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8],
  _: [0, 0, 0, 0, 0, 0, 31], '!': [4, 4, 4, 4, 4, 0, 4], ' ': [0, 0, 0, 0, 0, 0, 0],
};

const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

function raster(w, h) {
  const px = new Uint8Array(w * h * 3);
  const put = (x, y, c, a = 1) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 3;
    if (a >= 1) { px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; }
    else for (let k = 0; k < 3; k++) px[i + k] = Math.round(px[i + k] * (1 - a) + c[k] * a);
  };
  const rect = (x, y, rw, rh, c, a) => {
    for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(h, Math.ceil(y + rh)); yy++)
      for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(w, Math.ceil(x + rw)); xx++) put(xx, yy, c, a);
  };
  const disc = (cx, cy, r, c, a) => {
    for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++)
      for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++)
        if ((xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2 <= r * r) put(xx, yy, c, a);
  };
  const line = (x1, y1, x2, y2, t, c, a) => {
    const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1;
    for (let yy = Math.floor(Math.min(y1, y2) - t); yy <= Math.ceil(Math.max(y1, y2) + t); yy++)
      for (let xx = Math.floor(Math.min(x1, x2) - t); xx <= Math.ceil(Math.max(x1, x2) + t); xx++) {
        const px_ = xx + 0.5, py = yy + 0.5;
        const u = Math.max(0, Math.min(1, ((px_ - x1) * dx + (py - y1) * dy) / L));
        const ex = x1 + u * dx - px_, ey = y1 + u * dy - py;
        if (ex * ex + ey * ey <= t * t) put(xx, yy, c, a);
      }
  };
  const textWidth = (s, sc) => s.length * 6 * sc - sc;
  const text = (s, x, y, sc, c, shadow = true) => {
    s = String(s).toUpperCase();
    for (const pass of shadow ? [1, 0] : [0]) {
      let cx = x + pass * Math.max(1, sc >> 1);
      const oy = y + pass * Math.max(1, sc >> 1);
      for (const ch of s) {
        const g = FONT[ch] || FONT['?'];
        for (let r = 0; r < 7; r++) for (let b = 0; b < 5; b++)
          if (g[r] & (16 >> b)) rect(cx + b * sc, oy + r * sc, sc, sc, pass ? [0, 0, 0] : c, pass ? 0.45 : 1);
        cx += 6 * sc;
      }
    }
  };
  return { w, h, px, put, rect, disc, line, text, textWidth };
}

function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const C = {
  bg: hex('#14301c'), rough: hex('#2f6b35'), roughDark: hex('#285c2e'), felt: hex('#4fae4a'), feltDark: hex('#47a043'),
  slope: hex('#3f9440'), arrow: hex('#8fd47d'), sand: hex('#e6cf8b'), sandDark: hex('#cdb46f'), water: hex('#3d8fd6'),
  foam: hex('#bfe3ff'), rail: hex('#8a5a2b'), railLight: hex('#b07a3e'), bumper: hex('#d9473a'), bumperRim: hex('#ffd0c8'),
  cup: hex('#10140f'), rim: hex('#f2f2e6'), flag: hex('#e8433a'), pole: hex('#f5f5f5'), tee: hex('#2f7f3a'),
  gold: hex('#f2c75c'), cream: hex('#fbf6e4'), soft: hex('#c6e2bb'), ball: hex('#ffffff'),
};

function drawHole(r, hole, ox, oy, s) {
  const T = 10;
  const at = (tx, ty) => (ty < 0 || ty >= hole.rows || tx < 0 || tx >= hole.cols) ? '#' : hole.tiles[ty][tx];
  r.rect(ox - 8, oy - 8, hole.cols * T * s + 16, hole.rows * T * s + 16, [0, 0, 0], 0.35);
  for (let ty = 0; ty < hole.rows; ty++)
    for (let tx = 0; tx < hole.cols; tx++) {
      const ch = at(tx, ty), x = ox + tx * T * s, y = oy + ty * T * s, z = T * s;
      if (ch === '#') { r.rect(x, y, z, z, (tx + ty) % 2 ? C.rough : C.roughDark); continue; }
      const felt = ty % 2 ? C.felt : C.feltDark;
      if (ch === 's') { r.rect(x, y, z, z, C.sand); r.rect(x + z * 0.3, y + z * 0.4, s, s, C.sandDark); }
      else if (ch === 'w') { r.rect(x, y, z, z, C.water); r.rect(x + z * 0.2, y + z * 0.3, z * 0.35, s, C.foam, 0.6); }
      else if ('^v<>'.includes(ch)) {
        r.rect(x, y, z, z, C.slope);
        const cx = x + z / 2, cy = y + z / 2, a = z * 0.22, t = Math.max(1, s * 0.6);
        const d = { '^': [0, -1], v: [0, 1], '<': [-1, 0], '>': [1, 0] }[ch];
        const px = -d[1], py = d[0];
        r.line(cx + d[0] * a, cy + d[1] * a, cx - d[0] * a + px * a, cy - d[1] * a + py * a, t, C.arrow);
        r.line(cx + d[0] * a, cy + d[1] * a, cx - d[0] * a - px * a, cy - d[1] * a - py * a, t, C.arrow);
      } else r.rect(x, y, z, z, felt);
    }
  // rails where play meets the outside
  const rw = Math.max(2, Math.round(1.6 * s));
  for (let ty = 0; ty < hole.rows; ty++)
    for (let tx = 0; tx < hole.cols; tx++) {
      if (at(tx, ty) === '#') continue;
      const x = ox + tx * T * s, y = oy + ty * T * s, z = T * s;
      if (at(tx, ty - 1) === '#') r.rect(x, y, z, rw, C.railLight);
      if (at(tx, ty + 1) === '#') r.rect(x, y + z - rw, z, rw, C.rail);
      if (at(tx - 1, ty) === '#') r.rect(x, y, rw, z, C.rail);
      if (at(tx + 1, ty) === '#') r.rect(x + z - rw, y, rw, z, C.rail);
    }
  for (const w of hole.walls || []) r.line(ox + w.x1 * s, oy + w.y1 * s, ox + w.x2 * s, oy + w.y2 * s, 1.3 * s, C.rail);
  for (const b of hole.bumpers || []) { r.disc(ox + b.x * s, oy + b.y * s, b.r * s + s, C.bumperRim); r.disc(ox + b.x * s, oy + b.y * s, b.r * s, C.bumper); }
  // tee mat, ball, cup and flag
  r.rect(ox + (hole.tee.x - 6) * s, oy + (hole.tee.y - 4) * s, 12 * s, 8 * s, C.tee);
  r.disc(ox + hole.tee.x * s, oy + hole.tee.y * s, 2.4 * s, C.ball);
  const cx = ox + hole.cup.x * s, cy = oy + hole.cup.y * s;
  r.disc(cx, cy, 3.6 * s, C.rim); r.disc(cx, cy, 3 * s, C.cup);
  r.rect(cx - 0.4 * s, cy - 16 * s, 0.9 * s, 16 * s, C.pole);
  for (let i = 0; i < 6; i++) r.rect(cx + 0.5 * s, cy - 16 * s + i * s, (7 - i) * s, s, C.flag);
}

function wrap(r, s, sc, maxW) {
  const out = []; let cur = '';
  for (const word of s.split(' ')) {
    const t = cur ? cur + ' ' + word : word;
    if (r.textWidth(t, sc) > maxW && cur) { out.push(cur); cur = word; } else cur = t;
  }
  if (cur) out.push(cur);
  return out;
}

/** PNG for a course; `challenge` = { nick, total, diff } adds a "beat this" line. */
export function ogImage(course, challenge = null) {
  const r = raster(IW, IH);
  r.rect(0, 0, IW, IH, C.bg);
  for (let i = 0; i < 1400; i++) { const h = Math.imul(i + 1, 2654435761) >>> 0; r.rect(h % IW, (h >>> 11) % IH, 3, 3, C.roughDark, 0.5); }
  r.rect(0, 0, IW, 10, C.gold); r.rect(0, IH - 10, IW, 10, C.gold);

  const hole = course.holes[8], s = 1.75;
  drawHole(r, hole, IW - 60 - hole.cols * 10 * s, (IH - hole.rows * 10 * s) / 2, s);

  const x = 64, maxW = 690;
  r.text('PUTT DAILY', x, 62, 11, C.gold);
  r.text('DAY ' + course.day, x, 158, 7, C.cream);
  let y = 230;
  for (const ln of wrap(r, course.name, 5, maxW).slice(0, 2)) { r.text(ln, x, y, 5, C.soft); y += 48; }
  y += 14;
  if (challenge) {
    const d = challenge.diff === 0 ? 'E' : (challenge.diff > 0 ? '+' : '') + challenge.diff;
    r.text(challenge.nick + ' shot', x, y, 5, C.cream);
    r.text(challenge.total + ' (' + d + ')', x, y + 46, 5, C.cream);
    r.text('Can you beat it?', x, y + 104, 5, C.gold);
  } else {
    r.text('9 new holes every day.', x, y, 4, C.cream);
    r.text('Same course for everyone.', x, y + 42, 4, C.cream);
  }
  r.text('Hole 9: ' + hole.name, x, IH - 72, 3, C.soft);
  return png(IW, IH, r.px);
}

/** Square app icon: a flag in a cup on green, with a white ball. */
export function iconPng(size) {
  const r = raster(size, size), u = size / 32;
  r.rect(0, 0, size, size, C.bg);
  r.disc(size / 2, size / 2, size * 0.44, C.felt);
  const cx = 18 * u, cy = 22 * u;
  r.disc(cx, cy, 3.4 * u, C.rim); r.disc(cx, cy, 2.7 * u, C.cup);
  r.rect(cx - 0.5 * u, cy - 15 * u, u, 15 * u, C.pole);
  for (let i = 0; i < 6; i++) r.rect(cx + 0.5 * u, cy - 15 * u + i * u, (7 - i) * u, u, C.flag);
  r.disc(10 * u, 21 * u, 2.6 * u, [0, 0, 0], 0.3);
  r.disc(9.6 * u, 20.4 * u, 2.4 * u, C.ball);
  return png(size, size, r.px);
}
