/**
 * Offline shell.
 *
 * Everything this app does is arithmetic on the device: the network is generated
 * from a seed, the flight is integrated locally, and the camera frames are read,
 * segmented and discarded in the same tick. There is no server, no account and no
 * upload, so caching the shell makes the whole app work with the network off.
 *
 * What is never cached is anything from the camera. There is nothing to cache —
 * no frame is stored, and the only thing derived from one is a single number
 * between zero and one.
 *
 * @module makecns-fly/sw
 */

const CACHE = 'makecns-fly-v1';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icon.svg',
  'icon-maskable.svg',
  'js/app.js',
  'js/rng.js',
  'js/connectome.js',
  'js/net.js',
  'js/encode.js',
  'js/decode.js',
  'js/teacher.js',
  'js/plant.js',
  'js/loop.js',
  'js/ledger.js',
  'js/vision.js',
  'js/link.js',
  'js/render.js',
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
