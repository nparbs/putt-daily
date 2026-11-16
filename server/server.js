import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { handleWeather } from './weather.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const clientDir = path.join(root, 'client');
const sharedDir = path.join(root, 'shared');
const PORT = Number(process.env.PORT) || 8795;
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
    return send(res, 200, { 'Content-Type': CONTENT_TYPES['.html'], 'Cache-Control': 'no-cache' }, req.method === 'HEAD' ? undefined : INDEX_HTML);
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
  console.log(`putt-daily ${VERSION} listening on http://${HOST}:${PORT}`);
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
