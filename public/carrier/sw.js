/**
 * Offline shell.
 *
 * The bench is most useful where the footage is — a site visit, a client's
 * office, a train — so the whole app is cached on first visit and served from
 * there afterwards. Only the code is cached. Scripts live in `localStorage` and
 * footage never leaves the tab, so there is nothing of the author's work in
 * here to leak or to go stale.
 *
 * @module carrier/sw
 */

const CACHE = 'carrier-v1';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icon.svg',
  'icon-maskable.svg',
  'js/app.js',
  'js/chrome.js',
  'js/export.js',
  'js/media.js',
  'js/rain.js',
  'js/render.js',
  'js/script.js',
  'js/theme.js',
  'js/timeline.js',
  'js/panels/index.js',
  'js/panels/frame.js',
  'js/panels/heatmap.js',
  'js/panels/floorplan.js',
  'js/panels/sniffer.js',
  'js/panels/pose.js',
  'js/panels/media.js',
  'js/episodes/wifi-csi.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
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
    caches.match(request).then((hit) => hit ?? fetch(request).then((response) => {
      // Only same-origin shell responses are worth keeping; everything else is
      // served straight through.
      if (response.ok && new URL(request.url).origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match('index.html'))),
  );
});
