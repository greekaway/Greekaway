(function(){
  // Capture admin basic auth on login submit so we can call our endpoints
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('auth');
    if (form && !window.GA_ADMIN_AUTH_WIRED){
      window.GA_ADMIN_AUTH_WIRED = true;
      form.addEventListener('submit', () => {
        try {
          const user = document.getElementById('user').value || '';
          const pass = document.getElementById('pass').value || '';
          window.GA_ADMIN_AUTH = 'Basic ' + btoa(user + ':' + pass);
        } catch(_) {}
        // defer table augmentation a bit to allow admin-ui.js to render rows
        setTimeout(setupDispatchColumn, 1200);
      });
    }
  });

  function setupDispatchColumn(){
    const tbl = document.getElementById('bookingsTable'); if (!tbl) return;
    const theadRow = tbl.querySelector('thead tr'); if (!theadRow) return;
    if (!theadRow.querySelector('th.ga-dispatch')){
      const th = document.createElement('th'); th.className = 'ga-dispatch'; th.textContent = 'Dispatch';
      theadRow.appendChild(th);
    }
    refreshDispatchCells();
    // Rebuild on periodic updates
    setInterval(refreshDispatchCells, 10000);
  }

  function refreshDispatchCells(){
    const tbl = document.getElementById('bookingsTable'); if (!tbl) return;
    const tbody = tbl.querySelector('tbody'); if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    if (!rows.length) return;
    // Ensure a trailing TD for dispatch exists per row
    const ids = [];
    rows.forEach(tr => {
      const idCell = tr.children[0]; // booking id
      const bid = idCell ? (idCell.textContent||'').trim() : '';
      if (bid) ids.push(bid);
      if (!tr.querySelector('td.ga-dispatch')){
        const td = document.createElement('td'); td.className = 'ga-dispatch dispatch-cell'; td.textContent = '—'; tr.appendChild(td);
      }
    });
    // fetch statuses
    const auth = window.GA_ADMIN_AUTH;
    if (!auth) return; // wait until login captured
    fetch('/partner-dispatch/admin/status?ids=' + encodeURIComponent(ids.join(',')), { headers: { Authorization: auth } })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(j => {
        const map = (j && j.map) || {};
        rows.forEach(tr => {
          const idCell = tr.children[0]; const bid = idCell ? (idCell.textContent||'').trim() : '';
          const td = tr.querySelector('td.ga-dispatch'); if (!td) return;
          const st = map[bid] || null;
          const badge = document.createElement('span');
          const status = st ? (st.status || 'pending') : 'pending';
          badge.className = 'dispatch-badge ' + (status === 'success' ? 'success' : status === 'error' ? 'error' : 'pending');
          badge.textContent = status === 'success' ? ('Sent' + (st.sent_at ? ' ' + formatShort(st.sent_at) : '')) : (status.charAt(0).toUpperCase() + status.slice(1));
          const btn = document.createElement('button'); btn.textContent = 'Resend'; btn.addEventListener('click', () => resend(bid, td));
          td.innerHTML = ''; td.appendChild(badge); td.appendChild(document.createTextNode(' ')); td.appendChild(btn);
        });
      })
      .catch(()=>{});
  }

  function formatShort(s){ try { const d = new Date(s); return d.toISOString().slice(0,16).replace('T',' ');} catch(_) { return s; } }

  function resend(bookingId, cell){
    const auth = window.GA_ADMIN_AUTH; if (!auth) return alert('Not authorized');
    cell.textContent = 'Sending…';
    fetch('/partner-dispatch/admin/resend', { method:'POST', headers: { 'Content-Type':'application/json', Authorization: auth }, body: JSON.stringify({ booking_id: bookingId }) })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(() => { cell.textContent = 'Queued'; setTimeout(refreshDispatchCells, 1000); })
      .catch(() => { cell.textContent = 'Error'; });
  }
})();
