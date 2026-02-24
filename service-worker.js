const CACHE_NAME = "jo-todo-offline-v1";

function u(path) {
  return new URL(path, self.location).toString();
}

const ASSETS = [
  u("./"),
  u("./index.html"),
  u("./style.css"),
  u("./script.js"),
  u("./manifest.webmanifest"),

  // ไอคอน (ใส่เท่าที่มีจริงในโฟลเดอร์)
  u("./icons/icon-192.png"),
  u("./icons/icon-512.png"),
  u("./icons/icon-180.png"),
  u("./icons/icon-167.png"),
  u("./icons/icon-152.png"),
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // ✅ Navigation fallback: ออฟไลน์แล้วเปิดแอป ให้กลับไป index.html
  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.match(u("./index.html")).then((cached) => cached || fetch(event.request))
    );
    return;
  }

  // ✅ Cache first สำหรับไฟล์ในแอป
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});