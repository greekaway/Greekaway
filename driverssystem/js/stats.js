/**
 * DriversSystem — Stats Page
 * Displays aggregated statistics with time-range filters,
 * clickable summary cards with source breakdowns,
 * and expense category navigation.
 */
(async () => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ── Auth Guard — check if driver is logged in ──
  const STORAGE_KEY = 'ds_driver_phone';
  const savedPhone = localStorage.getItem(STORAGE_KEY);

  if (!savedPhone) {
    const profileUrl = window.DriversSystemConfig
      ? window.DriversSystemConfig.buildRoute('/profile')
      : '/driverssystem/profile';

    const guard = document.createElement('div');
    guard.className = 'ds-auth-guard';
    guard.innerHTML = `
      <div class="ds-auth-guard__inner">
        <div class="ds-auth-guard__icon">🔒</div>
        <h2 class="ds-auth-guard__title">Απαιτείται Σύνδεση</h2>
        <p class="ds-auth-guard__desc">Για να δείτε τα στατιστικά σας, πρέπει πρώτα να συνδεθείτε με τον αριθμό τηλεφώνου σας.</p>
        <a class="ds-auth-guard__btn" href="${profileUrl}">Σύνδεση στο Προφίλ</a>
      </div>`;
    document.body.appendChild(guard);
    const cfg = await window.DriversSystemConfig.load();
    return;
  }

  // ── Config ──
  const cfg = await window.DriversSystemConfig.load();

  // Apply dynamic page title from admin panel
  window.DriversSystemConfig.applyPageTitles(document, cfg);

  // ── Formatting ──
  const fmtEur = (v) => {
    const num = (v || 0).toFixed(2);
    return num.replace('.', ',') + ' \u20AC';
  };

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
    if (groupBy === 'week') {
      return `Εβδ. ${fmtDate(periodStr)}`;
    }
    return fmtDate(periodStr);
  };

  // ── State ──
  let sources = [];
  let currentQuick = 'today';
  let currentGroup = 'day';
  let currentSourceFilter = 'all';
  let customFrom = '';
  let customTo = '';
  let lastStats = null; // cache for detail panels

  // ── Get driver ID from localStorage (phone-based identity) ──
  const getDriverId = () => {
    return localStorage.getItem('ds_driver_phone') || '';
  };

  // ── Greece timezone helper ──
  const greeceNow = () => {
    const now = new Date();
    const gr = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Athens' }));
    return gr;
  };
  const greeceToday = () => {
    const gr = greeceNow();
    return gr.getFullYear() + '-' + String(gr.getMonth() + 1).padStart(2, '0') + '-' + String(gr.getDate()).padStart(2, '0');
  };

  // ── Compute date range from quick filter ──
  const getDateRange = () => {
    const today = greeceNow();
    const toStr = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

    switch (currentQuick) {
      case 'today':
        return { from: toStr(today), to: toStr(today) };
      case 'week': {
        const start = new Date(today);
        const day = start.getDay() || 7;
        start.setDate(start.getDate() - day + 1);
        return { from: toStr(start), to: toStr(today) };
      }
      case 'month': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { from: toStr(start), to: toStr(today) };
      }
      case '3months': {
        const start = new Date(today);
        start.setMonth(start.getMonth() - 3);
        return { from: toStr(start), to: toStr(today) };
      }
      case 'custom':
        return {
          from: customFrom || toStr(new Date(today.getFullYear(), today.getMonth(), 1)),
          to: customTo || toStr(today)
        };
      default:
        return { from: toStr(today), to: toStr(today) };
    }
  };

  // ── API ──
  const fetchStats = async () => {
    const range = getDateRange();
    const driverId = getDriverId();
    const params = new URLSearchParams();
    if (driverId) params.set('driverId', driverId);
    params.set('from', range.from);
    params.set('to', range.to);
    params.set('period', currentGroup);
    if (currentSourceFilter !== 'all') params.set('sourceId', currentSourceFilter);

    try {
      const res = await fetch(`/api/driverssystem/stats?${params}`);
      if (!res.ok) throw new Error('Fetch failed');
      return await res.json();
    } catch (_) {
      return null;
    }
  };

  // ── Fetch entries for overlay ──
  const fetchEntries = async () => {
    const range = getDateRange();
    const driverId = getDriverId();
    const params = new URLSearchParams();
    if (driverId) params.set('driverId', driverId);
    params.set('from', range.from);
    params.set('to', range.to);
    if (currentSourceFilter !== 'all') params.set('sourceId', currentSourceFilter);

    try {
      const res = await fetch(`/api/driverssystem/entries?${params}`);
      if (!res.ok) throw new Error('Fetch failed');
      return await res.json();
    } catch (_) {
      return [];
    }
  };

  // ── Load trip sources ──
  const loadSources = async () => {
    try {
      const res = await fetch('/api/driverssystem/trip-sources');
      if (res.ok) sources = await res.json();
    } catch (_) {
      sources = [];
    }
  };

  // ── Render Summary Cards ──
  const renderSummary = (stats) => {
    const grossEl = $('[data-ds-stats-gross]');
    const netEl = $('[data-ds-stats-net]');
    const countEl = $('[data-ds-stats-count]');
    const commEl = $('[data-ds-stats-commission]');

    if (grossEl) grossEl.textContent = fmtEur(stats.totalGross);
    if (netEl) netEl.textContent = fmtEur(stats.totalNet);
    if (countEl) countEl.textContent = stats.count;
    if (commEl) commEl.textContent = fmtEur(stats.totalCommission);
  };

  // ── Render Expandable Detail Panels — REMOVED (replaced by overlay) ──

  // ── Overlay System ──
  const overlayEl = $('[data-ds-stats-overlay]');
  const overlayTitle = $('[data-ds-overlay-title]');
  const overlayBody = $('[data-ds-overlay-body]');

  const openOverlay = () => {
    if (!overlayEl) return;
    overlayEl.style.display = 'flex';
    document.body.classList.add('ds-overlay-open');
  };
  const closeOverlay = () => {
    if (!overlayEl) return;
    overlayEl.style.display = 'none';
    document.body.classList.remove('ds-overlay-open');
  };

  // Close on backdrop / X button click
  if (overlayEl) {
    overlayEl.querySelectorAll('[data-ds-overlay-close]').forEach(el => {
      el.addEventListener('click', closeOverlay);
    });
  }

  // Helper: find best day from timeline
  const findBestDay = (timeline, field) => {
    if (!timeline || timeline.length === 0) return null;
    let best = timeline[0];
    for (const row of timeline) {
      if ((row[field] || 0) > (best[field] || 0)) best = row;
    }
    return best;
  };

  // Helper: count distinct days in entries
  const countDistinctDays = (entries) => {
    const days = new Set();
    entries.forEach(e => { if (e.date) days.add(e.date); });
    return days.size || 1;
  };

  // ── Build Overlay content per type ──

  const buildGrossOverlay = (stats, entries) => {
    const bySource = stats.bySource || {};
    const keys = Object.keys(bySource);
    const timeline = stats.timeline || [];
    const noData = stats.count === 0;

    if (noData) return '<div class="ds-ov-empty">Δεν υπάρχουν δεδομένα για την επιλεγμένη περίοδο</div>';

    let html = '';

    // Total
    html += `<div class="ds-ov-section"><div class="ds-ov-total ds-ov-total--blue">${fmtEur(stats.totalGross)}</div></div>`;

    // By source
    html += '<div class="ds-ov-section"><div class="ds-ov-section__title">Ανά Πηγή</div>';
    keys.forEach(key => {
      const s = bySource[key];
      const src = sources.find(x => x.id === key);
      const color = src ? src.color : '#9ca3af';
      html += `<div class="ds-ov-source-row">
        <span class="ds-ov-source-dot" style="background:${color}"></span>
        <span class="ds-ov-source-name">${s.name}</span>
        <span class="ds-ov-source-val">${fmtEur(s.gross)}</span>
      </div>`;
    });
    html += '</div>';

    // Timeline
    if (timeline.length > 0) {
      html += '<div class="ds-ov-section"><div class="ds-ov-section__title">Χρονολόγιο</div>';
      html += '<div class="ds-ov-table-wrap"><table class="ds-ov-table"><thead><tr><th>Περίοδος</th><th>Μεικτά</th><th>Δρομ.</th></tr></thead><tbody>';
      timeline.forEach(row => {
        html += `<tr><td>${fmtPeriodLabel(row.period, currentGroup)}</td><td style="color:#2563eb;font-weight:700">${fmtEur(row.gross)}</td><td>${row.count}</td></tr>`;
      });
      html += '</tbody></table></div></div>';
    }

    // Best day
    const best = findBestDay(timeline, 'gross');
    if (best) {
      html += `<div class="ds-ov-section"><div class="ds-ov-best">
        <span class="ds-ov-best__icon">🏆</span>
        <span class="ds-ov-best__text">Καλύτερη: ${fmtPeriodLabel(best.period, currentGroup)}</span>
        <span class="ds-ov-best__val">${fmtEur(best.gross)}</span>
      </div></div>`;
    }

    // Entries list
    if (entries.length > 0) {
      html += '<div class="ds-ov-section"><div class="ds-ov-section__title">Καταχωρήσεις</div><div class="ds-ov-entries">';
      entries.forEach(e => {
        html += `<div class="ds-ov-entry-row">
          <span class="ds-ov-entry-date">${fmtDate(e.date)}</span>
          <span class="ds-ov-entry-source">${e.sourceName || e.sourceId}</span>
          <span class="ds-ov-entry-val">${fmtEur(e.amount)}</span>
        </div>`;
      });
      html += '</div></div>';
    }

    return html;
  };

  const buildNetOverlay = (stats, entries) => {
    const bySource = stats.bySource || {};
    const keys = Object.keys(bySource);
    const timeline = stats.timeline || [];
    const noData = stats.count === 0;

    if (noData) return '<div class="ds-ov-empty">Δεν υπάρχουν δεδομένα για την επιλεγμένη περίοδο</div>';

    let html = '';

    // Total
    html += `<div class="ds-ov-section"><div class="ds-ov-total ds-ov-total--green">${fmtEur(stats.totalNet)}</div></div>`;

    // Formula
    html += `<div class="ds-ov-section"><div class="ds-ov-formula">
      <span>${fmtEur(stats.totalGross)}</span>
      <span>−</span>
      <span style="color:#dc2626">${fmtEur(stats.totalCommission)}</span>
      <span>=</span>
      <span style="color:#059669;font-weight:700">${fmtEur(stats.totalNet)}</span>
    </div></div>`;

    // Net by source
    html += '<div class="ds-ov-section"><div class="ds-ov-section__title">Καθαρά Ανά Πηγή</div>';
    keys.forEach(key => {
      const s = bySource[key];
      const src = sources.find(x => x.id === key);
      const color = src ? src.color : '#9ca3af';
      html += `<div class="ds-ov-source-row">
        <span class="ds-ov-source-dot" style="background:${color}"></span>
        <span class="ds-ov-source-name">${s.name}</span>
        <span class="ds-ov-source-val">${fmtEur(s.net)}</span>
      </div>`;
    });
    html += '</div>';

    // Timeline (net)
    if (timeline.length > 0) {
      html += '<div class="ds-ov-section"><div class="ds-ov-section__title">Χρονολόγιο</div>';
      html += '<div class="ds-ov-table-wrap"><table class="ds-ov-table"><thead><tr><th>Περίοδος</th><th>Καθαρά</th><th>Προμ.</th></tr></thead><tbody>';
      timeline.forEach(row => {
        html += `<tr><td>${fmtPeriodLabel(row.period, currentGroup)}</td><td style="color:#059669;font-weight:700">${fmtEur(row.net)}</td><td style="color:#dc2626">${fmtEur(row.commission)}</td></tr>`;
      });
      html += '</tbody></table></div></div>';
    }

    // Entries list with Gross / Commission / Net
    if (entries.length > 0) {
      html += '<div class="ds-ov-section"><div class="ds-ov-section__title">Καταχωρήσεις</div><div class="ds-ov-entries">';
      entries.forEach(e => {
        const comm = (e.amount || 0) - (e.netAmount || 0);
        html += `<div class="ds-ov-entry-row">
          <span class="ds-ov-entry-date">${fmtDate(e.date)}</span>
          <span class="ds-ov-entry-source">${e.sourceName || e.sourceId}</span>
          <span class="ds-ov-entry-val">${fmtEur(e.netAmount)}</span>
          <span class="ds-ov-entry-sub">${fmtEur(e.amount)} − ${fmtEur(comm)}</span>
        </div>`;
      });
      html += '</div></div>';
    }

    return html;
  };

  const buildTripsOverlay = (stats, entries) => {
    const bySource = stats.bySource || {};
    const keys = Object.keys(bySource);
    const timeline = stats.timeline || [];
    const noData = stats.count === 0;

    if (noData) return '<div class="ds-ov-empty">Δεν υπάρχουν δεδομένα για την επιλεγμένη περίοδο</div>';

    let html = '';

    // Total count
    html += `<div class="ds-ov-section"><div class="ds-ov-total ds-ov-total--purple">${stats.count}</div></div>`;

    // By source (counts)
    html += '<div class="ds-ov-section"><div class="ds-ov-section__title">Διαδρομές Ανά Πηγή</div>';
    keys.forEach(key => {
      const s = bySource[key];
      const src = sources.find(x => x.id === key);
      const color = src ? src.color : '#9ca3af';
      html += `<div class="ds-ov-source-row">
        <span class="ds-ov-source-dot" style="background:${color}"></span>
        <span class="ds-ov-source-name">${s.name}</span>
        <span class="ds-ov-source-val" style="color:#7c3aed">${s.count}</span>
      </div>`;
    });
    html += '</div>';

    // Average trips per day
    const distinctDays = countDistinctDays(entries);
    const avgPerDay = (stats.count / distinctDays).toFixed(1);
    html += `<div class="ds-ov-section"><div class="ds-ov-avg">
      <span class="ds-ov-avg__icon">📊</span>
      <span class="ds-ov-avg__text">Μ.Ο. ανά ημέρα</span>
      <span class="ds-ov-avg__val">${avgPerDay}</span>
    </div></div>`;

    // Best day (by count)
    const best = findBestDay(timeline, 'count');
    if (best) {
      html += `<div class="ds-ov-section"><div class="ds-ov-best">
        <span class="ds-ov-best__icon">🏆</span>
        <span class="ds-ov-best__text">Καλύτερη: ${fmtPeriodLabel(best.period, currentGroup)}</span>
        <span class="ds-ov-best__val" style="color:#7c3aed">${best.count} δρομ.</span>
      </div></div>`;
    }

    // Entries list
    if (entries.length > 0) {
      html += '<div class="ds-ov-section"><div class="ds-ov-section__title">Καταχωρήσεις</div><div class="ds-ov-entries">';
      entries.forEach(e => {
        html += `<div class="ds-ov-entry-row">
          <span class="ds-ov-entry-date">${fmtDate(e.date)}</span>
          <span class="ds-ov-entry-source">${e.sourceName || e.sourceId}</span>
          <span class="ds-ov-entry-val">${fmtEur(e.amount)}</span>
        </div>`;
      });
      html += '</div></div>';
    }

    return html;
  };

  const buildCommissionOverlay = (stats, entries) => {
    const bySource = stats.bySource || {};
    const keys = Object.keys(bySource);
    const timeline = stats.timeline || [];
    const noData = stats.count === 0;

    if (noData) return '<div class="ds-ov-empty">Δεν υπάρχουν δεδομένα για την επιλεγμένη περίοδο</div>';

    let html = '';

    // Total
    html += `<div class="ds-ov-section"><div class="ds-ov-total ds-ov-total--red">${fmtEur(stats.totalCommission)}</div></div>`;

    // By source (amount + % of gross)
    html += '<div class="ds-ov-section"><div class="ds-ov-section__title">Προμήθειες Ανά Πηγή</div>';
    keys.forEach(key => {
      const s = bySource[key];
      const src = sources.find(x => x.id === key);
      const color = src ? src.color : '#9ca3af';
      const comm = s.gross - s.net;
      const pct = s.gross > 0 ? ((comm / s.gross) * 100).toFixed(1) : '0.0';
      html += `<div class="ds-ov-source-row">
        <span class="ds-ov-source-dot" style="background:${color}"></span>
        <span class="ds-ov-source-name">${s.name}</span>
        <span class="ds-ov-source-val" style="color:#dc2626">${fmtEur(comm)}</span>
        <span class="ds-ov-source-pct">${pct}%</span>
      </div>`;
    });
    html += '</div>';

    // Timeline (commissions)
    if (timeline.length > 0) {
      html += '<div class="ds-ov-section"><div class="ds-ov-section__title">Χρονολόγιο</div>';
      html += '<div class="ds-ov-table-wrap"><table class="ds-ov-table"><thead><tr><th>Περίοδος</th><th>Προμήθεια</th><th>Μεικτά</th></tr></thead><tbody>';
      timeline.forEach(row => {
        html += `<tr><td>${fmtPeriodLabel(row.period, currentGroup)}</td><td style="color:#dc2626;font-weight:700">${fmtEur(row.commission)}</td><td>${fmtEur(row.gross)}</td></tr>`;
      });
      html += '</tbody></table></div></div>';
    }

    // Entries list with commission per entry
    if (entries.length > 0) {
      html += '<div class="ds-ov-section"><div class="ds-ov-section__title">Καταχωρήσεις</div><div class="ds-ov-entries">';
      entries.forEach(e => {
        const comm = (e.amount || 0) - (e.netAmount || 0);
        html += `<div class="ds-ov-entry-row">
          <span class="ds-ov-entry-date">${fmtDate(e.date)}</span>
          <span class="ds-ov-entry-source">${e.sourceName || e.sourceId}</span>
          <span class="ds-ov-entry-val" style="color:#dc2626">${fmtEur(comm)}</span>
          <span class="ds-ov-entry-sub">από ${fmtEur(e.amount)}</span>
        </div>`;
      });
      html += '</div></div>';
    }

    return html;
  };

  // ── Clickable Summary Cards → open overlay ──
  const overlayTitles = {
    gross: 'Ανάλυση Μεικτών',
    net: 'Ανάλυση Καθαρών',
    trips: 'Ανάλυση Διαδρομών',
    commission: 'Ανάλυση Προμηθειών'
  };
  const overlayBuilders = {
    gross: buildGrossOverlay,
    net: buildNetOverlay,
    trips: buildTripsOverlay,
    commission: buildCommissionOverlay
  };

  const initClickableCards = () => {
    $$('[data-stats-overlay]').forEach(card => {
      card.addEventListener('click', async () => {
        const type = card.dataset.statsOverlay;
        if (!overlayTitle || !overlayBody) return;

        overlayTitle.textContent = overlayTitles[type] || '';
        overlayBody.innerHTML = '<div style="text-align:center;padding:30px 0;color:#9ca3af">Φόρτωση…</div>';
        openOverlay();

        // Fetch both stats and entries in parallel
        const [stats, entries] = await Promise.all([
          lastStats ? Promise.resolve(lastStats) : fetchStats(),
          fetchEntries()
        ]);

        if (!stats) {
          overlayBody.innerHTML = '<div class="ds-ov-empty">Σφάλμα φόρτωσης δεδομένων</div>';
          return;
        }

        const builder = overlayBuilders[type];
        overlayBody.innerHTML = builder ? builder(stats, entries) : '';
      });
    });
  };

  // ── Expense Navigation Buttons ──
  const initExpenseNav = () => {
    $$('[data-expense-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.expenseCat;
        // Car expenses → dedicated 2-level page
        if (cat === 'car') {
          window.location.href = window.DriversSystemConfig.buildRoute('/car-expenses');
          return;
        }
        // Personal expenses → dedicated 2-level page
        if (cat === 'personal') {
          window.location.href = window.DriversSystemConfig.buildRoute('/personal-expenses');
          return;
        }
        // Tax / Insurance expenses → dedicated 2-level page
        if (cat === 'tax') {
          window.location.href = window.DriversSystemConfig.buildRoute('/tax-expenses');
          return;
        }
        const url = window.DriversSystemConfig.buildRoute(`/expenses/${cat}`);
        window.location.href = url;
      });
    });
  };

  const renderSourcePills = () => {
    const container = $('[data-ds-stats-source-pills]');
    if (!container) return;

    const allPill = `<button class="ds-stats-source-pill ${currentSourceFilter === 'all' ? 'active' : ''}" data-source-filter="all">Όλες</button>`;
    const pills = sources.map(s =>
      `<button class="ds-stats-source-pill ${currentSourceFilter === s.id ? 'active' : ''}" data-source-filter="${s.id}">
        <span class="ds-stats-source-pill__dot" style="background:${s.color || '#059669'}"></span>
        ${s.name}
      </button>`
    ).join('');

    container.innerHTML = allPill + pills;

    container.querySelectorAll('.ds-stats-source-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        currentSourceFilter = btn.dataset.sourceFilter;
        container.querySelectorAll('.ds-stats-source-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadStats();
      });
    });
  };

  const renderSourceBars = (stats) => {
    const container = $('[data-ds-stats-source-bars]');
    if (!container) return;

    const bySource = stats.bySource || {};
    const keys = Object.keys(bySource);
    const maxGross = Math.max(...keys.map(k => bySource[k].gross), 1);

    if (keys.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:12px 0;font-size:13px">Δεν υπάρχουν δεδομένα</div>';
      return;
    }

    container.innerHTML = keys.map(key => {
      const s = bySource[key];
      const source = sources.find(src => src.id === key);
      const color = source ? source.color : '#9ca3af';
      const pct = Math.round((s.gross / maxGross) * 100);
      return `
        <div class="ds-stats-source-bar">
          <span class="ds-stats-source-bar__dot" style="background:${color}"></span>
          <span class="ds-stats-source-bar__name">${s.name}</span>
          <div class="ds-stats-source-bar__track">
            <div class="ds-stats-source-bar__fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="ds-stats-source-bar__amount">${fmtEur(s.gross)}</span>
          <span class="ds-stats-source-bar__count">${s.count}×</span>
        </div>`;
    }).join('');
  };

  const renderTimeline = (stats) => {
    const tbody = $('[data-ds-stats-tbody]');
    const emptyEl = $('[data-ds-stats-empty]');
    const tableEl = $('[data-ds-stats-timeline] .ds-stats-table-wrap');
    if (!tbody) return;

    const timeline = stats.timeline || [];

    if (timeline.length === 0) {
      if (tableEl) tableEl.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (tableEl) tableEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';

    tbody.innerHTML = timeline.map(row => `
      <tr>
        <td>${fmtPeriodLabel(row.period, currentGroup)}</td>
        <td>${row.count}</td>
        <td>${fmtEur(row.gross)}</td>
        <td>${fmtEur(row.net)}</td>
        <td>${fmtEur(row.commission)}</td>
      </tr>
    `).join('');
  };

  // ── Main load ──
  const loadStats = async () => {
    const stats = await fetchStats();
    if (!stats) return;
    lastStats = stats;
    renderSummary(stats);
    renderSourceBars(stats);
    renderTimeline(stats);
  };

  // ── Allowed groupings per period ──
  // Prevents invalid combos (e.g. period=today + group=month)
  const allowedGroupings = {
    today:    ['day'],
    week:     ['day', 'week'],
    month:    ['day', 'week', 'month'],
    '3months': ['day', 'week', 'month'],
    custom:   ['day', 'week', 'month']
  };
  // Best default grouping when period changes
  const defaultGrouping = {
    today:    'day',
    week:     'day',
    month:    'week',
    '3months': 'month',
    custom:   'day'
  };

  // Update group pill enabled/disabled states
  const syncGroupPills = () => {
    const allowed = allowedGroupings[currentQuick] || ['day', 'week', 'month'];
    $$('[data-group]').forEach(btn => {
      const g = btn.dataset.group;
      if (allowed.includes(g)) {
        btn.disabled = false;
        btn.classList.remove('ds-stats-group-pill--disabled');
      } else {
        btn.disabled = true;
        btn.classList.remove('active');
        btn.classList.add('ds-stats-group-pill--disabled');
      }
    });
    // If current group is not allowed, switch to default
    if (!allowed.includes(currentGroup)) {
      currentGroup = defaultGrouping[currentQuick] || 'day';
      $$('[data-group]').forEach(b => b.classList.remove('active'));
      const activeBtn = $$('[data-group]').find(b => b.dataset.group === currentGroup);
      if (activeBtn) activeBtn.classList.add('active');
    }
  };

  // ── Quick filter handlers ──
  const initQuickFilters = () => {
    $$('[data-period-quick]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentQuick = btn.dataset.periodQuick;
        $$('[data-period-quick]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const customRange = $('[data-ds-custom-range]');
        if (currentQuick === 'custom') {
          if (customRange) customRange.style.display = 'flex';
        } else {
          if (customRange) customRange.style.display = 'none';
        }

        // Auto-adjust grouping to best default for this period
        currentGroup = defaultGrouping[currentQuick] || 'day';
        $$('[data-group]').forEach(b => b.classList.remove('active'));
        const grpBtn = $$('[data-group]').find(b => b.dataset.group === currentGroup);
        if (grpBtn) grpBtn.classList.add('active');
        syncGroupPills();

        loadStats();
      });
    });

    const fromInput = $('[data-ds-stats-from]');
    const toInput = $('[data-ds-stats-to]');
    if (fromInput) {
      fromInput.addEventListener('change', () => {
        customFrom = fromInput.value;
        if (currentQuick === 'custom') loadStats();
      });
    }
    if (toInput) {
      toInput.addEventListener('change', () => {
        customTo = toInput.value;
        if (currentQuick === 'custom') loadStats();
      });
    }
  };

  // ── Group pills ──
  const initGroupPills = () => {
    $$('[data-group]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        currentGroup = btn.dataset.group;
        $$('[data-group]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadStats();
      });
    });
  };

  // ── Init ──
  await loadSources();
  renderSourcePills();
  initQuickFilters();
  initGroupPills();
  syncGroupPills();   // apply initial disabled states
  initClickableCards();
  initExpenseNav();
  await loadStats();

  // ── Live updates: poll every 30s + midnight detection ──
  let lastKnownDate = greeceToday();

  const liveRefresh = async () => {
    const nowDate = greeceToday();
    if (nowDate !== lastKnownDate) {
      // Day changed — reset filters to today
      lastKnownDate = nowDate;
      currentQuick = 'today';
      currentGroup = 'day';
      const btns = $$('[data-period-quick]');
      btns.forEach(b => b.classList.remove('active'));
      const todayBtn = btns.find(b => b.dataset.periodQuick === 'today');
      if (todayBtn) todayBtn.classList.add('active');
      $$('[data-group]').forEach(b => b.classList.remove('active'));
      const dayBtn = $$('[data-group]').find(b => b.dataset.group === 'day');
      if (dayBtn) dayBtn.classList.add('active');
      syncGroupPills();
    }
    await loadStats();
  };

  setInterval(liveRefresh, 30000);

})();
