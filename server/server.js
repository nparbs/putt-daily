import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { handleWeather } from './weather.js';
import { handlePlayers, DB_FILE, challengeRun, courseFor } from './players.js';
import { ogImage, iconPng } from './og.js';
import { dayNumber } from '../shared/daily.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const clientDir = path.join(root, 'client');
const sharedDir = path.join(root, 'shared');
const PORT = Number(process.env.PORT) || 8795;
const SITE = process.env.SITE || 'https://putt.parbs.online';
const HOST = '0.0.0.0';

function readVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}
const VERSION = readVersion();

// Content hash of client/ and shared/. index.html loads assets from /v/<BUILD>/...,
// so Cloudflare's 4-hour cache of scripts and styles never serves an old build.
function hashDirs(dirs) {
  const h = crypto.createHash('sha256');
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else { h.update(path.relative(root, f)); h.update(fs.readFileSync(f)); }
    }
  };
  for (const d of dirs) walk(d);
  return h.digest('hex').slice(0, 12);
}
const BUILD = hashDirs([clientDir, sharedDir]);
const INDEX_HTML = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf8')
  .replace(/(src|href)="(?![a-z]+:|\/)([^"]+\.(?:js|css))"/g, `$1="/v/${BUILD}/c/$2"`);

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDiff = d => d === 0 ? 'E' : (d > 0 ? '+' : '') + d;

// Link previews: the page carries Open Graph tags for today, or for the shared
// run when the link has ?vs=<code>.
function indexFor(url) {
  const day = dayNumber();
  let title = 'Putt Daily #' + day;
  let desc = 'Nine new mini-golf holes every day, the same for everyone.';
  let img = SITE + '/og/' + day + '.png', page = SITE + '/';
  const code = url.searchParams.get('vs');
  const ch = challengeRun(code);
  if (ch && ch.day <= day) {
    title = ch.nick + ' shot ' + ch.total + ' (' + fmtDiff(ch.diff) + ') on Putt Daily #' + ch.day;
    desc = 'Can you beat it? Play the same nine holes and see their shots after each one.';
    img = SITE + '/og/c/' + code + '.png';
    page = SITE + '/?vs=' + code;
  } else {
    try { desc = courseFor(day).name + '. ' + desc; } catch (_) {}
  }
  const meta = [
    ['og:type', 'website'], ['og:site_name', 'Putt Daily'], ['og:title', title], ['og:description', desc],
    ['og:url', page], ['og:image', img], ['og:image:width', '1200'], ['og:image:height', '630'],
  ].map(([k, v]) => `<meta property="${k}" content="${esc(v)}">`).join('\n') +
    `\n<meta name="twitter:card" content="summary_large_image">\n<meta name="description" content="${esc(desc)}">`;
  return INDEX_HTML.replace('<title>Putt Daily</title>', `<title>${esc(title)}</title>\n${meta}`);
}

// Generated PNGs kept in memory: a day's image never changes, nor does a
// challenge's, since a run can't be edited.
const pngCache = new Map();
function cachedPng(key, make) {
  if (!pngCache.has(key)) {
    const v = make();
    if (!v) return null;
    pngCache.set(key, v);
    if (pngCache.size > 200) pngCache.delete(pngCache.keys().next().value);
  }
  return pngCache.get(key);
}

