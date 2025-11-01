// Simple provider panel helper
const ProviderAPI = (function(){
  const base = '/provider';
  let token = null;
  function setToken(t){ token = t; localStorage.setItem('ga_provider_token', t); }
  function getToken(){ return token || localStorage.getItem('ga_provider_token'); }
  async function login(email, password){
    const r = await fetch(base + '/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
    const j = await r.json(); if (!r.ok) throw new Error(j && j.error || 'login_failed');
    setToken(j.token); return j;
  }
  async function authed(path, opts){
    const t = getToken(); if (!t) throw new Error('no_token');
    const r = await fetch(base + path, { ...(opts||{}), headers: { ...(opts && opts.headers || {}), 'Authorization':'Bearer ' + t } });
    const j = await r.json(); if (!r.ok) throw new Error(j && j.error || 'request_failed');
    return j;
  }
  return { login, authed, getToken };
})();

function footerNav(){
  const links = [
    { href: '/provider/dashboard.html', label:'Αρχική' },
    { href: '/provider/bookings.html', label:'Κρατήσεις' },
    { href: '/provider/payments.html', label:'Πληρωμές' },
    { href: '/provider/profile.html', label:'Προφίλ' },
  ];
  const path = location.pathname;
  const nav = document.createElement('nav');
  nav.className='footer-nav';
  nav.innerHTML = links.map(l => `<a href="${l.href}" class="${path.endsWith(l.href) ? 'active' : ''}"><span class="icon"></span><span>${l.label}</span></a>`).join('');
  document.body.appendChild(nav);
}

function showError(el, msg){ el.textContent = msg; el.style.color = '#ffd7d7'; }

window.ProviderUI = {
  initLogin(){
    footerNav();
    const form = document.getElementById('loginForm');
    const out = document.getElementById('loginResult');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const pass = document.getElementById('password').value;
      out.textContent = 'Σύνδεση…';
      try {
        const r = await ProviderAPI.login(email, pass);
        out.textContent = 'Επιτυχής σύνδεση';
        setTimeout(() => location.href = '/provider/dashboard.html', 300);
      } catch (e) { showError(out, 'Αποτυχία σύνδεσης'); }
    });
  },
  async initDashboard(){
    footerNav();
    const grid = document.getElementById('kpis');
    const list = document.getElementById('latest');
    try {
      const r = await ProviderAPI.authed('/api/bookings');
      const bookings = (r && r.bookings) || [];
      const k = {
        new: bookings.filter(b => b.status === 'dispatched').length,
        progress: bookings.filter(b => b.status === 'accepted' || b.status === 'picked').length,
        done: bookings.filter(b => b.status === 'completed').length,
      };
      grid.innerHTML = `<div class="card"><h3>Νέες</h3><div>${k.new}</div></div>
        <div class="card"><h3>Σε εξέλιξη</h3><div>${k.progress}</div></div>
        <div class="card"><h3>Ολοκληρωμένες</h3><div>${k.done}</div></div>`;
      list.innerHTML = bookings.slice(0,5).map(b => `<div class="card booking">
        <div>
          <div><b>${b.trip_title || b.booking_id}</b></div>
          <div class="meta">${b.date} • ${b.pickup_point} (${b.pickup_time})</div>
          <div class="meta">${b.customer_name || ''}</div>
        </div>
        <div><span class="badge ${b.dispatch && b.dispatch.status==='success'?'success':b.dispatch && b.dispatch.status==='error'?'error':'info'}">${b.status}</span></div>
      </div>`).join('');
    } catch (e) {
      list.innerHTML = `<div class="card">Σφάλμα φόρτωσης</div>`;
    }
  },
  async initBookings(){
    footerNav();
    const container = document.getElementById('bookings');
    try {
      const r = await ProviderAPI.authed('/api/bookings');
      const bookings = (r && r.bookings) || [];
      container.innerHTML = bookings.map(b => `<div class="card">
        <div class="booking">
          <div>
            <div><b>${b.trip_title || b.booking_id}</b> <small class="muted">#${b.booking_id.slice(0,6)}</small></div>
            <div class="meta">${b.date} • ${b.pickup_point} (${b.pickup_time})</div>
            <div class="meta"><a href="tel:${b.customer_phone||''}" style="color:#cfe3ef">${b.customer_name || ''}</a></div>
            ${b.map_link ? `<div class="meta"><a href="${b.map_link}" target="_blank" rel="noopener">Χάρτης</a></div>` : ''}
          </div>
          <div><span class="badge ${b.status==='completed'?'success':b.status==='declined'?'error':'info'}">${b.status}</span></div>
        </div>
        <div class="actions" data-id="${b.booking_id}">
          <button class="btn" data-action="accept">Αποδοχή</button>
          <button class="btn ghost" data-action="decline">Άρνηση</button>
          <button class="btn ghost" data-action="picked">Παραλαβή</button>
          <button class="btn" data-action="completed">Ολοκλήρωση</button>
        </div>
      </div>`).join('');
      container.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]'); if (!btn) return;
        const card = btn.closest('.actions');
        const id = card.getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        try {
          await ProviderAPI.authed(`/api/bookings/${id}/action`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action }) });
          // quick UI feedback
          btn.textContent = 'OK'; setTimeout(() => location.reload(), 250);
        } catch(_) { alert('Αποτυχία ενέργειας'); }
      });
    } catch (e) {
      container.innerHTML = `<div class="card">Σφάλμα φόρτωσης</div>`;
    }
  },
  async initPayments(){ footerNav(); document.getElementById('content').innerHTML = '<div class="card">Σύντομα διαθέσιμο — θα βλέπετε εκκαθαρίσεις.</div>'; },
  async initProfile(){
    footerNav();
    const out = document.getElementById('profile');
    out.innerHTML = `<div class="card"><div><b>Email:</b> —</div><div><b>Τελευταία σύνδεση:</b> —</div><button class="btn ghost" id="logout">Έξοδος</button></div>`;
    document.getElementById('logout').addEventListener('click', () => { localStorage.removeItem('ga_provider_token'); location.href = '/provider/login.html'; });
  }
};
