/**
 * Greekaway — Update Banner
 * Polls /version.json periodically. When a new buildNumber is detected,
 * shows a non-intrusive banner prompting the user to refresh.
 * On "Ανανέωση": clears all Service Worker caches → unregisters SW → hard-reloads.
 * On "Αργότερα": hides for 30 minutes (sessionStorage), then re-appears.
 * Self-contained: injects its own CSS, no external stylesheet needed.
 */
(function () {
  'use strict';

  var CHECK_INTERVAL = 3 * 60 * 1000;   // poll every 3 minutes
  var SNOOZE_MS      = 30 * 60 * 1000;  // "Later" hides for 30 min
  var SNOOZE_KEY     = 'ga_update_snooze';
  var bannerId       = 'ga-update-banner';
  var initialBuild   = null;
  var bannerShown    = false;
  var cssInjected    = false;

  // ── Snooze helpers (sessionStorage) ──
  function isSnoozed() {
    try {
      var until = parseInt(sessionStorage.getItem(SNOOZE_KEY), 10);
      return until && Date.now() < until;
    } catch (_) { return false; }
  }
  function snooze() {
    try { sessionStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)); } catch (_) {}
  }

  // ── CSS (injected once, only when banner appears) ──
  function injectCSS() {
    if (cssInjected) return;
    cssInjected = true;
    var style = document.createElement('style');
    style.textContent =
      '#ga-update-banner{position:fixed;bottom:0;left:0;right:0;z-index:99999;padding:0 12px 12px;pointer-events:none;animation:ga-upd .35s ease-out}' +
      '@keyframes ga-upd{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}' +
      '.ga-update-banner__card{pointer-events:auto;display:flex;align-items:center;gap:10px;max-width:480px;margin:0 auto;padding:12px 16px;background:#1a1a2e;color:#f0f0f0;border-radius:14px;box-shadow:0 4px 24px rgba(0,0,0,.35);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.4}' +
      '.ga-update-banner__icon{font-size:24px;flex-shrink:0}' +
      '.ga-update-banner__text{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}' +
      '.ga-update-banner__text strong{font-weight:600;font-size:14px}' +
      '.ga-update-banner__text span{font-size:12px;opacity:.8}' +
      '.ga-update-banner__actions{display:flex;flex-direction:column;gap:6px;flex-shrink:0}' +
      '.ga-update-banner__btn{border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:opacity .15s}' +
      '.ga-update-banner__btn:active{opacity:.75}' +
      '.ga-update-banner__btn--refresh{background:#4fc3f7;color:#0a0a1a}' +
      '.ga-update-banner__btn--later{background:transparent;color:#999;padding:4px 14px;font-weight:400}';
    document.head.appendChild(style);
  }

  // ── Fetch latest buildNumber from server (cache-busted) ──
  function fetchBuild(cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/version.json?_t=' + Date.now(), true);
    xhr.timeout = 8000;
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          cb(data.buildNumber, data.version);
        } catch (_) { /* ignore parse errors */ }
      }
    };
    xhr.onerror = xhr.ontimeout = function () { /* silent */ };
    xhr.send();
  }

  // ── Hard refresh: clear all SW caches → unregister SW → reload ──
  function hardRefresh() {
    var tasks = [];

    // 1. Delete all Service Worker caches
    if ('caches' in window) {
      tasks.push(
        caches.keys().then(function (names) {
          return Promise.all(names.map(function (n) { return caches.delete(n); }));
        })
      );
    }

    // 2. Unregister all Service Workers
    if ('serviceWorker' in navigator) {
      tasks.push(
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        })
      );
    }

    // 3. After cleanup, hard-reload (bypass browser cache)
    Promise.all(tasks)
      .then(function () { window.location.reload(); })
      .catch(function () { window.location.reload(); });
  }

  // ── Show the update banner ──
  function showBanner(newVersion) {
    if (bannerShown) return;
    if (document.getElementById(bannerId)) return;
    bannerShown = true;
    injectCSS();

    var overlay = document.createElement('div');
    overlay.id = bannerId;
    overlay.setAttribute('role', 'alert');
    overlay.innerHTML =
      '<div class="ga-update-banner__card">' +
        '<span class="ga-update-banner__icon">🔄</span>' +
        '<div class="ga-update-banner__text">' +
          '<strong>Νέα έκδοση διαθέσιμη' + (newVersion ? ' (' + newVersion + ')' : '') + '</strong>' +
          '<span>Πατήστε «Ανανέωση» — γίνεται αυτόματα καθαρισμός cache.</span>' +
        '</div>' +
        '<div class="ga-update-banner__actions">' +
          '<button class="ga-update-banner__btn ga-update-banner__btn--refresh" data-ga-update-refresh>Ανανέωση</button>' +
          '<button class="ga-update-banner__btn ga-update-banner__btn--later" data-ga-update-later>Αργότερα</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // "Ανανέωση" → clear caches + SW + hard reload
    overlay.querySelector('[data-ga-update-refresh]').addEventListener('click', function () {
      this.textContent = '⏳';
      this.disabled = true;
      hardRefresh();
    });

    // "Αργότερα" → snooze for 30 min
    overlay.querySelector('[data-ga-update-later]').addEventListener('click', function () {
      overlay.remove();
      bannerShown = false;
      snooze();
    });
  }

  // ── Periodic check ──
  function check() {
    if (isSnoozed()) return;

    fetchBuild(function (remoteBuild, remoteVersion) {
      if (!remoteBuild) return;

      // First run: record the build the page was loaded with
      if (initialBuild === null) {
        initialBuild = remoteBuild;
        return;
      }

      // Newer build detected → show banner
      if (remoteBuild > initialBuild && !bannerShown) {
        showBanner(remoteVersion);
      }
    });
  }

  // ── Bootstrap ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(check, 5000);
    });
  } else {
    setTimeout(check, 5000);
  }
  setInterval(check, CHECK_INTERVAL);

  // Re-check when user returns to the tab
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !bannerShown) {
      setTimeout(check, 1000);
    }
  });
})();
