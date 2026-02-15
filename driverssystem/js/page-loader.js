/* ═══════════════════════════════════════════════════════
   Page Transition Loader – DriversSystem
   Injects a spinner overlay and shows it during navigation
   ═══════════════════════════════════════════════════════ */

(() => {
  /* ── 1. Create loader element ── */
  const loader = document.createElement('div');
  loader.className = 'ds-page-loader';
  loader.id = 'dsPageLoader';
  loader.setAttribute('aria-hidden', 'true');
  loader.innerHTML = '<div class="ds-page-loader__spinner"></div>';
  document.body.prepend(loader);

  const show = () => loader.classList.add('ds-page-loader--active');
  const hide = () => loader.classList.remove('ds-page-loader--active');

  /* ── 2. Hide on pageshow (handles bfcache / back-forward) ── */
  window.addEventListener('pageshow', hide);

  /* ── 3. Intercept internal navigation clicks (capturing phase) ── */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('a[href], [data-route]');
    if (!el) return;

    const href = el.getAttribute('href') || el.getAttribute('data-route');
    if (!href) return;

    // Skip external, anchor, mailto, tel, javascript links
    if (/^(https?:|#|javascript:|mailto:|tel:)/.test(href)) return;

    // Skip target=_blank
    if (el.getAttribute('target') === '_blank') return;

    show();
  }, true); // ← capturing so it fires before footer.js
})();
