/**
 * DriversSystem — Appointments (Πελάτες & Ραντεβού)
 * Personal appointment notebook for drivers.
 * Data is private per driver, not visible in admin panel.
 */
(async () => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // ── Auth guard ──
  const phone = localStorage.getItem('ds_driver_phone');
  if (!phone) {
    const prefix = window.DriversSystemConfig ? window.DriversSystemConfig.getRoutePrefix() : '/driverssystem';
    window.location.href = prefix + '/profile';
    return;
  }

  // ── Config ──
  if (window.DriversSystemConfig) {
    await window.DriversSystemConfig.load();
  }

  const BASE = '/api/driverssystem/appointments';

  // ── State ──
  let appointments = [];
  let activeFilter = 'upcoming';
  let activeView = 'list'; // list | calendar
  let editingId = null;
  let selectedStatus = 'pending';
  let calYear, calMonth; // calendar state
  let calSelectedDate = null;

  // ── DOM refs ──
  const listEl       = $('[data-ds-appt-list]');
  const emptyEl      = $('[data-ds-appt-empty]');
  const listView     = $('[data-ds-appt-list-view]');
  const calView      = $('[data-ds-appt-calendar-view]');
  const filtersRow   = $('[data-ds-appt-filters]');
  const overlay      = $('[data-ds-appt-overlay]');
  const dialogTitle  = $('[data-ds-appt-dialog-title]');
  const form         = $('[data-ds-appt-form]');
  const clientInput  = $('[data-ds-appt-client]');
  const phoneInput   = $('[data-ds-appt-phone]');
  const dateInput    = $('[data-ds-appt-date]');
  const timeInput    = $('[data-ds-appt-time]');
  const pickupInput  = $('[data-ds-appt-pickup]');
  const dropoffInput = $('[data-ds-appt-dropoff]');
  const amountInput  = $('[data-ds-appt-amount]');
  const noteInput    = $('[data-ds-appt-note]');
  const editIdInput  = $('[data-ds-appt-edit-id]');
  const deleteBtn    = $('[data-ds-appt-delete]');
  const calMonthEl   = $('[data-ds-appt-cal-month]');
  const calGrid      = $('[data-ds-appt-cal-grid]');
  const calAgenda    = $('[data-ds-appt-cal-agenda]');
  const calAgendaTitle = $('[data-ds-appt-cal-agenda-title]');
  const calAgendaList  = $('[data-ds-appt-cal-agenda-list]');

  // ── Back button ──
  const backBtn = $('[data-ds-appt-back]');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      const prefix = window.DriversSystemConfig ? window.DriversSystemConfig.getRoutePrefix() : '/driverssystem';
      window.location.href = prefix + '/profile';
    });
  }

  // ══════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════

  const fmtMoney = (v) => {
    const n = parseFloat(v) || 0;
    if (n === 0) return '';
    return n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  };

  const greeceDateStr = () => {
    const now = new Date();
    const gr = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Athens' }));
    return gr.getFullYear() + '-' + String(gr.getMonth() + 1).padStart(2, '0') + '-' + String(gr.getDate()).padStart(2, '0');
  };

  const greeceNow = () => {
    const now = new Date();
    return new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Athens' }));
  };

  const fmtDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  const fmtDateShort = (iso) => {
    if (!iso) return '';
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
  };

  const fmtTime = (t) => t || '';

  const escHtml = (s) => {
    const div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  };

  const GREEK_MONTHS = [
    'Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος',
    'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'
  ];

  const GREEK_DAYS_SHORT = ['Κυ', 'Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα'];

  const todayStr = () => greeceDateStr();

  const tomorrowStr = () => {
    const gr = greeceNow();
    gr.setDate(gr.getDate() + 1);
    return gr.getFullYear() + '-' + String(gr.getMonth() + 1).padStart(2, '0') + '-' + String(gr.getDate()).padStart(2, '0');
  };

  const weekEndStr = () => {
    const gr = greeceNow();
    gr.setDate(gr.getDate() + 7);
    return gr.getFullYear() + '-' + String(gr.getMonth() + 1).padStart(2, '0') + '-' + String(gr.getDate()).padStart(2, '0');
  };

  const dayLabel = (iso) => {
    const today = todayStr();
    const tomorrow = tomorrowStr();
    if (iso === today) return 'Σήμερα';
    if (iso === tomorrow) return 'Αύριο';
    // Show day name + date
    const d = new Date(iso + 'T00:00:00');
    return GREEK_DAYS_SHORT[d.getDay()] + ' ' + fmtDateShort(iso);
  };

  // ══════════════════════════════════════
  // API
  // ══════════════════════════════════════

  async function fetchAppointments() {
    try {
      const res = await fetch(`${BASE}?driverId=${encodeURIComponent(phone)}`);
      if (!res.ok) throw new Error();
      appointments = await res.json();
    } catch (_) {
      appointments = [];
    }
    renderCurrentView();
  }

  async function saveAppointment(data) {
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `${BASE}/${editingId}` : BASE;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Save failed');
    return res.json();
  }

  async function removeAppointment(id) {
    const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
  }

  // ══════════════════════════════════════
  // FILTERING
  // ══════════════════════════════════════

  function filterAppointments() {
    const today = todayStr();
    const tomorrow = tomorrowStr();
    const weekEnd = weekEndStr();

    let filtered = appointments;

    switch (activeFilter) {
      case 'today':
        filtered = appointments.filter(a => a.date === today);
        break;
      case 'tomorrow':
        filtered = appointments.filter(a => a.date === tomorrow);
        break;
      case 'week':
        filtered = appointments.filter(a => a.date >= today && a.date <= weekEnd);
        break;
      case 'upcoming':
        filtered = appointments.filter(a => a.date >= today && a.status !== 'cancelled');
        break;
      case 'all':
        // All, newest first
        break;
    }

    // Sort: pending first by date/time asc, then completed, then cancelled
    const statusOrder = { pending: 0, completed: 1, cancelled: 2 };
    filtered.sort((a, b) => {
      const sa = statusOrder[a.status] || 0;
      const sb = statusOrder[b.status] || 0;
      if (sa !== sb) return sa - sb;
      const dc = (a.date || '').localeCompare(b.date || '');
      if (dc !== 0) return dc;
      return (a.time || '').localeCompare(b.time || '');
    });

    return filtered;
  }

  // ══════════════════════════════════════
  // RENDER — LIST VIEW
  // ══════════════════════════════════════

  function renderCurrentView() {
    if (activeView === 'list') {
      renderList();
    } else {
      renderCalendar();
    }
  }

  function renderList() {
    const filtered = filterAppointments();

    // Clear existing cards + day headers
    listEl.querySelectorAll('.ds-appt-card, .ds-appt-day-header').forEach(el => el.remove());

    if (filtered.length === 0) {
      emptyEl.style.display = '';
      return;
    }

    emptyEl.style.display = 'none';

    // Group by date
    const groups = {};
    filtered.forEach(a => {
      const key = a.date || 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });

    // Render groups
    Object.keys(groups).sort().forEach(dateKey => {
      // Day header
      const header = document.createElement('div');
      header.className = 'ds-appt-day-header';
      header.textContent = dayLabel(dateKey);
      listEl.appendChild(header);

      // Cards
      groups[dateKey].forEach((a, i) => {
        const card = buildCard(a);
        card.style.animationDelay = `${i * 0.04}s`;
        listEl.appendChild(card);
      });
    });
  }

  function buildCard(a) {
    const card = document.createElement('div');
    card.className = 'ds-appt-card';
    if (a.status === 'completed') card.classList.add('ds-appt-card--completed');
    if (a.status === 'cancelled') card.classList.add('ds-appt-card--cancelled');
    card.setAttribute('data-ds-appt-id', a.id);

    const timeDisplay = a.time || '—';
    const dayDisplay = fmtDateShort(a.date);

    // Build route string
    let routeHtml = '';
    if (a.pickup || a.dropoff) {
      const p = escHtml(a.pickup || '—');
      const d = escHtml(a.dropoff || '—');
      routeHtml = `<span class="ds-appt-card__route">${p}<span class="ds-appt-card__route-arrow">→</span>${d}</span>`;
    }

    // Note
    const noteHtml = a.note ? `<span class="ds-appt-card__note">📝 ${escHtml(a.note)}</span>` : '';

    // Phone
    const phoneHtml = a.phone ? `<span class="ds-appt-card__phone">📞 ${escHtml(a.phone)}</span>` : '';

    // Status badge (only for completed/cancelled)
    let statusHtml = '';
    if (a.status === 'completed') {
      statusHtml = '<span class="ds-appt-card__status ds-appt-card__status--completed">✓ Ολοκληρώθηκε</span>';
    } else if (a.status === 'cancelled') {
      statusHtml = '<span class="ds-appt-card__status ds-appt-card__status--cancelled">✕ Ακυρώθηκε</span>';
    }

    card.innerHTML = `
      <div class="ds-appt-card__time-badge">
        <span class="ds-appt-card__time-badge-time">${escHtml(timeDisplay)}</span>
        <span class="ds-appt-card__time-badge-day">${escHtml(dayDisplay)}</span>
      </div>
      <div class="ds-appt-card__body">
        <span class="ds-appt-card__client">${escHtml(a.clientName || '—')}</span>
        ${routeHtml}
        ${phoneHtml}
        ${noteHtml}
        ${statusHtml}
      </div>
      ${a.amount ? `<span class="ds-appt-card__amount">${fmtMoney(a.amount)}</span>` : ''}
    `;

    card.addEventListener('click', () => openEdit(a));
    return card;
  }

  // ══════════════════════════════════════
  // RENDER — CALENDAR VIEW
  // ══════════════════════════════════════

  function initCalendar() {
    const gr = greeceNow();
    calYear = gr.getFullYear();
    calMonth = gr.getMonth();
    calSelectedDate = todayStr();
  }

  function renderCalendar() {
    if (!calYear) initCalendar();

    // Month label
    calMonthEl.textContent = GREEK_MONTHS[calMonth] + ' ' + calYear;

    // First day of month
    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth + 1, 0);
    const startWeekday = (firstDay.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = lastDay.getDate();

    // Count appointments per date this month
    const prefix = calYear + '-' + String(calMonth + 1).padStart(2, '0');
    const countByDate = {};
    appointments.forEach(a => {
      if (a.date && a.date.startsWith(prefix)) {
        countByDate[a.date] = (countByDate[a.date] || 0) + 1;
      }
    });

    // Build grid
    calGrid.innerHTML = '';
    const today = todayStr();

    // Padding for days before first of month
    for (let i = 0; i < startWeekday; i++) {
      const prevMonth = new Date(calYear, calMonth, -(startWeekday - 1 - i));
      const el = document.createElement('div');
      el.className = 'ds-appt-cal-day ds-appt-cal-day--other';
      el.textContent = prevMonth.getDate();
      calGrid.appendChild(el);
    }

    // Days of month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const el = document.createElement('div');
      el.className = 'ds-appt-cal-day';

      if (dateStr === today) el.classList.add('ds-appt-cal-day--today');
      if (dateStr === calSelectedDate) el.classList.add('ds-appt-cal-day--selected');

      el.textContent = d;

      // Dot for appointments
      const cnt = countByDate[dateStr] || 0;
      if (cnt > 0) {
        const dot = document.createElement('span');
        dot.className = 'ds-appt-cal-dot' + (cnt > 1 ? ' ds-appt-cal-dot--multi' : '');
        el.appendChild(dot);
      }

      el.addEventListener('click', () => {
        calSelectedDate = dateStr;
        renderCalendar();
      });

      calGrid.appendChild(el);
    }

    // Padding after last day
    const endWeekday = (lastDay.getDay() + 6) % 7;
    for (let i = 1; i <= (6 - endWeekday); i++) {
      const el = document.createElement('div');
      el.className = 'ds-appt-cal-day ds-appt-cal-day--other';
      el.textContent = i;
      calGrid.appendChild(el);
    }

    // Render agenda for selected date
    renderAgenda();
  }

  function renderAgenda() {
    if (!calSelectedDate) {
      calAgenda.style.display = 'none';
      return;
    }

    const dayAppts = appointments
      .filter(a => a.date === calSelectedDate)
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    if (dayAppts.length === 0) {
      calAgenda.style.display = 'none';
      return;
    }

    calAgenda.style.display = '';
    calAgendaTitle.textContent = dayLabel(calSelectedDate) + ` (${dayAppts.length})`;

    calAgendaList.innerHTML = '';
    dayAppts.forEach(a => {
      const item = document.createElement('div');
      item.className = 'ds-appt-cal-agenda-item';

      let routeStr = '';
      if (a.pickup || a.dropoff) {
        routeStr = (a.pickup || '—') + ' → ' + (a.dropoff || '—');
      }

      item.innerHTML = `
        <span class="ds-appt-cal-agenda-time">${escHtml(a.time || '—')}</span>
        <div class="ds-appt-cal-agenda-info">
          <div class="ds-appt-cal-agenda-client">${escHtml(a.clientName || '—')}</div>
          ${routeStr ? `<div class="ds-appt-cal-agenda-route">${escHtml(routeStr)}</div>` : ''}
        </div>
        ${a.amount ? `<span class="ds-appt-cal-agenda-amount">${fmtMoney(a.amount)}</span>` : ''}
      `;

      item.addEventListener('click', () => openEdit(a));
      calAgendaList.appendChild(item);
    });
  }

  // Calendar navigation
  const calPrev = $('[data-ds-appt-cal-prev]');
  const calNext = $('[data-ds-appt-cal-next]');
  if (calPrev) calPrev.addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); });
  if (calNext) calNext.addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); });

  // ══════════════════════════════════════
  // VIEW TOGGLE (List / Calendar)
  // ══════════════════════════════════════

  $$('[data-ds-appt-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-ds-appt-view]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeView = btn.getAttribute('data-ds-appt-view');

      if (activeView === 'list') {
        listView.style.display = '';
        calView.style.display = 'none';
        filtersRow.style.display = '';
        renderList();
      } else {
        listView.style.display = 'none';
        calView.style.display = '';
        filtersRow.style.display = 'none';
        initCalendar();
        renderCalendar();
      }
    });
  });

  // ══════════════════════════════════════
  // FILTER PILLS
  // ══════════════════════════════════════

  $$('[data-ds-appt-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-ds-appt-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.getAttribute('data-ds-appt-filter');
      renderList();
    });
  });

  // ══════════════════════════════════════
  // ADD / EDIT OVERLAY
  // ══════════════════════════════════════

  const addBtn = $('[data-ds-appt-add]');
  if (addBtn) addBtn.addEventListener('click', () => openAdd());

  function openAdd() {
    editingId = null;
    dialogTitle.textContent = 'Νέο Ραντεβού';
    deleteBtn.style.display = 'none';
    clientInput.value = '';
    phoneInput.value = '';
    dateInput.value = greeceDateStr();
    timeInput.value = '';
    pickupInput.value = '';
    dropoffInput.value = '';
    amountInput.value = '';
    noteInput.value = '';
    setStatus('pending');
    overlay.style.display = '';
    clientInput.focus();
  }

  function openEdit(appt) {
    editingId = appt.id;
    dialogTitle.textContent = 'Επεξεργασία';
    deleteBtn.style.display = '';
    clientInput.value = appt.clientName || '';
    phoneInput.value = appt.phone || '';
    dateInput.value = appt.date || '';
    timeInput.value = appt.time || '';
    pickupInput.value = appt.pickup || '';
    dropoffInput.value = appt.dropoff || '';
    amountInput.value = appt.amount || '';
    noteInput.value = appt.note || '';
    setStatus(appt.status || 'pending');
    overlay.style.display = '';
  }

  // ── Status toggle ──
  function setStatus(status) {
    selectedStatus = status;
    $$('[data-ds-appt-status]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-ds-appt-status') === status);
    });
  }

  $$('[data-ds-appt-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      setStatus(btn.getAttribute('data-ds-appt-status'));
    });
  });

  // ── Close overlay ──
  const cancelBtn = $('[data-ds-appt-cancel]');
  if (cancelBtn) cancelBtn.addEventListener('click', closeOverlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay();
  });

  function closeOverlay() {
    overlay.style.display = 'none';
    editingId = null;
  }

  // ── Save ──
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const clientName = (clientInput.value || '').trim();
    if (!clientName) return;
    if (!dateInput.value) return;

    const data = {
      driverId: phone,
      clientName,
      phone: (phoneInput.value || '').trim(),
      date: dateInput.value,
      time: (timeInput.value || '').trim(),
      pickup: (pickupInput.value || '').trim(),
      dropoff: (dropoffInput.value || '').trim(),
      amount: parseFloat(amountInput.value) || 0,
      note: (noteInput.value || '').trim(),
      status: selectedStatus
    };

    try {
      await saveAppointment(data);
      if (navigator.vibrate) navigator.vibrate(30);
      closeOverlay();
      await fetchAppointments();
    } catch (_) {
      // Silently fail — retry
    }
  });

  // ══════════════════════════════════════
  // DELETE (entries-style dynamic confirm)
  // ══════════════════════════════════════

  const showDeleteConfirm = (label) => {
    return new Promise((resolve) => {
      const existing = document.getElementById('dsApptDeleteConfirm');
      if (existing) existing.remove();

      const overlayEl = document.createElement('div');
      overlayEl.id = 'dsApptDeleteConfirm';
      overlayEl.className = 'ds-confirm-overlay';
      overlayEl.innerHTML = `
        <div class="ds-confirm-dialog" role="dialog" aria-modal="true">
          <div class="ds-confirm-dialog__icon">🗑️</div>
          <h3 class="ds-confirm-dialog__title">Διαγραφή Ραντεβού</h3>
          <p class="ds-confirm-dialog__body">${
            label
              ? `<strong>${escHtml(label)}</strong><br>Είσαι σίγουρος ότι θέλεις να διαγράψεις αυτό το ραντεβού;`
              : 'Είσαι σίγουρος ότι θέλεις να διαγράψεις αυτό το ραντεβού;'
          }</p>
          <div class="ds-confirm-dialog__actions">
            <button class="ds-confirm-btn ds-confirm-btn--cancel" data-ds-appt-confirm-cancel>Άκυρο</button>
            <button class="ds-confirm-btn ds-confirm-btn--danger" data-ds-appt-confirm-ok>Διαγραφή</button>
          </div>
        </div>`;

      document.body.appendChild(overlayEl);

      const okBtn     = overlayEl.querySelector('[data-ds-appt-confirm-ok]');
      const cancelBtn = overlayEl.querySelector('[data-ds-appt-confirm-cancel]');

      const close = (result) => {
        overlayEl.remove();
        document.removeEventListener('keydown', onKey);
        resolve(result);
      };

      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(false); }
      };

      okBtn.addEventListener('click', () => close(true));
      cancelBtn.addEventListener('click', () => close(false));
      overlayEl.addEventListener('click', (e) => {
        if (e.target === overlayEl) close(false);
      });
      document.addEventListener('keydown', onKey);
      setTimeout(() => { try { okBtn.focus(); } catch (_) {} }, 30);
    });
  };

  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!editingId) return;
      const appt = appointments.find(a => a.id === editingId);
      const lbl = appt ? `${appt.clientName || '—'} — ${fmtDate(appt.date)} ${appt.time || ''}` : '';
      const confirmed = await showDeleteConfirm(lbl);
      if (!confirmed) return;
      try {
        await removeAppointment(editingId);
        if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
        closeOverlay();
        await fetchAppointments();
      } catch (_) {
        // Silently fail
      }
    });
  }

  // ══════════════════════════════════════
  // INIT
  // ══════════════════════════════════════

  await fetchAppointments();
})();
