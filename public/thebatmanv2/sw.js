self.addEventListener("install", (event) => {
  event.waitUntil(caches.open("batmanv2-v2").then((cache) => cache.addAll([
    "./",
    "./index.html",
    "./css/style.css",
    "./js/app.js",
    "./manifest.json"
  ])));
});
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request))
  );
});