const MANIFEST = JSON.stringify({
  name: 'Putt Daily', short_name: 'Putt Daily', start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait',
  background_color: '#14301c', theme_color: '#14301c',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
});
// Service worker: the page and this build's assets work offline; the API stays online-only.
const SW = fs.readFileSync(path.join(here, 'sw.js'), 'utf8').replace('__BUILD__', BUILD);
const ICONS = { '/icon-192.png': 192, '/icon-512.png': 512, '/apple-touch-icon.png': 180, '/favicon.png': 64 };
const pngHeaders = buf => ({ 'Content-Type': 'image/png', 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=86400' });

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'",
};

function send(res, status, headers, body) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

function notFound(res) {
  send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found');
}

// Resolve a request path under baseDir; returns null if it escapes baseDir.
function resolveSafe(baseDir, relPath) {
  if (relPath.includes('\0')) return null;
  const full = path.resolve(baseDir, relPath);
  if (full !== baseDir && !full.startsWith(baseDir + path.sep)) return null;
  return full;
}

async function serveFile(req, res, filePath, immutable = false) {
  let target = filePath;
  let stat = await fs.promises.stat(target).catch(() => null);
  if (stat && stat.isDirectory()) {
    target = path.join(target, 'index.html');
    stat = await fs.promises.stat(target).catch(() => null);
  }
  if (!stat || !stat.isFile()) return notFound(res);

  const ext = path.extname(target).toLowerCase();
  const headers = {
    'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-cache' : immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
  };
  res.writeHead(200, { ...SECURITY_HEADERS, ...headers });
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(target);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

async function handle(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return notFound(res);
  }

  if (['/api/run', '/api/board', '/api/trails', '/api/challenge', '/api/shot'].includes(pathname)) {
    const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '?');
    const out = await handlePlayers(req, url, pathname, ip);
    return send(res, out.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, JSON.stringify(out.body));
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return notFound(res);

  if (pathname === '/health') {
    return send(res, 200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' }, 'ok');
  }

  if (pathname === '/api/version') {
    return send(
      res,
      200,
      { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' },
      JSON.stringify({ version: VERSION, build: BUILD }),
    );
  }

  if (pathname === '/api/weather') {
    const { status, body } = await handleWeather(req, url);
    return send(res, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, JSON.stringify(body));
  }

  if (pathname === '/' || pathname === '/index.html') {
    return send(res, 200, { 'Content-Type': CONTENT_TYPES['.html'], 'Cache-Control': 'no-cache' }, req.method === 'HEAD' ? undefined : indexFor(url));
  }

  const og = /^\/og\/(?:(\d{1,5})|c\/([a-zA-Z0-9]{8}))\.png$/.exec(pathname);
  if (og) {
    let buf = null;
    if (og[1]) {
      const day = Number(og[1]);
      if (day >= 1 && day <= dayNumber()) buf = cachedPng('d' + day, () => ogImage(courseFor(day)));
    } else {
      buf = cachedPng('c' + og[2], () => {
        const ch = challengeRun(og[2]);
        return ch && ch.day <= dayNumber() ? ogImage(courseFor(ch.day), ch) : null;
      });
    }
    if (!buf) return notFound(res);
    return send(res, 200, pngHeaders(buf), req.method === 'HEAD' ? undefined : buf);
  }
  if (ICONS[pathname]) {
    const buf = cachedPng('i' + ICONS[pathname], () => iconPng(ICONS[pathname]));
    return send(res, 200, pngHeaders(buf), req.method === 'HEAD' ? undefined : buf);
  }
  if (pathname === '/manifest.webmanifest') {
    return send(res, 200, { 'Content-Type': CONTENT_TYPES['.webmanifest'], 'Cache-Control': 'public, max-age=3600' }, req.method === 'HEAD' ? undefined : MANIFEST);
  }
  if (pathname === '/sw.js') {
    return send(res, 200, { 'Content-Type': CONTENT_TYPES['.js'], 'Cache-Control': 'no-cache' }, req.method === 'HEAD' ? undefined : SW);
  }

  // /v/<hash>/c/* -> client, /v/<hash>/shared/* -> shared (relative imports keep working).
  const vm = /^\/v\/[0-9a-f]{6,64}\/(c|shared)\/(.+)$/.exec(pathname);
  if (vm) {
    const full = resolveSafe(vm[1] === 'c' ? clientDir : sharedDir, vm[2]);
    if (!full) return notFound(res);
    return serveFile(req, res, full, true);
  }

  if (pathname === '/shared' || pathname.startsWith('/shared/')) {
    const rel = pathname.slice('/shared/'.length) || '.';
    const full = resolveSafe(sharedDir, rel);
    if (!full) return notFound(res);
    return serveFile(req, res, full);
  }

  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const full = resolveSafe(clientDir, rel);
  if (!full) return notFound(res);
  return serveFile(req, res, full);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(() => {
    if (!res.headersSent) notFound(res);
    else res.destroy();
  });
});

server.on('error', (err) => {
  console.error('server error:', err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`putt-daily ${VERSION} listening on http://${HOST}:${PORT}, db ${DB_FILE}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  const force = setTimeout(() => process.exit(0), 10000);
  force.unref();
  server.close(() => process.exit(0));
  server.closeIdleConnections?.();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
