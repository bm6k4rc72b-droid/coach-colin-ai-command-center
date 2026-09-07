/**
 * Offline shell.
 *
 * A guardian is worth nothing if it stops working when the broadband does, and
 * the households this is for are not the ones with the best connection. The
 * whole app is cached on first visit and served from there afterwards, so it
 * opens and runs with the router unplugged.
 *
 * What is cached is the code and nothing else. This worker never sees a frame,
 * a sample or a sound, because none of those ever becomes a request.
 *
 * @module aegis/sw
 */

const CACHE = 'aegis-v1';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icon.svg',
  'icon-maskable.svg',
  'js/app.js',
  'js/mathkit.js',
  'js/silhouette.js',
  'js/posture.js',
  'js/kinematics.js',
  'js/inertial.js',
  'js/acoustic.js',
  'js/fusion.js',
  'js/escalation.js',
  'js/demo.js',
  'js/hologram.js',
  'js/voice.js',
  'js/vera.js',
  'js/ledger.js',
  'js/views.js',
  '../baseline/js/camera.js',
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
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // A speech service the operator has bridged Vera to must never be cached,
  // and neither must anything else off this origin.
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
