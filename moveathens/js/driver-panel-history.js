/**
 * MoveAthens Driver Panel — History Tab
 * Completed trips list with date-range filter.
 * Depends: driver-panel.js (DpApp)
 */
(() => {
  'use strict';

  const LS_KEY = 'moveathens_driver';
  const API = '/api/driver-panel';

  let labels = {};

  const getPhone = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY))?.phone || ''; }
    catch { return ''; }
  };

  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // ── Filters ──

  function renderFilters(container) {
    const bar = document.createElement('div');
    bar.className = 'ma-dp-hist-filters';
    bar.innerHTML = `
      <label class="ma-dp-hist-label">Από
        <input type="date" id="dpHistFrom" class="ma-dp-hist-date" />
      </label>
      <label class="ma-dp-hist-label">Έως
        <input type="date" id="dpHistTo" class="ma-dp-hist-date" />
      </label>
      <button class="ma-dp-btn ma-dp-btn-filter" id="dpHistSearch">Αναζήτηση</button>`;
    bar.querySelector('#dpHistSearch').addEventListener('click', loadHistory);
    container.appendChild(bar);
  }

  // ── Load history ──

  async function loadHistory() {
    const phone = getPhone();
    if (!phone) return;

    const listEl = document.getElementById('dpHistList');
    if (!listEl) return;
    listEl.innerHTML = `<div class="ma-dp-empty">${esc(labels.msgLoading || 'Φόρτωση…')}</div>`;

    const from = document.getElementById('dpHistFrom')?.value || '';
    const to = document.getElementById('dpHistTo')?.value || '';

    let url = `${API}/history?phone=${encodeURIComponent(phone)}`;
    if (from) url += `&from=${from}`;
    if (to) url += `&to=${to}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('fail');
      const data = await res.json();
      const items = data.history || [];

      if (items.length === 0) {
        listEl.innerHTML = '<div class="ma-dp-empty">Δεν υπάρχει ιστορικό</div>';
        return;
      }

      listEl.innerHTML = items.map(item => {
        const dir = item.is_arrival ? '✈️' : '🚗';
        return `
          <div class="ma-dp-hist-row">
            <div class="ma-dp-hist-date-col">${formatDate(item.date)}</div>
            <div class="ma-dp-hist-route">
              <span>${dir}</span>
              <span>${esc(item.origin)}</span>
              <span class="ma-dp-hist-arrow">→</span>
              <span>${esc(item.destination)}</span>
            </div>
            <div class="ma-dp-hist-price">${(parseFloat(item.price) || 0).toFixed(0)}€</div>
          </div>`;
      }).join('');
    } catch {
      listEl.innerHTML = '<div class="ma-dp-empty">Σφάλμα φόρτωσης</div>';
    }
  }

  // ── Init ──

  async function init(driver, cfg) {
    labels = (cfg || {}).labels || {};

    const section = document.querySelector('[data-tab="history"]');
    if (!section) return;

    section.innerHTML = `
      <h2 class="ma-dp-tab-title">${esc(labels.sectionHistory || 'Ιστορικό')}</h2>
      <div id="dpHistList" class="ma-dp-hist-list"></div>`;

    renderFilters(section);
    await loadHistory();
  }

  window.DpHistory = { init, reload: loadHistory };
})();
