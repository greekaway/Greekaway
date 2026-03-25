/**
 * PWA Install Prompt — iOS (all browsers) + Android
 *
 * iOS Safari:     Shows step-by-step instructions (Share → Add to Home Screen).
 * iOS non-Safari: Shows "open in Safari" message + copy-URL button.
 * Both dismiss for 7 days (localStorage).
 *
 * Android:        Uses native beforeinstallprompt event.
 *                 "Εγκατάσταση" triggers the native prompt.
 *                 Dismiss hides for 30 days (localStorage).
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
  function isIOSDevice() {
    // iPhone / iPad / iPod via UA
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return true;
    // iPadOS 13+ reports as Mac — detect via touch support
    if (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1) return true;
    return false;
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

  // ── Share icon SVG (reused in banners) ──
  var SHARE_SVG = '<svg style="width:18px;height:18px;display:inline-block;vertical-align:middle" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M12 3c.3 0 .5.1.7.3l3 3a1 1 0 1 1-1.4 1.4L13 6.4V14a1 1 0 1 1-2 0V6.4L9.7 7.7A1 1 0 0 1 8.3 6.3l3-3c.2-.2.4-.3.7-.3Z"/><path fill="#fff" d="M5 10a3 3 0 0 1 3-3h1a1 1 0 1 1 0 2H8a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1a1 1 0 1 1 0-2h1a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-7Z"/></svg>';

  // ── CSS (injected once) ──
  var cssInjected = false;
  function injectCSS() {
    if (cssInjected) return;
    cssInjected = true;
    var s = document.createElement('style');
    s.textContent =
      '#pwa-install-prompt{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);width:95%;max-width:520px;z-index:2147483640;pointer-events:none;animation:pwa-ip-slide .35s ease-out}' +
      '@keyframes pwa-ip-slide{from{transform:translateX(-50%) translateY(100%);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}' +
      '@media(max-width:768px){#pwa-install-prompt{bottom:12px;padding-bottom:env(safe-area-inset-bottom,8px)}}' +
      '.pwa-ip-card{pointer-events:auto;padding:16px 18px 12px;background:#001f3f;color:#fff;border-radius:14px;box-shadow:0 10px 28px rgba(0,0,0,.22),0 2px 10px rgba(0,0,0,.12);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.4;backdrop-filter:saturate(120%)}' +
      '.pwa-ip-title{font-weight:700;font-size:16px;margin:0 0 6px;letter-spacing:.2px}' +
      '.pwa-ip-subtitle{margin:0 0 10px;opacity:.95;font-size:14px;line-height:1.28}' +
      '.pwa-ip-steps{margin:8px 0 12px;padding-left:18px}' +
      '.pwa-ip-steps li{margin:6px 0;font-size:14px;line-height:1.28}' +
      '.pwa-ip-badge{display:inline-flex;align-items:center;gap:8px;margin-top:6px;opacity:.95;font-size:13px}' +
      '.pwa-ip-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.12);font-weight:600}' +
      '.pwa-ip-actions{display:flex;justify-content:flex-end;margin-top:10px;gap:10px}' +
      '.pwa-ip-btn{border:none;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:700;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,opacity .2s ease}' +
      '.pwa-ip-btn:active{transform:translateY(0);opacity:.75}' +
      '.pwa-ip-btn--primary{background:var(--color-gold,#d4af37);color:#001f3f;box-shadow:0 6px 14px rgba(0,0,0,.18)}' +
      '.pwa-ip-btn--primary:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(0,0,0,.22)}' +
      '.pwa-ip-btn--secondary{background:transparent;color:#999;font-weight:400;padding:8px 14px}' +
      '.pwa-ip-copied{font-size:12px;color:#4fc3f7;margin-top:6px;text-align:center;display:none}';
    document.head.appendChild(s);
  }

  // ── Remove banner ──
  function removeBanner() {
    var el = document.getElementById(bannerId);
    if (el) el.remove();
  }

  // ── iOS Safari Banner ──
  function showIOSSafariBanner() {
    if (document.getElementById(bannerId)) return;
    injectCSS();

    var el = document.createElement('div');
    el.id = bannerId;
    el.setAttribute('role', 'dialog');
    el.innerHTML =
      '<div class="pwa-ip-card">' +
        '<div class="pwa-ip-title">📱 Προσθέστε στην Αρχική Οθόνη</div>' +
        '<p class="pwa-ip-subtitle">Για να το έχετε σαν κανονική εφαρμογή:</p>' +
        '<ol class="pwa-ip-steps">' +
          '<li>Πατήστε το ' + SHARE_SVG + ' <strong>κουμπί Κοινοποίησης</strong> (πάνω δεξιά στο Safari)</li>' +
          '<li>Σύρετε προς τα πάνω και πατήστε <strong>«Προβολή περισσότερων»</strong></li>' +
          '<li>Πατήστε <strong>«Προσθήκη στην οθόνη Αφετηρίας»</strong></li>' +
        '</ol>' +
        '<div class="pwa-ip-badge">' +
          '<span class="pwa-ip-chip">' + SHARE_SVG + ' Share → ⬆ More → Add to Home Screen</span>' +
        '</div>' +
        '<div class="pwa-ip-actions">' +
          '<button class="pwa-ip-btn pwa-ip-btn--primary" data-pwa-ok>✔ Κατάλαβα</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(el);

    el.querySelector('[data-pwa-ok]').addEventListener('click', function() {
      dismiss(IOS_DISMISS_KEY, IOS_DISMISS_DAYS);
      removeBanner();
    });
  }

  // ── iOS non-Safari Banner (Chrome, Firefox, Edge κλπ) ──
  function showIOSOtherBrowserBanner() {
    if (document.getElementById(bannerId)) return;
    injectCSS();

    var el = document.createElement('div');
    el.id = bannerId;
    el.setAttribute('role', 'dialog');
    el.innerHTML =
      '<div class="pwa-ip-card">' +
        '<div class="pwa-ip-title">📱 Εγκαταστήστε την εφαρμογή</div>' +
        '<p class="pwa-ip-subtitle">' +
          'Η εγκατάσταση γίνεται μόνο μέσω <strong>Safari</strong>. ' +
          'Ανοίξτε αυτή τη σελίδα στο Safari:' +
        '</p>' +
        '<ol class="pwa-ip-steps">' +
          '<li>Αντιγράψτε τον σύνδεσμο (κουμπί παρακάτω)</li>' +
          '<li>Ανοίξτε το <strong>Safari</strong> και επικολλήστε</li>' +
          '<li>Ακολουθήστε τις οδηγίες εγκατάστασης</li>' +
        '</ol>' +
        '<div class="pwa-ip-actions">' +
          '<button class="pwa-ip-btn pwa-ip-btn--secondary" data-pwa-later>Όχι τώρα</button>' +
          '<button class="pwa-ip-btn pwa-ip-btn--primary" data-pwa-copy>📋 Αντιγραφή συνδέσμου</button>' +
        '</div>' +
        '<div class="pwa-ip-copied" data-pwa-copied>✓ Αντιγράφηκε! Ανοίξτε το Safari και επικολλήστε.</div>' +
      '</div>';

    document.body.appendChild(el);

    el.querySelector('[data-pwa-later]').addEventListener('click', function() {
      dismiss(IOS_DISMISS_KEY, IOS_DISMISS_DAYS);
      removeBanner();
    });
    el.querySelector('[data-pwa-copy]').addEventListener('click', function() {
      var url = window.location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function() {
          var msg = el.querySelector('[data-pwa-copied]');
          if (msg) msg.style.display = 'block';
          setTimeout(function() { dismiss(IOS_DISMISS_KEY, IOS_DISMISS_DAYS); removeBanner(); }, 3000);
        }).catch(function() {
          dismiss(IOS_DISMISS_KEY, IOS_DISMISS_DAYS);
          removeBanner();
        });
      } else {
        var ta = document.createElement('textarea');
        ta.value = url;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        var msg = el.querySelector('[data-pwa-copied]');
        if (msg) msg.style.display = 'block';
        setTimeout(function() { dismiss(IOS_DISMISS_KEY, IOS_DISMISS_DAYS); removeBanner(); }, 3000);
      }
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
        '<p class="pwa-ip-subtitle">Προσθέστε στην αρχική οθόνη για γρήγορη πρόσβαση.</p>' +
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

    if (isIOSDevice()) {
      if (isDismissed(IOS_DISMISS_KEY)) return;
      if (isSafari()) {
        showIOSSafariBanner();       // Safari → οδηγίες Share → Add to Home Screen
      } else {
        showIOSOtherBrowserBanner(); // Chrome/Firefox/Edge → "ανοίξτε στο Safari" + copy URL
      }
    }
    // Android handled by beforeinstallprompt event above
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
