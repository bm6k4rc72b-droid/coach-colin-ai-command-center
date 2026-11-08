/**
 * RANCH COMMAND — offline shell. The page, its scripts, the bundled AI
 * runtime and both models are cached so the dashboard and on-device
 * detection still open with no signal. Live streams and the edge API are
 * never cached.
 */

const CACHE = 'ranch-command-v1';
const SHELL = [
  './', './index.html', './styles.css', './rules.json', './icon.svg', './manifest.webmanifest',
  './js/app.js', './js/slides.js', './js/dom.js', './js/config.js', './js/events.js', './js/mqtt.js', './js/mavlink.js',
  './js/mesh.js', './js/streams.js', './js/ai.js', './js/gesture.js', './js/rafa.js', './js/stack.js', './js/map3d.js',
  './vendor/mediapipe/vision_bundle.mjs', './vendor/mediapipe/wasm/vision_wasm_internal.js', './vendor/mediapipe/wasm/vision_wasm_internal.wasm',
  './models/efficientdet_lite0.tflite', './models/hand_landmarker.task',
  './vendor/three/three.module.min.js', './vendor/three/addons/postprocessing/EffectComposer.js', './vendor/three/addons/postprocessing/RenderPass.js',
  './vendor/three/addons/postprocessing/UnrealBloomPass.js', './vendor/three/addons/postprocessing/OutputPass.js', './vendor/three/addons/postprocessing/Pass.js',
  './vendor/three/addons/postprocessing/ShaderPass.js', './vendor/three/addons/postprocessing/MaskPass.js', './vendor/three/addons/shaders/CopyShader.js',
  './vendor/three/addons/shaders/LuminosityHighPassShader.js', './vendor/three/addons/shaders/OutputShader.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('ranch-command')).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const heavy = /\/(vendor|models)\//.test(url.pathname);
  if (heavy) {
    // The runtime and models never change under the same name: cache first.
    event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));
    return;
  }
  // Everything else: network first so updates land, cache when offline.
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
