// BackBeat service worker — offline-first for our own assets, network-first
// for navigations so updates can ship without bricking users.
//
// Bump CACHE_NAME on each release to invalidate older caches.

const CACHE_NAME = 'backbeat-v15';
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './player.css',
  './features.css',
  './metronome.js',
  './data.js',
  './app.jsx',
  './beatviz.jsx',
  './editor.jsx',
  './library.jsx',
  './onoma.jsx',
  './player.jsx',
  './practice.jsx',
  './tweaks-panel.jsx',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Network-first for HTML navigations so updates appear after deploy.
  // Fall back to cached index.html when offline.
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for everything else. Same-origin assets are cached on first
  // miss. Cross-origin (CDN React/Babel, Google Fonts) get opaque-cached so
  // the app can boot offline after one online visit.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    })
  );
});
