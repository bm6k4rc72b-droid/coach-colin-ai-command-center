/**
 * EXPOSURE service worker.
 *
 * The desk is entirely local — demo slate, engines, and the user's own data in
 * local storage — so there is no reason for it to need the network after the
 * first visit. Precache the shell on install and serve it cache-first.
 *
 * Outbound sportsbook links are cross-origin and deliberately never cached:
 * they leave the app for the book's own site, which is the point.
 */

const CACHE = 'exposure-v1';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
  './js/app.js',
  './js/dom.js',
  './js/store.js',
  './js/providers.js',
  './js/data/games.js',
  './js/data/leagues.js',
  './js/data/market.js',
  './js/data/players.js',
  './js/data/teams.js',
  './js/engine/exposure.js',
  './js/engine/live.js',
  './js/engine/market.js',
  './js/engine/startsit.js',
  './js/screens/command.js',
  './js/screens/exposure.js',
  './js/screens/home.js',
  './js/screens/lineup.js',
  './js/screens/market.js',
  './js/screens/more.js',
  './js/screens/onboarding.js',
  './js/screens/player.js',
  './js/screens/settings.js',
  './js/ui/components.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll is all-or-nothing; one missing file would leave the desk with
      // no offline copy at all, so failures are tolerated per file.
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
