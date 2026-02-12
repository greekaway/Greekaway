/**
 * Admin – DriversSystem Stats
 * Overview, drivers list, and entries browser
 */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ── API helper ──
  const api = async (url, method = 'GET', body = null) => {
    const opts = { method, credentials: 'include' };
    if (body) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (res.status === 401 || res.status === 403) {
      location.href = '/admin-home.html?next=' + encodeURIComponent(location.pathname);
      return null;
    }
    return res;
  };

  // ── Format ──
  const fmtEur = (v) => (v || 0).toFixed(2).replace('.', ',') + ' €';

  const fmtDate = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    if (parts.length === 2) return `${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  const fmtPeriodLabel = (periodStr, groupBy) => {
    if (groupBy === 'month') {
      const parts = periodStr.split('-');
      const months = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
      const m = parseInt(parts[1], 10) - 1;
      return `${months[m]} ${parts[0]}`;
    }
    if (groupBy === 'week') return `Εβδ. ${fmtDate(periodStr)}`;
    return fmtDate(periodStr);
  };

  // ── Tab switching ──
  $$('.bar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.bar-tab').forEach(t => t.classList.remove('active'));
      $$('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      const content = $(`[data-tab="${target}"].tab-content`);
      if (content) content.classList.add('active');

      // Lazy load tabs
      if (target === 'drivers') loadDrivers();
      if (target === 'entries') loadEntries();
    });
  });

  // ── Drivers cache ──
  let driversCache = [];
  let sourcesCache = [];

  // ── Load trip sources (for color info) ──
  const loadSources = async () => {
    try {
      const res = await api('/api/admin/driverssystem/trip-sources');
      if (res && res.ok) sourcesCache = await res.json();
    } catch (_) {}
  };

  // ── Load drivers and populate dropdowns ──
  const loadDriversList = async () => {
    try {
      const res = await api('/api/admin/driverssystem/drivers');
      if (res && res.ok) {
        driversCache = await res.json();
        populateDriverDropdowns();
      }
    } catch (_) {}
  };

  const populateDriverDropdowns = () => {
    ['#adminDriverSelect', '#adminEntriesDriverSelect'].forEach(sel => {
      const el = $(sel);
      if (!el) return;
      const current = el.value;
      el.innerHTML = '<option value="">Όλοι οι οδηγοί</option>';
      driversCache.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.phone;
        opt.textContent = `${d.fullName || d.phone} (${d.phone})`;
        el.appendChild(opt);
      });
      el.value = current;
    });
  };

  // ── OVERVIEW TAB ──

  const loadOverview = async () => {
    const driverId = ($('#adminDriverSelect') || {}).value || '';
    const from = ($('#adminFrom') || {}).value || '';
    const to = ($('#adminTo') || {}).value || '';
    const period = ($('#adminPeriod') || {}).value || 'month';

    const params = new URLSearchParams();
    if (driverId) params.set('driverId', driverId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('period', period);

    try {
      const res = await api(`/api/admin/driverssystem/stats?${params}`);
      if (!res || !res.ok) return;
      const stats = await res.json();
      renderOverview(stats, period);
    } catch (_) {}
  };

  const renderOverview = (stats, period) => {
    // Summary cards
    const grossEl = $('[data-admin-gross]');
    const netEl = $('[data-admin-net]');
    const commEl = $('[data-admin-commission]');
    const countEl = $('[data-admin-count]');
    if (grossEl) grossEl.textContent = fmtEur(stats.totalGross);
    if (netEl) netEl.textContent = fmtEur(stats.totalNet);
    if (commEl) commEl.textContent = fmtEur(stats.totalCommission);
    if (countEl) countEl.textContent = stats.count;

    // Source bars
    const barsEl = $('[data-admin-source-bars]');
    if (barsEl) {
      const bySource = stats.bySource || {};
      const keys = Object.keys(bySource);
      const maxGross = Math.max(...keys.map(k => bySource[k].gross), 1);

      if (keys.length === 0) {
        barsEl.innerHTML = '<div class="ds-admin-empty">Δεν υπάρχουν δεδομένα</div>';
      } else {
        barsEl.innerHTML = keys.map(key => {
          const s = bySource[key];
          const src = sourcesCache.find(x => x.id === key);
          const color = src ? src.color : '#9ca3af';
          const pct = Math.round((s.gross / maxGross) * 100);
          return `
            <div class="ds-admin-source-bar">
              <span class="ds-admin-source-bar__dot" style="background:${color}"></span>
              <span class="ds-admin-source-bar__name">${s.name}</span>
              <div class="ds-admin-source-bar__track">
                <div class="ds-admin-source-bar__fill" style="width:${pct}%;background:${color}"></div>
              </div>
              <span class="ds-admin-source-bar__amount">${fmtEur(s.gross)}</span>
              <span class="ds-admin-source-bar__count">${s.count}×</span>
            </div>`;
        }).join('');
      }
    }

    // Timeline
    const tbody = $('[data-admin-timeline-tbody]');
    const emptyEl = $('[data-admin-timeline-empty]');
    const timeline = stats.timeline || [];

    if (tbody) {
      if (timeline.length === 0) {
        tbody.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'block';
      } else {
        if (emptyEl) emptyEl.style.display = 'none';
        tbody.innerHTML = timeline.map(row => `
          <tr>
            <td>${fmtPeriodLabel(row.period, period)}</td>
            <td>${row.count}</td>
            <td class="col-gross">${fmtEur(row.gross)}</td>
            <td class="col-net">${fmtEur(row.net)}</td>
            <td class="col-commission">${fmtEur(row.commission)}</td>
          </tr>
        `).join('');
      }
    }
  };

  // Load button
  const loadBtn = $('#adminStatsLoad');
  if (loadBtn) loadBtn.addEventListener('click', loadOverview);

  // ── DRIVERS TAB ──

  const loadDrivers = async (search = '') => {
    const list = $('[data-admin-drivers-list]');
    if (!list) return;

    const params = new URLSearchParams();
    if (search) params.set('search', search);

    try {
      const res = await api(`/api/admin/driverssystem/drivers?${params}`);
      if (!res || !res.ok) return;
      const drivers = await res.json();

      if (drivers.length === 0) {
        list.innerHTML = '<div class="ds-admin-empty">Δεν βρέθηκαν οδηγοί</div>';
        return;
      }

      // For each driver, we'll show basic info. Stats could be loaded on demand.
      list.innerHTML = drivers.map(d => {
        const initials = (d.fullName || '?').split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
        const since = d.createdAt ? fmtDate(d.createdAt.slice(0, 10)) : '—';
        const lastLogin = d.lastLoginAt ? fmtDate(d.lastLoginAt.slice(0, 10)) : '—';
        return `
          <div class="ds-admin-driver-card">
            <div class="ds-admin-driver-avatar">${initials}</div>
            <div class="ds-admin-driver-info">
              <div class="ds-admin-driver-name">${d.fullName || '(Χωρίς όνομα)'}</div>
              <div class="ds-admin-driver-meta">
                <span>📱 ${d.phone}</span>
                <span>✉️ ${d.email || '—'}</span>
                <span>📅 ${since}</span>
                <span>🕐 ${lastLogin}</span>
              </div>
            </div>
          </div>`;
      }).join('');
    } catch (_) {
      list.innerHTML = '<div class="ds-admin-empty">Σφάλμα φόρτωσης</div>';
    }
  };

  // Driver search
  let searchTimeout;
  const searchInput = $('#adminDriverSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        loadDrivers(searchInput.value.trim());
      }, 300);
    });
  }

  // ── ENTRIES TAB ──

  const loadEntries = async () => {
    const driverId = ($('#adminEntriesDriverSelect') || {}).value || '';
    const from = ($('#adminEntriesFrom') || {}).value || '';
    const to = ($('#adminEntriesTo') || {}).value || '';

    const params = new URLSearchParams();
    if (driverId) params.set('driverId', driverId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const tbody = $('[data-admin-entries-tbody]');
    const emptyEl = $('[data-admin-entries-empty]');
    if (!tbody) return;

    try {
      const res = await api(`/api/admin/driverssystem/entries?${params}`);
      if (!res || !res.ok) return;
      const entries = await res.json();

      if (entries.length === 0) {
        tbody.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
      }

      if (emptyEl) emptyEl.style.display = 'none';

      // Find driver names
      const driverMap = {};
      driversCache.forEach(d => { driverMap[d.phone] = d.fullName || d.phone; });

      tbody.innerHTML = entries.map(e => {
        const src = sourcesCache.find(s => s.id === e.sourceId);
        const color = src ? src.color : '#9ca3af';
        const driverName = e.driverId ? (driverMap[e.driverId] || e.driverId) : '—';
        return `
          <tr>
            <td>${fmtDate(e.date)}</td>
            <td>${e.time || '—'}</td>
            <td>${driverName}</td>
            <td><span class="ds-admin-source-dot" style="background:${color}"></span>${e.sourceName || e.sourceId}</td>
            <td class="col-gross">${fmtEur(e.amount)}</td>
            <td class="col-net">${fmtEur(e.netAmount)}</td>
            <td>${e.note || '—'}</td>
          </tr>`;
      }).join('');
    } catch (_) {
      tbody.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
    }
  };

  const entriesLoadBtn = $('#adminEntriesLoad');
  if (entriesLoadBtn) entriesLoadBtn.addEventListener('click', loadEntries);

  // ── INIT ──
  (async () => {
    await loadSources();
    await loadDriversList();
    // Set default date range to current month
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const fromInput = $('#adminFrom');
    const toInput = $('#adminTo');
    if (fromInput) fromInput.value = firstOfMonth.toISOString().slice(0, 10);
    if (toInput) toInput.value = today.toISOString().slice(0, 10);
    await loadOverview();
  })();

})();
