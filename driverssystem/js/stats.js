/**
 * DriversSystem — Stats Page
 * Displays aggregated statistics with time-range filters
 */
(async () => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ── Config ──
  const cfg = await window.DriversSystemConfig.load();

  // Apply logo
  const logo = $('[data-ds-hero-logo]');
  if (logo && cfg.heroLogoUrl) {
    logo.src = cfg.heroLogoUrl;
    logo.style.display = 'block';
  }

  // Home link
  const homeLink = $('[data-ds-home-link]');
  if (homeLink) {
    homeLink.href = window.DriversSystemConfig.buildRoute('/');
  }

  // ── Formatting ──
  const fmtEur = (v) => {
    const num = (v || 0).toFixed(2);
    return num.replace('.', ',') + ' \u20AC';
  };

  const fmtDate = (dateStr) => {
    if (!dateStr) return '';
    // YYYY-MM-DD → DD/MM/YYYY
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    // YYYY-MM → MM/YYYY
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

  // ── Get driver ID from localStorage (phone-based identity) ──
  const getDriverId = () => {
    try {
      const d = JSON.parse(localStorage.getItem('ds_driver') || '{}');
      return d.phone || '';
    } catch (_) {
      return '';
    }
  };

  // ── Compute date range from quick filter ──
  const getDateRange = () => {
    const today = new Date();
    const toStr = (d) => d.toISOString().slice(0, 10);

    switch (currentQuick) {
      case 'today':
        return { from: toStr(today), to: toStr(today) };
      case 'week': {
        const start = new Date(today);
        const day = start.getDay() || 7; // Mon=1
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

  // ── Load trip sources ──
  const loadSources = async () => {
    try {
      const res = await fetch('/api/driverssystem/trip-sources');
      if (res.ok) sources = await res.json();
    } catch (_) {
      sources = [];
    }
  };

  // ── Render ──
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
    renderSummary(stats);
    renderSourceBars(stats);
    renderTimeline(stats);
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
        loadStats();
      });
    });

    // Custom date inputs
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
  await loadStats();

})();
