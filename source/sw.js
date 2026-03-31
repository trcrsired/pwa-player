const PWAPLAYER_VERSION = "255";
const CACHE_NAME = `pwa-player-cache-v${PWAPLAYER_VERSION}`;
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
  const url = new URL(event.request.url);

  // Detect loopback/local network requests
  const isLocal =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname.startsWith("192.168.") ||
      url.hostname.startsWith("10.") ||
      url.hostname.endsWith(".local");

  if (isLocal) {
      // Let the browser handle it directly
      return;
  }

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
