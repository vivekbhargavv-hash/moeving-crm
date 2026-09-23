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

/*
 * "New lead: ZYRKON · Hyderabad · 2 × 3W". The server sends { title, body,
 * url, callUrl?, tag }; one tag per lead, so reassigning the same lead
 * replaces its notification rather than stacking a second one.
 *
 * With a number, the notification carries a Call button (Chrome on Android
 * and desktop; iOS shows no buttons, so a tap opens the lead instead). A
 * notification cannot dial by itself — browsers do not open tel: from a
 * service worker — so Call opens the lead with ?call=1 and the page hands
 * the number to the dialer, the card's Call button beneath it if refused.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Good Deal", {
      body: data.body || "",
      tag: data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/leads", callUrl: data.callUrl },
      actions: data.callUrl ? [{ action: "call", title: "Call" }] : [],
    }),
  );
});

// A tap opens the app on the page the notification is about, reusing a
// window that is already open rather than starting another.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = event.action === "call" && data.callUrl ? data.callUrl : data.url || "/leads";
  const url = new URL(target, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if (new URL(win.url).origin === self.location.origin && "focus" in win) {
          return win.navigate(url).then((w) => (w || win).focus());
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
