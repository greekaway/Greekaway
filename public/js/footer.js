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
      // Ensure capsule styling CSS is loaded (separate file; no color/icon changes)
      try {
        const CSS_ID = 'ga-footer-rounded-css';
        if (!document.getElementById(CSS_ID)) {
          const link = document.createElement('link');
          link.id = CSS_ID;
          link.rel = 'stylesheet';
          link.href = '/css/footer-rounded.css?v=20251113';
          document.head.appendChild(link);
        }
      } catch(_){ /* ignore */ }
      // Mark body so CSS overrides (e.g. PWA safe-area handling) can target only pages with the rounded footer
      try { document.body.classList.add('has-rounded-footer'); } catch(_){ }
      // Mobile-only: prevent starting vertical scroll when dragging on the footer
      try {
        const mql = window.matchMedia && window.matchMedia('(max-width: 599px)');
        if ((mql && mql.matches) || window.innerWidth < 600) {
          attachFooterTouchGuard(f);
        }
        if (mql && mql.addEventListener) {
          mql.addEventListener('change', (e) => {
            try { if (e.matches) attachFooterTouchGuard(f); } catch(_){}
          });
        }
      } catch(_){}
      // If we are on a trip page (booking overlay present), switch central button to Booking (bell)
      try {
        const body = document.body || null;
        const pathname = (location && location.pathname) ? location.pathname : '';
        const isTripPage = (body && body.classList && body.classList.contains('trip-view-page')) || pathname.endsWith('/trip.html');
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
  function attachFooterTouchGuard(footerEl){
    if (!footerEl || footerEl.__gaTouchGuard) return;
    footerEl.__gaTouchGuard = true;
    let startX = 0, startY = 0, moved = false;
    const onStart = (e) => {
      const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
      if (!t) return;
      startX = t.clientX; startY = t.clientY; moved = false;
    };
    const onMove = (e) => {
      const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
      if (!t) return;
      const dx = Math.abs(t.clientX - startX);
      const dy = Math.abs(t.clientY - startY);
      // If gesture is predominantly vertical, block it so page doesn't scroll from the footer region
      if (dy > dx && dy > 6) {
        moved = true;
        e.preventDefault();
      }
    };
    footerEl.addEventListener('touchstart', onStart, { passive: true });
    footerEl.addEventListener('touchmove', onMove, { passive: false });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applySharedFooter);
  else applySharedFooter();
})();
