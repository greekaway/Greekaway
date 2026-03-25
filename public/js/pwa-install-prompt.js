/**
 * PWA Install Prompt — iOS + Android
 *
 * iOS Safari:  Shows step-by-step instructions (Share → Add to Home Screen).
 *              "Όχι τώρα" dismisses for 7 days (localStorage).
 *              Not shown if already in standalone mode or Chrome iOS.
 *
 * Android:     Uses native beforeinstallprompt event.
 *              "Εγκατάσταση" triggers the native prompt.
 *              Dismiss hides for 30 days (localStorage).
 *
 * Self-contained: injects its own CSS.
 */
(function() {
  'use strict';

  var IOS_DISMISS_KEY     = 'pwa_ios_dismiss_until';
  var ANDROID_DISMISS_KEY = 'pwa_android_dismiss_until';
  var IOS_DISMISS_DAYS    = 7;
  var ANDROID_DISMISS_DAYS = 30;

  var deferredPrompt = null;
  var bannerId = 'pwa-install-prompt';

  // ── Detection ──
  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }
  function isSafari() {
    return /safari/i.test(navigator.userAgent) && !/chrome|crios|fxios|edgios|opera/i.test(navigator.userAgent);
  }
  function isStandalone() {
    if (window.navigator.standalone === true) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    return false;
  }
  function isDismissed(key) {
    try {
      var until = parseInt(localStorage.getItem(key), 10);
      return until && Date.now() < until;
    } catch(_) { return false; }
  }
  function dismiss(key, days) {
    try {
      localStorage.setItem(key, String(Date.now() + days * 24 * 60 * 60 * 1000));
    } catch(_) {}
  }

  // ── CSS (injected once) ──
  var cssInjected = false;
  function injectCSS() {
    if (cssInjected) return;
    cssInjected = true;
    var s = document.createElement('style');
    s.textContent =
      '#pwa-install-prompt{position:fixed;bottom:0;left:0;right:0;z-index:2147483640;padding:0 12px 12px;pointer-events:none;animation:pwa-ip-slide .35s ease-out}' +
      '@keyframes pwa-ip-slide{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}' +
      '@media(max-width:768px){#pwa-install-prompt{bottom:64px;padding-bottom:env(safe-area-inset-bottom,8px)}}' +
      '.pwa-ip-card{pointer-events:auto;max-width:420px;margin:0 auto;padding:16px 18px;background:#1a1a2e;color:#f0f0f0;border-radius:16px;box-shadow:0 6px 28px rgba(0,0,0,.4);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.5}' +
      '.pwa-ip-title{font-weight:700;font-size:16px;margin:0 0 8px}' +
      '.pwa-ip-steps{margin:8px 0 14px;padding-left:20px}' +
      '.pwa-ip-steps li{margin:5px 0;font-size:13px;line-height:1.4}' +
      '.pwa-ip-actions{display:flex;gap:10px;justify-content:flex-end}' +
      '.pwa-ip-btn{border:none;border-radius:10px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s}' +
      '.pwa-ip-btn:active{opacity:.7}' +
      '.pwa-ip-btn--primary{background:#4fc3f7;color:#0a0a1a}' +
      '.pwa-ip-btn--secondary{background:transparent;color:#999;font-weight:400}';
    document.head.appendChild(s);
  }

  // ── Remove banner ──
  function removeBanner() {
    var el = document.getElementById(bannerId);
    if (el) el.remove();
  }

  // ── iOS Banner ──
  function showIOSBanner() {
    if (isStandalone()) return;
    if (isDismissed(IOS_DISMISS_KEY)) return;
    if (document.getElementById(bannerId)) return;

    injectCSS();

    var el = document.createElement('div');
    el.id = bannerId;
    el.setAttribute('role', 'dialog');
    el.innerHTML =
      '<div class="pwa-ip-card">' +
        '<div class="pwa-ip-title">📱 Εγκαταστήστε την εφαρμογή</div>' +
        '<ol class="pwa-ip-steps">' +
          '<li>Πατήστε το κουμπί <strong>⎙ Κοινοποίηση</strong> (κάτω μπάρα Safari)</li>' +
          '<li>Πατήστε <strong>«Προσθήκη στην οθόνη Αφετηρίας»</strong></li>' +
          '<li>Πατήστε <strong>«Προσθήκη»</strong></li>' +
        '</ol>' +
        '<div class="pwa-ip-actions">' +
          '<button class="pwa-ip-btn pwa-ip-btn--secondary" data-pwa-later>Όχι τώρα</button>' +
          '<button class="pwa-ip-btn pwa-ip-btn--primary" data-pwa-ok>Κατάλαβα</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(el);

    el.querySelector('[data-pwa-later]').addEventListener('click', function() {
      dismiss(IOS_DISMISS_KEY, IOS_DISMISS_DAYS);
      removeBanner();
    });
    el.querySelector('[data-pwa-ok]').addEventListener('click', function() {
      dismiss(IOS_DISMISS_KEY, IOS_DISMISS_DAYS);
      removeBanner();
    });
  }

  // ── Android Banner ──
  function showAndroidBanner() {
    if (isStandalone()) return;
    if (isDismissed(ANDROID_DISMISS_KEY)) return;
    if (!deferredPrompt) return;
    if (document.getElementById(bannerId)) return;

    injectCSS();

    var el = document.createElement('div');
    el.id = bannerId;
    el.setAttribute('role', 'dialog');
    el.innerHTML =
      '<div class="pwa-ip-card">' +
        '<div class="pwa-ip-title">📱 Εγκαταστήστε την εφαρμογή</div>' +
        '<p style="margin:0 0 12px;font-size:13px;opacity:.9">Προσθέστε στην αρχική οθόνη για γρήγορη πρόσβαση.</p>' +
        '<div class="pwa-ip-actions">' +
          '<button class="pwa-ip-btn pwa-ip-btn--secondary" data-pwa-later>Όχι τώρα</button>' +
          '<button class="pwa-ip-btn pwa-ip-btn--primary" data-pwa-install>Εγκατάσταση</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(el);

    el.querySelector('[data-pwa-later]').addEventListener('click', function() {
      dismiss(ANDROID_DISMISS_KEY, ANDROID_DISMISS_DAYS);
      removeBanner();
      deferredPrompt = null;
    });
    el.querySelector('[data-pwa-install]').addEventListener('click', function() {
      if (!deferredPrompt) { removeBanner(); return; }
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function(result) {
        if (result.outcome === 'dismissed') {
          dismiss(ANDROID_DISMISS_KEY, ANDROID_DISMISS_DAYS);
        }
        removeBanner();
        deferredPrompt = null;
      });
    });
  }

  // ── Events ──
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    showAndroidBanner();
  });

  window.addEventListener('appinstalled', function() {
    removeBanner();
    deferredPrompt = null;
  });

  // ── Init ──
  function init() {
    if (isStandalone()) return;

    if (isIOS() && isSafari()) {
      showIOSBanner();
    }
    // Android handled by beforeinstallprompt event above
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
