/**
 * Baseline service worker.
 *
 * The whole app is a shell and some maths — no model weights, no API, nothing
 * dynamic to fetch — so it is precached on install and served cache-first. That
 * matters more here than it looks: a readiness scan is taken first thing in the
 * morning, and "no signal" is a bad reason to skip a measurement.
 */

const CACHE = 'baseline-v1';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
  './js/app.js',
  './js/baseline.js',
  './js/breathe.js',
  './js/camera.js',
  './js/coach.js',
  './js/ledger.js',
  './js/llm.js',
  './js/roi.js',
  './js/signal.js',
  './js/speech.js',
  './js/vitals.js',
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
  // Never cache the optional coach endpoint: an answer about today's training
  // served from yesterday's cache would be worse than no answer.
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => (
      // Only a page navigation falls back to the shell. Answering a failed
      // stylesheet or manifest request with HTML produces a parse error rather
      // than an honest failure, and hides the fact that the fetch failed.
      request.mode === 'navigate' ? caches.match('./index.html') : Response.error()
    ))),
  );
});
