const CACHE_NAME = "pwa-player-cache-v70";
const urlsToCache = [
  "/",
  "/style.css",
  "/settings.css",
  "/indexeddb.js",
  "/nowplaying.js",
  "/player.js",
  "/storage.js",
  "/playlist.js",
  "/iptvchannels.js",
  "/iptv.js",
  "/extrafeatures.js",
  "/wakelock.js",
  "/settings.js",
  "/sw-register.js",
  "/manifest.json",
  "/icons/icon.webp"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request).catch(() => response);
    })
  );
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
