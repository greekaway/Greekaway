/**
 * MoveAthens Driver Panel — Appointments Tab
 * Scheduled requests: [Όλα] [Αποδεκτά] pill buttons, sort chips, period filters, accept, detail expand.
 * Depends: driver-panel.js (DpApp)
 */
(() => {
  'use strict';

  const LS_KEY = 'moveathens_driver';
  const API = '/api/driver-panel';

  let config = {};
  let labels = {};
  let activeSubTab = 'all';
  let activeSort = '';       // '' | 'time' | 'price'
  let activePeriod = 'all';  // 'all' | 'today' | 'tomorrow' | 'week' | 'month'

  const getPhone = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY))?.phone || ''; }
    catch { return ''; }
  };

  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

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
      case 'tomorrow': {
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        const tm = toDateStr(d);
        return { from: tm, to: tm };
      }
      case 'week': {
        const d = new Date(now);
        d.setDate(d.getDate() + 6);
        return { from: today, to: toDateStr(d) };
      }
      case 'month': {
        const d = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { from: today, to: toDateStr(d) };
      }
      default:
        return null;
    }
  }

  // ── Sub-tabs (pill buttons) ──

  function renderSubTabs(container) {
    const bar = document.createElement('div');
    bar.className = 'ma-dp-sched-tabs';
    bar.id = 'dpSchedTabs';
    bar.innerHTML = `
      <button class="ma-dp-sched-pill ma-dp-sched-pill--active" data-sub="all" type="button">Όλα</button>
      <button class="ma-dp-sched-pill" data-sub="accepted" type="button">${esc(labels.btnAccept || 'Αποδεκτά')}</button>`;
    bar.addEventListener('click', e => {
      const btn = e.target.closest('[data-sub]');
      if (!btn) return;
      activeSubTab = btn.dataset.sub;
      bar.querySelectorAll('.ma-dp-sched-pill').forEach(b =>
        b.classList.toggle('ma-dp-sched-pill--active', b.dataset.sub === activeSubTab));
      loadRequests();
    });
    container.appendChild(bar);
  }

  // ── Sort / Filter chips ──

  function renderSortChips(container) {
    const wrap = document.createElement('div');
    wrap.className = 'ma-dp-sched-sort-chips';
    wrap.id = 'dpSchedSortChips';
    wrap.innerHTML = `
      <span class="ma-dp-sched-sort-icon">☰</span>
      <button class="ma-dp-sched-chip" data-chip="time" type="button">🕐 Ώρα</button>
      <button class="ma-dp-sched-chip" data-chip="price" type="button">💰 Αξία</button>`;
    wrap.addEventListener('click', e => {
      const btn = e.target.closest('[data-chip]');
      if (!btn) return;
      const chip = btn.dataset.chip;
      activeSort = activeSort === chip ? '' : chip;

      wrap.querySelectorAll('.ma-dp-sched-chip').forEach(b => {
        b.classList.toggle('ma-dp-sched-chip--active', activeSort === b.dataset.chip);
      });
      loadRequests();
    });
    container.appendChild(wrap);
  }

  // ── Period filter bar (carousel) ──

  function renderPeriodFilter(container) {
    const bar = document.createElement('div');
    bar.className = 'ma-dp-sched-period-filter';
    bar.id = 'dpSchedPeriodFilter';
    bar.innerHTML = `
      <button class="ma-dp-sched-period-btn ma-dp-sched-period-btn--active" data-period="all" type="button">Όλα</button>
      <button class="ma-dp-sched-period-btn" data-period="today" type="button">Σήμερα</button>
      <button class="ma-dp-sched-period-btn" data-period="tomorrow" type="button">Αύριο</button>
      <button class="ma-dp-sched-period-btn" data-period="week" type="button">Εβδομάδα</button>
      <button class="ma-dp-sched-period-btn" data-period="month" type="button">Μήνας</button>`;
    bar.addEventListener('click', e => {
      const btn = e.target.closest('[data-period]');
      if (!btn) return;
      activePeriod = btn.dataset.period;
      bar.querySelectorAll('.ma-dp-sched-period-btn').forEach(b =>
        b.classList.toggle('ma-dp-sched-period-btn--active', b === btn));
      loadRequests();
    });
    container.appendChild(bar);
  }

  // ── Load requests ──

  async function loadRequests() {
    const phone = getPhone();
    if (!phone) return;

    const listEl = document.getElementById('dpSchedList');
    if (!listEl) return;
    listEl.innerHTML = `<div class="ma-dp-empty">${esc(labels.msgLoading || 'Φόρτωση…')}</div>`;

    try {
      const url = `${API}/scheduled?phone=${encodeURIComponent(phone)}&tab=${activeSubTab}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();

      let items = data.requests || [];

      // ── Period filter (client-side date range) ──
      if (activePeriod !== 'all') {
        const range = getDateRange(activePeriod);
        if (range) {
          items = items.filter(c => {
            const dtf = c.fields?.find(f => f.id === 'datetime');
            if (!dtf) return false;
            const dateStr = dtf.value.slice(0, 10);
            return dateStr >= range.from && dateStr <= range.to;
          });
        }
      }

      // ── Sorting ──
      if (activeSort === 'time') {
        items.sort((a, b) => {
          const dtA = a.fields?.find(f => f.id === 'datetime')?.value || '';
          const dtB = b.fields?.find(f => f.id === 'datetime')?.value || '';
          return dtA.localeCompare(dtB);
        });
      } else if (activeSort === 'price') {
        items.sort((a, b) => {
          const pA = parseFloat(a.fields?.find(f => f.id === 'price')?.value) || 0;
          const pB = parseFloat(b.fields?.find(f => f.id === 'price')?.value) || 0;
          return pB - pA;
        });
      }

      if (items.length === 0) {
        listEl.innerHTML = `<div class="ma-dp-empty">${esc(labels.msgNoRoutes || 'Δεν υπάρχουν διαδρομές αυτή τη στιγμή')}</div>`;
        return;
      }

      listEl.innerHTML = items.map(card => renderCard(card)).join('');
    } catch {
      listEl.innerHTML = '<div class="ma-dp-empty">Σφάλμα φόρτωσης</div>';
    }
  }

  // ── Card rendering (scheduled style) ──

  function renderCard(card) {
    const fieldsHTML = (card.fields || []).map(f =>
      `<div class="ma-dp-card-field">
        <span class="ma-dp-card-label">${esc(f.label)}</span>
        <span class="ma-dp-card-value">${esc(String(f.value))}</span>
      </div>`
    ).join('');

    const direction = card.is_arrival ? '✈️ Άφιξη' : '🚗 Αναχώρηση';
    const isAccepted = activeSubTab === 'accepted';
    const actionsHTML = isAccepted
      ? `<button class="ma-dp-btn ma-dp-btn-detail" data-action="detail">${esc(labels.btnDetails || 'Λεπτομέρειες')}</button>
         <button class="ma-dp-btn ma-dp-btn-accept" data-action="start">🚗 Ξεκίνα</button>`
      : `<button class="ma-dp-btn ma-dp-btn-detail" data-action="detail">${esc(labels.btnDetails || 'Λεπτομέρειες')}</button>
         <button class="ma-dp-btn ma-dp-btn-accept" data-action="accept">${esc(labels.btnAccept || 'Αποδοχή')}</button>`;

    return `
      <div class="ma-dp-sched-card" data-request-id="${card.requestId}">
        <div class="ma-dp-card-header">
          <span class="ma-dp-card-badge sched">${direction}</span>
        </div>
        <div class="ma-dp-card-fields">${fieldsHTML}</div>
        <div class="ma-dp-card-actions">${actionsHTML}</div>
        <div class="ma-dp-detail-expand" id="detail-${card.requestId}" hidden></div>
      </div>`;
  }

  // ── Detail expand ──

  async function showDetail(requestId) {
    const expandEl = document.getElementById(`detail-${requestId}`);
    if (!expandEl) return;

    if (!expandEl.hidden) { expandEl.hidden = true; return; }

    expandEl.innerHTML = `<div class="ma-dp-empty">${esc(labels.msgLoading || 'Φόρτωση…')}</div>`;
    expandEl.hidden = false;

    try {
      const res = await fetch(`${API}/request/${requestId}/detail`);
      if (!res.ok) throw new Error('fail');
      const data = await res.json();
      const card = data.card;

      expandEl.innerHTML = (card.fields || []).map(f =>
        `<div class="ma-dp-card-field">
          <span class="ma-dp-card-label">${esc(f.label)}</span>
          <span class="ma-dp-card-value">${esc(String(f.value))}</span>
        </div>`
      ).join('');
    } catch {
      expandEl.innerHTML = '<div class="ma-dp-empty">Σφάλμα</div>';
    }
  }

  // ── Accept ──

  async function acceptRequest(requestId, btn) {
    const phone = getPhone();
    if (!phone) return;
    btn.disabled = true;

    try {
      const res = await fetch(`${API}/accept/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('✅ Αποδοχή επιτυχής!');
        loadRequests();
      } else {
        showToast(data.error === 'Already taken' ? '⚠️ Ήδη δεσμευμένο' : '❌ Σφάλμα');
        btn.disabled = false;
      }
    } catch {
      showToast('❌ Σφάλμα σύνδεσης');
      btn.disabled = false;
    }
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

  function bindEvents(container) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const card = btn.closest('[data-request-id]');
      if (!card) return;
      const requestId = card.dataset.requestId;
      const action = btn.dataset.action;

      if (action === 'accept') acceptRequest(requestId, btn);
      if (action === 'detail') showDetail(requestId);
      if (action === 'start') window.location.href = '/moveathens/active-route?id=' + encodeURIComponent(requestId);
    });
  }

  // ── Init ──

  async function init(driver, cfg) {
    config = cfg || {};
    labels = config.labels || {};

    const section = document.querySelector('[data-tab="schedule"]');
    if (!section) return;

    section.innerHTML = '';

    renderSubTabs(section);
    renderSortChips(section);
    renderPeriodFilter(section);

    const list = document.createElement('div');
    list.id = 'dpSchedList';
    list.className = 'ma-dp-sched-list';
    section.appendChild(list);

    bindEvents(section);
    await loadRequests();
  }

  window.DpAppointments = { init, reload: loadRequests };
})();
