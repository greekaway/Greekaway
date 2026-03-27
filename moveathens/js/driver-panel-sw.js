/**
 * MoveAthens Driver Panel — Service Worker
 * Stale-while-revalidate for assets, network-only for API/version.
 * Push notification handler + update banner support.
 */
'use strict';

const CACHE_VERSION = 'v20260327h';
const CACHE_NAME = `ma-driver-${CACHE_VERSION}`;

const CORE_ASSETS = [
  '/moveathens/driver',
  '/moveathens/css/driver-panel.css',
  '/moveathens/css/driver-panel-auth.css',
  '/moveathens/css/driver-panel-home.css',
  '/moveathens/css/driver-panel-appointments.css',
  '/moveathens/css/driver-panel-history.css',
  '/moveathens/css/driver-panel-financials.css',
  '/moveathens/css/driver-panel-profile.css',
  '/moveathens/js/driver-panel.js',
  '/moveathens/js/driver-panel-auth.js',
  '/moveathens/js/driver-panel-home.js',
  '/moveathens/js/driver-panel-appointments.js',
  '/moveathens/js/driver-panel-history.js',
  '/moveathens/js/driver-panel-financials.js',
  '/moveathens/js/driver-panel-profile.js',
  '/moveathens/js/driver-panel-push.js',
  '/moveathens/videos/hero-logo.png',
  '/moveathens/icons/favicon-32x32.png',
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
        if (k.startsWith('ma-driver-') && k !== CACHE_NAME) return caches.delete(k);
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

    // Network-only: API, version, SSE, uploads, manifests
    if (url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/uploads/') ||
        url.pathname === '/version.json' ||
        url.pathname.endsWith('manifest.json') ||
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

// ── Push notification received ──
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'MoveAthens', body: event.data?.text() || '' }; }

  const title = data.title || 'MoveAthens Driver';
  const options = {
    body: data.body || '',
    icon: '/moveathens/videos/hero-logo.png',
    badge: '/moveathens/icons/favicon-32x32.png',
    tag: data.tag || 'ma-driver',
    data: data.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: data.urgent !== false
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Push notification click ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  let targetUrl = '/moveathens/driver';

  // If active route, go to fullscreen mode
  if (notifData.requestId && notifData.token) {
    targetUrl = `/moveathens/active-route?token=${notifData.token}`;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Focus existing tab if open
      for (const client of clients) {
        if (client.url.includes('/moveathens/driver') && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
