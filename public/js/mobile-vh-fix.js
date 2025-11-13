// Mobile 100vh fix: sets --vh to 1% of current innerHeight
// Use in CSS: height: calc(var(--vh, 1vh) * 100)
(function(){
  function updateVh(){
    try {
      var vh = (window.innerHeight || document.documentElement.clientHeight || 0) * 0.01;
      document.documentElement.style.setProperty('--vh', vh + 'px');
    } catch(_) {}
  }
  window.addEventListener('load', updateVh, { passive: true });
  window.addEventListener('resize', updateVh, { passive: true });
  // Also update on orientation changes which may not fire resize on some browsers
  window.addEventListener('orientationchange', function(){ setTimeout(updateVh, 150); }, { passive: true });
  // Set immediately for initial paint
  updateVh();
})();
// Mobile 100vh fix: sets --vh to 1% of visual viewport height
(function(){
  function updateVh(){
    try {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', vh + 'px');
    } catch (_) {}
  }
  window.addEventListener('load', updateVh, { passive: true });
  window.addEventListener('resize', updateVh, { passive: true });
  // iOS address bar show/hide sometimes fires orientationchange instead of resize
  window.addEventListener('orientationchange', updateVh, { passive: true });
  // Run once immediately in case load is late
  updateVh();
})();
