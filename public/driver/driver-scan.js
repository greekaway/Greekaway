// Driver scan page skeleton
(function(){
  function init(){
    DriverAuth.requireSync();
    if (DriverCommon) DriverCommon.footerNav();
    const wrap = document.getElementById('scanWrap');
    if (wrap) wrap.innerHTML = '<div class="card">Σύντομα: Σάρωση QR/Barcode εισιτηρίων.</div>';
  }
  window.DriverScan = { init };
})();
