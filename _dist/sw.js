/* Chef Marco service worker. Network-first, cache fallback. */
/* Bump CACHE_VERSION when shipping new global assets so old caches retire. */

const CACHE_VERSION = "chef-marco-v1";
const CORE_ASSETS = [
  "./manifest.json",
  "./icon-192.svg",
  "./icon-512.svg",
  "./tap-step.js",
  "./print.css",
  "../tokens.css"
];

/* install: precache core, take over fast */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // each addAll item is best-effort; ignore individual failures
      return Promise.all(
        CORE_ASSETS.map((url) =>
          cache.add(url).catch(() => null)
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* activate: drop stale caches, claim clients */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* fetch: network-first for GET, fall back to cache, cache successful responses */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Skip cross-origin opaque exotica (fonts CDN handled by browser cache)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // cache a clone of the fresh response (covers recipe images, html, etc.)
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./")))
  );
});
