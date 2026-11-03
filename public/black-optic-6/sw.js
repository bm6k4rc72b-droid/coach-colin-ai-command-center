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

const CACHE = 'black-optic-6-v5';
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
  'js/ranch-sim.js',
  'js/twin3d.js',
  'js/vision-ops.js',
  'js/world.js',
  'js/trafficcam.js',
  'js/newsfeed.js',
  'js/mariachi.js',
  'js/ai/ai-ui.js',
  'js/ai/audio-classes.js',
  'js/ai/depth-calib.js',
  'js/ai/detect.js',
  'js/ai/evidence.js',
  'js/ai/geophone.js',
  'js/ai/installs.js',
  'js/ai/isotherm.js',
  'js/ai/mavlink.js',
  'js/ai/meshtastic.js',
  'js/ai/ndvi.js',
  'js/ai/pcd.js',
  'js/ai/reid.js',
  'js/ai/runtime.js',
  'js/ai/vlm.js',
  'js/ai/zenoh.js',
  'js/ai/nvidia.js',
  'js/site/buildings.js',
  'js/site/egress.js',
  'js/site/energy.js',
  'js/site/flow.js',
  'js/site/site-ui.js',
  'js/site/sun.js',
  'vendor/suncalc/suncalc.js',
  'vendor/noble/blake3.js',
  'vendor/noble/_md.js',
  'vendor/noble/_u64.js',
  'vendor/noble/blake2.js',
  'vendor/noble/_blake.js',
  'vendor/noble/utils.js',
  'vendor/noble/crypto.js',
  '../vision-kit/bytetrack.js',
  '../vision-kit/latency.js',
  '../vision-kit/pointcloud.js',
  '../vision-kit/twin.js',
  '../vision-kit/vps.js',
  '../vision-kit/detector.js',
  '../vision-kit/depth.js',
  '../vision-kit/cinema.js',
  '../vision-kit/vendor/three.module.min.js',
  '../vision-kit/vendor/addons/controls/OrbitControls.js',
  '../vision-kit/vendor/addons/postprocessing/EffectComposer.js',
  '../vision-kit/vendor/addons/postprocessing/RenderPass.js',
  '../vision-kit/vendor/addons/postprocessing/UnrealBloomPass.js',
  '../vision-kit/vendor/addons/postprocessing/OutputPass.js',
  '../vision-kit/vendor/addons/postprocessing/ShaderPass.js',
  '../vision-kit/vendor/addons/postprocessing/Pass.js',
  '../vision-kit/vendor/addons/postprocessing/MaskPass.js',
  '../vision-kit/vendor/addons/shaders/CopyShader.js',
  '../vision-kit/vendor/addons/shaders/LuminosityHighPassShader.js',
  '../vision-kit/vendor/addons/shaders/OutputShader.js',
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

/** Code changes between deploys; fetch it fresh when online, fall back to the cache offline. */
const FRESH = /\.(?:html|js|mjs|css|json|webmanifest)$/;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Only this site's own files. Model weights (Hugging Face), Sentinel-2,
  // your Zenoh router and your Ollama are never touched by this worker — and
  // orbital imagery in particular must never be served stale as if current.
  if (url.origin !== self.location.origin) return;
  if (request.headers.has('range')) return;
  const store = (response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  };
  const fresh = url.pathname.endsWith('/') || FRESH.test(url.pathname);
  event.respondWith(fresh
    // Network first for code, so a deploy reaches the console on the next load.
    ? fetch(request).then(store).catch(() => caches.match(request).then((hit) => hit ?? caches.match('index.html')))
    // Cache first for the big binaries (WASM, the YAMNet model): fetched once, kept.
    : caches.match(request).then((hit) => hit ?? fetch(request).then(store)));
});
