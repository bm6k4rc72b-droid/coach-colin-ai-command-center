/**
 * RANCH COMMAND — offline shell.
 *
 * v2: the install step caches only the small page shell. v1 also precached
 * the 14 MB MediaPipe WASM runtime and 12 MB of models the moment the page
 * opened, which on iPhone pushed Safari's web process past its memory limit
 * and produced "A problem repeatedly occurred". The heavy files are now
 * cached the first time a feature actually loads them, never up front.
 * Live streams, the edge API and remote media (voice, imagery) are never
 * cached here.
 */

const CACHE = 'ranch-command-v2';
const SHELL = [
  './', './index.html', './styles.css', './rules.json', './icon.svg', './manifest.webmanifest',
  './js/app.js', './js/slides.js', './js/intel.js', './js/gate.js', './js/voicebank.js', './js/dom.js', './js/config.js', './js/events.js',
  './js/mqtt.js', './js/mavlink.js', './js/mesh.js', './js/streams.js', './js/ai.js', './js/gesture.js', './js/rafa.js', './js/stack.js', './js/map3d.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  // Drop v1, and the 26 MB it holds.
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('ranch-command')).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (/\.(mp4|webm|mp3)$/.test(url.pathname)) return;
  const heavy = /\/(vendor|models)\//.test(url.pathname);
  if (heavy) {
    // Cache on first real use, then serve from cache.
    event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request).then((response) => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); }
      return response;
    })));
    return;
  }
  // Everything else: network first so updates land, cache when offline.
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
