/**
 * MoveAthens Driver Panel — Appointments Tab
 * Scheduled requests: [Όλα] [Αποδεκτά] sub-tabs, filters, accept, detail expand.
 * Depends: driver-panel.js (DpApp)
 */
(() => {
  'use strict';

  const LS_KEY = 'moveathens_driver';
  const API = '/api/driver-panel';

  let config = {};
  let labels = {};
  let activeSubTab = 'all';

  const getPhone = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY))?.phone || ''; }
    catch { return ''; }
  };

  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // ── Sub-tabs ──

  function renderSubTabs(container) {
    const bar = document.createElement('div');
    bar.className = 'ma-dp-sched-tabs';
    bar.innerHTML = `
      <button class="ma-dp-sched-tab active" data-sub="all">Όλα</button>
      <button class="ma-dp-sched-tab" data-sub="accepted">${esc(labels.btnAccept || 'Αποδεκτά')}</button>`;
    bar.addEventListener('click', e => {
      const btn = e.target.closest('[data-sub]');
      if (!btn) return;
      activeSubTab = btn.dataset.sub;
      bar.querySelectorAll('.ma-dp-sched-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.sub === activeSubTab));
      loadRequests();
    });
    container.prepend(bar);
  }

  // ── Filters ──

  function renderFilters(container) {
    const wrap = document.createElement('div');
    wrap.className = 'ma-dp-sched-filters';
    wrap.innerHTML = `
      <select id="dpSchedFilter" class="ma-dp-sched-select">
        <option value="all">Όλα</option>
        <option value="airport">Αεροδρόμια</option>
        <option value="high">Υψηλή αξία</option>
      </select>
      <input type="date" id="dpSchedDate" class="ma-dp-sched-date" />`;
    wrap.addEventListener('change', () => loadRequests());
    container.appendChild(wrap);
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

      // Client-side filters
      const filterEl = document.getElementById('dpSchedFilter');
      const dateEl = document.getElementById('dpSchedDate');
      const filterVal = filterEl?.value || 'all';
      const dateVal = dateEl?.value || '';

      if (filterVal === 'airport') {
        items = items.filter(c =>
          c.fields?.some(f => f.id === 'destination' && /αεροδρ|airport/i.test(f.value)) ||
          c.fields?.some(f => f.id === 'origin' && /αεροδρ|airport/i.test(f.value))
        );
      } else if (filterVal === 'high') {
        items = items.filter(c => {
          const pf = c.fields?.find(f => f.id === 'price');
          return pf && parseFloat(pf.value) >= 40;
        });
      }

      if (dateVal) {
        items = items.filter(c => {
          const dtf = c.fields?.find(f => f.id === 'datetime');
          return dtf && dtf.value.startsWith(dateVal);
        });
      }

      if (items.length === 0) {
        listEl.innerHTML = `<div class="ma-dp-empty">${esc(labels.msgNoRoutes || 'Δεν υπάρχουν ραντεβού')}</div>`;
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

    section.innerHTML = '<div id="dpSchedList" class="ma-dp-sched-list"></div>';
    renderSubTabs(section);
    renderFilters(section);
    bindEvents(section);
    await loadRequests();
  }

  window.DpAppointments = { init, reload: loadRequests };
})();
