// Live local weather, cosmetic only: it changes how the course looks and sounds,
// never the course, the physics or the score. Everyone plays the same holes.
//
// Source: GET /api/weather (the server looks up Open-Meteo from the visitor's rough
// location). Players can opt in to phone location instead; it is rounded to 0.1 deg
// (about 10 km) before it leaves the device.
import { W, H } from './input.js';

const LS_MODE = 'pd.wx.mode';     // 'live' | 'off' | a preview kind
const LS_GPS = 'pd.wx.gps';       // { lat, lon } rounded, only after the player taps "Use my location"
const LS_LAST = 'pd.wx.last';     // last live reading, for an instant start
const TTL = 15 * 60 * 1000;

export const KINDS = ['clear', 'partly', 'cloudy', 'fog', 'drizzle', 'rain', 'heavy', 'snow', 'storm'];
export const PREVIEWS = ['clear', 'night', 'partly', 'cloudy', 'fog', 'rain', 'heavy', 'snow', 'storm', 'windy'];
const LABEL = {
  clear: 'Clear', partly: 'Partly cloudy', cloudy: 'Cloudy', fog: 'Fog', drizzle: 'Drizzle',
  rain: 'Rain', heavy: 'Heavy rain', snow: 'Snow', storm: 'Thunderstorm',
};

function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }

const localNight = () => { const h = new Date().getHours(); return h < 6 || h >= 19; };

function fallback() {
  return { kind: 'clear', night: localNight(), tempC: null, windKmh: 6, windDir: 250, src: 'none' };
}

let mode = lsGet(LS_MODE, 'live');
let live = null;
let fetchedAt = 0, inflight = false;
{
  const last = lsGet(LS_LAST, null);
  if (last && last.w && Date.now() - last.at < 3 * 3600 * 1000) live = last.w;
}
// ?wx=rain in the URL forces a look for testing.
try {
  const q = new URLSearchParams(location.search).get('wx') || new URLSearchParams(location.hash.slice(1)).get('wx');
  if (q && (PREVIEWS.includes(q) || q === 'live' || q === 'off')) mode = q;
} catch (_) {}

export function getMode() { return mode; }
export function setMode(m) { mode = m; lsSet(LS_MODE, m); resetParticles(); }
export function hasGps() { return !!lsGet(LS_GPS, null); }
export function liveSource() { return live ? live.src : 'none'; }

function preview(kind) {
  const w = { kind, night: false, tempC: 12, windKmh: 10, windDir: 250, src: 'preview' };
  if (kind === 'night') { w.kind = 'clear'; w.night = true; w.tempC = 6; }
  if (kind === 'windy') { w.kind = 'partly'; w.windKmh = 45; }
  if (kind === 'snow') w.tempC = -2;
  if (kind === 'storm' || kind === 'heavy') w.windKmh = 30;
  return w;
}

// The weather the renderer should use right now.
export function current() {
  if (mode === 'off') return { ...fallback(), night: false, src: 'off' };
  if (mode !== 'live') return preview(mode);
  return live || fallback();
}

export function label(w = current()) {
  let s = LABEL[w.kind] || 'Clear';
  if (w.night && w.kind === 'clear') s = 'Clear night';
  if (w.windKmh >= 35 && (w.kind === 'clear' || w.kind === 'partly' || w.kind === 'cloudy')) s = 'Windy';
  return s;
}

const usesF = (() => { try { return /^en-(US|LR|MM)|^en-us/i.test(navigator.language || ''); } catch (_) { return false; } })();
export function tempText(w = current()) {
  if (w.tempC == null) return '';
  return usesF ? Math.round(w.tempC * 9 / 5 + 32) + '°F' : Math.round(w.tempC) + '°C';
}

export async function refresh(force = false) {
  if (inflight || (!force && Date.now() - fetchedAt < TTL)) return;
  inflight = true; fetchedAt = Date.now();
  try {
    const g = lsGet(LS_GPS, null);
    const url = '/api/weather' + (g ? '?lat=' + g.lat + '&lon=' + g.lon : '');
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(to);
    if (r.ok) {
      const w = await r.json();
      if (w && KINDS.includes(w.kind)) {
        const before = live && live.kind;
        live = w;
        if (w.src !== 'none') lsSet(LS_LAST, { at: Date.now(), w });
        if (before !== w.kind) resetParticles();
      }
    }
  } catch (_) {}
  inflight = false;
}

export function useMyLocation() {
  return new Promise(resolve => {
    try {
      navigator.geolocation.getCurrentPosition(p => {
        const r1 = v => Math.round(v * 10) / 10;
        lsSet(LS_GPS, { lat: r1(p.coords.latitude), lon: r1(p.coords.longitude) });
        refresh(true).then(() => resolve(true));
      }, () => resolve(false), { maximumAge: 3600e3, timeout: 15000, enableHighAccuracy: false });
    } catch (_) { resolve(false); }
  });
}
export function forgetLocation() { try { localStorage.removeItem(LS_GPS); } catch (_) {} refresh(true); }

