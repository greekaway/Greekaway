/* Provider Bookings Module */
// Provider Bookings Module (restored legacy modal + filters styling relies on provider.css)
(function(){
  // Auth guard: redirect early if token missing
  if (window.ProviderAuth) { window.ProviderAuth.requireSync(); }
  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, (s) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s] || s));
  }

  function ensureModal(){
    let wrap = document.getElementById('booking-modal-wrapper');
    if (!wrap){
      wrap = document.createElement('div');
      wrap.id = 'booking-modal-wrapper';
      wrap.innerHTML = `<div class="modal-backdrop" data-close></div>
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="bookingModalTitle">
          <div class="modal-header">
            <h2 id="bookingModalTitle">Λεπτομέρειες Κράτησης</h2>
            <button type="button" class="close-btn" data-close aria-label="Κλείσιμο">×</button>
          </div>
          <div class="modal-body" id="bookingModalBody">Φόρτωση…</div>
        </div>`;
      document.body.appendChild(wrap);
      wrap.addEventListener('click', (e) => { if (e.target.matches('[data-close]')) closeModal(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    }
    return wrap;
  }
  function closeModal(){
    const wrap = document.getElementById('booking-modal-wrapper');
    if (wrap){ wrap.classList.remove('show'); setTimeout(()=>{ wrap.style.display='none'; }, 180); document.body.classList.remove('no-scroll'); }
  }

  async function openDetails(id){
    const wrap = ensureModal();
    const body = wrap.querySelector('#bookingModalBody');
    body.innerHTML = 'Φόρτωση…';
    wrap.style.display='block';
    requestAnimationFrame(()=>wrap.classList.add('show'));
    document.body.classList.add('no-scroll');
    try {
      const r = await ProviderAPI.authed(`/api/bookings/${id}`);
      const bk = r && r.booking ? r.booking : null;
      if (!bk) { body.innerHTML = '<div class="error">Δεν βρέθηκε η κράτηση</div>'; return; }
      let meta = bk.metadata || {};
      try { if (typeof meta === 'string') meta = JSON.parse(meta); } catch(_) {}
      const dropoff = meta.dropoff_point || meta.dropoff || meta.to || meta.end_location || '—';
      let suitcasesText = '';
      if (bk.suitcases_json){
        try { const arr = JSON.parse(bk.suitcases_json); if (Array.isArray(arr)) suitcasesText = arr.join(', '); else if (arr) suitcasesText = String(arr); } catch(_) {}
      } else if (bk.suitcases && Array.isArray(bk.suitcases)) { suitcasesText = bk.suitcases.join(', '); }
      const luggageDisplay = suitcasesText || (meta.luggage || meta.suitcases ? String(meta.luggage || meta.suitcases) : '') || '—';
      const special = bk.special_requests || meta.special_requests || meta.notes || '—';
      const pickup = bk.pickup_location || bk.pickup_point || meta.pickup_point || meta.pickup || '—';
      const pickupTime = meta.pickup_time || meta.time || '—';
      const people = bk.seats || meta.people || meta.seats || '—';
      const customerName = bk.user_name || meta.customer_name || '—';
      const customerPhone = (meta.customer_phone || bk.customer_phone || '') ? `<a href="tel:${meta.customer_phone || bk.customer_phone}" class="phone-link">${meta.customer_phone || bk.customer_phone}</a>` : '—';
      body.innerHTML = `
        <div class="details-grid">
          <div class="row"><div class="label">Pick-up:</div><div class="value">${escapeHtml(pickup)}</div></div>
          <div class="row"><div class="label">Drop-off:</div><div class="value">${escapeHtml(dropoff)}</div></div>
          <div class="row"><div class="label">Ώρα:</div><div class="value">${escapeHtml(pickupTime)}</div></div>
          <div class="row"><div class="label">Άτομα:</div><div class="value">${escapeHtml(String(people))}</div></div>
          <div class="row"><div class="label">Αποσκευές:</div><div class="value">${escapeHtml(luggageDisplay)}</div></div>
          <div class="row"><div class="label">Ειδικές Οδηγίες:</div><div class="value">${escapeHtml(special)}</div></div>
          <div class="row"><div class="label">Πελάτης:</div><div class="value">${escapeHtml(customerName)}</div></div>
          <div class="row"><div class="label">Τηλέφωνο:</div><div class="value">${customerPhone}</div></div>
        </div>`;
    } catch (_) {
      body.innerHTML = '<div class="error">Σφάλμα φόρτωσης στοιχείων</div>';
    }
  }

  async function init(){
    if (window.ProviderAuth) { window.ProviderAuth.requireSync(); }
    Theme.init();
    footerNav();
    const container = document.getElementById('bookings');
    // Preload drivers (active) for assignment feature
    let drivers = [];
    try {
      const drRes = await ProviderAPI.authed('/api/drivers');
      drivers = (drRes && drRes.drivers || []).filter(d => d.status === 'active');
    } catch(_){ drivers = []; }
    async function renderOnce(){
      const r = await ProviderAPI.authed('/api/bookings');
      const bookings = (r && r.bookings) || [];
      container.innerHTML = bookings.map(b => `
        <div class="card booking-item" data-status="${b.status}">
          <div class="booking">
            <div>
              <div><b>${b.trip_title || b.booking_id}</b> <small class="muted">#${b.booking_id.slice(0,6)}</small></div>
              <div class="meta">${b.date} • ${b.pickup_point} (${b.pickup_time})</div>
              <div class="meta">Πελάτης: ${b.customer_name || ''}</div>
              ${b.luggage ? (`<div class=\"meta\">Αποσκευές: ${b.luggage}</div>`) : ''}
              ${b.special_requests ? (`<div class=\"meta\">Σχόλια: ${b.special_requests}</div>`) : ''}
              ${b.map_link ? `<div class=\"meta\"><a href=\"${b.map_link}\" target=\"_blank\" rel=\"noopener\">Χάρτης</a></div>` : ''}
            </div>
            <div class="status-top"><span class="badge ${b.status==='completed'?'success':b.status==='declined'?'error':'info'}">${b.status}</span></div>
          </div>
          <div class="actions" data-id="${b.booking_id}">
            <button class="btn" data-action="view" aria-label="Προβολή κράτησης">Προβολή</button>
            ${b.customer_phone ? ('<a href="tel:' + (b.customer_phone) + '" class="btn call" aria-label="Κλήση στον/στην ' + (b.customer_name || '') + '"><span class="phone-icon">📞</span> Κλήση</a>') : ''}
            <div class="assign-row" data-booking="${b.booking_id}">
              ${drivers.length === 0 ? renderNoDriversUI() : renderAssignControl(b, drivers)}
            </div>
          </div>
          
        </div>`).join('');
    }
    try {
      await renderOnce();
      // Filters
      const bar = document.getElementById('filters');
      if (bar) {
        bar.addEventListener('click', (e) => {
          const btn = e.target.closest('.filter-btn');
          if (!btn) return;
          bar.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
          btn.classList.add('active');
          const mode = btn.getAttribute('data-filter');
          const items = container.querySelectorAll('.booking-item');
          items.forEach(it => {
            const st = (it.getAttribute('data-status')||'').toLowerCase();
            let show = true;
            if (mode === 'new') show = (st === 'dispatched');
            else if (mode === 'progress') show = (st === 'accepted' || st === 'picked');
            else if (mode === 'completed') show = (st === 'completed');
            else show = true; // all
            it.style.display = show ? '' : 'none';
          });
        });
      }

      container.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]'); if (!btn) return;
        const card = btn.closest('.actions');
        const id = card.getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        if (action === 'view'){ openDetails(id); return; }
        try {
          await ProviderAPI.authed(`/api/bookings/${id}/action`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action }) });
          btn.textContent = 'OK'; setTimeout(() => renderOnce(), 250);
        } catch(_) { alert('Αποτυχία ενέργειας'); }
      });

      // Assignment handlers: select a driver from dropdown, then click the Assign button
      // Do NOT auto-assign on select change; wait for explicit button click
      container.addEventListener('click', async (e) => {
        const assignBtn = e.target.closest('button.do-assign');
        if (!assignBtn) return;
        const wrap = assignBtn.closest('.assign-row');
        const bookingId = wrap.getAttribute('data-booking') || assignBtn.getAttribute('data-booking');
        const sel = wrap.querySelector('select.assign-select');
        const driverId = sel && sel.value;
        if (!driverId) { alert('Επιλέξτε οδηγό'); return; }
        await assignDriver(bookingId, driverId, wrap);
      });

    } catch (e) {
      container.innerHTML = `<div class="card">Σφάλμα φόρτωσης</div>`;
    }
    // Auto-refresh every 15s (lightweight: re-fetch and re-render, preserve event handlers)
    try { if (!window.__providerBookingsInterval){ window.__providerBookingsInterval = setInterval(() => { renderOnce().catch(()=>{}); }, 15000); } } catch(_){ }
  }

  window.ProviderBookings = { init };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
})();

function renderAssignControl(b, drivers){
  if (b.assigned_driver_id){
    const drv = drivers.find(d => d.id === b.assigned_driver_id);
    const name = drv ? drv.name : 'Οδηγός';
    return `<button class="btn assigned" disabled title="Ανατέθηκε στον ${escapeHtml(name)}">✅ Ανατέθηκε</button>`;
  }
  return (
    `<button class="btn do-assign" data-booking="${b.booking_id}">Ανάθεση</button>` +
    renderSelect(b.booking_id, drivers)
  );
}

function renderNoDriversUI(){
  // Disabled assign button + disabled select to preserve layout
  return `<button class="btn disabled" disabled title="Δεν υπάρχουν οδηγοί">Ανάθεση</button>` +
    `<select class="assign-select" disabled><option>Οδηγοί</option></select>`;
}

function renderSelect(bookingId, drivers){
  return `<select data-assign="${bookingId}" class="assign-select">` +
    `<option value="" selected disabled>Οδηγοί</option>` +
    drivers.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('') +
    `</select>`;
}

async function assignDriver(bookingId, driverId, mountEl){
  try {
    mountEl.innerHTML = '<div class="meta">Αποθήκευση…</div>';
    await ProviderAPI.authed('/api/assign-driver', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ booking_id: bookingId, driver_id: driverId }) });
    // Fetch driver list again to show name (optional optimization: local lookup)
    let drivers = [];
    try { const drRes = await ProviderAPI.authed('/api/drivers'); drivers = (drRes && drRes.drivers)||[]; } catch(_){ }
    const drv = drivers.find(d => d.id === driverId);
    mountEl.innerHTML = `<button class="btn assigned" disabled title="Ανατέθηκε στον ${escapeHtml(drv ? drv.name : 'Οδηγός')}">✅ Ανατέθηκε</button>`;
  } catch(e){
    mountEl.innerHTML = `<button class="btn disabled" disabled title="Σφάλμα ανάθεσης">Σφάλμα</button>`;
  }
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, (s) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s] || s));
}
