/**
 * Admin – DriversSystem Stats
 * Overview, drivers list, and entries browser
 */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ── API helper ──
  const api = async (url, methodOrOpts = 'GET', body = null) => {
    let method = 'GET';
    if (typeof methodOrOpts === 'object' && methodOrOpts !== null) {
      method = methodOrOpts.method || 'GET';
      body = methodOrOpts.body ? JSON.parse(methodOrOpts.body) : null;
    } else {
      method = methodOrOpts;
    }
    const opts = { method, credentials: 'include' };
    if (body) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = typeof body === 'string' ? body : JSON.stringify(body);
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

  // ── Confirm Modal (styled, like MoveAthens) ──
  const openConfirm = (message, opts = {}) => new Promise((resolve) => {
    const root = $('#dsConfirmModal');
    if (!root) { resolve(confirm(message)); return; }
    const titleEl = $('#dsConfirmTitle');
    const msgEl = $('#dsConfirmMessage');
    const okBtn = $('#dsConfirmOk');
    const cancelBtn = $('#dsConfirmCancel');
    if (titleEl) titleEl.textContent = opts.title || 'Επιβεβαίωση';
    if (msgEl) msgEl.textContent = message || '';
    if (okBtn) okBtn.textContent = opts.okLabel || 'OK';
    root.setAttribute('data-open', 'true');
    root.setAttribute('aria-hidden', 'false');

    const close = (result) => {
      root.removeAttribute('data-open');
      root.setAttribute('aria-hidden', 'true');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      root.removeEventListener('click', onBackdrop);
      resolve(result);
    };
    const onOk = () => close(true);
    const onCancel = () => close(false);
    const onBackdrop = (e) => { if (e.target && e.target.matches && e.target.matches('[data-action="close"]')) close(false); };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    root.addEventListener('click', onBackdrop);
  });

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
      if (target === 'expenses') loadExpenses();
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

    // ── Load performance dashboard (real data) ──
    try {
      const dashParams = new URLSearchParams();
      if (driverId) dashParams.set('driverId', driverId);
      const dashRes = await api(`/api/admin/driverssystem/dashboard?${dashParams}`);
      if (dashRes && dashRes.ok) {
        const dash = await dashRes.json();
        renderPerformance(dash);
      }
    } catch (_) {}
  };

  const renderPerformance = (d) => {
    const set = (attr, val) => {
      const el = $(`[${attr}]`);
      if (el) el.textContent = val;
    };
    set('data-admin-perf-days', d.workingDays);
    set('data-admin-perf-trips', d.totalTrips);
    set('data-admin-perf-net', fmtEur(d.totalNet));
    set('data-admin-perf-avg', fmtEur(d.avgNetPerDay));
    set('data-admin-perf-proj', fmtEur(d.projectedNet));
    set('data-admin-perf-expenses', fmtEur(d.totalExpenses));
    const afterEl = $('[data-admin-perf-after]');
    if (afterEl) {
      afterEl.textContent = fmtEur(d.projectedNetAfterExpenses);
      afterEl.classList.remove('positive', 'negative');
      afterEl.classList.add(d.projectedNetAfterExpenses >= 0 ? 'positive' : 'negative');
    }
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

      list.innerHTML = drivers.map(d => {
        const initials = (d.fullName || '?').split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
        const since = d.createdAt ? fmtDate(d.createdAt.slice(0, 10)) : '—';
        const lastLogin = d.lastLoginAt ? fmtDate(d.lastLoginAt.slice(0, 10)) : '—';
        return `
          <div class="ds-admin-driver-card" data-driver-id="${d.id}">
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
            <div class="ds-admin-driver-actions">
              <button class="btn btn-sm btn-edit" data-edit-driver="${d.id}" data-name="${(d.fullName || '').replace(/"/g, '&quot;')}" data-phone="${d.phone}" data-email="${(d.email || '').replace(/"/g, '&quot;')}" title="Επεξεργασία">✏️</button>
              <button class="btn btn-sm btn-danger-solid" data-delete-driver="${d.id}" data-name="${(d.fullName || '').replace(/"/g, '&quot;')}" title="Διαγραφή">Διαγραφή</button>
            </div>
          </div>`;
      }).join('');

      // Attach edit handlers
      list.querySelectorAll('[data-edit-driver]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-edit-driver');
          const name = btn.getAttribute('data-name');
          const phone = btn.getAttribute('data-phone');
          const email = btn.getAttribute('data-email');
          const newName = prompt('Ονοματεπώνυμο:', name);
          if (newName === null) return;
          const newEmail = prompt('Email:', email);
          if (newEmail === null) return;
          api(`/api/admin/driverssystem/drivers/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName: newName, email: newEmail })
          }).then(r => {
            if (r && r.ok) {
              loadDrivers(searchInput ? searchInput.value.trim() : '');
              loadDriversList();
            } else {
              alert('Σφάλμα ενημέρωσης');
            }
          });
        });
      });

      // Attach delete handlers
      list.querySelectorAll('[data-delete-driver]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-delete-driver');
          const name = btn.getAttribute('data-name');
          const ok = await openConfirm(`Θέλετε σίγουρα να διαγράψετε τον οδηγό "${name}";`, { title: 'Διαγραφή Οδηγού', okLabel: 'Διαγραφή' });
          if (!ok) return;
          const r = await api(`/api/admin/driverssystem/drivers/${id}`, { method: 'DELETE' });
          if (r && r.ok) {
            loadDrivers(searchInput ? searchInput.value.trim() : '');
            loadDriversList();
          } else {
            await openConfirm('Σφάλμα διαγραφής. Δοκιμάστε ξανά.', { title: 'Σφάλμα', okLabel: 'OK' });
          }
        });
      });
    } catch (_) {
      list.innerHTML = '<div class="ds-admin-empty">Σφάλμα φόρτωσης</div>';
    }
  };

  // Create driver form
  const createForm = $('#adminCreateDriverForm');
  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msgEl = $('[data-admin-create-driver-msg]');
      const nameInput = $('#newDriverName');
      const phoneInput = $('#newDriverPhone');
      const emailInput = $('#newDriverEmail');
      const fullName = (nameInput.value || '').trim();
      const phone = (phoneInput.value || '').trim();
      const email = (emailInput.value || '').trim();
      if (!fullName || !phone) {
        if (msgEl) { msgEl.textContent = 'Συμπληρώστε όνομα και τηλέφωνο'; msgEl.className = 'ds-admin-form-msg error'; }
        return;
      }
      try {
        const res = await api('/api/admin/driverssystem/drivers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName, phone, email })
        });
        if (res && res.ok) {
          if (msgEl) { msgEl.textContent = 'Ο οδηγός δημιουργήθηκε!'; msgEl.className = 'ds-admin-form-msg success'; }
          nameInput.value = '';
          phoneInput.value = '';
          emailInput.value = '';
          loadDrivers('');
          loadDriversList();
          setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 3000);
        } else {
          const err = await res.json().catch(() => ({}));
          if (msgEl) { msgEl.textContent = err.error || 'Σφάλμα δημιουργίας'; msgEl.className = 'ds-admin-form-msg error'; }
        }
      } catch (_) {
        if (msgEl) { msgEl.textContent = 'Σφάλμα σύνδεσης'; msgEl.className = 'ds-admin-form-msg error'; }
      }
    });
  }

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

  // ── EXPENSES TAB ──

  const catLabels = { car: 'Αυτοκίνητο', personal: 'Προσωπικά / Σπιτιού', tax: 'Φόροι / Ασφαλιστικά' };

  // Cache for car expense categories (from admin API)
  let carExpCatsCache = [];
  const loadCarExpCats = async () => {
    try {
      const res = await api('/api/admin/driverssystem/car-expense-categories');
      if (res && res.ok) carExpCatsCache = await res.json();
    } catch (_) {}
  };

  // Cache for personal expense categories
  let persExpCatsCache = [];
  const loadPersExpCats = async () => {
    try {
      const res = await api('/api/admin/driverssystem/personal-expense-categories');
      if (res && res.ok) persExpCatsCache = await res.json();
    } catch (_) {}
  };

  // Cache for tax / insurance expense categories
  let taxExpCatsCache = [];
  const loadTaxExpCats = async () => {
    try {
      const res = await api('/api/admin/driverssystem/tax-expense-categories');
      if (res && res.ok) taxExpCatsCache = await res.json();
    } catch (_) {}
  };

  const populateExpDriverDropdown = () => {
    const el = $('#adminExpDriverSelect');
    if (!el) return;
    const current = el.value;
    el.innerHTML = '<option value="">Όλοι</option>';
    driversCache.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.phone;
      opt.textContent = `${d.fullName || d.phone} (${d.phone})`;
      el.appendChild(opt);
    });
    el.value = current;
  };

  // Keep the full expenses array for drill-down
  let lastExpenses = [];

  const loadExpenses = async () => {
    const driverId = ($('#adminExpDriverSelect') || {}).value || '';
    const category = ($('#adminExpCatSelect') || {}).value || '';
    const from = ($('#adminExpFrom') || {}).value || '';
    const to = ($('#adminExpTo') || {}).value || '';

    const params = new URLSearchParams();
    if (driverId) params.set('driverId', driverId);
    if (category) params.set('category', category);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const tbody = $('[data-admin-expenses-tbody]');
    const emptyEl = $('[data-admin-expenses-empty]');
    if (!tbody) return;

    // Hide drill-down when reloading
    const drilldown = $('[data-admin-exp-drilldown]');
    if (drilldown) drilldown.hidden = true;

    try {
      const res = await api(`/api/admin/driverssystem/expenses?${params}`);
      if (!res || !res.ok) return;
      const expenses = await res.json();
      lastExpenses = expenses;

      // Compute totals per category
      const carTotal = expenses.reduce((s, e) => s + (e.category === 'car' ? (e.amount || 0) : 0), 0);
      const personalTotal = expenses.reduce((s, e) => s + (e.category === 'personal' ? (e.amount || 0) : 0), 0);
      const taxTotal = expenses.reduce((s, e) => s + (e.category === 'tax' ? (e.amount || 0) : 0), 0);
      const grandTotal = carTotal + personalTotal + taxTotal;
      const carEl = $('[data-admin-exp-car]');
      if (carEl) carEl.textContent = fmtEur(carTotal);
      const persEl = $('[data-admin-exp-personal]');
      if (persEl) persEl.textContent = fmtEur(personalTotal);
      const taxEl = $('[data-admin-exp-tax]');
      if (taxEl) taxEl.textContent = fmtEur(taxTotal);
      const totalEl = $('[data-admin-exp-total]');
      if (totalEl) totalEl.textContent = fmtEur(grandTotal);

      if (expenses.length === 0) {
        tbody.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
      }

      if (emptyEl) emptyEl.style.display = 'none';

      const driverMap = {};
      driversCache.forEach(d => { driverMap[d.phone] = d.fullName || d.phone; });

      tbody.innerHTML = expenses.map(e => {
        const driverName = e.driverId ? (driverMap[e.driverId] || e.driverId) : '—';
        const groupItem = e.groupName && e.itemName ? `${e.groupName} / ${e.itemName}` : (e.description || '—');
        return `
          <tr>
            <td>${fmtDate(e.date)}</td>
            <td>${driverName}</td>
            <td>${catLabels[e.category] || e.category}</td>
            <td>${groupItem}</td>
            <td class="col-commission">${fmtEur(e.amount)}</td>
          </tr>`;
      }).join('');
    } catch (_) {
      tbody.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
    }
  };

  // ── Drill-down logic (3 levels) ──
  const initDrilldown = () => {
    const carCard = $('[data-admin-exp-car-card]');
    const personalCard = $('[data-admin-exp-personal-card]');
    const taxCard = $('[data-admin-exp-tax-card]');
    const drilldown = $('[data-admin-exp-drilldown]');
    const drillTitle = $('[data-admin-exp-drill-title]');
    const drillBody = $('[data-admin-exp-drill-body]');
    const drillBack = $('[data-admin-exp-drill-back]');
    if (!drilldown) return;

    let drillLevel = 0; // 0 = closed, 1 = groups, 2 = items
    let drillGroupId = null;
    let drillCategory = null; // 'car' or 'personal'

    const closeDrill = () => {
      drilldown.hidden = true;
      drillLevel = 0;
      drillGroupId = null;
      drillCategory = null;
    };

    // Generic: open group-level drill-down for a category
    const openCategoryDrill = (category) => {
      if (drillLevel === 1 && drillCategory === category && !drillGroupId) { closeDrill(); return; }
      drillLevel = 1;
      drillGroupId = null;
      drillCategory = category;
      drilldown.hidden = false;
      drillTitle.textContent = 'Ανάλυση - ' + (catLabels[category] || category);

      // Sum by groupName
      const catExps = lastExpenses.filter(e => e.category === category);
      const groupTotals = {};
      catExps.forEach(e => {
        const gn = e.groupName || 'Άλλο';
        const gid = e.groupId || gn;
        if (!groupTotals[gid]) groupTotals[gid] = { name: gn, total: 0 };
        groupTotals[gid].total += (e.amount || 0);
      });

      const groups = Object.entries(groupTotals);
      if (groups.length === 0) {
        drillBody.innerHTML = '<div class="ds-admin-drilldown__empty">Δεν υπάρχουν δεδομένα</div>';
        return;
      }

      drillBody.innerHTML = groups.map(([gid, g]) => `
        <div class="ds-admin-drilldown__row ds-admin-drilldown__row--clickable" data-drill-group="${gid}">
          <span class="ds-admin-drilldown__row-name">${g.name}</span>
          <span class="ds-admin-drilldown__row-amount">${fmtEur(g.total)}</span>
        </div>
      `).join('');

      // Level 2: click on a group → show items
      drillBody.querySelectorAll('[data-drill-group]').forEach(row => {
        row.addEventListener('click', () => {
          const gid = row.dataset.drillGroup;
          drillLevel = 2;
          drillGroupId = gid;
          const groupName = groupTotals[gid] ? groupTotals[gid].name : gid;
          drillTitle.textContent = groupName;

          const itemExps = catExps.filter(e => (e.groupId || e.groupName || 'Άλλο') === gid);
          const itemTotals = {};
          itemExps.forEach(e => {
            const iname = e.itemName || e.description || 'Άλλο';
            if (!itemTotals[iname]) itemTotals[iname] = 0;
            itemTotals[iname] += (e.amount || 0);
          });

          const items = Object.entries(itemTotals);
          if (items.length === 0) {
            drillBody.innerHTML = '<div class="ds-admin-drilldown__empty">Δεν υπάρχουν δεδομένα</div>';
            return;
          }

          drillBody.innerHTML = items.map(([name, total]) => `
            <div class="ds-admin-drilldown__row">
              <span class="ds-admin-drilldown__row-name">${name}</span>
              <span class="ds-admin-drilldown__row-amount">${fmtEur(total)}</span>
            </div>
          `).join('');
        });
      });
    };

    // Bind car card
    if (carCard) carCard.addEventListener('click', () => openCategoryDrill('car'));

    // Bind personal card
    if (personalCard) personalCard.addEventListener('click', () => openCategoryDrill('personal'));

    // Bind tax card
    if (taxCard) taxCard.addEventListener('click', () => openCategoryDrill('tax'));

    // Back button
    if (drillBack) {
      drillBack.addEventListener('click', () => {
        if (drillLevel === 2) {
          // Go back to groups for the current category
          openCategoryDrill(drillCategory);
        } else {
          closeDrill();
        }
      });
    }
  };

  initDrilldown();

  const expLoadBtn = $('#adminExpLoad');
  if (expLoadBtn) expLoadBtn.addEventListener('click', loadExpenses);

  // ── INIT ──
  (async () => {
    await loadSources();
    await loadDriversList();
    populateExpDriverDropdown();
    await loadCarExpCats();
    await loadPersExpCats();
    await loadTaxExpCats();
    // Set default date range to current month
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const fromInput = $('#adminFrom');
    const toInput = $('#adminTo');
    if (fromInput) fromInput.value = firstOfMonth.toISOString().slice(0, 10);
    if (toInput) toInput.value = today.toISOString().slice(0, 10);
    // Also set expense date defaults
    const expFromInput = $('#adminExpFrom');
    const expToInput = $('#adminExpTo');
    if (expFromInput) expFromInput.value = firstOfMonth.toISOString().slice(0, 10);
    if (expToInput) expToInput.value = today.toISOString().slice(0, 10);
    await loadOverview();
  })();

})();
