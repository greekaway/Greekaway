/**
 * MoveAthens Hotel Site — PWA Boot
 * Registers site-specific service worker + loads update-banner.
 */
(function() {
  'use strict';

  var SW_PATH  = '/moveathens/js/moveathens-sw.js';
  var SW_SCOPE = '/moveathens/';

  // ── Register Service Worker ──
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE })
      .then(function(reg) {
        // If a new SW is waiting, show update banner
        if (reg.waiting) loadUpdateBanner();
        reg.addEventListener('updatefound', function() {
          var nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', function() {
            if (nw.state === 'activated') loadUpdateBanner();
          });
        });
      })
      .catch(function(err) { console.warn('[ma-pwa] SW reg failed:', err); });
  }

  // ── Load shared update-banner.js ──
  function loadUpdateBanner() {
    if (document.querySelector('script[src*="update-banner"]')) return;
    var s = document.createElement('script');
    s.src = '/js/update-banner.js';
    s.defer = true;
    document.head.appendChild(s);
  }

  // Always load update-banner on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadUpdateBanner);
  } else {
    loadUpdateBanner();
  }
})();
