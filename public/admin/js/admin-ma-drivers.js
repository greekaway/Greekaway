/**
 * Admin MoveAthens — Routes & Drivers Panel
 * Tab "Αιτήματα Διαδρομών": pending requests + accepted routes
 * Tab "Οδηγοί": permanent driver financial table
 * Shared: driver detail modal with payments/history
 */
(function () {
  'use strict';

  /* ─── helpers ─── */
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

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...opts
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Server error');
    return json;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
      ' ' + d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
  }

  function statusBadge(s) {
    const labels = { pending: 'Αναμονή', sent: 'Εστάλη', accepted: 'Αποδεκτό', confirmed: 'Confirmed', expired: 'Ληγμένο', cancelled: 'Ακυρωμένο', completed: 'Ολοκληρωμένο' };
    return '<span class="dr-badge ' + (s || '') + '">' + (labels[s] || s || '—') + '</span>';
  }

  /* ─── state ─── */
  let _initRoutes = false;
  let _initMgmt = false;
  let _sharedBound = false;
  let _pollTimer = null;
  let _driversMap = {};
  let _driversCacheTime = 0;
  const DRIVERS_CACHE_TTL = 30000;

  /* ─── shared modal / confirm bindings (run once) ─── */
  function bindSharedEvents() {
    if (_sharedBound) return;
    _sharedBound = true;
    var modal = _$('#driver-modal');
    var closeBtn = _$('#dm-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { modal.classList.add('hidden'); });
    if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) modal.classList.add('hidden'); });
    var payBtn = _$('#dm-pay-btn');
    if (payBtn) payBtn.addEventListener('click', recordPayment);
  }

  /* ─── lazy init ─── */
  function initRoutesTab() {
    if (_initRoutes) return;
    _initRoutes = true;
    bindSharedEvents();
    bindRoutesEvents();
    loadRoutesData();
    startPolling();
  }

  function initMgmtTab() {
    if (_initMgmt) return;
    _initMgmt = true;
    bindSharedEvents();
    bindMgmtEvents();
    loadAllDrivers();
    if (!_pollTimer) startPolling();
  }

  function startPolling() {
    if (_pollTimer) return;
    _pollTimer = setInterval(function () {
      var routesPanel = _$('.tab-content[data-tab="drivers"]');
      if (routesPanel && routesPanel.classList.contains('active')) {
        loadRoutesData();
      }
      var mgmtPanel = _$('.tab-content[data-tab="driversmgmt"]');
      if (mgmtPanel && mgmtPanel.classList.contains('active')) {
        loadAllDrivers();
      }
    }, 5000);
  }

  // Watch tab system
  var observer = new MutationObserver(function () {
    var routesPanel = _$('.tab-content[data-tab="drivers"]');
    if (routesPanel && routesPanel.classList.contains('active')) initRoutesTab();
    var mgmtPanel = _$('.tab-content[data-tab="driversmgmt"]');
    if (mgmtPanel && mgmtPanel.classList.contains('active')) initMgmtTab();
  });
  var contentWrap = _$('.content-wrap') || document.body;
  observer.observe(contentWrap, { subtree: true, attributes: true, attributeFilter: ['class'] });

  setTimeout(function () {
    var routesPanel = _$('.tab-content[data-tab="drivers"]');
    if (routesPanel && routesPanel.classList.contains('active')) initRoutesTab();
    var mgmtPanel = _$('.tab-content[data-tab="driversmgmt"]');
    if (mgmtPanel && mgmtPanel.classList.contains('active')) initMgmtTab();
  }, 200);

  /* ═══════════════════════════════════════════
     STYLED CONFIRM DIALOG (uses #maConfirmModal)
     ═══════════════════════════════════════════ */
  function showConfirm(title, msg) {
    return new Promise(function (resolve) {
      var root = _$('#maConfirmModal');
      if (!root) { resolve(confirm(msg)); return; }
      var titleEl = _$('#maConfirmTitle');
      var msgEl   = _$('#maConfirmMessage');
      var okBtn   = _$('#maConfirmOk');
      var cancelBtn = _$('#maConfirmCancel');
      if (titleEl) titleEl.textContent = title || 'Επιβεβαίωση';
      if (msgEl) msgEl.textContent = msg || '';
      okBtn.textContent = 'Διαγραφή';
      root.setAttribute('data-open', 'true');
      root.setAttribute('aria-hidden', 'false');
      function close(result) {
        root.removeAttribute('data-open');
        root.setAttribute('aria-hidden', 'true');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        root.removeEventListener('click', onBackdrop);
        resolve(result);
      }
      function onOk() { close(true); }
      function onCancel() { close(false); }
      function onBackdrop(e) { if (e.target && e.target.matches && e.target.matches('[data-action="close"]')) close(false); }
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      root.addEventListener('click', onBackdrop);
    });
  }

  /* ═══════════════════════════════════════════
     ROUTES TAB — EVENTS
     ═══════════════════════════════════════════ */
  function bindRoutesEvents() {
    var filterEl = _$('#req-filter-status');
    var refreshEl = _$('#req-refresh-btn');
    if (filterEl) filterEl.addEventListener('change', loadRoutesData);
    if (refreshEl) refreshEl.addEventListener('click', loadRoutesData);
  }

  /* ─── 2h auto-cleanup rule ─── */
  function shouldShowAccepted(r) {
    var now = Date.now();
    var TWO_H = 2 * 60 * 60 * 1000;
    if (r.booking_type === 'instant') {
      if (r.accepted_at && (now - new Date(r.accepted_at).getTime() > TWO_H)) return false;
    } else if (r.scheduled_date) {
      var timeStr = r.scheduled_time || '23:59';
      var schedMs = new Date(r.scheduled_date + 'T' + timeStr).getTime();
      if (!isNaN(schedMs) && now > schedMs + TWO_H) return false;
    }
    return true;
  }

  /* ─── drivers cache (refreshes every 30s) ─── */
  async function ensureDriversCache() {
    if (Date.now() - _driversCacheTime < DRIVERS_CACHE_TTL && Object.keys(_driversMap).length) return;
    try {
      var d = await api('/api/admin/moveathens/drivers');
      var list = d.drivers || d || [];
      _driversMap = {};
      list.forEach(function (dr) { _driversMap[dr.id] = dr; });
      _driversCacheTime = Date.now();
    } catch (e) { /* keep stale cache */ }
  }

  /* ─── main data load (one API call → split into two tables) ─── */
  async function loadRoutesData() {
    var reqTbody = _$('#req-tbody');
    var reqEmpty = _$('#req-empty');
    var accTbody = _$('#acc-tbody');
    var accEmpty = _$('#acc-empty');

    await ensureDriversCache();

    try {
      var data = await api('/api/admin/moveathens/requests');
      var all = data.requests || data || [];

      // ── Requests table (pending / sent only) ──
      var statusFilter = (_$('#req-filter-status') || {}).value || '';
      var pendingList = all.filter(function (r) {
        return ['pending', 'sent', 'expired', 'cancelled'].indexOf(r.status) >= 0;
      });
      if (statusFilter) pendingList = pendingList.filter(function (r) { return r.status === statusFilter; });
      if (reqTbody) renderRequests(pendingList, reqTbody, reqEmpty);

      // ── Accepted routes table ──
      var accepted = all.filter(function (r) { return r.status === 'accepted'; });
      var visible = accepted.filter(shouldShowAccepted);
      var expired = accepted.filter(function (r) { return !shouldShowAccepted(r); });
      if (accTbody) renderAcceptedRoutes(visible, accTbody, accEmpty);

      // Auto-mark expired accepted routes as completed server-side
      expired.forEach(function (r) {
        api('/api/admin/moveathens/requests/' + r.id, {
          method: 'PUT',
          body: JSON.stringify({ status: 'completed' })
        }).catch(function () {});
      });
    } catch (e) {
      toast('Σφάλμα: ' + e.message);
    }
  }

  /* ═══════════════════════════════════════════
     RENDER: REQUESTS (pending / sent)
     ═══════════════════════════════════════════ */
  function renderRequests(list, tbody, empty) {
    if (!list.length) { tbody.innerHTML = ''; if (empty) empty.style.display = 'block'; return; }
    if (empty) empty.style.display = 'none';

    // Skip full re-render if user is actively editing a phone input
    var activeEl = document.activeElement;
    if (activeEl && activeEl.classList.contains('req-phone') && tbody.contains(activeEl)) {
      // Only update non-input cells (status badges, etc.) without touching rows being edited
      var editingRowId = activeEl.closest('tr') ? activeEl.closest('tr').dataset.id : null;
      var serverMap = {};
      list.forEach(function (r) { serverMap[r.id] = r; });
      // Update status badges and other cells for rows NOT being edited
      _$$('tr[data-id]', tbody).forEach(function (tr) {
        if (tr.dataset.id === editingRowId) return; // skip the row user is typing in
        var r = serverMap[tr.dataset.id];
        if (!r) return;
        var statusTd = tr.children[6];
        if (statusTd) statusTd.innerHTML = statusBadge(r.status);
      });
      return;
    }

    // Preserve any phone values the user typed but hasn't sent yet
    var savedPhones = {};
    _$$('.req-phone', tbody).forEach(function (input) {
      var tr = input.closest('tr');
      if (tr && input.value.trim()) savedPhones[tr.dataset.id] = input.value;
    });

    tbody.innerHTML = list.map(function (r) {
      var canSend = r.status === 'pending' || r.status === 'sent';
      var phoneVal = savedPhones[r.id] || r.driver_phone || '';
      var dirIcon = r.is_arrival ? '✈️ ' : '';
      var routeDisplay = r.is_arrival
        ? (dirIcon + (r.destination_name || '—') + ' → ' + (r.hotel_name || '—'))
        : ((r.hotel_name || '—') + ' → ' + (r.destination_name || '—'));

      // Flight tracking info for arrivals
      var flightInfo = '';
      if (r.flight_number) {
        flightInfo = '<br><small style="color:#6b7280">✈ ' + r.flight_number;
        if (r.flight_airline) flightInfo += ' (' + r.flight_airline + ')';
        if (r.flight_origin) flightInfo += ' — ' + r.flight_origin;
        flightInfo += '</small>';
        if (r.flight_eta) {
          var etaDate = new Date(r.flight_eta);
          var etaTime = etaDate.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
          var statusColor = '#6b7280';
          var statusLabel = '';
          if (r.flight_status === 'en_route') { statusColor = '#f59e0b'; statusLabel = '✈️ Σε πτήση'; }
          else if (r.flight_status === 'landed') { statusColor = '#10b981'; statusLabel = '✅ Προσγειώθηκε'; }
          else if (r.flight_status === 'scheduled') { statusColor = '#3b82f6'; statusLabel = '📅 Προγρ/μένη'; }
          else if (r.flight_status === 'cancelled') { statusColor = '#ef4444'; statusLabel = '❌ Ακυρώθηκε'; }
          flightInfo += '<br><small style="color:' + statusColor + ';font-weight:600">ETA ' + etaTime;
          if (statusLabel) flightInfo += ' — ' + statusLabel;
          if (r.flight_gate) flightInfo += ' | Gate ' + r.flight_gate;
          if (r.flight_terminal) flightInfo += ' | T' + r.flight_terminal;
          flightInfo += '</small>';
        }
      }

      return '<tr data-id="' + r.id + '">' +
        '<td title="' + r.id + '">' + String(r.id).slice(-6) + '</td>' +
        '<td colspan="2">' + routeDisplay + '</td>' +
        '<td>' + (r.vehicle_name || '—') + '</td>' +
        '<td>€' + parseFloat(r.price || 0).toFixed(0) + '</td>' +
        '<td>' + (r.passenger_name || '—') + flightInfo + '</td>' +
        '<td>' + statusBadge(r.status) + '</td>' +
        '<td>' + (canSend
          ? '<input class="dr-inline-input req-phone" value="' + phoneVal + '" placeholder="+30…">'
          : (r.driver_phone || '—')) + '</td>' +
        '<td style="white-space:nowrap">' +
          (canSend
            ? '<button class="dr-btn dr-btn-success req-send-btn">Αποστολή</button> <button class="dr-btn req-del-btn" style="background:#ef4444;color:#fff;margin-left:4px">Διαγραφή</button>'
            : (r.status === 'expired' || r.status === 'cancelled'
              ? '<button class="dr-btn req-del-btn" style="background:#ef4444;color:#fff">Διαγραφή</button>'
              : '')) +
        '</td>' +
      '</tr>';
    }).join('');

    _$$('.req-send-btn', tbody).forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var tr = btn.closest('tr');
        var id = tr.dataset.id;
        var phone = (_$('.req-phone', tr) || {}).value || '';
        if (!phone.trim()) { toast('Εισάγετε τηλέφωνο οδηγού'); return; }
        btn.disabled = true;
        try {
          var d = await api('/api/admin/moveathens/requests/' + id + '/send-driver', {
            method: 'POST', body: JSON.stringify({ driver_phone: phone.trim() })
          });
          toast('Εστάλη! Ανοίγει WhatsApp…');
          if (d.whatsapp_url) {
            var a = document.createElement('a'); a.href = d.whatsapp_url; a.target = '_blank'; a.rel = 'noopener';
            document.body.appendChild(a); a.click(); a.remove();
          }
          loadRoutesData();
        } catch (e) { toast('Σφάλμα: ' + e.message); btn.disabled = false; }
      });
    });

    _$$('.req-del-btn', tbody).forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var tr = btn.closest('tr');
        var id = tr.dataset.id;
        var ok = await showConfirm('Διαγραφή Αιτήματος', 'Θέλεις σίγουρα να διαγράψεις αυτό το αίτημα;');
        if (!ok) return;
        btn.disabled = true;
        try {
          var resp = await fetch('/api/admin/moveathens/requests/' + id, { method: 'DELETE', credentials: 'same-origin' });
          var data = await resp.json();
          if (!resp.ok) throw new Error(data.error || 'Delete failed');
          toast('Διαγράφηκε');
          loadRoutesData();
        } catch (e) { toast('Σφάλμα: ' + e.message); btn.disabled = false; }
      });
    });
  }

  /* ═══════════════════════════════════════════
     RENDER: ACCEPTED ROUTES
     ═══════════════════════════════════════════ */
  function renderAcceptedRoutes(list, tbody, empty) {
    if (!list.length) { tbody.innerHTML = ''; if (empty) empty.style.display = 'block'; return; }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = list.map(function (r) {
      var driver = _driversMap[r.driver_id] || {};
      var driverName = r.driver_name || driver.name || '—';
      var driverPhone = r.driver_phone || driver.phone || '—';
      var typeLabel = r.booking_type === 'instant'
        ? '⚡ Άμεσα'
        : (r.scheduled_date ? '📅 ' + r.scheduled_date + ' ' + (r.scheduled_time || '') : '—');
      // Driver phase badge
      var phaseBadge;
      if (r.navigating_dest_at) phaseBadge = '<span class="dr-badge" style="background:#dbeafe;color:#1e40af">🎯 Προορισμό</span>';
      else if (r.arrived_at) phaseBadge = '<span class="dr-badge" style="background:#fef3c7;color:#92400e">📍 Έφτασε</span>';
      else phaseBadge = '<span class="dr-badge accepted">🚗 Εν Ρούτε</span>';
      return '<tr data-id="' + r.id + '" data-driver-id="' + (r.driver_id || '') + '">' +
        '<td title="' + r.id + '">' + String(r.id).slice(-6) + '</td>' +
        '<td>' + driverName + '</td>' +
        '<td>' + driverPhone + '</td>' +
        '<td>' + (r.hotel_name || '—') + ' → ' + (r.destination_name || '—') + '</td>' +
        '<td>' + (r.vehicle_name || '—') + '</td>' +
        '<td>€' + parseFloat(r.price || 0).toFixed(0) + '</td>' +
        '<td>' + typeLabel + '</td>' +
        '<td>' + fmtDate(r.accepted_at) + '</td>' +
        '<td>' + phaseBadge + '</td>' +
        '<td>' + (r.driver_id ? '<button class="dr-btn dr-btn-primary acc-detail-btn">Λεπτομέρειες</button>' : '') + '</td>' +
      '</tr>';
    }).join('');

    _$$('.acc-detail-btn', tbody).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var drvId = btn.closest('tr').dataset.driverId;
        if (drvId) openDriverModal(drvId);
      });
    });
  }

  /* ═══════════════════════════════════════════
     DRIVERS MANAGEMENT TAB
     ═══════════════════════════════════════════ */
  function bindMgmtEvents() {
    var sortField = _$('#drvmgmt-sort-field');
    var sortDir = _$('#drvmgmt-sort-dir');
    var refreshBtn = _$('#drvmgmt-refresh-btn');
    if (sortField) sortField.addEventListener('change', loadAllDrivers);
    if (sortDir) sortDir.addEventListener('change', loadAllDrivers);
    if (refreshBtn) refreshBtn.addEventListener('click', loadAllDrivers);
  }

  async function loadAllDrivers() {
    var tbody = _$('#drvmgmt-tbody');
    var empty = _$('#drvmgmt-empty');
    if (!tbody) return;

    try {
      var data = await api('/api/admin/moveathens/drivers');
      var list = data.drivers || data || [];

      list = list.map(function (d) {
        return Object.assign({}, d, {
          balance: parseFloat(d.total_owed || 0) - parseFloat(d.total_paid || 0)
        });
      });

      var field = (_$('#drvmgmt-sort-field') || {}).value || 'name';
      var dir = (_$('#drvmgmt-sort-dir') || {}).value || 'desc';

      list.sort(function (a, b) {
        if (field === 'name') {
          var c = (a.name || '').localeCompare(b.name || '', 'el');
          return dir === 'asc' ? c : -c;
        }
        var av = parseFloat(a[field]) || 0;
        var bv = parseFloat(b[field]) || 0;
        return dir === 'asc' ? av - bv : bv - av;
      });

      renderAllDrivers(list, tbody, empty);
    } catch (e) { toast('Σφάλμα: ' + e.message); }
  }

  function renderAllDrivers(list, tbody, empty) {
    if (!list.length) { tbody.innerHTML = ''; if (empty) empty.style.display = 'block'; return; }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = list.map(function (d) {
      var bal = d.balance !== undefined ? d.balance : parseFloat(d.total_owed || 0) - parseFloat(d.total_paid || 0);
      var cls = bal > 0 ? 'negative' : 'positive';
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

    _$$('.drvmgmt-detail-btn', tbody).forEach(function (btn) {
      btn.addEventListener('click', function () { openDriverModal(btn.closest('tr').dataset.id); });
    });

    _$$('.drvmgmt-del-btn', tbody).forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var tr = btn.closest('tr');
        var id = tr.dataset.id;
        // Read balance directly from the rendered table cell (column 7, index 6)
        var balCell = tr.children[6];
        var bal = balCell ? parseFloat(balCell.textContent.replace(/[^0-9.\-]/g, '')) || 0 : 0;
        if (bal > 0) {
          toast('⚠️ Ο οδηγός χρωστάει €' + bal.toFixed(0) + ' — δεν μπορεί να διαγραφεί.');
          return;
        }
        var ok = await showConfirm('Διαγραφή Οδηγού', 'Θέλεις σίγουρα να διαγράψεις αυτόν τον οδηγό;');
        if (!ok) return;
        btn.disabled = true;
        try {
          var resp = await fetch('/api/admin/moveathens/drivers/' + id, { method: 'DELETE', credentials: 'same-origin' });
          var data = await resp.json();
          if (!resp.ok) {
            if (data.error === 'BALANCE_OWED') {
              toast('⚠️ ' + data.message);
              btn.disabled = false;
              return;
            }
            throw new Error(data.error || 'Delete failed');
          }
          toast('Διαγράφηκε');
          loadAllDrivers();
        } catch (e) { toast('Σφάλμα: ' + e.message); btn.disabled = false; }
      });
    });
  }

  /* ═══════════════════════════════════════════
     DRIVER DETAIL MODAL (shared between tabs)
     ═══════════════════════════════════════════ */
  var currentDriverId = null;

  async function openDriverModal(id) {
    currentDriverId = id;
    var modal = _$('#driver-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    _$('#dm-title').textContent = 'Φόρτωση…';
    _$('#dm-stats').innerHTML = '';
    _$('#dm-payments-tbody').innerHTML = '';
    _$('#dm-trips-tbody').innerHTML = '';

    try {
      var results = await Promise.all([
        api('/api/admin/moveathens/drivers/' + id),
        api('/api/admin/moveathens/drivers/' + id + '/payments'),
        api('/api/admin/moveathens/drivers/' + id + '/requests')
      ]);

      var d = results[0].driver || results[0];
      var payments = results[1].payments || results[1] || [];
      var trips = results[2].requests || results[2] || [];

      var balance = parseFloat(d.total_owed || 0) - parseFloat(d.total_paid || 0);
      var balCls = balance > 0 ? 'negative' : 'positive';

      _$('#dm-title').textContent = d.name || d.phone || 'Οδηγός';

      _$('#dm-stats').innerHTML =
        '<div class="dr-stat"><div class="num">' + (d.total_trips || 0) + '</div><div class="lbl">Διαδρομές</div></div>' +
        '<div class="dr-stat"><div class="num">€' + parseFloat(d.total_revenue || 0).toFixed(0) + '</div><div class="lbl">Έσοδα</div></div>' +
        '<div class="dr-stat"><div class="num">€' + parseFloat(d.total_owed || 0).toFixed(0) + '</div><div class="lbl">Οφειλόμενα</div></div>' +
        '<div class="dr-stat"><div class="num">€' + parseFloat(d.total_paid || 0).toFixed(0) + '</div><div class="lbl">Πληρωμένα</div></div>' +
        '<div class="dr-stat"><div class="num ' + balCls + '">€' + balance.toFixed(0) + '</div><div class="lbl">Υπόλοιπο</div></div>';

      _$('#dm-payments-tbody').innerHTML = payments.length
        ? payments.map(function (p) {
            return '<tr><td>' + fmtDate(p.created_at) + '</td><td>€' + parseFloat(p.amount).toFixed(0) + '</td><td>' + (p.note || '—') + '</td></tr>';
          }).join('')
        : '<tr><td colspan="3" class="dr-empty">Δεν υπάρχουν πληρωμές</td></tr>';

      _$('#dm-trips-tbody').innerHTML = trips.length
        ? trips.map(function (r) {
            return '<tr><td>' + fmtDate(r.created_at) + '</td><td>' + (r.hotel_name || '—') + '</td><td>' + (r.destination_name || '—') + '</td><td>€' + parseFloat(r.price || 0).toFixed(0) + '</td><td>' + statusBadge(r.status) + '</td></tr>';
          }).join('')
        : '<tr><td colspan="5" class="dr-empty">Δεν υπάρχουν διαδρομές</td></tr>';
    } catch (e) {
      toast('Σφάλμα: ' + e.message);
    }
  }

  async function recordPayment() {
    if (!currentDriverId) return;
    var amount = parseFloat((_$('#dm-pay-amount') || {}).value);
    var noteEl = _$('#dm-pay-note');
    var note = noteEl ? (noteEl.value || '').trim() : '';
    if (!amount || amount <= 0) { toast('Εισάγετε ποσό > 0'); return; }
    try {
      await api('/api/admin/moveathens/drivers/' + currentDriverId + '/payments', {
        method: 'POST', body: JSON.stringify({ amount: amount, note: note })
      });
      toast('Πληρωμή καταχωρήθηκε ✓');
      _$('#dm-pay-amount').value = '';
      if (noteEl) noteEl.value = '';
      openDriverModal(currentDriverId);
      loadAllDrivers();
    } catch (e) { toast('Σφάλμα: ' + e.message); }
  }

  /* ─── Cross-module event: open driver modal from other modules ─── */
  document.addEventListener('ma-open-driver-modal', function (e) {
    var id = e.detail && e.detail.id;
    if (id) openDriverModal(id);
  });
})();
