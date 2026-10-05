const CACHE = "brownhub-v13";
const OFFLINE = "/offline.html";
const SHELL = [OFFLINE, "/css/offline.css?v=1", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png",
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

// GitHub Pages answers with no security headers whatsoever. A page's own
// <meta> can carry the content policy, but frame-ancestors is ignored when it
// arrives that way, and no meta at all can ask for the rest — so every page this
// worker returns, live or from cache, gets the headers the host will not send.
const PAGE_HEADERS = {
  "content-security-policy": "frame-ancestors 'self'",
  "x-frame-options": "SAMEORIGIN",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  // Everything the studio's own pages never touch. Microphone and clipboard stay
  // open on purpose: the voice note and the copy-account button both need them.
  "permissions-policy": "camera=(), geolocation=(), accelerometer=(), gyroscope=(), " +
    "magnetometer=(), usb=(), bluetooth=(), serial=(), hid=(), midi=(), " +
    "display-capture=(), idle-detection=(), interest-cohort=()",
};

function guard(res) {
  if (!res || res.status !== 200 || res.type !== "basic") return res;
  try {
    const h = new Headers(res.headers);
    for (const k in PAGE_HEADERS) if (!h.get(k)) h.set(k, PAGE_HEADERS[k]);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  } catch (err) { return res; }
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
        .then((res) => { freshen(res); return guard(res); })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(OFFLINE)).then(guard))
    );
    return;
  }

  const st = url.pathname.split("/")[1];
  if (["css", "js", "i18n", "data", "fonts", "images", "icons"].indexOf(st) === -1) return;

  // The owner edits data/*.json by hand and expects the new figure or review to show
  // up for a returning visitor without a hard refresh — which cache-first quietly
  // undoes once this file is installed as an app. Curated content therefore asks the
  // network first and falls back to what it has; code and dictionaries keep their
  // cache-first reading because those are versioned by the ?v= ledger anyway.
  if (st === "data") {
    e.respondWith(
      fetch(req)
        .then((res) => freshen(res))
        .catch(() => caches.match(req))
        .then((hit) => hit || new Response("{}", {
          status: 504,
          headers: { "content-type": "application/json" },
        }))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => freshen(res)).catch(() => hit);
      return hit || net;
    })
  );
});