// ---------------- palette ----------------

export function palette(w = current()) {
  const wet = w.kind === 'drizzle' || w.kind === 'rain' || w.kind === 'heavy' || w.kind === 'storm';
  const snow = w.kind === 'snow';
  const grey = w.kind === 'cloudy' || w.kind === 'fog' || wet;
  const p = {
    felt: '#4fb860', felt2: '#48ad59', feltDot: '#5cc46c', shade: 'rgba(10,40,15,0.28)',
    slope: '#3fa58a', slope2: '#3a9b81', arrow: 'rgba(235,255,245,0.55)',
    sand: '#efd79a', sandDot: '#d9bd78', sandEdge: '#c9a960',
    water: '#2f86dc', water2: '#2774c4', waterEdge: '#9fd6ff', ripple: '#bfe6ff',
    rough: '#2f6e3a', roughDark: '#275f31', roughLight: '#3b7f45',
    rail: '#9a6a3c', railTop: '#d6a468', railDark: '#5e3a1c', cap: null,
    bumper: '#d83b35', bumperRing: '#fff1e8',
    mat: '#3c9a4e', hud: 'rgba(12,30,18,0.88)',
  };
  if (grey) {
    Object.assign(p, { felt: '#46a656', felt2: '#409c50', feltDot: '#4fb05f', rough: '#2b6235', roughDark: '#24552d', roughLight: '#346f3d' });
  }
  if (wet) {
    Object.assign(p, { felt: '#3f9a4e', felt2: '#3a9149', feltDot: '#4aa859', rough: '#25562e', roughDark: '#1f4a27', roughLight: '#2e6437', rail: '#7c5330', railTop: '#ad8050' });
  }
  if (snow) {
    Object.assign(p, { rough: '#e9f1f6', roughDark: '#c9d8e3', roughLight: '#ffffff', cap: '#ffffff', railTop: '#f4f8fb' });
  }
  return p;
}

// ---------------- particles & overlays ----------------

let parts = [], splashes = [], leaves = [], fogBands = [], clouds = [];
let flash = 0, nextFlash = 0, lastT = 0, birdAt = 0;
let onThunder = null;
export function setThunderHandler(fn) { onThunder = fn; }

function resetParticles() { parts = []; splashes = []; leaves = []; fogBands = []; clouds = []; lastT = 0; }

function windVec(w) {
  // windDir is where the wind comes FROM (meteorological); particles move the other way.
  const rad = (w.windDir || 0) * Math.PI / 180;
  const s = Math.min(60, w.windKmh || 0);
  return { x: -Math.sin(rad) * s, y: Math.cos(rad) * s * 0.4 };   // y squashed: top-down, mostly sideways drift
}
export function windSide(w = current()) { return windVec(w).x >= 0 ? 1 : -1; }
export function windStrength(w = current()) { return Math.min(1, (w.windKmh || 0) / 45); }

function ensure(w) {
  const rainy = { drizzle: 40, rain: 90, heavy: 150, storm: 140 }[w.kind] || 0;
  const snowy = w.kind === 'snow' ? 70 : 0;
  const want = rainy || snowy;
  while (parts.length < want) parts.push(spawn(w, true));
  if (parts.length > want) parts.length = want;
  const wantLeaves = w.windKmh >= 25 && !snowy ? Math.round(4 + windStrength(w) * 10) : 0;
  while (leaves.length < wantLeaves) leaves.push(spawnLeaf(w, true));
  if (leaves.length > wantLeaves) leaves.length = wantLeaves;
  if (w.kind === 'fog' && fogBands.length === 0)
    for (let i = 0; i < 7; i++) fogBands.push({ y: 10 + i * 48 + Math.random() * 20, x: Math.random() * (W + 240) - 120, h: 50 + Math.random() * 30, a: 0.16 + Math.random() * 0.1, v: 3 + Math.random() * 4 });
  const nClouds = { partly: 3, cloudy: 5, drizzle: 4, rain: 4, heavy: 5, storm: 5, snow: 3 }[w.kind] || 0;
  while (clouds.length < nClouds) clouds.push({ x: Math.random() * (W + 160) - 80, y: Math.random() * H, rx: 40 + Math.random() * 40, ry: 22 + Math.random() * 20 });
  if (clouds.length > nClouds) clouds.length = nClouds;
}

