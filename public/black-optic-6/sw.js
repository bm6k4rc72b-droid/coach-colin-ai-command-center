/**
 * Offline shell.
 *
 * A perimeter console is most needed where the connection is worst — a gate at
 * the far end of a property, a barn, a vehicle at the boundary. Everything the
 * console needs to measure is cached on first visit and served from there
 * afterwards, so the camera, the microphone, the geofence and the whole ledger
 * work with the signal off.
 *
 * Only code is cached. No frame, no clip, no position and no event log is ever
 * put in here — the vault holds clips deliberately, in the page, and nothing in
 * this worker should quietly make a second copy of any of it.
 *
 * @module black-optic-6/sw
 */

const CACHE = 'black-optic-6-v1';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icon.svg',
  'icon-maskable.svg',
  'js/app.js',
  'js/provenance.js',
  'js/capability.js',
  'js/watch.js',
  'js/acoustic.js',
  'js/perimeter.js',
  'js/satellite.js',
  'js/vault.js',
  'js/hud.js',
  'js/devices.js',
  'js/biolink.js',
  'js/spectral.js',
  'js/sonar.js',
  'js/track.js',
  'js/thermal.js',
  'js/lock.js',
  'js/harvest.js',
  'js/aerial.js',
  'js/argus.js',
  'js/mariachi.js',
  '../sentry/js/scene.js',
  '../sentry/js/tracker.js',
  '../sentry/js/ground.js',
  '../sentry/js/classify.js',
  '../sentry/js/behaviour.js',
  '../sentry/js/views.js',
  '../sentry/js/rf.js',
  '../emberline/js/geo.js',
  '../emberline/js/overpass.js',
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
  // Orbital tiles are never cached: a stale satellite frame presented as current
  // is precisely the failure the satellite panel spends its caption warning about.
  if (request.url.includes('gibs.earthdata.nasa.gov')) return;
  event.respondWith(
    caches.match(request).then((hit) => hit ?? fetch(request).then((response) => {
      if (response.ok && new URL(request.url).origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match('index.html'))),
  );
});
