const CACHE_NAME = "pwa-player-cache-v57";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
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
        "/settings.js",
        "/sw-register.js",
        "/manifest.json",
        "/icons/icon.webp"
      ]);
    })
  );
  self.skipWaiting(); // Activate immediately
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key); // 🔥 delete old cache
          }
        })
      )
    )
  );
  clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === "basic"
          ) {
            cache.put(event.request, networkResponse.clone()); // ← updates cache
          }
          return networkResponse;
        });

        return cachedResponse || fetchPromise;
      })
    )
  );
});
