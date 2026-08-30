/* Offline shell. The whole app is static and sensor-driven, so once it
   is cached it runs on a practice field with no signal. */
const CACHE = 'loopbreak-v2';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/holo.css', './css/screens.css',
  './js/main.js',
  './js/core/bus.js', './js/core/rng.js', './js/core/state.js', './js/core/audio.js', './js/core/haptics.js',
  './js/sensors/motion.js', './js/sensors/camera.js', './js/sensors/ppg.js',
  './js/engine/playbook.js', './js/engine/defense.js', './js/engine/routes.js', './js/engine/ooda.js',
  './js/engine/wrplaybook.js', './js/engine/positions.js',
  './js/render/field.js', './js/render/dial.js', './js/render/brain.js',
  './js/ui/ui.js', './js/ui/views.js',
  './js/drills/index.js', './js/drills/stage.js', './js/drills/loopbreak.js', './js/drills/orient.js',
  './js/drills/periph.js', './js/drills/ironhand.js', './js/drills/twitch.js', './js/drills/pulse.js',
  './js/drills/wrread.js', './js/drills/track.js',
  './assets/icon-192.png', './assets/icon-512.png', './assets/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(e.request.method !== 'GET') return;
  if(url.origin !== location.origin) return;          // let fonts hit the network
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
