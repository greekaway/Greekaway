/**
 * Greekaway Admin Panel — Service Worker
 * Network-first strategy (admin always needs fresh data).
 * Handles update lifecycle + cache cleanup.
 */
'use strict';

const CACHE_VERSION = 'v20260325';
const CACHE_NAME = `admin-${CACHE_VERSION}`;

const CORE_ASSETS = [
  '/css/admin-common.css',
  '/css/admin-theme-toggle.css',
  '/images/logo.png',
  '/offline.html'
];

// ── Install ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => {
        if (k.startsWith('admin-') && k !== CACHE_NAME) return caches.delete(k);
      }))
    ).then(() => self.clients.claim())
  );
});

// ── Message: allow SKIP_WAITING from client ──
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Fetch: network-first for everything, fallback to cache ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // Network-only: API calls, version.json, SSE
    if (url.pathname.startsWith('/api/') ||
        url.pathname === '/version.json' ||
        url.pathname.includes('/sse')) {
      event.respondWith(
        fetch(request, { cache: 'no-store' }).catch(() => new Response('', { status: 503 }))
      );
      return;
    }
  } catch { /* fall through */ }

  // Network-first: try network, fall back to cache
  event.respondWith(
    fetch(request).then(response => {
      if (response && response.status === 200) {
        try {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, copy)).catch(() => {});
        } catch { /* */ }
      }
      return response;
    }).catch(() => {
      return caches.match(request).then(cached => {
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('/offline.html');
        return new Response('', { status: 503 });
      });
    })
  );
});
