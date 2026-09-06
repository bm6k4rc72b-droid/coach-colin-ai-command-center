/**
 * Offline shell.
 *
 * A camera watching a gate is often on the worst connection in the building, so
 * the app is cached on first visit and served from there afterwards. Nothing it
 * measures is cached, because nothing it measures is ever stored: this worker
 * holds the code, not a single frame.
 *
 * @module sentry/sw
 */

const CACHE = 'sentry-v1';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icon.svg',
  'icon-maskable.svg',
  'js/app.js',
  'js/ground.js',
  'js/scene.js',
  'js/tracker.js',
  'js/behaviour.js',
  'js/classify.js',
  'js/zones.js',
  'js/views.js',
  'js/vitals.js',
  'js/dossier.js',
  'js/rf.js',
  'js/llm.js',
  '../baseline/js/camera.js',
  '../baseline/js/signal.js',
  '../baseline/js/vitals.js',
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
