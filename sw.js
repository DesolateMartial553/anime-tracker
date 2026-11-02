// Cozy Corner service worker — the site stays usable offline after the first visit.
//
// Rules (agreed in SYNC-2):
//   * same-origin GET          → network first, so a new deploy shows up on the next open;
//                                the cache is the fallback when the connection is gone.
//   * cdn.jsdelivr.net GET     → cache first (supabase-js and its chunks have versioned URLs).
//   * everything else          → untouched: AniList, Supabase, s4.anilist.co covers.
//   * non-GET requests         → never intercepted.

const VERSION = 'v1';
const SHELL_CACHE = 'cozy-shell-' + VERSION;
const VENDOR_CACHE = 'cozy-vendor-' + VERSION;

// Every file the app needs to open with no connection. Listed one by one on purpose:
// a missing file should fail the install loudly, not silently ship half a shell.
const SHELL = [
  './',
  'index.html',
  'offline.html',
  'css/fonts.css',
  'css/style.css',
  'js/app.js',
  'js/store.js',
  'js/anilist.js',
  'js/config.js',
  'fonts/fredoka-latin.woff2',
  'fonts/fredoka-latin-ext.woff2',
  'fonts/nunito-latin.woff2',
  'fonts/nunito-latin-ext.woff2',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'manifest.json',
];

const NETWORK_TIMEOUT = 4000; // ms; then the cached copy wins instead of a blank screen
const CDN_ORIGIN = 'https://cdn.jsdelivr.net';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, VENDOR_CACHE]);
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => (
      name.startsWith('cozy-') && !keep.has(name) ? caches.delete(name) : Promise.resolve(false)
    )));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(event, request));
  } else if (url.origin === CDN_ORIGIN) {
    event.respondWith(cacheFirst(request, VENDOR_CACHE));
  }
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

async function networkFirst(event, request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT);
    if (response && response.ok) {
      event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
    }
    return response;
  } catch {
    const hit = await caches.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (request.mode === 'navigate') {
      const shell = (await cache.match('index.html')) || (await cache.match('./'));
      if (shell) return shell;
      const offline = await cache.match('offline.html');
      if (offline) return offline;
    }
    return Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    return Response.error();
  }
}
