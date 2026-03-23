/**
 * MoveAthens Driver Panel — Push Notifications Client
 * SW registration, push subscription, update banner.
 * Depends: driver-panel.js (DpApp)
 */
(() => {
  'use strict';

  const LS_KEY = 'moveathens_driver';
  const API = '/api/driver-panel';
  const SW_PATH = '/moveathens/js/driver-panel-sw.js';
  const SW_SCOPE = '/moveathens/';
  const VERSION_POLL_MS = 60000;

  let swRegistration = null;
  let currentVersion = null;

  const getPhone = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY))?.phone || ''; }
    catch { return ''; }
  };

  // ── Service Worker Registration ──

  async function registerSW() {
    if (!('serviceWorker' in navigator)) return;

    try {
      swRegistration = await navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE });
      console.log('[dp-push] SW registered');

      swRegistration.addEventListener('updatefound', () => {
        const newWorker = swRegistration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') showUpdateBanner();
        });
      });
    } catch (err) {
      console.error('[dp-push] SW registration failed:', err);
    }
  }

  // ── Push Subscription ──

  async function subscribePush() {
    if (!swRegistration || !('PushManager' in window)) return;

    const phone = getPhone();
    if (!phone) return;

    try {
      // Get VAPID public key from server
      const keyRes = await fetch(`${API}/push/vapid-key`);
      if (!keyRes.ok) return;
      const { publicKey } = await keyRes.json();
      if (!publicKey) return;

      const subscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      // Send subscription to server
      await fetch(`${API}/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, subscription: subscription.toJSON() })
      });

      console.log('[dp-push] Push subscribed');
    } catch (err) {
      console.warn('[dp-push] Push subscription failed:', err.message);
    }
  }

  // ── Update Banner ──

  async function checkForUpdate() {
    try {
      const res = await fetch('/version.json', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();

      if (!currentVersion) {
        currentVersion = data.version;
        return;
      }

      if (data.version !== currentVersion) {
        showUpdateBanner();
      }
    } catch { /* offline */ }
  }

  function showUpdateBanner() {
    if (document.getElementById('dpUpdateBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'dpUpdateBanner';
    banner.className = 'ma-dp-update-banner';
    banner.innerHTML = `
      <span>Νέα ενημέρωση διαθέσιμη</span>
      <button id="dpUpdateBtn">Ανανέωση</button>`;
    document.body.appendChild(banner);

    setTimeout(() => banner.classList.add('show'), 10);

    document.getElementById('dpUpdateBtn').addEventListener('click', async () => {
      try {
        // 1. Clear all caches
        if ('caches' in window) {
          const names = await caches.keys();
          await Promise.all(names.map(n => caches.delete(n)));
        }
        // 2. Tell waiting SW to activate
        if (swRegistration?.waiting) {
          swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        // 3. Force SW update check
        if (swRegistration) {
          await swRegistration.update().catch(() => {});
        }
      } catch { /* continue reload */ }
      // 4. Hard reload
      window.location.reload();
    });
  }

  // ── Utility ──

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  // ── Init ──

  async function init() {
    await registerSW();

    // Subscribe push after short delay (avoid blocking UI)
    setTimeout(subscribePush, 2000);

    // Poll for version updates
    checkForUpdate();
    setInterval(checkForUpdate, VERSION_POLL_MS);
  }

  // Auto-init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.DpPush = { init, subscribePush };
})();
