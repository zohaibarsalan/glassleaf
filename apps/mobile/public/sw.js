/* build:web replaces the development cache ID and precache list. */
const CACHE = "glassleaf-shell-dev";
const PRECACHE = ["/", "/index.html", "/manifest.json", "/favicon.ico"];
const PRECACHE_PATHS = new Set(
  PRECACHE.map((entry) => new URL(entry, self.location).pathname),
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("glassleaf-shell-") && key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .open(CACHE)
          .then((cache) => cache.match("/index.html"))
          .then((response) => response ?? Response.error()),
      ),
    );
    return;
  }

  if (!PRECACHE_PATHS.has(url.pathname)) return;
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(url.pathname, { ignoreSearch: true }))
      .then((response) => response ?? fetch(request)),
  );
});
