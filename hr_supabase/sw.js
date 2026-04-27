const CACHE_NAME = "hr-attendance-login-punch-fix-20260427-8";
const ASSETS = [
  "./index.html",
  "./assets/css/styles.css",
  "./assets/js/database.js",
  "./assets/js/api.js",
  "./assets/js/supabase-api.js",
  "./assets/js/supabase-config.js",
  "./assets/js/app.js",
  "./assets/js/register-sw.js",
  "./assets/pwa/manifest.json",
  "./assets/images/ahla-shabab-logo.png",
  "./assets/images/favicon-64.png",
  "./assets/images/icon-192.png",
  "./assets/images/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("hr-attendance") && key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.includes("/rest/v1/") || url.hostname.endsWith("supabase.co")) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => undefined);
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html"))),
  );
});

self.addEventListener("push", (event) => {
  let payload = { title: "نظام الحضور", body: "لديك تنبيه جديد" };
  try { payload = event.data ? event.data.json() : payload; } catch {}
  event.waitUntil(self.registration.showNotification(payload.title || "نظام الحضور", {
    body: payload.body || "لديك تنبيه جديد",
    icon: "./assets/images/icon-192.png",
    badge: "./assets/images/favicon-64.png",
    tag: payload.tag || "hr-notification",
    data: payload.data || {},
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if ("focus" in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow("./index.html#notifications");
    return undefined;
  }));
});

self.addEventListener("sync", (event) => {
  if (event.tag === "hr-offline-sync") {
    event.waitUntil(self.clients.matchAll().then((clientsList) => clientsList.forEach((client) => client.postMessage({ type: "SYNC_OFFLINE_QUEUE" }))));
  }
});
