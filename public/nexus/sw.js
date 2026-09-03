/**
 * AETHER NEXUS service worker.
 *
 * The console is a training tool that has to keep working on a plane, in a
 * basement, or on a phone with no signal — the syllabus, the ranges and the
 * grading are all local, so there is no reason for the app shell to need the
 * network either.
 *
 * Strategy: precache the shell on install and serve it cache-first. Live feed
 * requests are cross-origin and deliberately never cached here — a stale
 * earthquake is worse than an honest "cached" badge, which the feed layer
 * handles itself with its own last-good store.
 */

const CACHE = 'aether-nexus-v1';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
  './js/app.js',
  './js/audio.js',
  './js/camera.js',
  './js/curriculum.js',
  './js/decks.js',
  './js/dom.js',
  './js/feeds.js',
  './js/geometry.js',
  './js/hall.js',
  './js/mathkit.js',
  './js/mentor.js',
  './js/progress.js',
  './js/security.js',
  './js/swarm.js',
  './js/voice.js',
  './js/labs/index.js',
  './js/labs/agentloop.js',
  './js/labs/crypto.js',
  './js/labs/injection.js',
  './js/labs/passwords.js',
  './js/labs/phishing.js',
  './js/labs/scanner.js',
  './js/tracks/agents.js',
  './js/tracks/appcraft.js',
  './js/tracks/cyber.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll is all-or-nothing; one missing file would leave the console
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
  // Live feeds go straight to the network; the feed layer owns their caching.
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
