/**
 * MoveAthens Driver Panel — History Tab
 * Summary boxes (all/today/week/month) + completed trips list with filters.
 * Depends: driver-panel.js (DpApp)
 */
(() => {
  'use strict';

  const LS_KEY = 'moveathens_driver';
  const API = '/api/driver-panel';

  let labels = {};
  let activePeriod = 'all';

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

  const toDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  };

  function getDateRange(period) {
    const now = new Date();
    const today = toDateStr(now);
    switch (period) {
      case 'today':
        return { from: today, to: today };
      case 'week': {
        const d = new Date(now);
        d.setDate(d.getDate() - 6);
        return { from: toDateStr(d), to: today };
      }
      case 'month': {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        return { from: toDateStr(d), to: today };
      }
      case 'custom':
        return null;
      default:
        return { from: '', to: '' };
    }
  }

  // ── Summary Boxes ──

  function renderSummary(container) {
    const frame = document.createElement('div');
    frame.className = 'ma-dp-hist-summary-frame';
    frame.id = 'dpHistSummary';
    frame.innerHTML = `
      <div class="ma-dp-hist-summary-grid">
        <div class="ma-dp-hist-summary-box" data-key="all">
          <span class="ma-dp-hist-summary-title">Σύνολο</span>
          <span class="ma-dp-hist-summary-amount">—</span>
          <span class="ma-dp-hist-summary-date">—</span>
        </div>
        <div class="ma-dp-hist-summary-box" data-key="today">
          <span class="ma-dp-hist-summary-title">Σήμερα</span>
          <span class="ma-dp-hist-summary-amount">—</span>
          <span class="ma-dp-hist-summary-date">—</span>
        </div>
        <div class="ma-dp-hist-summary-box" data-key="week">
          <span class="ma-dp-hist-summary-title">Εβδομάδα</span>
          <span class="ma-dp-hist-summary-amount">—</span>
          <span class="ma-dp-hist-summary-date">—</span>
        </div>
        <div class="ma-dp-hist-summary-box" data-key="month">
          <span class="ma-dp-hist-summary-title">Μήνας</span>
          <span class="ma-dp-hist-summary-amount">—</span>
          <span class="ma-dp-hist-summary-date">—</span>
        </div>
      </div>`;
    container.appendChild(frame);
  }

  async function loadSummary() {
    const phone = getPhone();
    if (!phone) return;
    try {
      const res = await fetch(`${API}/history-summary?phone=${encodeURIComponent(phone)}`);
      if (!res.ok) return;
      const data = await res.json();
      const s = data.summary || {};
      ['all', 'today', 'week', 'month'].forEach(key => {
        const box = document.querySelector(`.ma-dp-hist-summary-box[data-key="${key}"]`);
        if (!box || !s[key]) return;
        box.querySelector('.ma-dp-hist-summary-amount').textContent =
          (s[key].total || 0).toFixed(0) + '€';
        box.querySelector('.ma-dp-hist-summary-date').textContent = s[key].label || '—';
      });
    } catch { /* silent */ }
  }

  // ── Period Filter Bar ──

  function renderFilters(container) {
    const periodBar = document.createElement('div');
    periodBar.className = 'ma-dp-hist-period-filter';
    periodBar.id = 'dpHistPeriodFilter';
    periodBar.innerHTML = `
      <button class="ma-dp-hist-period-btn ma-dp-hist-period-btn--active" data-period="all" type="button">Όλα</button>
      <button class="ma-dp-hist-period-btn" data-period="today" type="button">Σήμερα</button>
      <button class="ma-dp-hist-period-btn" data-period="week" type="button">Εβδομάδα</button>
      <button class="ma-dp-hist-period-btn" data-period="month" type="button">Μήνας</button>
      <button class="ma-dp-hist-period-btn" data-period="custom" type="button">Προσαρμοσμένο</button>`;
    container.appendChild(periodBar);

    const customDates = document.createElement('div');
    customDates.className = 'ma-dp-hist-custom-dates';
    customDates.id = 'dpHistCustomDates';
    customDates.style.display = 'none';
    customDates.innerHTML = `
      <div class="ma-dp-hist-date-group">
        <label class="ma-dp-hist-date-label" for="dpHistFrom">Από</label>
        <input type="date" class="ma-dp-hist-date-input" id="dpHistFrom" />
      </div>
      <div class="ma-dp-hist-date-group">
        <label class="ma-dp-hist-date-label" for="dpHistTo">Έως</label>
        <input type="date" class="ma-dp-hist-date-input" id="dpHistTo" />
      </div>
      <button class="ma-dp-hist-apply" id="dpHistApply" type="button">Εφαρμογή</button>`;
    container.appendChild(customDates);

    periodBar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-period]');
      if (!btn) return;
      const period = btn.dataset.period;
      activePeriod = period;
      periodBar.querySelectorAll('.ma-dp-hist-period-btn').forEach(b =>
        b.classList.toggle('ma-dp-hist-period-btn--active', b === btn)
      );
      if (period === 'custom') {
        customDates.style.display = '';
      } else {
        customDates.style.display = 'none';
        loadHistory();
      }
    });

    customDates.querySelector('#dpHistApply').addEventListener('click', loadHistory);
  }

  // ── Load history (rows list only — summary stays independent) ──

  async function loadHistory() {
    const phone = getPhone();
    if (!phone) return;

    const listEl = document.getElementById('dpHistList');
    if (!listEl) return;
    listEl.innerHTML = `<div class="ma-dp-empty">${esc(labels.msgLoading || 'Φόρτωση…')}</div>`;

    let from = '';
    let to = '';

    if (activePeriod === 'custom') {
      from = document.getElementById('dpHistFrom')?.value || '';
      to = document.getElementById('dpHistTo')?.value || '';
    } else {
      const range = getDateRange(activePeriod);
      if (range) { from = range.from; to = range.to; }
    }

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

    section.innerHTML = '';

    renderSummary(section);
    renderFilters(section);

    const list = document.createElement('div');
    list.id = 'dpHistList';
    list.className = 'ma-dp-hist-list';
    section.appendChild(list);

    await Promise.all([loadSummary(), loadHistory()]);
  }

  window.DpHistory = { init, reload: loadHistory };
})();
