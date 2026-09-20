/**
 * Offline shell for Vice Command.
 *
 * The page is a marketing site, so the caching rule is the boring correct one:
 * network first, cache as a fallback. A visitor who comes back after the copy
 * or the rate card has changed must not be shown last month's prices out of a
 * cache — but a visitor on a bad connection should still get the page.
 *
 * The exception is the media, which is content-addressed by name and never
 * edited in place, so it is served cache-first.
 *
 * @module vice/sw
 */

const VERSION = 'vice-1';
const SHELL = `${VERSION}-shell`;
const MEDIA = `${VERSION}-media`;

const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './js/app.js',
  './js/mathkit.js',
  './js/sequence.js',
  './js/scroll.js',
  './js/city.js',
  './js/actors.js',
  './js/explosion.js',
  './js/stage.js',
  './js/hud.js',
  './js/score.js',
  './js/showcase.js',
  './js/apps.js',
  './js/agents.js',
  './js/security.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/media/')) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(MEDIA).then((cache) => cache.put(request, copy));
        return response;
      })),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(SHELL).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html'))),
  );
});
