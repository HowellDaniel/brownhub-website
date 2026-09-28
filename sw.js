const CACHE = "brownhub-v1";
const OFFLINE = "/offline.html";
const SHELL = [OFFLINE, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png",
  "/icons/maskable-512.png", "/icons/apple-touch-icon.png", "/images/logo.png", "/images/favicon.png"];

// Anything served from another origin — Supabase auth, the chat proxy, Paystack —
// is left completely alone. Only our own static files may ever be stored.
const MINE = new Set([location.hostname, "www.brownhub283.com"]);

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("message", (e) => {
  if (e.data === "skip-waiting") self.skipWaiting();
});

function freshen(res) {
  if (!res || res.status !== 200 || res.type !== "basic") return res;
  const copy = res.clone();
  caches.open(CACHE).then((c) => c.put(res.url, copy)).catch(() => {});
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (!MINE.has(url.hostname)) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => freshen(res))
        .catch(() => caches.match(req).then((hit) => hit || caches.match(OFFLINE)))
    );
    return;
  }

  const st = url.pathname.split("/")[1];
  if (["css", "js", "i18n", "data", "fonts", "images", "icons"].indexOf(st) === -1) return;
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => freshen(res)).catch(() => hit);
      return hit || net;
    })
  );
});
