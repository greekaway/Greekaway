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
      // Re-apply translations for newly injected nodes
      try {
        if (window.currentI18n && window.setLanguage) {
          window.setLanguage(window.currentI18n.lang);
        }
      } catch(_) { /* noop */ }
    } catch (e) { /* ignore */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applySharedFooter);
  else applySharedFooter();
})();
