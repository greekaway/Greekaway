(function(){
  async function applySharedFooter(){
    try {
      const res = await fetch('/partials/footer-inner.html', { cache: 'no-cache' });
      if (!res.ok) return;
      const html = await res.text();
      // If a footer exists, replace its innerHTML; else create one at end of body
      let f = document.querySelector('footer');
      if (f) {
        f.innerHTML = html;
      } else {
        f = document.createElement('footer');
        f.innerHTML = html;
        document.body.appendChild(f);
      }
      // If we are on a trip page (booking overlay present), switch central button to Booking (bell)
      try {
        const isTripPage = !!document.getElementById('bookingOverlay') || (location.pathname || '').includes('/trips/trip.html');
        if (isTripPage) {
          const central = f.querySelector('a.central-btn');
          if (central) {
            central.setAttribute('href', 'javascript:void(0)');
            central.removeAttribute('onclick');
            const icon = central.querySelector('i');
            const label = central.querySelector('span');
            if (icon) icon.className = 'fas fa-bell';
            if (label) { label.setAttribute('data-i18n', 'nav.book'); label.textContent = 'Κράτηση'; }
          }
        }
      } catch(_) {}
      // Re-apply translations for newly injected nodes
      try {
        if (window.currentI18n && window.setLanguage) {
          // i18n already initialized: re-translate now
          window.setLanguage(window.currentI18n.lang);
        } else {
          // i18n not ready yet: wait once, then re-translate
          const once = (e) => {
            try { window.removeEventListener('i18n:changed', once); } catch(_){ }
            try {
              if (window.currentI18n && window.setLanguage) window.setLanguage(window.currentI18n.lang);
            } catch(_) { }
          };
          window.addEventListener('i18n:changed', once, { once: true });
        }
      } catch(_) { /* noop */ }
    } catch (e) { /* ignore */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applySharedFooter);
  else applySharedFooter();
})();
