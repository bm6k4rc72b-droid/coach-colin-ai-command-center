/**
 * The offline shell.
 *
 * Cache-first for the app's own files so a second visit — or a visit with no
 * signal at all — still gets the whole site: the hologram, the concierge, the
 * music and the maths all run locally, so there is nothing else to fetch.
 *
 * The full-resolution plates are the one exception. They live on a render CDN
 * and are treated as a network-only upgrade: if they are unreachable the
 * committed AVIF stays on screen and nothing is missing.
 */

const CACHE = 'jose-montes-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
  './js/app.js',
  './js/airscroll.js',
  './js/concierge.js',
  './js/finance.js',
  './js/geometry.js',
  './js/listings.js',
  './js/mathkit.js',
  './js/motion.js',
  './js/reveal.js',
  './js/score.js',
  './js/scroll.js',
  './js/stage.js',
  './js/voice.js',
  './media/coast-estate-dusk.avif',
  './media/estate-twilight.avif',
  './media/great-room-sunset.avif',
  './media/pool-terrace-dusk.avif',
  './media/primary-suite-dawn.avif',
  './media/kitchen-marble.avif',
  './media/coast-aerial-golden.avif',
  './media/vineyard-estate.avif',
  './media/hologram-estate.avif',
  './media/keys-closing.avif',
  './media/jose-portrait.jpg',
  './media/jose-consultation.jpg',
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
  const url = new URL(request.url);
  // Anything off-origin (the full-resolution plates) is a pure upgrade.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match('./index.html'))),
  );
});
