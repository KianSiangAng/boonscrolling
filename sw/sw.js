/* boonscrolling service worker. Built by vite.config.ts, which injects the precache list. */
const VERSION = self.__VERSION__;
const PRECACHE = self.__PRECACHE__;
const SHELL_CACHE = `shell-${VERSION}`;
const RUNTIME_CACHE = 'runtime-v1';
const RUNTIME_MAX_ENTRIES = 400;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - RUNTIME_MAX_ENTRIES))) await cache.delete(key);
}

/** Flags: cache-first (they never change), so every flag seen once works offline. */
async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') {
    await cache.put(request, res.clone());
    void trim(cache);
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    // App shell: hashed assets never change, so cache-first is safe. Navigations get index.html.
    if (request.mode === 'navigate') {
      event.respondWith(
        fetch(request).catch(() => caches.match('./', { ignoreSearch: true }).then((r) => r ?? Response.error())),
      );
      return;
    }
    event.respondWith(caches.match(request, { ignoreSearch: true }).then((hit) => hit ?? fetch(request)));
    return;
  }

  // API responses (trivia, countries) are persisted in IndexedDB by the app itself.
  if (url.hostname === 'flags.restcountries.com') event.respondWith(cacheFirst(request));
});
