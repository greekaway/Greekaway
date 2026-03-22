/**
 * MoveAthens Hotel Revenue Dashboard — Client-side logic
 * Fetches hotel-specific stats from /api/moveathens/my-detailed-stats
 * + Route history with date navigation from /api/moveathens/my-routes
 */
(async () => {
  const MONTH_NAMES = [
    '', 'Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος',
    'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος',
    'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'
  ];

  const DAY_NAMES = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
  const MONTH_SHORT = ['', 'Ιαν', 'Φεβ', 'Μάρ', 'Απρ', 'Μάι', 'Ιούν', 'Ιούλ', 'Αύγ', 'Σεπ', 'Οκτ', 'Νοέ', 'Δεκ'];

  const fmt = (n) => {
    const num = Number(n) || 0;
    return num.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  };

  const fmtDuration = (ms) => {
    if (!ms || ms < 0) return '—';
    const totalMin = Math.round(ms / 60000);
    if (totalMin < 60) return totalMin + 'λ';
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h + 'ω ' + m + 'λ';
  };

  const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
  };

  const toDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  };

  const todayStr = () => toDateStr(new Date());

  const statusBadge = (s) => {
    switch (s) {
      case 'completed': return '<span class="ma-route-badge ma-route-badge--ok">✅ Ολοκληρώθηκε</span>';
      case 'accepted':
      case 'confirmed': return '<span class="ma-route-badge ma-route-badge--progress">⏳ Σε εξέλιξη</span>';
      case 'nodriver': return '<span class="ma-route-badge ma-route-badge--warn">❌ Χωρίς οδηγό</span>';
      case 'expired': return '<span class="ma-route-badge ma-route-badge--muted">⌛ Ληγμένο</span>';
      default: return '<span class="ma-route-badge ma-route-badge--muted">📩 Εκκρεμεί</span>';
    }
  };

  const destIcon = (name) => {
    if (!name) return '📍';
    const n = name.toLowerCase();
    if (n.includes('αεροδρόμ') || n.includes('airport') || n.includes('ελ. βενιζέλος')) return '✈️';
    if (n.includes('λιμάν') || n.includes('port') || n.includes('πειραι')) return '⚓';
    if (n.includes('ταξίδ') || n.includes('travel')) return '🧳';
    return '🏙️';
  };

  // Get hotel zone_id from localStorage
  const stored = (() => {
    try { return JSON.parse(localStorage.getItem('moveathens_hotel') || 'null'); } catch { return null; }
  })();

  if (!stored || !stored.origin_zone_id) return;

  const zoneId = stored.origin_zone_id;

  // ════════════════════════════════════════
  // PART 1: Summary Stats (existing)
  // ════════════════════════════════════════
  try {
    const res = await fetch(`/api/moveathens/my-detailed-stats?zone_id=${encodeURIComponent(zoneId)}`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();

    const el = (id) => document.getElementById(id);
    el('rev-total-requests').textContent = data.totalRequests || 0;
    el('rev-completed').textContent = data.completed || 0;
    el('rev-nodriver').textContent = data.nodriver || 0;
    el('rev-total-revenue').textContent = fmt(data.totalRevenue);
    el('rev-my-commission').textContent = fmt(data.myCommission);
    el('rev-service-commission').textContent = fmt(data.serviceCommission);

    const rt = data.routeTypes || {};
    el('rev-rt-airport').textContent = rt.airport || 0;
    el('rev-rt-port').textContent = rt.port || 0;
    el('rev-rt-city').textContent = rt.city || 0;
    el('rev-rt-travel').textContent = rt.travel || 0;

    const monthList = document.getElementById('rev-monthly');
    const months = data.months || [];
    if (months.length === 0) {
      monthList.innerHTML = '<p class="ma-rev-empty">Δεν υπάρχουν δεδομένα μηνιαίας ανάλυσης</p>';
    } else {
      monthList.innerHTML = months.map(m => `
        <div class="ma-rev-month-row">
          <div>
            <div class="ma-rev-month-name">${MONTH_NAMES[m.month_number] || m.month} ${m.year}</div>
            <div class="ma-rev-month-details">${m.total_routes} διαδρομ${m.total_routes === 1 ? 'ή' : 'ές'} · Προμ. ${fmt(m.commission_hotel)}</div>
          </div>
          <div class="ma-rev-month-amount">${fmt(m.total_revenue)}</div>
        </div>
      `).join('');
    }

    // Per-phone breakdown
    const perPhoneList = document.getElementById('rev-perphone');
    const perPhone = data.perPhone || [];
    if (perPhoneList) {
      if (perPhone.length === 0) {
        perPhoneList.innerHTML = '<p class="ma-rev-empty">Δεν υπάρχουν δεδομένα χρηστών</p>';
      } else if (perPhone.length === 1 && perPhone[0].phone === (stored.orderer_phone || '')) {
        // Only one phone and it's the current user — hide section
        const section = document.getElementById('rev-perphone-section');
        if (section) section.style.display = 'none';
      } else {
        perPhoneList.innerHTML = `
          <div class="ma-rev-perphone-header">
            <span>Τηλέφωνο</span>
            <span>Διαδρομές</span>
            <span>Τζίρος</span>
          </div>
          ${perPhone.map(p => `
            <div class="ma-rev-perphone-row${p.phone === (stored.orderer_phone || '') ? ' ma-rev-perphone-row--me' : ''}">
              <span class="ma-rev-perphone-phone">${p.phone === 'unknown' ? '—' : p.phone}${p.phone === (stored.orderer_phone || '') ? ' <em>(εσείς)</em>' : ''}</span>
              <span class="ma-rev-perphone-count">${p.routes}</span>
              <span class="ma-rev-perphone-amount">${fmt(p.revenue)}</span>
            </div>
          `).join('')}
        `;
      }
    }
  } catch (err) {
    console.error('[hotel-revenue] Stats load error:', err);
    const el = (id) => document.getElementById(id);
    ['rev-total-requests', 'rev-completed', 'rev-nodriver',
     'rev-total-revenue', 'rev-my-commission', 'rev-service-commission'].forEach(id => {
      const e = el(id);
      if (e) e.textContent = '—';
    });
    const monthList = document.getElementById('rev-monthly');
    if (monthList) monthList.innerHTML = '<p class="ma-rev-empty">Σφάλμα φόρτωσης δεδομένων</p>';
  }

  // ════════════════════════════════════════
  // PART 2: Route History with Date Navigator
  // ════════════════════════════════════════
  let currentDate = todayStr();

  const dateText = document.getElementById('rev-date-text');
  const dateBadge = document.getElementById('rev-date-badge');
  const datePicker = document.getElementById('rev-date-picker');
  const dateNext = document.getElementById('rev-date-next');
  const datePrev = document.getElementById('rev-date-prev');
  const dateLabel = document.getElementById('rev-date-label');
  const routeList = document.getElementById('rev-route-list');

  if (!dateText || !routeList) return;

  function updateDateLabel() {
    const d = new Date(currentDate + 'T00:00:00');
    const today = todayStr();
    if (currentDate === today) {
      dateText.textContent = 'Σήμερα';
    } else {
      const yesterday = toDateStr(new Date(Date.now() - 86400000));
      if (currentDate === yesterday) {
        dateText.textContent = 'Χθες';
      } else {
        dateText.textContent = DAY_NAMES[d.getDay()] + ' ' + d.getDate() + ' ' + MONTH_SHORT[d.getMonth() + 1];
      }
    }

    // Disable "next" if already today
    if (dateNext) {
      dateNext.disabled = currentDate >= today;
      dateNext.classList.toggle('ma-date-nav__btn--disabled', currentDate >= today);
    }

    if (datePicker) {
      datePicker.value = currentDate;
      datePicker.max = today;
    }
  }

  function renderRouteCard(r) {
    const timelineHtml = r.status === 'completed' && r.dur_total
      ? `<div class="ma-route-timeline">
           <div class="ma-route-tl-step"><span class="ma-route-tl-icon">🚗</span><span class="ma-route-tl-label">Ξενοδοχείο</span><span class="ma-route-tl-dur">${fmtDuration(r.dur_to_hotel)}</span></div>
           <div class="ma-route-tl-step"><span class="ma-route-tl-icon">⏳</span><span class="ma-route-tl-label">Αναμονή</span><span class="ma-route-tl-dur">${fmtDuration(r.dur_waiting)}</span></div>
           <div class="ma-route-tl-step"><span class="ma-route-tl-icon">🎯</span><span class="ma-route-tl-label">Προορισμός</span><span class="ma-route-tl-dur">${fmtDuration(r.dur_to_dest)}</span></div>
           <div class="ma-route-tl-total"><span>⏱️ Σύνολο</span><span>${fmtDuration(r.dur_total)}</span></div>
         </div>`
      : '';

    const driverHtml = r.driver_name
      ? `<div class="ma-route-meta__item">🧑‍✈️ ${r.driver_name}${r.vehicle_name ? ' · ' + r.vehicle_name : ''}</div>`
      : '';

    const passengerHtml = r.passenger_name
      ? `<div class="ma-route-meta__item">👤 ${r.passenger_name}${r.passengers > 1 ? ' +' + (r.passengers - 1) : ''}</div>`
      : '';

    const paymentIcon = r.payment_method === 'pos' ? '💳' : '💵';
    const timeStr = r.scheduled_time || fmtTime(r.accepted_at || r.created_at);

    return `
      <div class="ma-route-entry">
        <div class="ma-route-header">
          <div class="ma-route-dest">
            <span class="ma-route-dest__icon">${destIcon(r.destination_name)}</span>
            <span class="ma-route-dest__name">${r.destination_name}</span>
          </div>
          <span class="ma-route-time">${timeStr}</span>
        </div>
        <div class="ma-route-body">
          ${statusBadge(r.status)}
          <div class="ma-route-meta">
            ${driverHtml}
            ${passengerHtml}
          </div>
          <div class="ma-route-price">
            <span>${paymentIcon} ${fmt(r.price)}</span>
            <span class="ma-route-commission">Προμ. ${fmt(r.commission_hotel)}</span>
          </div>
        </div>
        ${timelineHtml}
      </div>`;
  }

  async function loadRoutes() {
    routeList.innerHTML = '<p class="ma-rev-empty">Φόρτωση...</p>';
    updateDateLabel();

    try {
      const res = await fetch(`/api/moveathens/my-routes?zone_id=${encodeURIComponent(zoneId)}&date=${encodeURIComponent(currentDate)}`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      const routes = data.routes || [];

      if (dateBadge) {
        dateBadge.textContent = routes.length > 0 ? routes.length : '';
        dateBadge.style.display = routes.length > 0 ? '' : 'none';
      }

      if (routes.length === 0) {
        routeList.innerHTML = '<p class="ma-rev-empty">Δεν υπάρχουν διαδρομές αυτή την ημέρα</p>';
        return;
      }

      routeList.innerHTML = routes.map(renderRouteCard).join('');
    } catch (err) {
      console.error('[hotel-revenue] Routes load error:', err);
      routeList.innerHTML = '<p class="ma-rev-empty">Δεν υπάρχουν διαδρομές ακόμα</p>';
    }
  }

  function shiftDate(days) {
    const d = new Date(currentDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    const newDate = toDateStr(d);
    if (newDate > todayStr()) return;
    currentDate = newDate;
    loadRoutes();
  }

  // Event listeners
  if (datePrev) datePrev.addEventListener('click', () => shiftDate(-1));
  if (dateNext) dateNext.addEventListener('click', () => shiftDate(1));
  if (dateLabel) dateLabel.addEventListener('click', () => datePicker && datePicker.showPicker());
  if (datePicker) datePicker.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val && val <= todayStr()) {
      currentDate = val;
      loadRoutes();
    }
  });

  // Initial load
  loadRoutes();
})();
