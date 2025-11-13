// Driver Panel PWA Install — uses the same service worker
(function(){
  let deferredPrompt = null;
  let bannerEl = null;

  function alreadyInstalled(){
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.navigator && window.navigator.standalone) return true; // iOS Safari
    } catch(_) {}
    return false;
  }

  function ensureManifestDriver(){
    try {
      let link = document.querySelector("link[rel='manifest']");
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'manifest');
        document.head.appendChild(link);
      }
      // Point manifest to Driver Panel manifest
      link.setAttribute('href', '/manifest-driver.json');
    } catch(_){ }
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
    text.textContent = '📱 Προσθήκη εφαρμογής Driver Panel';

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
        // Ensure manifest is set to driver manifest before prompt
        ensureManifestDriver();
        deferredPrompt.prompt();
        await deferredPrompt.userChoice; // { outcome, platform }
        hideBanner();
        deferredPrompt = null;
      } catch (_) {
        hideBanner();
      }
    });

    bannerEl = wrap;
    return wrap;
  }

  function registerSW(){
    try {
      if ('serviceWorker' in navigator) {
        // Use the same global service worker with root scope
        navigator.serviceWorker.register('/service-worker.js');
      }
    } catch(_) {}
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    // Only for driver pages; prevent generic handler from showing
    if (deferredPrompt || alreadyInstalled()) return;
    e.preventDefault();
    deferredPrompt = e;
    // Point manifest to Driver variant as soon as eligible
    ensureManifestDriver();
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
