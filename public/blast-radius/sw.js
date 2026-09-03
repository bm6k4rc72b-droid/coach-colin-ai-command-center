/**
 * Offline cache for Blast Radius.
 *
 * The app is static and self-contained, so the service worker only has to make
 * that fact durable: cache the shell on install, serve cache-first, and fall
 * back to the network for anything new. Bump `CACHE` when the app changes.
 */

const CACHE = 'blast-radius-v1';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
  './js/app.js',
  './js/views.js',
  './js/charts.js',
  './js/iam.js',
  './js/graph.js',
  './js/estate.js',
  './js/aisec.js',
  './js/injection.js',
  './js/detect.js',
  './js/telemetry.js',
  './js/fair.js',
  './js/scenarios.js',
  './js/portfolio.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((hit) => hit ?? fetch(event.request)));
});
