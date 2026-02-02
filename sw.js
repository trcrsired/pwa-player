const CACHE_NAME = "pwa-player-cache-v20";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        "/", // Entry file
        "/style.css",  // Styles
        "/settings.css",  // Settings Styles
        "/indexeddb.js",  // JS logic
        "/nowplaying.js",
        "/player.js",  // JS logic
        "/storage.js",  // JS logic
        "/playlist.js",
        "/sw-register.js",
        "/manifest.json",
        "/icons/icon.webp"
        // You could add default video or fallback assets too
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
