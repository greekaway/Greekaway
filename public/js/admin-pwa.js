/**
 * Greekaway Admin — PWA Boot
 * Registers admin-specific service worker + loads update-banner.
 * Replaces generic pwa-install.js for admin pages.
 */
(function() {
  'use strict';

  var SW_PATH = '/admin-sw.js';

  // ── Register Service Worker ──
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(SW_PATH)
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
      .catch(function(err) { console.warn('[admin-pwa] SW reg failed:', err); });
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
