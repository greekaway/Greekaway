/**
 * Admin MoveAthens — Driver Timeline Panel
 * Tab "📊 Χρονολόγιο": shows timing breakdown for each trip phase
 *
 * Phases:
 *   1. 🚗 Πλοήγηση → Ξενοδοχείο  (accepted_at → arrived_at)
 *   2. ⏳ Αναμονή Επιβάτη         (arrived_at → navigating_dest_at)
 *   3. 🎯 Πλοήγηση → Προορισμό    (navigating_dest_at → completed_at)
 *   4. ⏱️ Σύνολο                   (accepted_at → completed_at)
 *
 * NEW FILE — does not modify admin-ma-drivers.js
 */
(function () {
  'use strict';

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

  /* ─── Duration formatting ─── */
  function fmtDuration(ms) {
    if (ms == null || ms < 0) return '—';
    var totalSec = Math.floor(ms / 1000);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    if (h > 0) return h + 'ω ' + m + 'λ';
    if (m > 0) return m + 'λ ' + s + 'δ';
    return s + 'δ';
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
      ' ' + d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  /* ─── Status badge with driver phase ─── */
  function driverPhaseBadge(r) {
    if (r.status === 'completed') return '<span class="dr-badge completed">✅ Ολοκληρωμένη</span>';
    if (r.navigating_dest_at) return '<span class="dr-badge" style="background:#dbeafe;color:#1e40af">🎯 Πρ. Προορισμό</span>';
    if (r.arrived_at) return '<span class="dr-badge" style="background:#fef3c7;color:#92400e">📍 Στο Ξενοδοχείο</span>';
    if (r.accepted_at) return '<span class="dr-badge accepted">🚗 Πρ. Ξενοδοχείο</span>';
    return '<span class="dr-badge pending">Αναμονή</span>';
  }

  /* ─── Duration cell with color coding ─── */
  function durCell(ms, warnMinutes) {
    if (ms == null) return '<td class="tl-na">—</td>';
    var minutes = ms / 60000;
    var cls = '';
    if (warnMinutes && minutes > warnMinutes) cls = ' tl-warn';
    else if (warnMinutes && minutes > warnMinutes * 0.7) cls = ' tl-caution';
    return '<td class="tl-dur' + cls + '">' + fmtDuration(ms) + '</td>';
  }

  /* ─── State ─── */
  var _initTimeline = false;
  var _pollTimer = null;
  var _timelineData = [];

  /* ─── Lazy init ─── */
  function initTimelineTab() {
    if (_initTimeline) return;
    _initTimeline = true;
    bindEvents();
    loadTimeline();
    startPolling();
  }

  function bindEvents() {
    var refreshBtn = _$('#tl-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadTimeline);

    var modalClose = _$('#tl-modal-close');
    var modal = _$('#tl-modal');
    if (modalClose) modalClose.addEventListener('click', function () { modal.classList.add('hidden'); });
    if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) modal.classList.add('hidden'); });
  }

  function startPolling() {
    if (_pollTimer) return;
    _pollTimer = setInterval(function () {
      var panel = _$('.tab-content[data-tab="timeline"]');
      if (panel && panel.classList.contains('active')) loadTimeline();
    }, 10000); // 10 seconds
  }

  /* ─── Tab detection ─── */
  var observer = new MutationObserver(function () {
    var panel = _$('.tab-content[data-tab="timeline"]');
    if (panel && panel.classList.contains('active')) initTimelineTab();
  });
  var contentWrap = _$('.content-wrap') || document.body;
  observer.observe(contentWrap, { subtree: true, attributes: true, attributeFilter: ['class'] });

  setTimeout(function () {
    var panel = _$('.tab-content[data-tab="timeline"]');
    if (panel && panel.classList.contains('active')) initTimelineTab();
  }, 300);

  /* ─── Load data ─── */
  async function loadTimeline() {
    try {
      var data = await api('/api/admin/moveathens/timeline');
      _timelineData = data.timeline || [];
      renderSummary(_timelineData);
      renderTable(_timelineData);
    } catch (e) {
      toast('Σφάλμα: ' + e.message);
    }
  }

  /* ─── Summary cards ─── */
  function renderSummary(list) {
    var el = _$('#tl-summary');
    if (!el) return;

    var total = list.length;
    var completed = list.filter(function (r) { return r.status === 'completed'; });
    var inProgress = list.filter(function (r) { return r.status !== 'completed'; });

    // Average durations (completed only)
    var avgToHotel = avg(completed.map(function (r) { return r.dur_to_hotel; }));
    var avgWaiting = avg(completed.map(function (r) { return r.dur_waiting; }));
    var avgToDest = avg(completed.map(function (r) { return r.dur_to_dest; }));
    var avgTotal = avg(completed.map(function (r) { return r.dur_total; }));

    el.innerHTML =
      card('📋', 'Σύνολο', total) +
      card('✅', 'Ολοκληρωμένες', completed.length) +
      card('🔄', 'Σε Εξέλιξη', inProgress.length) +
      card('🚗', 'Μ.Ο. → Ξενοδ.', fmtDuration(avgToHotel)) +
      card('⏳', 'Μ.Ο. Αναμονή', fmtDuration(avgWaiting), avgWaiting > 15 * 60000 ? 'tl-card-warn' : '') +
      card('🎯', 'Μ.Ο. → Προορ.', fmtDuration(avgToDest)) +
      card('⏱️', 'Μ.Ο. Σύνολο', fmtDuration(avgTotal));
  }

  function card(icon, label, value, extraClass) {
    return '<div class="tl-card ' + (extraClass || '') + '">' +
      '<div class="tl-card-icon">' + icon + '</div>' +
      '<div class="tl-card-value">' + value + '</div>' +
      '<div class="tl-card-label">' + label + '</div>' +
    '</div>';
  }

  function avg(arr) {
    var valid = arr.filter(function (v) { return v != null && v >= 0; });
    if (!valid.length) return null;
    var sum = valid.reduce(function (a, b) { return a + b; }, 0);
    return Math.round(sum / valid.length);
  }

  /* ─── Main table ─── */
  function renderTable(list) {
    var tbody = _$('#tl-tbody');
    var empty = _$('#tl-empty');
    if (!tbody) return;

    if (!list.length) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = list.map(function (r) {
      var typeLabel = r.booking_type === 'instant'
        ? '⚡'
        : (r.scheduled_date ? '📅' : '—');
      return '<tr data-id="' + r.id + '">' +
        '<td title="' + r.id + '">' + String(r.id).slice(-6) + '</td>' +
        '<td>' + (r.driver_name || '—') + '</td>' +
        '<td style="font-size:12px">' + (r.hotel_name || '—') + ' → ' + (r.destination_name || '—') + '</td>' +
        '<td>' + typeLabel + '</td>' +
        '<td style="font-size:12px">' + fmtDate(r.accepted_at) + '</td>' +
        '<td>' + driverPhaseBadge(r) + '</td>' +
        durCell(r.dur_to_hotel, 45) +
        durCell(r.dur_waiting, 15) +
        durCell(r.dur_to_dest, 60) +
        durCell(r.dur_total, 120) +
        '<td><button class="dr-btn dr-btn-primary tl-detail-btn" style="font-size:11px;padding:4px 10px">🔍</button></td>' +
      '</tr>';
    }).join('');

    _$$('.tl-detail-btn', tbody).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('tr').dataset.id;
        var r = _timelineData.find(function (t) { return t.id === id; });
        if (r) openTimelineModal(r);
      });
    });
  }

  /* ─── Detail modal ─── */
  function openTimelineModal(r) {
    var modal = _$('#tl-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    _$('#tl-modal-title').textContent = '📊 Χρονολόγιο — ' + String(r.id).slice(-6);

    var html = '';

    // Trip info
    html += '<div style="margin-bottom:16px;font-size:13px;color:#6b7280">';
    html += '<strong>' + (r.hotel_name || '—') + '</strong> → <strong>' + (r.destination_name || '—') + '</strong><br>';
    html += '👤 ' + (r.driver_name || '—') + ' &nbsp;|&nbsp; 🧑 ' + (r.passenger_name || '—') + ' &nbsp;|&nbsp; €' + parseFloat(r.price || 0).toFixed(0);
    html += '</div>';

    // Timeline steps
    html += '<div class="tl-steps">';
    html += timelineStep('✅', 'Αποδοχή', fmtTime(r.accepted_at), null, true);
    html += timelineStep('🚗', 'Άφιξη Ξενοδοχείο', fmtTime(r.arrived_at), r.dur_to_hotel, !!r.arrived_at);
    html += timelineStep('🧑‍🤝‍🧑', 'Παραλαβή Επιβάτη', fmtTime(r.navigating_dest_at), r.dur_waiting, !!r.navigating_dest_at);
    html += timelineStep('🏁', 'Ολοκλήρωση', fmtTime(r.completed_at), r.dur_to_dest, !!r.completed_at);
    html += '</div>';

    // Total
    html += '<div style="margin-top:16px;padding:12px;background:#f0fdf4;border-radius:8px;text-align:center">';
    html += '<div style="font-size:12px;color:#6b7280">⏱️ Συνολικός Χρόνος</div>';
    html += '<div style="font-size:24px;font-weight:700;color:#166534">' + fmtDuration(r.dur_total) + '</div>';
    html += '</div>';

    // Warning if waiting > 15 minutes
    if (r.dur_waiting && r.dur_waiting > 15 * 60000) {
      html += '<div style="margin-top:12px;padding:10px;background:#fef2f2;border-radius:8px;font-size:13px;color:#991b1b">';
      html += '⚠️ Μεγάλη αναμονή επιβάτη: <strong>' + fmtDuration(r.dur_waiting) + '</strong> (πάνω από 15 λεπτά)';
      html += '</div>';
    }

    _$('#tl-modal-body').innerHTML = html;
  }

  function timelineStep(icon, label, time, duration, active) {
    var opacity = active ? '1' : '0.35';
    var dStr = duration != null ? fmtDuration(duration) : '';
    return '<div class="tl-step" style="opacity:' + opacity + '">' +
      '<div class="tl-step-dot">' + icon + '</div>' +
      '<div class="tl-step-info">' +
        '<div class="tl-step-label">' + label + '</div>' +
        '<div class="tl-step-time">' + time + '</div>' +
      '</div>' +
      (dStr ? '<div class="tl-step-dur">' + dStr + '</div>' : '') +
    '</div>';
  }

  /* ─── Inject scoped CSS ─── */
  var style = document.createElement('style');
  style.textContent = [
    /* Summary cards */
    '.tl-card{flex:1;min-width:100px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;text-align:center}',
    '.tl-card-icon{font-size:20px}',
    '.tl-card-value{font-size:18px;font-weight:700;margin:2px 0}',
    '.tl-card-label{font-size:11px;color:#6b7280}',
    '.tl-card-warn{background:#fef2f2;border-color:#fecaca}',
    '.tl-card-warn .tl-card-value{color:#991b1b}',
    /* Duration cells */
    '.tl-dur{font-weight:600;font-variant-numeric:tabular-nums}',
    '.tl-na{color:#d1d5db}',
    '.tl-warn{color:#dc2626;font-weight:700}',
    '.tl-caution{color:#d97706}',
    /* Timeline steps in modal */
    '.tl-steps{display:flex;flex-direction:column;gap:0;position:relative;padding-left:18px}',
    '.tl-steps::before{content:"";position:absolute;left:27px;top:18px;bottom:18px;width:2px;background:#e5e7eb}',
    '.tl-step{display:flex;align-items:center;gap:12px;padding:10px 0;position:relative}',
    '.tl-step-dot{width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;background:#fff;border:2px solid #e5e7eb;border-radius:50%;z-index:1}',
    '.tl-step-info{flex:1}',
    '.tl-step-label{font-size:13px;font-weight:600;color:#374151}',
    '.tl-step-time{font-size:12px;color:#9ca3af}',
    '.tl-step-dur{font-size:13px;font-weight:700;color:#2563eb;background:#eff6ff;padding:2px 8px;border-radius:6px}',
    /* Dark mode */
    '[data-theme="dark"] .tl-card{background:#1f2937;border-color:#374151}',
    '[data-theme="dark"] .tl-card-label{color:#9ca3af}',
    '[data-theme="dark"] .tl-card-warn{background:#7f1d1d;border-color:#991b1b}',
    '[data-theme="dark"] .tl-card-warn .tl-card-value{color:#fca5a5}',
    '[data-theme="dark"] .tl-step-dot{background:#1f2937;border-color:#4b5563}',
    '[data-theme="dark"] .tl-step-label{color:#e5e7eb}',
    '[data-theme="dark"] .tl-step-dur{background:#1e3a5f;color:#93c5fd}'
  ].join('\n');
  document.head.appendChild(style);
})();
