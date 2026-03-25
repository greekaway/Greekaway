/**
 * MoveAthens Driver Panel — Push Notifications Client + PWA Boot
 * SW registration, push subscription, shared update banner.
 * Update banner uses the same /js/update-banner.js as all other projects.
 * Depends: driver-panel.js (DpApp)
 */
(() => {
  'use strict';

  const LS_KEY = 'moveathens_driver';
  const API = '/api/driver-panel';
  const SW_PATH = '/moveathens/js/driver-panel-sw.js';
  const dpHost = (window.location.hostname || '').toLowerCase();
  const onOwnDomain = (dpHost === 'moveathens.com' || dpHost === 'www.moveathens.com');
  const SW_SCOPE = onOwnDomain ? '/' : '/moveathens/';

  let swRegistration = null;

  const getPhone = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY))?.phone || ''; }
    catch { return ''; }
  };

  // ── Load shared update-banner.js (same mechanism as all other projects) ──

  function loadUpdateBanner() {
    if (document.querySelector('script[src*="update-banner"]')) return;
    const s = document.createElement('script');
    s.src = '/js/update-banner.js';
    s.defer = true;
    document.head.appendChild(s);
  }

  // ── Service Worker Registration ──

  async function registerSW() {
    if (!('serviceWorker' in navigator)) return;

    try {
      swRegistration = await navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE });
      console.log('[dp-push] SW registered');

      // If there's already a waiting worker, load update banner
      if (swRegistration.waiting) loadUpdateBanner();

      swRegistration.addEventListener('updatefound', () => {
        const newWorker = swRegistration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') loadUpdateBanner();
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
      const keyRes = await fetch(`${API}/push/vapid-key`);
      if (!keyRes.ok) return;
      const { publicKey } = await keyRes.json();
      if (!publicKey) return;

      const subscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

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

    // Load shared update banner (always, like all other projects)
    loadUpdateBanner();
  }

  // Auto-init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.DpPush = { init, subscribePush };
})();
