// Shared Driver Panel helpers (footer nav + guard)
(function(){
  // Theme handling (dark/light with system default)
  const DriverTheme = (function(){
    const KEY = 'ga_driver_theme';
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
        btn.className = 'theme-toggle btn ghost';
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

  function activePath(){ return location.pathname.replace(/\/+/g,'/'); }
  function footerNav(){
    if (document.querySelector('.footer-nav')) return; // prevent duplicate
    const links = [
      { href: '/driver/driver-dashboard.html', label: 'Διαδρομές' },
      { href: '/driver/driver-scan.html', label: 'Σάρωση Εισιτηρίου' },
      { href: '/driver/driver-profile.html', label: 'Προφίλ' }
    ];
    const nav = document.createElement('nav');
    nav.className = 'footer-nav';
    nav.innerHTML = links.map(l => `<a href="${l.href}" class="${activePath().endsWith(l.href)?'active':''}"><span>${l.label}</span></a>`).join('');
    document.body.appendChild(nav);
  }
  function guard(){ if (window.DriverAuth) window.DriverAuth.requireSync(); }
  window.DriverCommon = { footerNav, guard, Theme: DriverTheme };
  // Initialize theme asap
  try { DriverTheme.init(); } catch(_) {}
})();
