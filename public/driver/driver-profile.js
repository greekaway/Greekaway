// Driver profile page
(function(){
  async function fetchMe(){
    try { return await DriverAPI.authed('/api/me'); } catch(_) { return null; }
  }
  function render(info){
    const wrap = document.getElementById('profileWrap');
    if (!wrap) return;
    if (!info){ wrap.innerHTML = '<div class="card">Σφάλμα φόρτωσης προφίλ</div>'; return; }
    const d = info.driver || {};
    wrap.innerHTML = `<div class="card"><div><b>${d.name||'-'}</b></div>
      <div class="meta">${d.email||'-'} • ${d.phone||'-'}</div>
      <div class="meta">Πινακίδα: <strong>${d.vehicle_plate||'—'}</strong></div></div>`;
  }
  async function init(){
    DriverAuth.requireSync(); if (DriverCommon) DriverCommon.footerNav();
    const data = await fetchMe(); render(data && data.ok ? data : null);
    const logout = document.getElementById('logoutBtn'); if (logout) logout.addEventListener('click', () => DriverAuth.logout());
  }
  window.DriverProfile = { init };
})();
