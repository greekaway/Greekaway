// Greekaway PWA – 2025-11-13
self.skipWaiting();
self.clientsClaim();

// Explicit cache version to force fresh caches on deploys
const CACHE_VERSION = 'v20251113';

// Bump cache to invalidate old SW and ensure fresh checkout/network
const CACHE_NAME = `greekaway-pwa-${CACHE_VERSION}`;

// Core assets to pre-cache for fast, offline-first navigation
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/trips.html',
  // Checkout MUST NOT be precached to avoid stale Stripe placeholders
  // '/checkout.html',
  '/step2.html',
  '/step3.html',
  '/admin.html',
  '/admin-home.html',
  '/admin-bookings.html',
  '/admin-payments.html',
  '/admin-manual.html',
  '/admin-providers.html',
  '/admin-availability.html',
  '/admin/trip-availability.html',
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
  '/css/trip-core.css',
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
  '/js/trip-core.js',
  '/js/admin-home.js',
  '/js/admin-bookings.js',
  '/js/admin-payments.js',
  '/offline.html',
  '/pwa.css',
  '/css/pwa-fixes.css'
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

  // Network-only for sensitive endpoints and third-party payment scripts
  try {
    const url = new URL(request.url);
    const isSameOrigin = url.origin === self.location.origin;
    const path = url.pathname || '';

    const networkOnly = (
      // Never cache checkout page or well-known files
      path === '/checkout.html' || path.startsWith('/.well-known/') ||
      // Never cache any API calls (includes create-payment-intent endpoints)
      path.startsWith('/api/') ||
      // Explicit example file mentioned (if it ever exists)
      path === '/js/checkout.js' ||
      // Never touch Stripe domains or related assets
      url.origin === 'https://js.stripe.com' ||
      url.hostname.endsWith('.stripe.com')
    );

    if (networkOnly) {
      event.respondWith(
        fetch(request).catch((err) => {
          // For navigations, provide offline fallback
          if (isHtmlNavigation && isSameOrigin) return caches.match('/offline.html');
          throw err;
        })
      );
      return;
    }
  } catch (_) { /* fall through to default strategy */ }

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
