/**
 * Offline shell.
 *
 * A pitch is usually the worst-connected place anyone will open this, so the
 * app is cached on first visit and served from there afterwards. Nothing it
 * measures is cached, because nothing it measures is ever stored: this worker
 * holds the code, not a single frame of anybody's football.
 *
 * @module touchline/sw
 */

const CACHE = 'touchline-v1';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icon.svg',
  'icon-maskable.svg',
  'js/app.js',
  'js/pitch.js',
  'js/segment.js',
  'js/track.js',
  'js/teams.js',
  'js/ball.js',
  'js/possession.js',
  'js/passing.js',
  'js/space.js',
  'js/metrics.js',
  'js/overlay.js',
  'js/report.js',
  'js/demo.js',
  'js/llm.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => hit);
    }),
  );
});
