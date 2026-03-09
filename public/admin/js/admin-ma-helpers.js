/**
 * MoveAthens Admin — Shared helpers, state & API
 * Exposes window.MaAdmin for all per-section modules.
 */
(() => {
  'use strict';

  // ── DOM helpers ──
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const toast = $('#ma-toast');

  const showToast = (msg) => {
    if (!toast) return;
    toast.textContent = msg || '';
    toast.setAttribute('data-open', 'true');
    setTimeout(() => toast.removeAttribute('data-open'), 2200);
  };

  // ── Confirm modal ──
  const confirmModal = {
    root: $('#maConfirmModal'),
    title: $('#maConfirmTitle'),
    message: $('#maConfirmMessage'),
    okBtn: $('#maConfirmOk'),
    cancelBtn: $('#maConfirmCancel')
  };

  const openConfirm = (message, opts = {}) => new Promise((resolve) => {
    if (!confirmModal.root) { resolve(confirm(message)); return; }
    if (confirmModal.title) confirmModal.title.textContent = opts.title || 'Επιβεβαίωση';
    if (confirmModal.message) confirmModal.message.textContent = message || '';
    confirmModal.okBtn.textContent = opts.okLabel || 'OK';
    confirmModal.root.setAttribute('data-open', 'true');
    confirmModal.root.setAttribute('aria-hidden', 'false');

    const close = (result) => {
      confirmModal.root.removeAttribute('data-open');
      confirmModal.root.setAttribute('aria-hidden', 'true');
      confirmModal.okBtn.removeEventListener('click', onOk);
      confirmModal.cancelBtn.removeEventListener('click', onCancel);
      confirmModal.root.removeEventListener('click', onBackdrop);
      resolve(result);
    };
    const onOk = () => close(true);
    const onCancel = () => close(false);
    const onBackdrop = (e) => { if (e.target?.matches('[data-action="close"]')) close(false); };
    confirmModal.okBtn.addEventListener('click', onOk);
    confirmModal.cancelBtn.addEventListener('click', onCancel);
    confirmModal.root.addEventListener('click', onBackdrop);
  });

  const setStatus = (el, msg, kind) => {
    if (!el) return;
    el.textContent = msg || '';
    el.setAttribute('data-kind', kind || '');
  };

  const authRedirect = () => {
    const next = encodeURIComponent('/admin/moveathens-ui');
    window.location.href = `/admin-home.html?next=${next}`;
  };

  // ── Shared state ──
  const state = {
    CONFIG: {},
    configLoaded: false,
    editingCategoryId: null,
    editingDestinationId: null,
    editingVehicleId: null,
    editingZoneId: null
  };

  // ── API helpers ──
  const api = async (url, method = 'GET', body = null) => {
    const opts = { method, credentials: 'include' };
    if (body) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (res.status === 401 || res.status === 403) { authRedirect(); return null; }
    return res;
  };

  const loadConfig = async () => {
    try {
      const res = await api('/api/admin/moveathens/ui-config');
      if (!res) { console.error('[admin-ma] loadConfig: no response (auth redirect?)'); return; }
      if (!res.ok) { console.error('[admin-ma] loadConfig: status', res.status); showToast('Σφάλμα φόρτωσης config (HTTP ' + res.status + ')'); return; }
      state.CONFIG = await res.json();
      state.configLoaded = true;
      console.log('[admin-ma] Config loaded OK — zones:', (state.CONFIG.transferZones||[]).length,
        'vehicles:', (state.CONFIG.vehicleTypes||[]).length,
        'prices:', (state.CONFIG.transferPrices||[]).length);
      return state.CONFIG;
    } catch (err) {
      console.error('[admin-ma] loadConfig CRASHED:', err);
      showToast('⚠️ Σφάλμα φόρτωσης config: ' + (err.message || err));
    }
  };

  const ensureConfigLoaded = () => {
    if (!state.configLoaded) {
      showToast('⚠️ Config δεν φορτώθηκε — δεν επιτρέπεται αποθήκευση. Ξαναφόρτωσε τη σελίδα.');
      console.error('[admin-ma] Save blocked: configLoaded =', state.configLoaded);
      return false;
    }
    return true;
  };

  // ── Expose globally ──
  window.MaAdmin = {
    $, $$, showToast, openConfirm, setStatus, authRedirect,
    state, api, loadConfig, ensureConfigLoaded
  };
})();
