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
  let _flightCheckMins = 25; // cached from admin config
  let _flightCheckMinsTime = 0;
  let _countdownTimer = null;
  let _broadcastTimeoutMin = 5; // driver panel broadcast timeout (minutes)
  let _expiredAlerted = new Set(); // track which requests already triggered alert

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

    // Live countdown ticker — updates flight countdown every second without re-rendering
    if (!_countdownTimer) {
      _countdownTimer = setInterval(function () {
        var now = Date.now();

        // Flight countdowns
        var els = _$$('.flight-countdown .cd-value');
        els.forEach(function (span) {
          var parent = span.closest('.flight-countdown');
          if (!parent) return;
          var callAt = parseInt(parent.dataset.callAt, 10);
          if (!callAt) return;
          var secsLeft = Math.max(0, Math.round((callAt - now) / 1000));
          if (secsLeft <= 0) {
            span.textContent = 'τώρα!';
            parent.style.color = '#f97316';
            return;
          }
          var h = Math.floor(secsLeft / 3600);
          var m = Math.floor((secsLeft % 3600) / 60);
          var s = secsLeft % 60;
          span.textContent = (h > 0 ? h + 'ω ' : '') + (m > 0 ? m + 'λ ' : '') + s + 'δ';
        });

        // Request broadcast countdowns
        var reqEls = _$$('.req-countdown');
        reqEls.forEach(function (span) {
          var expiresAt = parseInt(span.dataset.expiresAt, 10);
          if (!expiresAt) return;
          var secsLeft = Math.max(0, Math.round((expiresAt - now) / 1000));
          var reqId = span.dataset.reqId;
          if (secsLeft <= 0) {
            span.textContent = '⏱ Έληξε!';
            span.style.color = '#ef4444';
            // Alert once per request
            if (reqId && !_expiredAlerted.has(reqId)) {
              _expiredAlerted.add(reqId);
              // Beep via Web Audio API (no external sound file needed)
              try {
                var ac = new (window.AudioContext || window.webkitAudioContext)();
                var osc = ac.createOscillator();
                var gain = ac.createGain();
                osc.type = 'sine'; osc.frequency.value = 880;
                gain.gain.value = 0.3;
                osc.connect(gain); gain.connect(ac.destination);
                osc.start(); osc.stop(ac.currentTime + 0.25);
              } catch(e) {}
              span.closest('tr') && (span.closest('tr').style.background = 'rgba(239,68,68,0.08)');
            }
            return;
          }
          var m = Math.floor(secsLeft / 60);
          var s = secsLeft % 60;
          span.textContent = '⏱ ' + m + ':' + (s < 10 ? '0' : '') + s;
          // Change color in last 60 seconds
          span.style.color = secsLeft <= 60 ? '#ef4444' : '#f59e0b';
        });
      }, 1000);
    }
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

    // Refresh config values (cache 30s)
    if (Date.now() - _flightCheckMinsTime > 30000) {
      try {
        var cfg = await api('/api/admin/moveathens/ui-config');
        if (cfg && typeof cfg.flightCheckMinsBefore === 'number') {
          _flightCheckMins = cfg.flightCheckMinsBefore;
        }
        _flightCheckMinsTime = Date.now();
      } catch (_e) { /* keep previous value */ }
      // Also load driver panel config for broadcast timeout
      try {
        var dpCfg = await api('/api/driver-panel/config');
        if (dpCfg && dpCfg.acceptance) {
          var t = dpCfg.acceptance.broadcastTimeoutMinutes || dpCfg.acceptance.broadcastTimeoutMin;
          if (typeof t === 'number' && t > 0) _broadcastTimeoutMin = t;
        }
      } catch (_e2) { /* keep default */ }
    }

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
        // ── Flight Tracking Status Badge (2nd API call visibility) ──
        if (r.flight_poller_done && r.flight_last_checked) {
          var checkedAt = new Date(r.flight_last_checked);
          var checkedTime = checkedAt.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
          var checkedDate = checkedAt.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' });
          flightInfo += '<br><small style="color:#10b981;font-weight:600">✅ 2η κλήση API ολοκληρώθηκε: ' + checkedDate + ' ' + checkedTime + '</small>';
        } else if (r.flight_tracking_active && r.flight_eta && !r.flight_poller_done) {
          var nowMs = Date.now();
          var etaMs = new Date(r.flight_eta).getTime();
          // 2nd call fires at: ETA minus flightCheckMinsBefore
          var callAtMs = etaMs - (_flightCheckMins * 60000);
          var secsUntilCall = Math.round((callAtMs - nowMs) / 1000);
          var callAtTime = new Date(callAtMs).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
          if (secsUntilCall > 0) {
            // Show countdown to the 2nd call
            var h = Math.floor(secsUntilCall / 3600);
            var m = Math.floor((secsUntilCall % 3600) / 60);
            var s = secsUntilCall % 60;
            var countdownStr = (h > 0 ? h + 'ω ' : '') + (m > 0 ? m + 'λ ' : '') + s + 'δ';
            flightInfo += '<br><small style="color:#f59e0b;font-weight:600" class="flight-countdown" data-call-at="' + callAtMs + '">' +
              '⏱ 2η κλήση σε: <span class="cd-value">' + countdownStr + '</span>' +
              ' <span style="color:#9ca3af;font-weight:400">(στις ' + callAtTime + ', ' + _flightCheckMins + '\' πριν ETA)</span>' +
              '</small>';
          } else {
            // Within the window — call should fire on next poller cycle
            flightInfo += '<br><small style="color:#f97316;font-weight:600;animation:pulse 1.5s infinite">' +
              '🔄 2η κλήση εκτελείται σύντομα… (αναμονή poller cycle)' +
              '</small>';
          }
        } else if (r.flight_number && !r.flight_tracking_active && !r.flight_poller_done) {
          flightInfo += '<br><small style="color:#9ca3af">⏸ Flight tracking ανενεργό</small>';
        }
      }

      // Hotel reply button — one button showing channel type
      var replyBtns = '';
      if (canSend && r.orderer_phone) {
        var ch = r.channel || 'whatsapp';
        var chLabel = ch === 'email' ? '📧 Email' : '💬 WhatsApp';
        var chColor = ch === 'email' ? '#f59e0b' : '#3b82f6';
        replyBtns = '<button class="dr-btn req-unified-reply-btn" style="background:' + chColor + ';color:#fff;margin-right:2px;font-size:12px" data-channel="' + ch + '">' + chLabel + '</button>';
      }

      // Request countdown (time until broadcast expires)
      var countdownHtml = '';
      if (canSend && r.created_at) {
        var createdMs = new Date(r.created_at).getTime();
        var expiresAt = createdMs + (_broadcastTimeoutMin * 60 * 1000);
        countdownHtml = '<span class="req-countdown" data-expires-at="' + expiresAt + '" data-req-id="' + r.id + '" style="display:block;font-size:11px;font-weight:600;margin-top:3px;color:#f59e0b">⏱ …</span>';
      }

      return '<tr data-id="' + r.id + '" data-json=\'' + JSON.stringify({
        hotel_name: r.hotel_name || '',
        destination_name: r.destination_name || '',
        passenger_name: r.passenger_name || '',
        flight_number: r.flight_number || '',
        flight_airline: r.flight_airline || '',
        flight_origin: r.flight_origin || '',
        flight_eta: r.flight_eta || '',
        flight_tracking_active: !!r.flight_tracking_active,
        flight_poller_done: !!r.flight_poller_done,
        flight_last_checked: r.flight_last_checked || '',
        vehicle_name: r.vehicle_name || '',
        orderer_phone: r.orderer_phone || '',
        is_arrival: !!r.is_arrival,
        price: r.price || 0,
        channel: r.channel || 'whatsapp'
      }).replace(/'/g, '&#39;') + '\'>' +
        '<td title="' + r.id + '">' + String(r.id).slice(-6) + '</td>' +
        '<td colspan="2">' + routeDisplay + '</td>' +
        '<td>' + (r.vehicle_name || '—') + '</td>' +
        '<td>€' + parseFloat(r.price || 0).toFixed(0) + '</td>' +
        '<td>' + (r.passenger_name || '—') + flightInfo + '</td>' +
        '<td>' + statusBadge(r.status) + countdownHtml + '</td>' +
        '<td>' + (canSend
          ? '<input class="dr-inline-input req-phone" value="' + phoneVal + '" placeholder="+30…">'
          : (r.driver_phone || '—')) + '</td>' +
        '<td style="white-space:nowrap">' +
          replyBtns +
          (canSend
            ? '<button class="dr-btn dr-btn-success req-send-btn" style="margin-left:2px">Αποστολή</button> <button class="dr-btn req-del-btn" style="background:#ef4444;color:#fff;margin-left:2px">Διαγραφή</button>'
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

    // ── Unified reply popup — adapts to WhatsApp or Email channel ──
    _$$('.req-unified-reply-btn', tbody).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tr = btn.closest('tr');
        var id = tr.dataset.id;
        var ch = btn.dataset.channel || 'whatsapp';
        var isEmail = (ch === 'email');
        var rData = {};
        try { rData = JSON.parse(tr.dataset.json || '{}'); } catch (_) {}

        // Normalize phone for WhatsApp
        var phone = '';
        if (!isEmail) {
          var rawPhone = (rData.orderer_phone || '').replace(/[\s\-().]/g, '');
          if (/^69\d{8}$/.test(rawPhone)) rawPhone = '30' + rawPhone;
          phone = rawPhone.replace(/^\+/, '').replace(/[^0-9]/g, '');
          if (!phone || phone.length < 10) { toast('Δεν υπάρχει τηλέφωνο ξενοδοχείου'); return; }
        }

        function grGreeting() {
          var gr = new Date().toLocaleString('en-US', { timeZone: 'Europe/Athens', hour: 'numeric', hour12: false });
          return parseInt(gr, 10) < 12 ? 'Καλημέρα' : 'Καλησπέρα';
        }

        var route = rData.is_arrival
          ? (rData.destination_name + ' → ' + rData.hotel_name)
          : (rData.hotel_name + ' → ' + rData.destination_name);

        var channelIcon = isEmail ? '📧' : '💬';
        var channelLabel = isEmail ? 'Email' : 'WhatsApp';
        var accentColor = isEmail ? '#f59e0b' : '#3b82f6';

        // Detect theme
        var isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        var bgCol = isDark ? 'var(--ga-card, #162432)' : 'var(--ga-card, #ffffff)';
        var textCol = isDark ? 'var(--ga-text, #E8EDF3)' : 'var(--ga-text, #0f1b2c)';
        var mutedCol = isDark ? 'var(--ga-muted, #A6B2C2)' : 'var(--ga-muted, #5d6472)';
        var borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

        // Create modal overlay
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center';
        var box = document.createElement('div');
        box.style.cssText = 'background:' + bgCol + ';border-radius:12px;padding:24px;max-width:360px;width:92%;text-align:center;color:' + textCol + ';border:1px solid ' + borderCol;

        // WhatsApp: show Έλαβα + Βρήκα + Δε βρήκαμε
        // Email: show only Βρήκα + Δε βρήκαμε (ACK is automatic)
        var ackBtn = isEmail ? '' :
          '<button id="reply-ack" style="flex:1;padding:14px 8px;border:none;background:' + accentColor + ';color:#fff;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600">📩 Έλαβα το αίτημα</button>';

        box.innerHTML = '<h3 style="margin:0 0 16px;font-size:16px">' + channelIcon + ' Απάντηση μέσω ' + channelLabel + '</h3>' +
          '<div style="display:flex;gap:10px;margin-bottom:10px">' +
            ackBtn +
            '<button id="reply-found" style="flex:1;padding:14px 8px;border:none;background:#10b981;color:#fff;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600">🚗 Βρήκα οδηγό</button>' +
          '</div>' +
          '<div style="margin-bottom:16px">' +
            '<button id="reply-nodriver" style="width:100%;padding:14px 8px;border:none;background:#dc2626;color:#fff;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600">🚫 Δε βρήκαμε οδηγό</button>' +
          '</div>' +
          '<div id="reply-eta-section" style="display:none">' +
            '<p style="margin:0 0 8px;font-size:13px;color:' + mutedCol + '">Σε πόσα λεπτά θα φτάσει;</p>' +
            '<div id="reply-eta-grid" style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:0 0 12px"></div>' +
          '</div>' +
          (isEmail ? '<div id="reply-sending" style="display:none;padding:12px;color:' + mutedCol + ';font-size:14px">⏳ Αποστολή email…</div>' : '') +
          '<button id="reply-cancel" style="padding:8px 20px;border:1px solid ' + borderCol + ';background:transparent;color:' + mutedCol + ';border-radius:8px;cursor:pointer;font-size:14px">Ακύρωση</button>';
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // ── Helper: send via WhatsApp ──
        function openWhatsApp(msg) {
          var a = document.createElement('a');
          a.href = 'https://api.whatsapp.com/send?phone=' + phone + '&text=' + encodeURIComponent(msg);
          a.target = '_blank'; a.rel = 'noopener';
          document.body.appendChild(a); a.click(); a.remove();
          overlay.remove();
        }

        // ── Helper: send via Email API ──
        async function sendEmailReply(type, etaMin) {
          var sendingEl = box.querySelector('#reply-sending');
          if (sendingEl) sendingEl.style.display = 'block';
          try {
            var bodyData = { type: type };
            if (etaMin) bodyData.eta_minutes = etaMin;
            var resp = await fetch('/api/admin/moveathens/requests/' + id + '/email-reply', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify(bodyData)
            });
            var data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Send failed');
            toast('✅ Email στάλθηκε στο ' + (data.email || 'ξενοδοχείο'));
            overlay.remove();
            if (type === 'nodriver') loadRoutesData();
          } catch (e) {
            if (sendingEl) sendingEl.style.display = 'none';
            toast('❌ Σφάλμα: ' + e.message);
          }
        }

        // ── "Έλαβα" (WhatsApp only) ──
        var ackEl = box.querySelector('#reply-ack');
        if (ackEl) {
          ackEl.addEventListener('click', function () {
            var msg = grGreeting() + '! Έλαβα το αίτημά σας:\n\n';
            msg += '🚗 Διαδρομή: ' + route + '\n';
            if (rData.passenger_name) msg += '👤 Επιβάτης: ' + rData.passenger_name + '\n';
            if (rData.flight_number) {
              msg += '🛫 Πτήση: ' + rData.flight_number;
              if (rData.flight_airline) msg += ' (' + rData.flight_airline + ')';
              msg += '\n';
              if (rData.flight_origin) msg += '📍 Από: ' + rData.flight_origin + '\n';
              if (rData.flight_eta) {
                var etaT = new Date(rData.flight_eta).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
                msg += '⏱️ ETA: ' + etaT + '\n';
              }
            }
            msg += '\nΣύντομα θα σας ενημερώσω για τον οδηγό! 🙏';
            openWhatsApp(msg);
          });
        }

        // ── "Βρήκα Οδηγό" — show ETA grid ──
        box.querySelector('#reply-found').addEventListener('click', function () {
          box.querySelector('#reply-eta-section').style.display = 'block';
          // Hide the main buttons
          box.querySelector('#reply-found').parentElement.style.display = 'none';
          box.querySelector('#reply-nodriver').parentElement.style.display = 'none';
        });

        // Build ETA grid
        var grid = box.querySelector('#reply-eta-grid');
        [1,2,3,4,5,6,7,8,9,10,12,15,20,25,30].forEach(function (n) {
          var b = document.createElement('button');
          b.textContent = n + '\'';
          b.style.cssText = 'padding:10px;border:none;background:' + accentColor + ';color:#fff;border-radius:8px;cursor:pointer;font-size:15px;font-weight:600';
          b.addEventListener('click', function () {
            if (isEmail) {
              sendEmailReply('found', n);
            } else {
              var routeText = rData.destination_name || rData.hotel_name || 'τη διαδρομή σας';
              var msg = grGreeting() + '! Βρήκαμε οδηγό για ' + routeText + '.\n\n🕐 Θα είναι εκεί σε ' + n + ' λεπτ' + (n === 1 ? 'ό' : 'ά') + '!\n\nΕυχαριστούμε! 🙏';
              openWhatsApp(msg);
            }
          });
          grid.appendChild(b);
        });

        // ── "Δε βρήκαμε οδηγό" ──
        box.querySelector('#reply-nodriver').addEventListener('click', async function () {
          if (isEmail) {
            sendEmailReply('nodriver');
          } else {
            var msg = grGreeting() + '!\n\n';
            msg += 'Ζητούμε συγνώμη, δυστυχώς δεν καταφέραμε να βρούμε διαθέσιμο οδηγό για τη διαδρομή:\n\n';
            msg += '🚗 ' + route + '\n';
            if (rData.passenger_name) msg += '👤 Επιβάτης: ' + rData.passenger_name + '\n';
            if (rData.flight_number) msg += '🛫 Πτήση: ' + rData.flight_number + '\n';
            msg += '\nΠαρακαλούμε επικοινωνήστε μαζί μας αν χρειάζεστε εναλλακτική λύση.\n\nΕυχαριστούμε για την κατανόηση! 🙏';
            openWhatsApp(msg);
            // Mark request as nodriver (soft-delete)
            try {
              var rid = tr.dataset.id;
              var resp = await fetch('/api/admin/moveathens/requests/' + rid, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ status: 'nodriver' })
              });
              if (resp.ok) {
                toast('Αίτημα: δε βρέθηκε οδηγός');
                loadRoutesData();
              }
            } catch (delErr) { console.warn('Nodriver update failed:', delErr); }
          }
        });

        box.querySelector('#reply-cancel').addEventListener('click', function () { overlay.remove(); });
        overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
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
