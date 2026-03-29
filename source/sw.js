const CACHE_NAME = "pwa-player-cache-v157";
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
  "/icons/icon.webp",
  "/locale.js",
  "/locales/en.js",
  "/locales/zhcn.js",
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
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
      });
    })
  );
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
