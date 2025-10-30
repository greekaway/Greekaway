// Welcome page: delay showing content until i18n is applied
// Applies only on index.html which has <body class="has-bg-video">
(function(){
  function markReady(){
    try {
      document.body.classList.add('ready');
    } catch(_) {}
  }

  function onDomReady(){
    var isWelcome = document.body && document.body.classList && document.body.classList.contains('has-bg-video');
    if (!isWelcome) return; // only on welcome page

    // If i18n already initialized, reveal immediately
    if (window.currentI18n && window.currentI18n.lang) {
      markReady();
      return;
    }

    // Otherwise, wait for the first i18n:changed event (once)
    var once = function(){
      try { window.removeEventListener('i18n:changed', once); } catch(_){}
      markReady();
    };
    window.addEventListener('i18n:changed', once, { once: true });

    // Safety fallback: reveal after 1200ms in case the event is missed
    setTimeout(function(){
      if (!document.body.classList.contains('ready')) markReady();
    }, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onDomReady);
  else onDomReady();
})();
