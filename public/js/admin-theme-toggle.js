/* Admin Theme – automatic mode
   - Desktop: always dark
   - Mobile / Tablet: follows device prefers-color-scheme
   - No manual toggle button
*/
(function(){
  function applyMode(mode){
    document.documentElement.setAttribute('data-theme', mode);
  }

  /* Touch-primary device → mobile or tablet */
  function isMobileOrTablet(){
    return window.matchMedia('(pointer: coarse)').matches;
  }

  function getSystemMode(){
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function init(){
    /* Remove any leftover manual toggle button from cache / old HTML */
    var old = document.getElementById('ga-theme-toggle');
    if (old) old.remove();

    if (isMobileOrTablet()){
      /* Follow device day/night preference */
      applyMode(getSystemMode());
      window.matchMedia('(prefers-color-scheme: light)')
        .addEventListener('change', function(e){ applyMode(e.matches ? 'light' : 'dark'); });
    } else {
      /* Desktop: always dark */
      applyMode('dark');
    }

    /* Clean up old localStorage key so it doesn't confuse anything */
    try { localStorage.removeItem('themeMode'); } catch(_){}
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
