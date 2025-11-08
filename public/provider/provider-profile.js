/* Provider Profile Module */
(function(){
  function init(){
    if (window.ProviderAuth) { window.ProviderAuth.requireSync(); }
    Theme.init();
    footerNav();
    const out = document.getElementById('profile');
    if (out) {
      out.innerHTML = `<div class="card" id="profileCard"><div><b>Email:</b> <span id="pEmail">—</span></div><div><b>Τελευταία σύνδεση:</b> <span id="pLast">—</span></div><button class="btn ghost" id="logout">Έξοδος</button></div>`;
      const lg = document.getElementById('logout');
      if (lg) lg.addEventListener('click', () => { if (window.ProviderAuth) window.ProviderAuth.logout(); else { localStorage.removeItem('ga_provider_token'); location.href = '/provider/login.html'; } });
      // Attempt remote verify for richer info
      if (window.ProviderAuth && typeof window.ProviderAuth.verifyRemote === 'function') {
        window.ProviderAuth.verifyRemote().then((info) => {
          if (info && info.partner){
            const em = document.getElementById('pEmail'); if (em) em.textContent = info.partner.email || '—';
            const ls = document.getElementById('pLast'); if (ls) ls.textContent = info.partner.last_seen || '—';
          }
        }).catch(()=>{});
      }
    }
  }
  window.ProviderProfile = { init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
})();
