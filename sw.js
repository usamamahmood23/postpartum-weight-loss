/* Mama Reset — Service Worker */
const VERSION = "mama-reset-v4";
const CORE_CACHE = VERSION + "-core";
const RUNTIME_CACHE = VERSION + "-runtime";

// Same-origin files that make up the app shell.
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

// Pre-cache the app shell. Cache items individually so one failure
// (e.g. a transient network blip) doesn't abort the whole install.
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    await Promise.allSettled(CORE_ASSETS.map((url) => cache.add(url)));
    self.skipWaiting();
  })());
});

// Remove caches from older versions.
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Page navigations: network-first so updates show when online,
  // fall back to the cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CORE_CACHE);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match("./index.html")) ||
               (await caches.match("./")) ||
               Response.error();
      }
    })());
    return;
  }

  // Everything else (icons, CDN scripts, fonts): stale-while-revalidate.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then((res) => {
      if (res && (res.ok || res.type === "opaque")) {
        caches.open(RUNTIME_CACHE).then((c) => c.put(req, res.clone()));
      }
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});

// Allow the page to trigger an immediate update.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
