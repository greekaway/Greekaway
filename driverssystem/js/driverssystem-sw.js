/**
 * DriverSystem — Service Worker
 * Stale-while-revalidate for assets, network-only for API/version.
 */
'use strict';

const CACHE_VERSION = 'v20260325';
const CACHE_NAME = `ds-${CACHE_VERSION}`;

const CORE_ASSETS = [
  '/driverssystem/pages/welcome.html',
  '/driverssystem/pages/entries.html',
  '/driverssystem/pages/debts.html',
  '/driverssystem/pages/stats.html',
  '/driverssystem/pages/car-expenses.html',
  '/driverssystem/pages/personal-expenses.html',
  '/driverssystem/pages/tax-expenses.html',
  '/driverssystem/pages/appointments.html',
  '/driverssystem/pages/partners.html',
  '/driverssystem/pages/obligations.html',
  '/driverssystem/pages/profile.html',
  '/driverssystem/pages/assistant.html',
  '/driverssystem/css/driverssystem-base.css',
  '/driverssystem/css/dark-mode.css',
  '/driverssystem/css/footer.css',
  '/driverssystem/css/auth-gate.css',
  '/driverssystem/css/page-loader.css',
  '/driverssystem/css/welcome.css',
  '/driverssystem/js/driverssystem-config.js',
  '/driverssystem/js/auth-gate.js',
  '/driverssystem/js/page-loader.js',
  '/driverssystem/js/footer.js',
  '/driverssystem/js/welcome.js',
  '/driverssystem/icons/favicon-32x32.png',
  '/driverssystem/icons/apple-touch-icon.png',
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
        if (k.startsWith('ds-') && k !== CACHE_NAME) return caches.delete(k);
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
