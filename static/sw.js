const CACHE_NAME = "doc-draft-builder-v1";
const STATIC_ASSETS = [
  "/static/css/style.css?v=4",
  "/static/js/app.js?v=5",
  "/static/images/suwon_logo.png",
  "/static/images/icon-192.png",
  "/static/images/icon-512.png",
  "/static/images/apple-touch-icon.png",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/") || url.pathname === "/login") return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
