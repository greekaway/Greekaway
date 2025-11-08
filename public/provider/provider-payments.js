/* Provider Payments Module */
(function(){
  function init(){
    if (window.ProviderAuth) { window.ProviderAuth.requireSync(); }
    Theme.init();
    footerNav();
    const el = document.getElementById('content');
    if (el) el.innerHTML = '<div class="card">Σύντομα διαθέσιμο — θα βλέπετε εκκαθαρίσεις.</div>';
  }
  window.ProviderPayments = { init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
})();
