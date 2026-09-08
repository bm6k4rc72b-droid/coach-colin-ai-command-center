/**
 * ASTRA service worker.
 *
 * The platform is a research tool that has to keep working on a plane, in a
 * clinic basement, or on a phone with no signal — the corpus, the grading, the
 * decoder and the renderer are all local, so there is no reason for the app
 * shell to need the network either.
 *
 * Strategy: precache the shell on install and serve it cache-first. The
 * research radar's requests are cross-origin and deliberately never cached
 * here — a stale literature sweep presented as fresh is worse than an honest
 * CACHED badge, which the radar handles itself with its own last-good store.
 */

const CACHE = 'astra-v1';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
  './js/app.js',
  './js/astra.js',
  './js/audio.js',
  './js/claims.js',
  './js/command.js',
  './js/compare.js',
  './js/decks.js',
  './js/decoder.js',
  './js/dom.js',
  './js/engine.js',
  './js/evidence.js',
  './js/geometry.js',
  './js/graph.js',
  './js/intro.js',
  './js/lab.js',
  './js/mathkit.js',
  './js/progress.js',
  './js/reviewers.js',
  './js/sensors.js',
  './js/studio.js',
  './js/data/peptides.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll is all-or-nothing; one missing file would leave the platform
      // with no offline copy at all, so failures are tolerated per file.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
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
  // The radar and any literature link go straight to the network.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match('./index.html'))),
  );
});
