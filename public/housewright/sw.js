/**
 * HOUSEWRIGHT service worker.
 *
 * The app is used inside houses — basements, stairwells, steel-framed
 * buildings — where signal is the first thing to go. The shell is precached on
 * install and served cache-first, and there is nothing dynamic to fetch,
 * because the whole analysis runs on the device.
 */

const CACHE = 'housewright-v1';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
  './js/app.js',
  './js/camera.js',
  './js/demo.js',
  './js/finish.js',
  './js/hand.js',
  './js/ledger.js',
  './js/massing.js',
  './js/mathkit.js',
  './js/plan.js',
  './js/pose.js',
  './js/report.js',
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
      if (response.ok && new URL(request.url).origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match('./index.html'))),
  );
});
