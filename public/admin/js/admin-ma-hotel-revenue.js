/**
 * Admin MoveAthens — Hotel Revenue + Driver Date Filter Module
 * Separate module: keeps admin-ma-drivers.js clean.
 *
 * Features:
 *  1. Date range filter on Drivers tab (recalculates from requests)
 *  2. Hotel Revenue sub-section with per-hotel breakdown
 *  3. Expandable route-type breakdown per hotel row
 */
(function () {
  'use strict';

  /* ─── helpers (local) ─── */
  const _$ = (sel, ctx) => (ctx || document).querySelector(sel);
  const _$$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

  function toast(msg) {
    const el = _$('#dr-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2500);
  }

  async function api(path) {
    const res = await fetch(path, { credentials: 'include' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Server error');
    return json;
  }

  const ROUTE_TYPE_LABELS = {
    airport: '✈️ Αεροδρόμιο',
    port:    '⚓ Λιμάνι',
    city:    '🏙️ Πόλη',
    travel:  '🚗 Ταξίδια',
    unknown: '❓ Χωρίς τύπο'
  };

  /* ═══════════════════════════════════════════
     DRIVER DATE RANGE FILTER
     ═══════════════════════════════════════════ */
  let _drvDateBound = false;

  function initDriverDateFilter() {
    if (_drvDateBound) return;
    _drvDateBound = true;

    const applyBtn = _$('#drvmgmt-date-apply');
    const clearBtn = _$('#drvmgmt-date-clear');
    const info     = _$('#drvmgmt-date-info');

    if (applyBtn) applyBtn.addEventListener('click', applyDriverDateFilter);
    if (clearBtn) clearBtn.addEventListener('click', clearDriverDateFilter);

    function clearDriverDateFilter() {
      const fromEl = _$('#drvmgmt-date-from');
      const toEl   = _$('#drvmgmt-date-to');
      if (fromEl) fromEl.value = '';
      if (toEl)   toEl.value = '';
      if (info)   info.textContent = '';
      // Trigger the original loadAllDrivers (unflitered)
      const refreshBtn = _$('#drvmgmt-refresh-btn');
      if (refreshBtn) refreshBtn.click();
    }

    async function applyDriverDateFilter() {
      const from = (_$('#drvmgmt-date-from') || {}).value || '';
      const to   = (_$('#drvmgmt-date-to') || {}).value || '';

      if (!from && !to) {
        clearDriverDateFilter();
        return;
      }

      if (info) info.textContent = 'Φόρτωση…';

      try {
        let url = '/api/admin/moveathens/driver-stats?';
        if (from) url += 'from=' + from + '&';
        if (to)   url += 'to=' + to;

        const data = await api(url);
        const list = (data.drivers || []).map(d => ({
          ...d,
          balance: d.balance !== undefined ? d.balance : (parseFloat(d.total_owed || 0) - parseFloat(d.total_paid || 0))
        }));

        // Apply current sort
        const field = (_$('#drvmgmt-sort-field') || {}).value || 'name';
        const dir   = (_$('#drvmgmt-sort-dir') || {}).value || 'desc';
        list.sort((a, b) => {
          if (field === 'name') {
            const c = (a.name || '').localeCompare(b.name || '', 'el');
            return dir === 'asc' ? c : -c;
          }
          const av = parseFloat(a[field]) || 0;
          const bv = parseFloat(b[field]) || 0;
          return dir === 'asc' ? av - bv : bv - av;
        });

        renderFilteredDrivers(list);

        const parts = [];
        if (from) parts.push('από ' + from);
        if (to)   parts.push('έως ' + to);
        if (info) info.textContent = '📅 ' + parts.join(' ') + ' — ' + list.length + ' οδηγοί';
      } catch (e) {
        toast('Σφάλμα: ' + e.message);
        if (info) info.textContent = 'Σφάλμα φόρτωσης';
      }
    }

    function renderFilteredDrivers(list) {
      const tbody = _$('#drvmgmt-tbody');
      const empty = _$('#drvmgmt-empty');
      if (!tbody) return;

      if (!list.length) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
      }
      if (empty) empty.style.display = 'none';

      tbody.innerHTML = list.map(d => {
        const bal = d.balance !== undefined ? d.balance : parseFloat(d.total_owed || 0) - parseFloat(d.total_paid || 0);
        const cls = bal > 0 ? 'negative' : 'positive';
        return '<tr data-id="' + d.id + '">' +
          '<td>' + (d.name || '—') + '</td>' +
          '<td>' + (d.phone || '—') + '</td>' +
          '<td>' + (d.total_trips || 0) + '</td>' +
          '<td>€' + parseFloat(d.total_revenue || 0).toFixed(0) + '</td>' +
          '<td>€' + parseFloat(d.total_owed || 0).toFixed(0) + '</td>' +
          '<td>€' + parseFloat(d.total_paid || 0).toFixed(0) + '</td>' +
          '<td class="' + cls + '">€' + bal.toFixed(0) + '</td>' +
          '<td>' +
            '<button class="dr-btn dr-btn-primary drvmgmt-detail-btn">Λεπτομέρειες</button> ' +
            '<button class="dr-btn dr-btn-danger drvmgmt-del-btn">Διαγραφή</button>' +
          '</td>' +
        '</tr>';
      }).join('');

      // Re-bind detail buttons (use the existing openDriverModal from admin-ma-drivers.js)
      _$$('.drvmgmt-detail-btn', tbody).forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.closest('tr').dataset.id;
          // openDriverModal from the parent IIFE — trigger via dispatching custom event
          document.dispatchEvent(new CustomEvent('ma-open-driver-modal', { detail: { id } }));
        });
      });
    }
  }

  /* ═══════════════════════════════════════════
     HOTEL REVENUE SUB-SECTION
     ═══════════════════════════════════════════ */
  let _hotelBound = false;

  function initHotelRevenue() {
    if (_hotelBound) return;
    _hotelBound = true;

    const refreshBtn = _$('#hotel-rev-refresh');
    const applyBtn   = _$('#hotel-rev-date-apply');
    const clearBtn   = _$('#hotel-rev-date-clear');
    const sortField  = _$('#hotel-rev-sort-field');
    const sortDir    = _$('#hotel-rev-sort-dir');

    if (refreshBtn) refreshBtn.addEventListener('click', () => loadHotelRevenue());
    if (applyBtn)   applyBtn.addEventListener('click', () => loadHotelRevenue());
    if (clearBtn)   clearBtn.addEventListener('click', clearHotelDates);
    if (sortField)  sortField.addEventListener('change', () => loadHotelRevenue());
    if (sortDir)    sortDir.addEventListener('change', () => loadHotelRevenue());

    loadHotelRevenue();
  }

  function clearHotelDates() {
    const fromEl = _$('#hotel-rev-date-from');
    const toEl   = _$('#hotel-rev-date-to');
    const info   = _$('#hotel-rev-date-info');
    if (fromEl) fromEl.value = '';
    if (toEl)   toEl.value = '';
    if (info)   info.textContent = '';
    loadHotelRevenue();
  }

  async function loadHotelRevenue() {
    const tbody = _$('#hotel-rev-tbody');
    const empty = _$('#hotel-rev-empty');
    const info  = _$('#hotel-rev-date-info');
    if (!tbody) return;

    const from = (_$('#hotel-rev-date-from') || {}).value || '';
    const to   = (_$('#hotel-rev-date-to') || {}).value || '';

    try {
      let url = '/api/admin/moveathens/hotel-revenue?';
      if (from) url += 'from=' + from + '&';
      if (to)   url += 'to=' + to;

      const data = await api(url);
      const hotels = data.hotels || [];

      // Apply sort
      const sortField = (_$('#hotel-rev-sort-field') || {}).value || 'hotel_name';
      const sortDir   = (_$('#hotel-rev-sort-dir') || {}).value || 'desc';
      hotels.sort(function (a, b) {
        if (sortField === 'hotel_name') {
          var c = (a.hotel_name || '').localeCompare(b.hotel_name || '', 'el');
          return sortDir === 'asc' ? c : -c;
        }
        var av = parseFloat(a[sortField]) || 0;
        var bv = parseFloat(b[sortField]) || 0;
        return sortDir === 'asc' ? av - bv : bv - av;
      });

      if (!hotels.length) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = 'block';
        if (info) info.textContent = from || to ? '📅 Χωρίς δεδομένα στο εύρος' : '';
        return;
      }
      if (empty) empty.style.display = 'none';

      tbody.innerHTML = hotels.map((h, idx) => {
        // Route types: count total known types
        const rt = h.route_types || {};
        const knownCount = (rt.airport || 0) + (rt.port || 0) + (rt.city || 0) + (rt.travel || 0);
        const typeSummary = knownCount > 0 ? knownCount : '—';

        // Build expand detail
        const expandId = 'hrt-expand-' + idx;
        const expandHtml = '<div class="hrt-expand hidden" id="' + expandId + '">' +
          (rt.airport ? '<div class="hrt-type-row">✈️ Αεροδρόμιο: <strong>' + rt.airport + '</strong></div>' : '') +
          (rt.port    ? '<div class="hrt-type-row">⚓ Λιμάνι: <strong>' + rt.port + '</strong></div>' : '') +
          (rt.city    ? '<div class="hrt-type-row">🏙️ Πόλη: <strong>' + rt.city + '</strong></div>' : '') +
          (rt.travel  ? '<div class="hrt-type-row">🚗 Ταξίδια: <strong>' + rt.travel + '</strong></div>' : '') +
          (rt.unknown ? '<div class="hrt-type-row">❓ Χωρίς τύπο: <strong>' + rt.unknown + '</strong></div>' : '') +
          '</div>';

        return '<tr>' +
          '<td><strong>' + h.hotel_name + '</strong></td>' +
          '<td>' + h.total_routes + '</td>' +
          '<td>€' + h.total_revenue.toFixed(0) + '</td>' +
          '<td>€' + h.total_commission.toFixed(0) + '</td>' +
          '<td class="hrt-types-cell">' +
            '<span class="hrt-types-badge" data-target="' + expandId + '" title="Κλικ για ανάλυση">' + typeSummary + '</span>' +
            expandHtml +
          '</td>' +
        '</tr>';
      }).join('');

      // Bind expand toggles
      _$$('.hrt-types-badge', tbody).forEach(badge => {
        badge.addEventListener('click', function () {
          const target = _$('#' + this.dataset.target);
          if (target) target.classList.toggle('hidden');
          this.classList.toggle('active');
        });
      });

      // Date info
      if (info) {
        const parts = [];
        if (from) parts.push('από ' + from);
        if (to) parts.push('έως ' + to);
        info.textContent = parts.length ? '📅 ' + parts.join(' ') + ' — ' + hotels.length + ' ξενοδοχεία' : '';
      }
    } catch (e) {
      toast('Σφάλμα: ' + e.message);
      if (info) info.textContent = 'Σφάλμα φόρτωσης';
    }
  }

  /* ═══════════════════════════════════════════
     AUTO-INIT: Watch for tab activation
     ═══════════════════════════════════════════ */
  function tryInit() {
    var mgmtPanel = _$('.tab-content[data-tab="driversmgmt"]');
    if (mgmtPanel && mgmtPanel.classList.contains('active')) {
      initDriverDateFilter();
    }
    var hotelPanel = _$('.tab-content[data-tab="hotelrevenue"]');
    if (hotelPanel && hotelPanel.classList.contains('active')) {
      initHotelRevenue();
    }
  }

  const observer = new MutationObserver(tryInit);
  const wrap = _$('.content-wrap') || document.body;
  observer.observe(wrap, { subtree: true, attributes: true, attributeFilter: ['class'] });
  setTimeout(tryInit, 300);
})();
