// Greekaway PWA – 2025-11-13

(function(){
  // Ensure mobile --vh fix is loaded globally where this file is included
  try {
    var hasVhFix = !!document.querySelector('script[src*="/js/mobile-vh-fix.js"]');
    if (!hasVhFix) {
      var s = document.createElement('script');
      s.src = '/js/mobile-vh-fix.js';
      s.defer = false;
      document.head.appendChild(s);
    }
  } catch(_) {}

  let deferredPrompt = null;
  let bannerEl = null;

  function alreadyInstalled(){
    try {
      // iOS/Android standalone check
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
      // iOS Safari older
      if (window.navigator && window.navigator.standalone) return true;
    } catch(_) {}
    return false;
  }

  function hideBanner(){
    try { if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl); } catch(_) {}
    bannerEl = null;
  }

  function createBanner(){
    if (bannerEl) return bannerEl;
    const wrap = document.createElement('div');
    wrap.className = 'pwa-install-container';

    const card = document.createElement('div');
    card.className = 'pwa-install-card';

    const text = document.createElement('p');
    text.className = 'pwa-install-text';
    text.textContent = '📱 Πρόσθεσε το Greekaway ως εφαρμογή';

    const btn = document.createElement('button');
    btn.className = 'pwa-install-button';
    btn.type = 'button';
    btn.textContent = 'Εγκατάσταση';

    const close = document.createElement('button');
    close.className = 'pwa-install-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Κλείσιμο');
    close.textContent = '×';

    card.appendChild(text);
    card.appendChild(btn);
    card.appendChild(close);
    wrap.appendChild(card);
    document.body.appendChild(wrap);

    close.addEventListener('click', hideBanner);
    btn.addEventListener('click', async () => {
      try {
        if (!deferredPrompt) { hideBanner(); return; }
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        // Regardless of outcome, hide banner
        hideBanner();
        deferredPrompt = null;
      } catch (_) {
        hideBanner();
      }
    });

    bannerEl = wrap;
    return wrap;
  }

  // Register service worker
  function registerSW(){
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js');
      }
    } catch(_) {}
  }

  // Events
  window.addEventListener('beforeinstallprompt', (e) => {
    // Only handle once and only if not installed
    if (deferredPrompt || alreadyInstalled()) return;
    e.preventDefault();
    deferredPrompt = e;
    // Show banner
    createBanner();
  });

  window.addEventListener('appinstalled', () => {
    hideBanner();
    deferredPrompt = null;
  });

  document.addEventListener('DOMContentLoaded', () => {
    registerSW();
    if (alreadyInstalled()) hideBanner();
  });
})();
