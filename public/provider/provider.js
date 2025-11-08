// Theme handling (light/dark with system default)
const Theme = (function(){
  const KEY = 'ga_provider_theme';
  function getStored(){ try { return localStorage.getItem(KEY); } catch(_) { return null; } }
  function system(){ try { return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'; } catch(_) { return 'dark'; } }
  function current(){ return getStored() || system(); }
  function apply(t){
    try { document.documentElement.setAttribute('data-theme', t); } catch(_){}
    try { localStorage.setItem(KEY, t); } catch(_){}
    updateButton(t);
  }
  function ensure(){ apply(current()); }
  function toggle(){ const t = current() === 'dark' ? 'light' : 'dark'; apply(t); }
  function mountButton(){
    const header = document.querySelector('header');
    if (!header) return;
    let btn = header.querySelector('.theme-toggle');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'theme-toggle';
      btn.type = 'button';
      btn.addEventListener('click', toggle);
      header.appendChild(btn);
    }
    updateButton(current());
  }
  function updateButton(t){
    const btn = document.querySelector('header .theme-toggle');
    if (!btn) return;
    btn.textContent = t === 'dark' ? '☀️' : '🌙';
    btn.title = t === 'dark' ? 'Light mode' : 'Dark mode';
  }
  return { init(){ ensure(); mountButton(); }, apply, toggle };
})();

// Simple provider panel helper
const ProviderAPI = (function(){
  const base = '/provider';
  let token = null;
  function setToken(t){ token = t; localStorage.setItem('ga_provider_token', t); }
  function getToken(){ return token || localStorage.getItem('ga_provider_token'); }
  async function login(email, password){
    const r = await fetch(base + '/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
    const raw = await r.text();
    let j = null; try { j = raw ? JSON.parse(raw) : null; } catch(e){ throw new Error('invalid_json_response'); }
    if (!r.ok || !j || !j.ok) { const msg = (j && j.error) ? j.error : (!r.ok ? ('http_'+r.status) : 'login_failed'); throw new Error(msg); }
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

// Lightweight authentication guard usable across all provider panel modules
// Supports legacy key name migration if it ever changes.
window.ProviderAuth = (function(){
  const KEY_PRIMARY = 'ga_provider_token';
  const LEGACY_KEYS = ['provider_token']; // future-proof list
  function readToken(){
    // Prefer primary key
    let t = null;
    try { t = localStorage.getItem(KEY_PRIMARY); } catch(_) {}
    if (!t){
      for (const k of LEGACY_KEYS){
        try { const v = localStorage.getItem(k); if (v){ t = v; localStorage.setItem(KEY_PRIMARY, v); break; } } catch(_) {}
      }
    }
    return t;
  }
  function present(){ return !!readToken(); }
  function redirectToLogin(){
    // Use consistent .html path to avoid confusion between static and extensionless routes
    window.location.replace('/provider/login.html');
  }
  function requireSync(){ if (!present()) redirectToLogin(); }
  async function verifyRemote(){
    const tok = readToken(); if (!tok){ redirectToLogin(); return false; }
    try {
      const r = await fetch('/provider/auth/verify', { headers:{ 'Authorization':'Bearer ' + tok } });
      if (!r.ok){ localStorage.removeItem(KEY_PRIMARY); redirectToLogin(); return false; }
      const j = await r.json().catch(()=>({}));
      if (!j || !j.ok){ localStorage.removeItem(KEY_PRIMARY); redirectToLogin(); return false; }
      return j; // { ok:true, partner:{...} }
    } catch(_){ redirectToLogin(); return false; }
  }
  function logout(){ try { localStorage.removeItem(KEY_PRIMARY); } catch(_){} redirectToLogin(); }
  return { requireSync, verifyRemote, logout, token: readToken };
})();

function footerNav(){
  // If modular footer placeholder exists, skip legacy injection to avoid duplicates
  if (document.getElementById('footer-placeholder')) return;
  const links = [
    { href: '/provider/dashboard.html', label:'Αρχική' },
    { href: '/provider/provider-bookings.html', label:'Κρατήσεις' },
	{ href: '/provider/provider-availability.html', label:'Διαθεσιμότητα' },
    { href: '/provider/provider-payments.html', label:'Πληρωμές' },
    { href: '/provider/provider-profile.html', label:'Προφίλ' },
    { href: '/provider/provider-drivers.html', label:'Οδηγοί' },
  ];
  const path = location.pathname;
  const nav = document.createElement('nav');
  nav.className='footer-nav';
  nav.innerHTML = links.map(l => `<a href="${l.href}" class="${path.endsWith(l.href) ? 'active' : ''}"><span class="icon"></span><span>${l.label}</span></a>`).join('');
  document.body.appendChild(nav);
}

function showError(el, msg){ el.textContent = msg; el.style.color = '#ffd7d7'; }

// Expose only common or cross-page init handlers here; page-specific in separate modules
window.ProviderUI = {
  initLogin(){
    Theme.init();
    footerNav();
    const form = document.getElementById('loginForm');
    const out = document.getElementById('loginResult');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email')?.value.trim();
      const pass = document.getElementById('password')?.value;
      out && (out.textContent = 'Σύνδεση…');
      const btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = '…'; }
      try {
        const r = await ProviderAPI.login(email, pass);
        out && (out.textContent = 'Επιτυχής σύνδεση');
        setTimeout(() => location.href = '/provider/dashboard.html', 300);
      } catch (e) {
        const msg = String(e && e.message || 'Αποτυχία σύνδεσης');
        out && showError(out, 'Αποτυχία: ' + msg.replace(/^invalid_json_response$/,'Μη έγκυρη απάντηση server'));
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Σύνδεση'; }
      }
    });
  },
  async initDashboard(){
    ProviderAuth.requireSync();
    Theme.init();
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
      if (grid){
        grid.innerHTML = `<div class="card"><h3>Νέες</h3><div>${k.new}</div></div>
          <div class="card"><h3>Σε εξέλιξη</h3><div>${k.progress}</div></div>
          <div class="card"><h3>Ολοκληρωμένες</h3><div>${k.done}</div></div>`;
      }
      if (list){
        list.innerHTML = bookings.slice(0,5).map(b => `<div class="card booking">
          <div>
            <div><b>${b.trip_title || b.booking_id}</b></div>
            <div class="meta">${b.date} • ${b.pickup_point} (${b.pickup_time})</div>
            <div class="meta">${b.customer_name || ''}</div>
          </div>
          <div><span class="badge ${b.dispatch && b.dispatch.status==='success'?'success':b.dispatch && b.dispatch.status==='error'?'error':'info'}">${b.status}</span></div>
        </div>`).join('');
      }
    } catch (e) {
      if (list) list.innerHTML = `<div class="card">Σφάλμα φόρτωσης</div>`;
    }
  }
};
