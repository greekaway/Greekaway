/**
 * Admin MoveAthens Drivers Panel (embedded tab module)
 * Loaded inside admin-moveathens-ui.html as the "Οδηγοί" tab.
 * Requests table + Drivers table + Driver detail modal.
 * Does NOT grow admin-moveathens-ui.js — lives in its own file.
 */
(function () {
  'use strict';

  /* ─── helpers (scoped to avoid conflict with parent) ─── */
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
    const labels = { pending: 'Pending', sent: 'Εστάλη', accepted: 'Αποδεκτό', confirmed: 'Confirmed', expired: 'Ληγμένο', cancelled: 'Ακυρωμένο' };
    return `<span class="dr-badge ${s || ''}">${labels[s] || s || '—'}</span>`;
  }

  /* ─── lazy init: load data when drivers tab first becomes visible ─── */
  let initialised = false;

  function initIfNeeded() {
    if (initialised) return;
    initialised = true;
    bindEvents();
    loadRequests();
    loadDrivers();
  }

  // Watch the parent tab system — when "drivers" tab activates, init
  const observer = new MutationObserver(() => {
    const driversPanel = _$('.tab-content[data-tab="drivers"]');
    if (driversPanel && driversPanel.classList.contains('active')) initIfNeeded();
  });
  const contentWrap = _$('.content-wrap') || document.body;
  observer.observe(contentWrap, { subtree: true, attributes: true, attributeFilter: ['class'] });

  // Also check immediately (in case someone navigated directly)
  setTimeout(() => {
    const driversPanel = _$('.tab-content[data-tab="drivers"]');
    if (driversPanel && driversPanel.classList.contains('active')) initIfNeeded();
  }, 200);

  /* ================================================================
     REQUESTS
     ================================================================ */
  function bindEvents() {
    const filterEl = _$('#req-filter-status');
    const refreshEl = _$('#req-refresh-btn');
    if (filterEl) filterEl.addEventListener('change', loadRequests);
    if (refreshEl) refreshEl.addEventListener('click', loadRequests);

    // modal close
    const modal = _$('#driver-modal');
    const closeBtn = _$('#dm-close');
    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    if (modal) modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

    // payment button
    const payBtn = _$('#dm-pay-btn');
    if (payBtn) payBtn.addEventListener('click', recordPayment);
  }

  async function loadRequests() {
    const reqTbody = _$('#req-tbody');
    const reqEmpty = _$('#req-empty');
    if (!reqTbody) return;

    const status = (_$('#req-filter-status') || {}).value || '';
    const qs = status ? '?status=' + status : '';
    try {
      const data = await api('/api/admin/moveathens/requests' + qs);
      const list = data.requests || data || [];
      renderRequests(list, reqTbody, reqEmpty);
    } catch (e) {
      toast('Σφάλμα: ' + e.message);
    }
  }

  function renderRequests(list, tbody, empty) {
    if (!list.length) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = list.map(r => {
      const canSend = r.status === 'pending' || r.status === 'sent';
      return `<tr data-id="${r.id}">
        <td title="${r.id}">${String(r.id).slice(-6)}</td>
        <td>${r.hotel_name || '—'}</td>
        <td>${r.destination_name || '—'}</td>
        <td>${r.vehicle_name || '—'}</td>
        <td>€${parseFloat(r.price || 0).toFixed(0)}</td>
        <td>${r.passenger_name || '—'}</td>
        <td>${statusBadge(r.status)}</td>
        <td>
          ${canSend
            ? `<input class="dr-inline-input req-phone" value="${r.driver_phone || ''}" placeholder="+30…">`
            : (r.driver_phone || '—')}
        </td>
        <td style="white-space:nowrap">
          ${canSend ? `<button class="dr-btn dr-btn-primary req-send-btn" title="Αποστολή σε οδηγό">📲</button>` : ''}
          <button class="dr-btn dr-btn-danger req-del-btn" title="Διαγραφή">🗑️</button>
        </td>
      </tr>`;
    }).join('');

    // send buttons
    _$$('.req-send-btn', tbody).forEach(btn => {
      btn.addEventListener('click', async () => {
        const tr = btn.closest('tr');
        const id = tr.dataset.id;
        const phone = (_$('.req-phone', tr) || {}).value || '';
        if (!phone.trim()) { toast('Εισάγετε τηλέφωνο οδηγού'); return; }
        btn.disabled = true;
        try {
          const data = await api(`/api/admin/moveathens/requests/${id}/send-driver`, {
            method: 'POST',
            body: JSON.stringify({ driver_phone: phone.trim() })
          });
          toast('Εστάλη! Ανοίγει WhatsApp…');
          if (data.whatsapp_url) window.open(data.whatsapp_url, '_blank');
          loadRequests();
        } catch (e) {
          toast('Σφάλμα: ' + e.message);
          btn.disabled = false;
        }
      });
    });

    // delete buttons
    _$$('.req-del-btn', tbody).forEach(btn => {
      btn.addEventListener('click', async () => {
        const tr = btn.closest('tr');
        const id = tr.dataset.id;
        if (!confirm('Διαγραφή αιτήματος #' + String(id).slice(-6) + ';')) return;
        btn.disabled = true;
        try {
          await api(`/api/admin/moveathens/requests/${id}`, { method: 'DELETE' });
          toast('Διαγράφηκε');
          loadRequests();
        } catch (e) {
          toast('Σφάλμα: ' + e.message);
          btn.disabled = false;
        }
      });
    });
  }

  /* ================================================================
     DRIVERS
     ================================================================ */
  async function loadDrivers() {
    const drvTbody = _$('#drv-tbody');
    const drvEmpty = _$('#drv-empty');
    if (!drvTbody) return;

    try {
      const data = await api('/api/admin/moveathens/drivers');
      const list = data.drivers || data || [];
      renderDrivers(list, drvTbody, drvEmpty);
    } catch (e) {
      toast('Σφάλμα: ' + e.message);
    }
  }

  function renderDrivers(list, tbody, empty) {
    if (!list.length) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = list.map(d => {
      const balance = parseFloat(d.total_owed || 0) - parseFloat(d.total_paid || 0);
      const cls = balance > 0 ? 'negative' : 'positive';
      return `<tr data-id="${d.id}">
        <td>${d.name || '—'}</td>
        <td>${d.phone || '—'}</td>
        <td>${d.total_trips || 0}</td>
        <td>€${parseFloat(d.total_revenue || 0).toFixed(0)}</td>
        <td>€${parseFloat(d.total_owed || 0).toFixed(0)}</td>
        <td>€${parseFloat(d.total_paid || 0).toFixed(0)}</td>
        <td class="${cls}">€${balance.toFixed(0)}</td>
        <td>
          <button class="dr-btn dr-btn-primary drv-detail-btn" title="Λεπτομέρειες">📄</button>
          <button class="dr-btn dr-btn-danger drv-del-btn" title="Διαγραφή">🗑️</button>
        </td>
      </tr>`;
    }).join('');

    _$$('.drv-detail-btn', tbody).forEach(btn => {
      btn.addEventListener('click', () => openDriverModal(btn.closest('tr').dataset.id));
    });

    _$$('.drv-del-btn', tbody).forEach(btn => {
      btn.addEventListener('click', async () => {
        const tr = btn.closest('tr');
        const id = tr.dataset.id;
        if (!confirm('Διαγραφή οδηγού;')) return;
        btn.disabled = true;
        try {
          await api(`/api/admin/moveathens/drivers/${id}`, { method: 'DELETE' });
          toast('Διαγράφηκε');
          loadDrivers();
        } catch (e) {
          toast('Σφάλμα: ' + e.message);
          btn.disabled = false;
        }
      });
    });
  }

  /* ================================================================
     DRIVER DETAIL MODAL
     ================================================================ */
  let currentDriverId = null;

  async function openDriverModal(id) {
    currentDriverId = id;
    const modal = _$('#driver-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    _$('#dm-title').textContent = 'Φόρτωση…';
    _$('#dm-stats').innerHTML = '';
    _$('#dm-payments-tbody').innerHTML = '';
    _$('#dm-trips-tbody').innerHTML = '';

    try {
      const [driverData, paymentsData, tripsData] = await Promise.all([
        api(`/api/admin/moveathens/drivers/${id}`),
        api(`/api/admin/moveathens/drivers/${id}/payments`),
        api(`/api/admin/moveathens/drivers/${id}/requests`)
      ]);

      const d = driverData.driver || driverData;
      const payments = paymentsData.payments || paymentsData || [];
      const trips = tripsData.requests || tripsData || [];

      const balance = parseFloat(d.total_owed || 0) - parseFloat(d.total_paid || 0);
      const balCls = balance > 0 ? 'negative' : 'positive';

      _$('#dm-title').textContent = d.name || d.phone || 'Οδηγός';

      _$('#dm-stats').innerHTML = `
        <div class="dr-stat"><div class="num">${d.total_trips || 0}</div><div class="lbl">Διαδρομές</div></div>
        <div class="dr-stat"><div class="num">€${parseFloat(d.total_revenue || 0).toFixed(0)}</div><div class="lbl">Έσοδα</div></div>
        <div class="dr-stat"><div class="num">€${parseFloat(d.total_owed || 0).toFixed(0)}</div><div class="lbl">Οφειλόμενα</div></div>
        <div class="dr-stat"><div class="num">€${parseFloat(d.total_paid || 0).toFixed(0)}</div><div class="lbl">Πληρωμένα</div></div>
        <div class="dr-stat"><div class="num ${balCls}">€${balance.toFixed(0)}</div><div class="lbl">Υπόλοιπο</div></div>
      `;

      if (payments.length) {
        _$('#dm-payments-tbody').innerHTML = payments.map(p =>
          `<tr><td>${fmtDate(p.created_at)}</td><td>€${parseFloat(p.amount).toFixed(0)}</td><td>${p.note || '—'}</td></tr>`
        ).join('');
      } else {
        _$('#dm-payments-tbody').innerHTML = '<tr><td colspan="3" class="dr-empty">Δεν υπάρχουν πληρωμές</td></tr>';
      }

      if (trips.length) {
        _$('#dm-trips-tbody').innerHTML = trips.map(r =>
          `<tr><td>${fmtDate(r.created_at)}</td><td>${r.hotel_name || '—'}</td><td>${r.destination_name || '—'}</td><td>€${parseFloat(r.price || 0).toFixed(0)}</td><td>${statusBadge(r.status)}</td></tr>`
        ).join('');
      } else {
        _$('#dm-trips-tbody').innerHTML = '<tr><td colspan="5" class="dr-empty">Δεν υπάρχουν διαδρομές</td></tr>';
      }
    } catch (e) {
      toast('Σφάλμα: ' + e.message);
    }
  }

  async function recordPayment() {
    if (!currentDriverId) return;
    const amount = parseFloat((_$('#dm-pay-amount') || {}).value);
    const note = (_$('#dm-pay-note') || {}).value?.trim() || '';
    if (!amount || amount <= 0) { toast('Εισάγετε ποσό > 0'); return; }
    try {
      await api(`/api/admin/moveathens/drivers/${currentDriverId}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount, note })
      });
      toast('Πληρωμή καταχωρήθηκε ✓');
      _$('#dm-pay-amount').value = '';
      _$('#dm-pay-note').value = '';
      openDriverModal(currentDriverId);
      loadDrivers();
    } catch (e) {
      toast('Σφάλμα: ' + e.message);
    }
  }
})();
