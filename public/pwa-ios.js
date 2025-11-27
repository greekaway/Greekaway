(function(){
  const PROMPT_CLASS = 'pwa-prompt-enabled';
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const alreadyShown = typeof localStorage !== 'undefined' && localStorage.getItem('ga_ios_install_shown') === '1';

  function promptAllowed(){
    try {
      return !!(document.body && document.body.classList && document.body.classList.contains(PROMPT_CLASS));
    } catch(_) {
      return false;
    }
  }

  function createPopup(){
    const el = document.createElement('div');
    el.id = 'ga-ios-popup';
    el.setAttribute('role','dialog');
    el.setAttribute('aria-live','polite');
    el.innerHTML = [
      '<div class="ga-ios-row">',
      '  <div class="ga-ios-col">',
      '    <div class="ga-ios-title">📱 Προσθέστε το Greekaway στην Αρχική Οθόνη</div>',
      '    <p class="ga-ios-text">Για να το έχετε σαν κανονική εφαρμογή:</p>',
      '    <ol class="ga-ios-steps">',
      '      <li>Πάτα το κουμπί “Κοινοποίηση” (το τετράγωνο με το βελάκι πάνω)</li>',
      '      <li>Επίλεξε «Προσθήκη στην οθόνη αφετηρίας»</li>',
      '    </ol>',
      '    <div class="ga-ios-badge">',
      '      <span class="ga-ios-chip">',
      '        <svg class="ga-icon" viewBox="0 0 24 24" aria-hidden="true">',
      '          <path fill="#fff" d="M12 3c.3 0 .5.1.7.3l3 3a1 1 0 1 1-1.4 1.4L13 6.4V14a1 1 0 1 1-2 0V6.4L9.7 7.7A1 1 0 0 1 8.3 6.3l3-3c.2-.2.4-.3.7-.3Z"/>',
      '          <path fill="#fff" d="M5 10a3 3 0 0 1 3-3h1a1 1 0 1 1 0 2H8a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1a1 1 0 1 1 0-2h1a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-7Z"/>',
      '        </svg>',
      '        Share → Add to Home Screen',
      '      </span>',
      '    </div>',
      '    <div class="ga-ios-actions">',
      '      <button type="button" class="ga-ios-ok">✔ Κατάλαβα</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');

    const btn = el.querySelector('.ga-ios-ok');
    btn.addEventListener('click', function(){
      try { localStorage.setItem('ga_ios_install_shown','1'); } catch(_e) {}
      el.remove();
    });

    return el;
  }

  function shouldShow(){
    if(!promptAllowed()) return false;
    if(!isIOS || !isSafari) return false;
    if(alreadyShown) return false;
    return true;
  }

  function mount(){
    if(!shouldShow()) return;
    const popup = createPopup();
    document.body.appendChild(popup);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