function spawn(w, anywhere) {
  const snow = w.kind === 'snow';
  return {
    x: Math.random() * (W + 40) - 20,
    y: anywhere ? Math.random() * H : -10 - Math.random() * 30,
    vy: snow ? 12 + Math.random() * 16 : 230 + Math.random() * 90,
    r: snow ? 0.6 + Math.random() * 0.8 : 0,
    ph: Math.random() * 6.28,
    land: 30 + Math.random() * (H - 30),
  };
}
function spawnLeaf(w, anywhere) {
  const side = windSide(w);
  return {
    x: anywhere ? Math.random() * W : (side > 0 ? -6 : W + 6), y: Math.random() * H,
    sp: 0.6 + Math.random() * 0.6, ph: Math.random() * 6.28,
    col: ['#d9822b', '#c9531f', '#e3b23c', '#a8562a'][Math.floor(Math.random() * 4)],
  };
}

// Under the ball: cloud shadows (drawn before ball and flag).
export function drawGround(ctx, t, w = current()) {
  ensure(w);
  const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
  const wv = windVec(w);
  for (const c of clouds) {
    c.x += (wv.x * 0.25 + 2) * dt;
    if (c.x - c.rx > W + 10) { c.x = -c.rx - 10; c.y = Math.random() * H; }
    if (c.x + c.rx < -10) { c.x = W + c.rx + 10; c.y = Math.random() * H; }
    ctx.save();
    ctx.translate(c.x, c.y); ctx.scale(1, c.ry / c.rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, c.rx);
    const a = w.kind === 'partly' ? 0.13 : 0.1;
    g.addColorStop(0, 'rgba(0,20,30,' + a + ')'); g.addColorStop(1, 'rgba(0,20,30,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, c.rx, 0, 6.2832); ctx.fill();
    ctx.restore();
  }
  // Clear day: a bird's shadow drifts across now and then.
  if (w.kind === 'clear' && !w.night) {
    if (!birdAt) birdAt = t + 4000 + Math.random() * 8000;
    const k = (t - birdAt) / 6000;
    if (k > 0 && k < 1) {
      const bx = -10 + k * (W + 20), by = 60 + Math.sin(birdAt) * 80 + k * 40, flap = Math.sin(t / 90) * 1.5;
      ctx.strokeStyle = 'rgba(0,25,10,0.22)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx - 4, by - 1 + flap); ctx.lineTo(bx, by + 1); ctx.lineTo(bx + 4, by - 1 + flap); ctx.stroke();
    } else if (k >= 1) birdAt = t + 15000 + Math.random() * 20000;
  }
}

// Night: darken the scene, keep pools of lamp light at the cup and round the ball.
export function drawNight(ctx, lights, w = current()) {
  if (!w.night) return;
  ctx.save();
  ctx.fillStyle = w.kind === 'clear' ? 'rgba(14,22,60,0.38)' : 'rgba(10,14,34,0.44)';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
    g.addColorStop(0, 'rgba(255,214,140,' + l.a + ')'); g.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = g; ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
  }
  ctx.restore();
}

// Over everything: rain, snow, leaves, fog, lightning.
export function drawSky(ctx, t, w = current()) {
  const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
  lastT = t;
  const wv = windVec(w);
  const snow = w.kind === 'snow';
  if (parts.length) {
    if (snow) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const p of parts) {
        p.y += p.vy * dt; p.x += (wv.x * 0.5 + Math.sin(t / 700 + p.ph) * 6) * dt;
        if (p.y > H + 4 || p.x < -24 || p.x > W + 24) Object.assign(p, spawn(w, false));
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
      }
    } else {
      const sx = wv.x * 2.2;
      const len = 0.03;
      ctx.strokeStyle = w.night ? 'rgba(190,205,240,0.45)' : 'rgba(215,232,255,0.55)';
      ctx.lineWidth = 0.8; ctx.lineCap = 'round';
      ctx.beginPath();
      for (const p of parts) {
        p.y += p.vy * dt; p.x += sx * dt;
        if (p.y > p.land) {
          if (splashes.length < 60) splashes.push({ x: p.x, y: p.y, age: 0 });
          Object.assign(p, spawn(w, false));
        }
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - sx * len, p.y - p.vy * len);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(220,238,255,0.6)'; ctx.lineWidth = 0.6;
      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i]; s.age += dt;
        if (s.age > 0.3) { splashes.splice(i, 1); continue; }
        const k = s.age / 0.3;
        ctx.globalAlpha = 1 - k;
        ctx.beginPath(); ctx.ellipse(s.x, s.y, 0.5 + k * 2.5, 0.3 + k * 1.3, 0, 0, 6.2832); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  for (const l of leaves) {
    l.x += (wv.x * 1.6 * l.sp) * dt; l.y += (Math.sin(t / 400 + l.ph) * 10 + wv.y) * dt;
    if (l.x < -10 || l.x > W + 10 || l.y < -10 || l.y > H + 10) Object.assign(l, spawnLeaf(w, false));
    ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(t / 300 * l.sp + l.ph);
    ctx.fillStyle = l.col; ctx.fillRect(-1.5, -0.8, 3, 1.6);
    ctx.restore();
  }
  for (const f of fogBands) {
    f.x += (f.v + wv.x * 0.1) * dt;
    if (f.x > W + 120) f.x -= W + 240;
    // soft elliptical bank, drawn twice so it wraps without a seam
    const c = w.night ? '150,160,185' : '235,240,242';
    for (const ox of [0, -(W + 240)]) {
      ctx.save(); ctx.translate(f.x + ox, f.y); ctx.scale(1, f.h / 240);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 120);
      g.addColorStop(0, 'rgba(' + c + ',' + f.a + ')'); g.addColorStop(1, 'rgba(' + c + ',0)');
      ctx.fillStyle = g; ctx.fillRect(-120, -120, 240, 240);
      ctx.restore();
    }
  }
  if (w.kind === 'fog') { ctx.fillStyle = w.night ? 'rgba(120,130,150,0.12)' : 'rgba(225,230,232,0.12)'; ctx.fillRect(0, 0, W, H); }
  if (w.kind === 'storm') {
    if (!nextFlash) nextFlash = t + 3000 + Math.random() * 6000;
    if (t >= nextFlash) {
      flash = 1; nextFlash = t + 6000 + Math.random() * 12000;
      if (onThunder) setTimeout(() => { try { onThunder(); } catch (_) {} }, 400 + Math.random() * 1200);
    }
    if (flash > 0) {
      const a = flash > 0.6 ? 0.45 : flash > 0.45 ? 0.05 : flash * 0.6;
      ctx.fillStyle = 'rgba(235,240,255,' + a.toFixed(3) + ')'; ctx.fillRect(0, 0, W, H);
      flash -= dt * 2.2;
    }
  }
}

