/**
 * MoveAthens Driver Panel — Home Tab
 * Real-time SSE for urgent requests, accept/reject, quick stats.
 * Depends: driver-panel.js (DpApp)
 */
(() => {
  'use strict';

  const LS_KEY = 'moveathens_driver';
  const API = '/api/driver-panel';

  let sse = null;
  let config = {};
  let labels = {};
  let dismissedIds = new Set();
  let _bannerEl = null;
  let _bannerTimeout = null;
  let pollTimer = null;
  const POLL_INTERVAL = 5000; // 5 seconds, same as admin panel

  const getPhone = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY))?.phone || ''; }
    catch { return ''; }
  };
  const getDriver = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY)); }
    catch { return null; }
  };

  // ── New-request banner (when driver is on another tab) ──

  function showNewRequestBanner(card) {
    // Only show if driver is NOT on home tab
    if (!window.DpApp || window.DpApp.getActiveTab() === 'home') return;

    // Remove previous banner if any
    hideNewRequestBanner(true);

    const route = (card.origin || '…') + ' → ' + (card.destination || '…');
    const price = card.price ? (' | ' + card.price + '€') : '';

    const el = document.createElement('div');
    el.className = 'ma-dp-new-req-banner';
    el.innerHTML =
      '<span class="banner-icon">🚖</span>' +
      '<span class="banner-text">Νέα διαδρομή!<small>' + route + price + '</small></span>' +
      '<span class="banner-arrow">›</span>';

    el.addEventListener('click', () => {
      hideNewRequestBanner();
      if (window.DpApp) window.DpApp.switchTab('home');
    });

    document.body.appendChild(el);
    _bannerEl = el;

    // Auto-dismiss after 8 seconds
    _bannerTimeout = setTimeout(() => hideNewRequestBanner(), 8000);
  }

  function hideNewRequestBanner(instant) {
    if (_bannerTimeout) { clearTimeout(_bannerTimeout); _bannerTimeout = null; }
    if (!_bannerEl) return;
    if (instant) { _bannerEl.remove(); _bannerEl = null; return; }
    _bannerEl.classList.add('hiding');
    _bannerEl.addEventListener('animationend', () => {
      if (_bannerEl) { _bannerEl.remove(); _bannerEl = null; }
    }, { once: true });
  }

  // ── SSE Connection ──

  function connectSSE() {
    const phone = getPhone();
    if (!phone) return;
    if (sse) sse.close();

    sse = new EventSource(`${API}/sse?phone=${encodeURIComponent(phone)}`);

    sse.addEventListener('new-request', (e) => {
      try {
        const card = JSON.parse(e.data);
        if (!dismissedIds.has(card.requestId)) addUrgentCard(card);
        // Show route on map
        if (window.DpMap && (card.hotel_lat || card.destination_lat)) {
          window.DpMap.showRoute(card);
        }
        playAlert();
        showNewRequestBanner(card);
      } catch { /* ignore parse errors */ }
    });

    sse.addEventListener('request-taken', (e) => {
      try {
        const { requestId } = JSON.parse(e.data);
        removeCard(requestId, 'taken');
      } catch { /* */ }
    });

    sse.addEventListener('request-expired', (e) => {
      try {
        const { requestId } = JSON.parse(e.data);
        removeCard(requestId, 'expired');
      } catch { /* */ }
    });

    sse.addEventListener('request-dismissed', (e) => {
      try {
        const { requestId } = JSON.parse(e.data);
        removeCard(requestId, 'dismissed');
      } catch { /* */ }
    });

    sse.onerror = () => {
      sse.close();
      setTimeout(connectSSE, 5000);
    };
  }

  // ── Sound / Vibration ──

  function playAlert() {
    if (config.notifications?.soundEnabled !== false) {
      const driverSound = localStorage.getItem('ma_dp_alert_sound');
      const soundId = driverSound || config.sounds?.defaults?.new_ride || '';
      if (window.DpSounds) { window.DpSounds.playLoop(soundId); }
      navigator.vibrate([200, 100, 200]);
    }
  }

  function stopAlert() {
    if (window.DpSounds) window.DpSounds.stopLoop();
  }

  // ── Card Rendering ──

  function getContainer() {
    return document.getElementById('dpHomeCards');
  }

  function addUrgentCard(card) {
    const container = getContainer();
    if (!container) return;

    // prevent duplicates
    if (container.querySelector(`[data-request-id="${card.requestId}"]`)) return;

    const el = document.createElement('div');
    el.className = 'ma-dp-urgent-card';
    el.dataset.requestId = card.requestId;

    const fieldsHTML = (card.fields || []).map(f =>
      `<div class="ma-dp-card-field">
        <span class="ma-dp-card-label">${esc(f.label)}</span>
        <span class="ma-dp-card-value">${esc(String(f.value))}</span>
      </div>`
    ).join('');

    const direction = card.is_arrival ? 'Άφιξη' : 'Αναχώρηση';

    el.innerHTML = `
      <div class="ma-dp-card-header">
        <span class="ma-dp-card-badge">${direction}</span>
        <span class="ma-dp-card-timer" data-request-id="${card.requestId}"></span>
      </div>
      <div class="ma-dp-card-fields">${fieldsHTML}</div>
      <div class="ma-dp-card-actions">
        <button class="ma-dp-btn ma-dp-btn-reject" data-action="reject">${esc(labels.btnReject || 'Απόρριψη')}</button>
        <button class="ma-dp-btn ma-dp-btn-accept" data-action="accept">${esc(labels.btnAccept || 'Αποδοχή')}</button>
      </div>`;

    container.prepend(el);
    updateEmptyState();
  }

  function removeCard(requestId, reason) {
    const container = getContainer();
    if (!container) return;
    const card = container.querySelector(`[data-request-id="${requestId}"]`);
    if (card) {
      card.classList.add('ma-dp-card-exit');
      setTimeout(() => {
        card.remove();
        updateEmptyState();
        // Stop looping sound if no urgent cards remain
        const remaining = container.querySelectorAll('.ma-dp-urgent-card').length;
        if (remaining === 0) {
          stopAlert();
          // Clear route from map and recenter on driver
          if (window.DpMap) { window.DpMap.clearRoute(); window.DpMap.recenterOnDriver(); }
        }
      }, 300);
    }
    if (reason === 'dismissed') dismissedIds.add(requestId);
  }

  function updateEmptyState() {
    const container = getContainer();
    if (!container) return;
    let empty = container.querySelector('.ma-dp-empty');
    const hasCards = container.querySelectorAll('.ma-dp-urgent-card').length > 0;

    if (!hasCards && !empty) {
      const div = document.createElement('div');
      div.className = 'ma-dp-empty';
      div.textContent = labels.msgNoRoutes || 'Δεν υπάρχουν διαδρομές αυτή τη στιγμή';
      container.appendChild(div);
    } else if (hasCards && empty) {
      empty.remove();
    }
  }

  // ── Accept / Reject ──

  async function handleAction(requestId, action) {
    const phone = getPhone();
    if (!phone) return;
    stopAlert();

    try {
      const body = { phone };
      // Send driver location on accept for server-side ETA
      if (action === 'accept' && window.DpMap) {
        const pos = window.DpMap.getDriverLatLng();
        if (pos) { body.driverLat = pos.lat; body.driverLng = pos.lng; }
      }

      const res = await fetch(`${API}/${action}/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (action === 'accept') {
        if (data.ok) {
          removeCard(requestId, 'accepted');
          showToast('✅ Αποδοχή επιτυχής!');
          // Open fullscreen active route
          setTimeout(() => { window.location.href = '/moveathens/active-route?id=' + encodeURIComponent(requestId); }, 600);
        } else {
          showToast(data.error === 'Already taken' ? '⚠️ Ήδη δεσμευμένο' : '❌ Σφάλμα');
        }
      } else {
        removeCard(requestId, 'dismissed');
      }
    } catch {
      showToast('❌ Σφάλμα σύνδεσης');
    }
  }

  // ── Load pending on init + polling ──

  async function loadPending() {
    const phone = getPhone();
    if (!phone) return;

    try {
      const res = await fetch(`${API}/pending?phone=${encodeURIComponent(phone)}`);
      if (!res.ok) return;
      const data = await res.json();
      const container = getContainer();
      const currentIds = new Set();
      if (container) {
        container.querySelectorAll('.ma-dp-urgent-card').forEach(el => {
          currentIds.add(el.dataset.requestId);
        });
      }
      let hasNew = false;
      (data.requests || []).forEach(card => {
        if (!dismissedIds.has(card.requestId) && !currentIds.has(String(card.requestId))) {
          addUrgentCard(card);
          hasNew = true;
          // Show first route on map
          if (window.DpMap && (card.hotel_lat || card.destination_lat)) {
            window.DpMap.showRoute(card);
          }
        }
      });
      if (hasNew) playAlert();
      // Remove cards that are no longer pending on server
      const serverIds = new Set((data.requests || []).map(c => String(c.requestId)));
      if (container) {
        container.querySelectorAll('.ma-dp-urgent-card').forEach(el => {
          if (!serverIds.has(el.dataset.requestId) && !dismissedIds.has(el.dataset.requestId)) {
            removeCard(el.dataset.requestId, 'taken');
          }
        });
      }
    } catch { /* offline */ }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(loadPending, POLL_INTERVAL);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ── Toast ──

  function showToast(msg) {
    const existing = document.querySelector('.ma-dp-toast');
    if (existing) existing.remove();

    const t = document.createElement('div');
    t.className = 'ma-dp-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
  }

  // ── Event delegation ──

  function bindEvents() {
    const container = getContainer();
    if (!container) return;

    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const card = btn.closest('.ma-dp-urgent-card');
      if (!card) return;
      const requestId = card.dataset.requestId;
      const action = btn.dataset.action;
      if (action === 'accept' || action === 'reject') {
        btn.disabled = true;
        handleAction(requestId, action);
      }
    });
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // ── Init ──

  async function init(driver, cfg) {
    config = cfg || {};
    labels = config.labels || {};

    // Place fullscreen map container in body (behind everything)
    if (!document.getElementById('dpMapContainer')) {
      const mapWrap = document.createElement('div');
      mapWrap.className = 'ma-dp-map-wrap';
      mapWrap.innerHTML = '<div id="dpMapContainer"></div>';
      document.body.insertBefore(mapWrap, document.body.firstChild);

      // Recenter button (fixed, on top)
      const recenterBtn = document.createElement('button');
      recenterBtn.className = 'ma-dp-map-recenter';
      recenterBtn.id = 'dpMapRecenter';
      recenterBtn.setAttribute('aria-label', 'Κεντράρισμα');
      recenterBtn.innerHTML = '⊕';
      recenterBtn.addEventListener('click', () => {
        if (window.DpMap) window.DpMap.recenterOnDriver();
      });
      document.body.appendChild(recenterBtn);
    }

    // Cards container inside section
    const section = document.querySelector('[data-tab="home"]');
    if (section && !section.querySelector('#dpHomeCards')) {
      section.innerHTML = '<div id="dpHomeCards" class="ma-dp-home-cards"></div>';
    }

    // Init map
    if (window.DpMap) window.DpMap.init();

    bindEvents();
    await loadPending();
    connectSSE();
    startPolling();
  }

  function destroy() {
    if (sse) { sse.close(); sse = null; }
    stopPolling();
    stopAlert();
    dismissedIds.clear();
  }

  window.DpHome = { init, destroy };
})();
