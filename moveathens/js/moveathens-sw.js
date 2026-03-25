/**
 * MoveAthens Hotel Site — Service Worker
 * Stale-while-revalidate for assets, network-only for API/version.
 */
'use strict';

const CACHE_VERSION = 'v20260325';
const CACHE_NAME = `ma-site-${CACHE_VERSION}`;

const CORE_ASSETS = [
  '/moveathens/pages/welcome.html',
  '/moveathens/pages/transfer.html',
  '/moveathens/pages/prices.html',
  '/moveathens/pages/info.html',
  '/moveathens/pages/contact.html',
  '/moveathens/pages/hotel-context.html',
  '/moveathens/pages/hotel-profile.html',
  '/moveathens/pages/hotel-settings.html',
  '/moveathens/pages/hotel-revenue.html',
  '/moveathens/pages/ai-assistant.html',
  '/moveathens/pages/media.html',
  '/moveathens/css/moveathens-base.css',
  '/moveathens/css/dark-mode.css',
  '/moveathens/css/footer.css',
  '/moveathens/css/welcome.css',
  '/moveathens/css/transfer.css',
  '/moveathens/css/auth-gate.css',
  '/moveathens/css/page-loader.css',
  '/moveathens/js/moveathens-config.js',
  '/moveathens/js/auth-gate.js',
  '/moveathens/js/page-loader.js',
  '/moveathens/js/footer.js',
  '/moveathens/js/welcome.js',
  '/moveathens/js/network-status.js',
  '/moveathens/videos/hero-logo.png',
  '/moveathens/icons/favicon-32x32.png',
  '/moveathens/icons/apple-touch-icon.png',
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
        if (k.startsWith('ma-site-') && k !== CACHE_NAME) return caches.delete(k);
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

// ── Fetch: network-only for API/version, stale-while-revalidate for rest ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // Network-only: API, version, SSE, uploads
    if (url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/uploads/') ||
        url.pathname === '/version.json' ||
        url.pathname.includes('/sse')) {
      event.respondWith(
        fetch(request, { cache: 'no-store' }).catch(() => {
          if (request.mode === 'navigate') return caches.match('/offline.html');
          return new Response('', { status: 503 });
        })
      );
      return;
    }
  } catch { /* fall through */ }

  // Stale-while-revalidate
  event.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request).then(response => {
        try {
          const url = new URL(request.url);
          if (url.origin === self.location.origin && response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, copy)).catch(() => {});
          }
        } catch { /* */ }
        return response;
      }).catch(() => {
        if (request.mode === 'navigate') return caches.match('/offline.html');
        return cached;
      });

      return cached || networkFetch;
    })
  );
});