// ---------------- small icons for the HUD and title ----------------

export function drawIcon(ctx, x, y, w = current(), s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const sun = () => {
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 0.9; ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * 0.785; ctx.moveTo(Math.cos(a) * 4.2, Math.sin(a) * 4.2); ctx.lineTo(Math.cos(a) * 5.6, Math.sin(a) * 5.6); }
    ctx.stroke();
  };
  const moon = () => {
    ctx.fillStyle = '#f3e7b8'; ctx.beginPath(); ctx.arc(0, 0, 3.6, 0, 6.2832); ctx.fill();
    ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(1.8, -1.2, 3.2, 0, 6.2832); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  };
  const cloud = (dx = 0, dy = 0, col = '#e6edf2') => {
    ctx.fillStyle = col; ctx.beginPath();
    ctx.arc(dx - 2.5, dy + 1, 2.5, 0, 6.2832); ctx.arc(dx + 0.5, dy - 0.5, 3.2, 0, 6.2832); ctx.arc(dx + 3.2, dy + 1.2, 2.3, 0, 6.2832);
    ctx.fill(); ctx.fillRect(dx - 2.5, dy + 1, 5.7, 2.5);
  };
  const k = w.kind;
  if (k === 'clear') (w.night ? moon : sun)();
  else if (k === 'partly') { ctx.save(); ctx.translate(-2, -2); (w.night ? moon : sun)(); ctx.restore(); cloud(1.5, 1.5); }
  else if (k === 'cloudy') { cloud(-1.5, -1, '#b9c4cc'); cloud(1, 1.5); }
  else if (k === 'fog') { ctx.fillStyle = '#dfe6ea'; for (let i = 0; i < 3; i++) ctx.fillRect(-5 + (i % 2), -3.5 + i * 3, 10 - (i % 2) * 2, 1.4); }
  else if (k === 'snow') {
    cloud(0, -1.5);
    ctx.fillStyle = '#fff'; for (const [a, b] of [[-3, 4.5], [0, 5.5], [3, 4.5]]) { ctx.beginPath(); ctx.arc(a, b, 0.9, 0, 6.2832); ctx.fill(); }
  } else if (k === 'storm') {
    cloud(0, -2, '#9aa6b0');
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.moveTo(0.5, 0.5); ctx.lineTo(-2, 4.5); ctx.lineTo(0, 4.5); ctx.lineTo(-1, 7.5); ctx.lineTo(2.5, 3); ctx.lineTo(0.5, 3); ctx.closePath(); ctx.fill();
  } else {
    cloud(0, -1.5, k === 'drizzle' ? '#d5dee5' : '#aeb9c2');
    ctx.strokeStyle = '#7fc4ff'; ctx.lineWidth = 0.9; ctx.lineCap = 'round'; ctx.beginPath();
    const n = k === 'drizzle' ? 2 : 3;
    for (let i = 0; i < n; i++) { const a = -3 + i * (6 / Math.max(1, n - 1)); ctx.moveTo(a, 3.6); ctx.lineTo(a - 0.8, 6); }
    ctx.stroke();
  }
  ctx.restore();
}
