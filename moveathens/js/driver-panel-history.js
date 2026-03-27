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

  // ── Stats Cards (6 cards: 2 count + 4 money) ──

  let summaryCache = null;

  function renderStats(container) {
    const grid = document.createElement('div');
    grid.className = 'ma-dp-hist-stats-grid';
    grid.id = 'dpHistStats';
    grid.innerHTML = `
      <div class="ma-dp-hist-stat-card">
        <span class="ma-dp-hist-stat-title">ΣΥΝΟΛΟ ΑΙΤΗΜΑΤΩΝ</span>
        <span class="ma-dp-hist-stat-value" id="dpStatRequests">—</span>
      </div>
      <div class="ma-dp-hist-stat-card">
        <span class="ma-dp-hist-stat-title">ΟΛΟΚΛΗΡΩΜΕΝΑ</span>
        <span class="ma-dp-hist-stat-value" id="dpStatCompleted">—</span>
      </div>
      <div class="ma-dp-hist-stat-card">
        <span class="ma-dp-hist-stat-title">ΣΥΝΟΛΟ</span>
        <span class="ma-dp-hist-stat-value" id="dpStatAll">—</span>
        <span class="ma-dp-hist-stat-sub" id="dpStatAllSub">—</span>
      </div>
      <div class="ma-dp-hist-stat-card">
        <span class="ma-dp-hist-stat-title">ΣΗΜΕΡΑ</span>
        <span class="ma-dp-hist-stat-value" id="dpStatToday">—</span>
        <span class="ma-dp-hist-stat-sub" id="dpStatTodaySub">—</span>
      </div>
      <div class="ma-dp-hist-stat-card">
        <span class="ma-dp-hist-stat-title">ΕΒΔΟΜΑΔΑ</span>
        <span class="ma-dp-hist-stat-value" id="dpStatWeek">—</span>
        <span class="ma-dp-hist-stat-sub" id="dpStatWeekSub">—</span>
      </div>
      <div class="ma-dp-hist-stat-card">
        <span class="ma-dp-hist-stat-title">ΜΗΝΑΣ</span>
        <span class="ma-dp-hist-stat-value" id="dpStatMonth">—</span>
        <span class="ma-dp-hist-stat-sub" id="dpStatMonthSub">—</span>
      </div>`;
    container.appendChild(grid);
  }

  function updateStats() {
    const s = summaryCache;
    if (!s) return;
    // Count cards — follow active filter period
    const period = (activePeriod === 'custom') ? 'all' : activePeriod;
    const pd = s[period] || s.all || {};
    const reqEl = document.getElementById('dpStatRequests');
    const compEl = document.getElementById('dpStatCompleted');
    if (reqEl) reqEl.textContent = pd.eligible ?? pd.count ?? 0;
    if (compEl) compEl.textContent = pd.count ?? 0;
    // Money cards — always show their respective periods
    ['all', 'today', 'week', 'month'].forEach(key => {
      const cap = key.charAt(0).toUpperCase() + key.slice(1);
      const valEl = document.getElementById('dpStat' + cap);
      const subEl = document.getElementById('dpStat' + cap + 'Sub');
      if (valEl && s[key]) valEl.textContent = (s[key].total || 0).toFixed(0) + '€';
      if (subEl && s[key]) subEl.textContent = s[key].label || '—';
    });
  }

  async function loadSummary() {
    const phone = getPhone();
    if (!phone) return;
    try {
      const res = await fetch(`${API}/history-summary?phone=${encodeURIComponent(phone)}`);
      if (!res.ok) return;
      const data = await res.json();
      summaryCache = data.summary || {};
      updateStats();
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
        updateStats();
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
        const price = (parseFloat(item.price) || 0).toFixed(0);

        // Build detail rows from available data
        const details = [];
        if (item.hotel_name) details.push({ label: 'Ξενοδοχείο', value: item.hotel_name });
        if (item.hotel_address) details.push({ label: 'Διεύθυνση', value: item.hotel_address });
        if (item.vehicle_name) details.push({ label: 'Όχημα', value: item.vehicle_name });
        if (item.passenger_name) details.push({ label: 'Επιβάτης', value: item.passenger_name });
        if (item.passengers) details.push({ label: 'Άτομα', value: item.passengers });
        if (item.room_number) details.push({ label: 'Δωμάτιο', value: item.room_number });

        const luggageParts = [];
        if (item.luggage_large) luggageParts.push(`${item.luggage_large} μεγάλ.`);
        if (item.luggage_medium) luggageParts.push(`${item.luggage_medium} μεσαί.`);
        if (item.luggage_cabin) luggageParts.push(`${item.luggage_cabin} χειρ.`);
        if (luggageParts.length) details.push({ label: 'Αποσκευές', value: luggageParts.join(', ') });

        if (item.flight_number) details.push({ label: 'Πτήση', value: item.flight_number });
        if (item.scheduled_date && item.scheduled_time) details.push({ label: 'Ώρα', value: `${item.scheduled_date} ${item.scheduled_time}` });
        else if (item.scheduled_time) details.push({ label: 'Ώρα', value: item.scheduled_time });
        if (item.payment_method) {
          const payLabels = { cash: 'Μετρητά', card: 'Κάρτα', invoice: 'Τιμολόγιο' };
          details.push({ label: 'Πληρωμή', value: payLabels[item.payment_method] || item.payment_method });
        }
        if (item.commission_driver) details.push({ label: 'Προμήθεια', value: `${parseFloat(item.commission_driver).toFixed(0)}€` });
        if (item.notes) details.push({ label: 'Σημ.', value: item.notes });
        if (item.completed_at) details.push({ label: 'Ολοκλήρωση', value: formatDate(item.completed_at) });

        const detailsHtml = details.length
          ? details.map(d => `<div class="ma-dp-hist-detail-row"><span class="ma-dp-hist-detail-label">${esc(d.label)}:</span> <span class="ma-dp-hist-detail-value">${esc(String(d.value))}</span></div>`).join('')
          : '<div class="ma-dp-hist-detail-row ma-dp-hist-detail-empty">Δεν υπάρχουν επιπλέον πληροφορίες</div>';

        return `
          <div class="ma-dp-hist-card">
            <button class="ma-dp-hist-card-header" type="button" aria-expanded="false">
              <div class="ma-dp-hist-date-col">${formatDate(item.date)}</div>
              <div class="ma-dp-hist-route">
                <span>${dir}</span>
                <span>${esc(item.origin)}</span>
                <span class="ma-dp-hist-arrow">→</span>
                <span>${esc(item.destination)}</span>
              </div>
              <div class="ma-dp-hist-price">${price}€</div>
              <svg class="ma-dp-hist-chevron" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="ma-dp-hist-card-body">
              ${detailsHtml}
            </div>
          </div>`;
      }).join('');

      // Accordion toggle
      listEl.querySelectorAll('.ma-dp-hist-card-header').forEach(btn => {
        btn.addEventListener('click', () => {
          const card = btn.closest('.ma-dp-hist-card');
          const isOpen = card.classList.contains('ma-dp-hist-card--open');
          // Close all others
          listEl.querySelectorAll('.ma-dp-hist-card--open').forEach(c => {
            c.classList.remove('ma-dp-hist-card--open');
            c.querySelector('.ma-dp-hist-card-header').setAttribute('aria-expanded', 'false');
          });
          if (!isOpen) {
            card.classList.add('ma-dp-hist-card--open');
            btn.setAttribute('aria-expanded', 'true');
          }
        });
      });
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

    // Title (no back arrow — this is a main tab, not a submenu)
    const title = document.createElement('h2');
    title.className = 'ma-dp-tab-title';
    title.textContent = labels.sectionHistory || 'Ιστορικό';
    section.appendChild(title);

    renderFilters(section);
    renderStats(section);

    const list = document.createElement('div');
    list.id = 'dpHistList';
    list.className = 'ma-dp-hist-list';
    section.appendChild(list);

    await Promise.all([loadSummary(), loadHistory()]);
  }

  window.DpHistory = { init, reload: loadHistory };
})();
