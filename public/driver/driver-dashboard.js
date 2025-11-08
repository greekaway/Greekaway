// Driver dashboard page logic (progressive actions + animations)
(function(){
  const api = DriverAPI;
  function computeNextButtons(status){
    const s = (status||'pending').toLowerCase();
    if (s==='pending' || s==='confirmed' || s==='dispatched') return ['accepted'];
    if (s==='accepted') return ['picked','completed'];
    if (s==='picked') return ['completed'];
    return []; // completed/declined etc.
  }
  function statusClass(s){
    if (s==='accepted') return 'state-accepted';
    if (s==='picked') return 'state-picked';
    if (s==='completed') return 'state-completed';
    return '';
  }
  async function load(){
    const list = document.getElementById('driverBookings');
    if (!list) return;
    try {
      const r = await api.authed('/api/bookings');
      const bookings = (r && r.bookings) || [];
      if (!bookings.length){ list.innerHTML = '<div class="card">Δεν υπάρχουν αναθέσεις ακόμη.</div>'; return; }
      list.innerHTML = bookings.map(b => {
        const actions = computeNextButtons(b.status);
        const btns = actions.map(a => `<button class="btn act" data-action="${a}" data-id="${b.id}">${a==='accepted'?'Αποδοχή':a==='picked'?'Παραλαβή':'Ολοκλήρωση'}</button>`).join('');
        return `<div class="card booking ${statusClass(b.status)}" data-id="${b.id}">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
            <div>
              <div><b>${b.trip_title || b.booking_id}</b></div>
              <div class="meta">${b.date || ''} • ${b.pickup_point || ''} (${b.pickup_time || ''})</div>
              <div class="meta">${b.customer_name || ''}${b.customer_phone ? ' • ' + b.customer_phone : ''}</div>
            </div>
            <div><span class="badge ${b.status==='completed'?'ok':b.status==='accepted'?'gold':'warn'}">${b.status||'pending'}</span></div>
          </div>
          <div class="actions" style="margin-top:8px;">${btns || ''}<button class="btn ghost view-route" data-id="${b.id}">Δείτε Διαδρομή</button></div>
        </div>`;
      }).join('');
      bindActions(list);
    } catch(e){ list.innerHTML = '<div class="card">Σφάλμα φόρτωσης</div>'; }
  }
  function attachAction(btn){
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const status = btn.getAttribute('data-action');
        const card = btn.closest('.booking');
        btn.disabled = true; btn.textContent = '…';
        try {
          await api.authed('/api/update-status', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ booking_id: id, status }) });
          // Optimistic UI: update card before reload
          if (card){
            card.classList.remove('state-accepted','state-picked','state-completed');
            card.classList.add(statusClass(status),'fade-update');
            const badge = card.querySelector('.badge'); if (badge) badge.textContent = status; if (badge){ badge.className = 'badge ' + (status==='completed'?'ok':status==='accepted'?'gold':'warn'); }
            // Re-render buttons for new status
            const actionsWrap = card.querySelector('.actions');
            if (actionsWrap){
              const actions = computeNextButtons(status);
              actionsWrap.querySelectorAll('button.act').forEach(b=>b.remove());
              actions.forEach(a => {
                const nb = document.createElement('button');
                nb.className = 'btn act';
                nb.dataset.action = a; nb.dataset.id = id;
                nb.textContent = a==='accepted'?'Αποδοχή':a==='picked'?'Παραλαβή':'Ολοκλήρωση';
                actionsWrap.insertBefore(nb, actionsWrap.querySelector('.view-route'));
                attachAction(nb);
              });
            }
          }
          // After short delay refresh full list for consistency
          setTimeout(load, 250);
        } catch(_) {
          btn.disabled = false; btn.textContent = status==='accepted'?'Αποδοχή':status==='picked'?'Παραλαβή':'Ολοκλήρωση';
        }
      });
  }
  function bindActions(root){
    root.querySelectorAll('button.act').forEach(btn => attachAction(btn));
    root.querySelectorAll('button.view-route').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        location.href = '/driver/driver-route.html?booking=' + encodeURIComponent(id);
      });
    });
  }
  window.DriverDashboard = { init(){ DriverAuth.requireSync(); if (DriverCommon) DriverCommon.footerNav(); load(); try{ if (!window.__driverDashInterval){ window.__driverDashInterval = setInterval(load, 30000); } }catch(_){} }, load };
})();
// Auto-refresh handled from init() via setInterval(load, 30000)
