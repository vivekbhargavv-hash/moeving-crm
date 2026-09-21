/*
 * Minimal, honest service worker.
 *
 * It makes the app installable and instant to open. It deliberately does NOT
 * cache API responses or queue offline writes — a CRM that shows a salesperson
 * stale pipeline numbers is worse than one that says "you're offline".
 */
// Bump this whenever a cached asset changes identity without changing its URL
// — the icons did when the logo changed, and an installed phone would
// otherwise keep serving the old one from this cache forever.
const SHELL = "moeving-shell-v2";
const SHELL_URLS = ["/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Navigations: network first, offline card as the fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline").then((r) => r || Response.error())),
    );
    return;
  }

  // Static build output only: immutable by content hash, safe to serve fast.
  if (request.url.includes("/_next/static/") || request.url.includes("/icons/")) {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
  }
});
