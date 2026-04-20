const PWAPLAYER_VERSION = "398";
const CACHE_NAME = `pwa-player-cache-v${PWAPLAYER_VERSION}`;
const urlsToCache = [
  "/",
  "/style.css",
  "/settings.css",
  "/indexeddb.js",
  "/nowplaying.js",
  "/player.js",
  "/embeddedplayer.js",
  "/storage.js",
  "/playlist.js",
  "/iptvchannels.js",
  "/iptv.js",
  "/extrafeatures.js",
  "/wakelock.js",
  "/imageviewer.js",
  "/settings.js",
  "/sw-register.js",
  "/manifest.json",
  "/icons/icon.webp",
  "/locale.js",
  "/locales/en.js",
  "/locales/zhcn.js",
  "/locales/ja.js",
  // Platform support for embedded players
  "/platforms/base.js",
  "/platforms/youtube.js",
  "/platforms/vimeo.js",
  "/platforms/bilibili.js",
  "/platforms/douyin.js",
  "/platforms/tiktok.js",
  "/platforms/twitch.js",
  "/platforms/spotify.js",
  "/platforms/soundcloud.js",
  "/platforms/applemusic.js",
  "/platforms/kick.js",
  "/platforms/neteasemusic.js"
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
  const host = url.hostname;
/*
https://wicg.github.io/local-network-access/
For some reasons, LNA only accepts .local
See issue:
https://github.com/WICG/local-network-access/issues/3
We treat .local, .lan, .internal for future expansions
*/
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    host.endsWith(".local") ||
    host.endsWith(".lan") ||
    host.endsWith(".internal") ||
    host.startsWith("fe80:") ||   // IPv6 link-local
    host.startsWith("fc") ||      // IPv6 ULA
    host.startsWith("fd");        // IPv6 ULA

  if (isLocal) {
    return; // Let browser handle LAN traffic
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        return new Response("Offline", { status: 503 });
      });
    })
  );
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
