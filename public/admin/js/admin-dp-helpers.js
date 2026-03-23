/**
 * Driver Panel Admin — Shared helpers, state & API
 * Exposes window.DpAdmin for all per-tab modules.
 */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const toast = $('#dp-toast');

  const showToast = (msg) => {
    if (!toast) return;
    toast.textContent = msg || '';
    toast.setAttribute('data-open', 'true');
    setTimeout(() => toast.removeAttribute('data-open'), 2200);
  };

  const setStatus = (el, msg, kind) => {
    if (!el) return;
    el.textContent = msg || '';
    el.setAttribute('data-kind', kind || '');
  };

  const api = async (url, method = 'GET', body = null) => {
    const opts = { method, credentials: 'include' };
    if (body) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/admin-home.html?next=' + encodeURIComponent('/admin/driver-panel');
      return null;
    }
    return res;
  };

  const openConfirm = (message, opts = {}) => new Promise((resolve) => {
    const root = $('#dpConfirmModal');
    if (!root) { resolve(confirm(message)); return; }
    const title = $('#dpConfirmTitle');
    const msg = $('#dpConfirmMessage');
    const okBtn = $('#dpConfirmOk');
    const cancelBtn = $('#dpConfirmCancel');
    if (title) title.textContent = opts.title || 'Επιβεβαίωση';
    if (msg) msg.textContent = message || '';
    okBtn.textContent = opts.okLabel || 'OK';
    root.setAttribute('data-open', 'true');
    root.setAttribute('aria-hidden', 'false');
    const close = (r) => {
      root.removeAttribute('data-open');
      root.setAttribute('aria-hidden', 'true');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      root.removeEventListener('click', onBg);
      resolve(r);
    };
    const onOk = () => close(true);
    const onCancel = () => close(false);
    const onBg = (e) => { if (e.target?.matches('[data-action="close"]')) close(false); };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    root.addEventListener('click', onBg);
  });

  // Shared state
  const state = {
    config: {},
    vehicleTypes: [],
    drivers: [],
    configLoaded: false
  };

  const loadConfig = async () => {
    try {
      const res = await api('/api/admin/driver-panel/config');
      if (res?.ok) {
        state.config = await res.json();
        state.configLoaded = true;
      }
    } catch (err) {
      console.error('[dp] Config load failed:', err);
    }
    return state.config;
  };

  const saveConfig = async () => {
    const res = await api('/api/admin/driver-panel/config', 'POST', state.config);
    return res?.ok || false;
  };

  window.DpAdmin = {
    $, $$, showToast, setStatus, api, openConfirm,
    state, loadConfig, saveConfig
  };
})();
