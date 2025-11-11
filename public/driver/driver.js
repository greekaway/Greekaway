// Driver Panel helpers
const DriverAPI = (function(){
  const base = '/driver';
  function getToken(){ try { return localStorage.getItem('ga_driver_token'); } catch(_) { return null; } }
  function setToken(t){ try { localStorage.setItem('ga_driver_token', t); } catch(_) {} }
  async function login(identifier, password, remember){
    const r = await fetch(base + '/api/login', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ identifier, password, remember: !!remember }) });
    const j = await r.json().catch(()=>null);
    if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || 'login_failed');
    setToken(j.token);
    return j;
  }
  async function authed(path, opts){
    const t = getToken(); if (!t) throw new Error('no_token');
    const r = await fetch(base + path, { ...(opts||{}), headers: { ...(opts && opts.headers || {}), 'Authorization':'Bearer ' + t } });
    if (r.status === 401) { localStorage.removeItem('ga_driver_token'); location.replace('/driver/driver-login.html'); return Promise.reject(new Error('unauthorized')); }
    const j = await r.json().catch(()=>null);
    if (!r.ok) throw new Error((j && j.error) || 'request_failed');
    return j;
  }
  return { login, authed, getToken };
})();

window.DriverAuth = (function(){
  const KEY = 'ga_driver_token';
  function has(){ try { return !!localStorage.getItem(KEY); } catch(_) { return false; } }
  function requireSync(){ if (!has()) location.replace('/driver/driver-login.html'); }
  function logout(){ try { localStorage.removeItem(KEY); } catch(_) {} location.replace('/driver/driver-login.html'); }
  return { requireSync, logout };
})();

window.DriverUI = {
  initLogin(){
    // no guard for login
    const form = document.getElementById('loginForm');
    const out = document.getElementById('loginResult');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifier = document.getElementById('identifier')?.value.trim();
      const password = document.getElementById('password')?.value;
      const btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = '…'; }
      out && (out.textContent = 'Σύνδεση…');
      try {
        const remember = document.getElementById('remember')?.checked;
        await DriverAPI.login(identifier, password, remember);
        out && (out.textContent = 'Επιτυχής σύνδεση');
        setTimeout(() => location.href = '/driver/driver-dashboard.html', 200);
      } catch (e) {
        out && (out.textContent = 'Λανθασμένα στοιχεία');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Σύνδεση'; }
      }
    });
  },
  async initDashboard(){
    DriverAuth.requireSync();
  if (window.DriverCommon) window.DriverCommon.footerNav();
    const list = document.getElementById('driverBookings');
    const reloadBtn = document.getElementById('reload');
    async function load(){
      try {
        const r = await DriverAPI.authed('/api/bookings');
        const bookings = (r && r.bookings) || [];
        if (!bookings.length) {
          list.innerHTML = '<div class="card">Δεν υπάρχουν αναθέσεις ακόμη.</div>';
          return;
        }
        list.innerHTML = bookings.map(b => `
          <div class="card booking" data-id="${b.id}">
            <div style="display:flex; justify-content: space-between; gap: 8px; align-items: center;">
              <div>
                <div><b>${b.trip_title || b.booking_id}</b></div>
                <div class="meta">${b.date || ''} • ${b.pickup_point || ''} (${b.pickup_time || ''})</div>
                <div class="meta">${b.customer_name || ''}${b.customer_phone ? ' • ' + b.customer_phone : ''}</div>
              </div>
              <div><span class="badge ${b.status==='completed'?'ok':b.status==='accepted'?'gold':'warn'}">${b.status||'pending'}</span></div>
            </div>
            <div class="actions" style="margin-top:8px;">
              <button class="btn act" data-action="accepted">Αποδοχή</button>
              <button class="btn act" data-action="picked">Παραλαβή</button>
              <button class="btn act" data-action="completed">Ολοκλήρωση</button>
            </div>
          </div>
        `).join('');
        // Bind actions
        list.querySelectorAll('.booking').forEach(el => {
          const id = el.getAttribute('data-id');
          const buttons = el.querySelectorAll('button.act');
          buttons.forEach(btn => {
            btn.addEventListener('click', async () => {
              const status = btn.getAttribute('data-action');
              btn.disabled = true;
              btn.textContent = '…';
              try {
                await DriverAPI.authed('/api/update-status', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ booking_id: id, status }) });
                await load(); // refresh immediately after change
              } catch (_) {
                btn.disabled = false; btn.textContent = btn.getAttribute('data-action') === 'accepted' ? 'Αποδοχή' : (btn.getAttribute('data-action') === 'picked' ? 'Παραλαβή' : 'Ολοκλήρωση');
              }
            });
          });
        });
      } catch (e) {
        list.innerHTML = '<div class="card">Σφάλμα φόρτωσης</div>';
      }
    }
    if (reloadBtn) reloadBtn.addEventListener('click', load);
    await load();
  },
  initScan(){
    DriverAuth.requireSync();
    if (window.DriverCommon) window.DriverCommon.footerNav();
    const wrap = document.getElementById('scanWrap');
    if (wrap) wrap.innerHTML = '<div class="card">Σύντομα: Σάρωση QR/Barcode εισιτηρίων.</div>';
  },
  initProfile(){
    DriverAuth.requireSync();
    if (window.DriverCommon) window.DriverCommon.footerNav();
    const wrap = document.getElementById('profileWrap');
    if (!wrap) return;
    // Minimal profile from token payload (client-side decode for display only)
    try {
      const token = DriverAPI.getToken();
      const payload = token ? JSON.parse(atob(token.split('.')[1])) : {};
      const info = {
        name: payload.name || '-',
        email: payload.email || '-',
        phone: payload.phone || '-',
      };
      wrap.innerHTML = `<div class="card"><div><b>${info.name}</b></div><div class="meta">${info.email} • ${info.phone}</div></div>`;
    } catch(_) {
      wrap.innerHTML = '<div class="card">Αδυναμία φόρτωσης προφίλ</div>';
    }
  }
};
