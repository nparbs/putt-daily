// Putt Daily service worker. The server fills in the build hash, so a new
// deploy installs a fresh cache and drops the old one.
const CACHE = 'putt-__BUILD__';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.add('/')).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('putt-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;              // live data: network only
  if (url.pathname.startsWith('/v/')) {                       // versioned assets: cache first
    e.respondWith(caches.open(CACHE).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok) c.put(e.request, r.clone());
      return r;
    }))));
    return;
  }
  if (url.pathname === '/' || url.pathname === '/index.html') { // page: network first, cached copy offline
    e.respondWith(fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put('/', copy)); }
      return r;
    }).catch(() => caches.match('/')));
  }
});
