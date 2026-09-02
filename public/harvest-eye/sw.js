/**
 * HarvestEye service worker.
 *
 * The app has to work in a polytunnel with no signal, so the shell is
 * precached on install and served cache-first. There is nothing dynamic to
 * fetch — no model weights, no API — which is exactly why offline is cheap.
 */

const CACHE = 'harvesteye-v1';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
  './js/app.js',
  './js/camera.js',
  './js/color.js',
  './js/crops.js',
  './js/forecast.js',
  './js/ledger.js',
  './js/rowwalk.js',
  './js/tracker.js',
  './js/vision.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((response) => {
      // Cache same-origin successes so a first online visit is enough to make
      // the whole app available in the field afterwards.
      if (response.ok && new URL(request.url).origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match('./index.html'))),
  );
});
