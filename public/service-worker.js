// Greekaway PWA – 2025-11-13

const CACHE_NAME = 'greekaway-pwa-v1';

// Core assets to pre-cache for fast, offline-first navigation
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/trips.html',
  '/checkout.html',
  '/step2.html',
  '/step3.html',
  '/admin.html',
  '/admin-home.html',
  '/admin-bookings.html',
  '/admin-payments.html',
  '/admin-manual.html',
  '/admin-providers.html',
  '/admin-availability.html',
  '/manual-payments.html',
  '/partner-agreement.html',
  '/partner-manual-onboarding.html',
  // Provider basic pages
  '/provider/login.html',
  '/provider/dashboard.html',
  '/provider/profile.html',
  '/provider/payments.html',
  '/provider/bookings.html',
  '/provider/availability.html',
  '/provider/provider-profile.html',
  '/provider/provider-payments.html',
  '/provider/provider-bookings.html',
  '/provider/provider-drivers.html',
  '/provider/provider-availability.html',
  // Driver basic pages
  '/driver/driver-login.html',
  '/driver/driver-dashboard.html',
  '/driver/driver-profile.html',
  '/driver/driver-route.html',
  '/driver/driver-scan.html',
  // CSS/JS essentials (keep list small to avoid huge caches)
  '/css/style.css',
  '/css/theme.css',
  '/css/booking.css',
  '/css/checkout.css',
  '/css/trip.css',
  '/css/welcome.css',
  '/css/admin-common.css',
  '/css/admin-home.css',
  '/css/admin-payments.css',
  '/css/admin-bookings.css',
  '/css/admin-availability.css',
  '/js/main.js',
  '/js/welcome.js',
  '/js/i18n.js',
  '/js/footer.js',
  '/js/admin-home.js',
  '/js/admin-bookings.js',
  '/js/admin-payments.js',
  '/offline.html',
  '/pwa.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Stale-while-revalidate strategy with offline fallback for navigations
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // Only cache GET

  const isHtmlNavigation = request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          // Update cache clone for same-origin only
          try {
            const url = new URL(request.url);
            if (url.origin === self.location.origin && response && response.status === 200) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
            }
          } catch (_) {}
          return response;
        })
        .catch((err) => {
          // Network failed. If navigation and no cache, serve offline fallback
          if (isHtmlNavigation) {
            return caches.match('/offline.html');
          }
          // Else, give cached if present, or propagate error
          return cached || Promise.reject(err);
        });

      // Return cached immediately if present; meanwhile update in background
      return cached || networkFetch;
    })
  );
});
