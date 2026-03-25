/**
 * DriverSystem — PWA Boot
 * Registers site-specific service worker + loads update-banner.
 */
(function() {
  'use strict';

  var SW_PATH  = '/driverssystem/js/driverssystem-sw.js';
  var SW_SCOPE = '/driverssystem/';

  // ── Register Service Worker ──
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE })
      .then(function(reg) {
        if (reg.waiting) loadUpdateBanner();
        reg.addEventListener('updatefound', function() {
          var nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', function() {
            if (nw.state === 'activated') loadUpdateBanner();
          });
        });
      })
      .catch(function(err) { console.warn('[ds-pwa] SW reg failed:', err); });
  }

  // ── Load shared update-banner.js ──
  function loadUpdateBanner() {
    if (document.querySelector('script[src*="update-banner"]')) return;
    var s = document.createElement('script');
    s.src = '/js/update-banner.js';
    s.defer = true;
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadUpdateBanner);
  } else {
    loadUpdateBanner();
  }
})();
