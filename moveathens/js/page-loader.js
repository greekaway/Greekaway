/* ═══════════════════════════════════════════════════════
   Page Transition Loader – MoveAthens
   
   Two roles:
   A) INCOMING – page-loader.css creates a body::before/::after
      overlay visible from first paint. This script adds
      .ma-page-ready to <body> once everything is rendered,
      which fades the overlay out and reveals the page instantly.
   B) OUTGOING – Injects a .ma-page-loader div that is shown
      on nav-click so the user sees a spinner while the browser
      navigates to the next page.
   ═══════════════════════════════════════════════════════ */

(() => {
  /* ── A. Hide the INCOMING overlay once page is ready ── */
  const markReady = () => {
    requestAnimationFrame(() => {
      document.body.classList.add('ma-page-ready');
    });
  };

  if (document.readyState === 'complete') {
    markReady();
  } else {
    window.addEventListener('load', markReady);
  }

  /* ── B. Create OUTGOING loader element ── */
  const loader = document.createElement('div');
  loader.className = 'ma-page-loader';
  loader.id = 'maPageLoader';
  loader.setAttribute('aria-hidden', 'true');
  loader.innerHTML = '<div class="ma-page-loader__spinner"></div>';
  document.body.prepend(loader);

  const show = () => loader.classList.add('ma-page-loader--active');
  const hide = () => loader.classList.remove('ma-page-loader--active');

  /* ── Hide on pageshow (handles bfcache / back-forward) ── */
  window.addEventListener('pageshow', (e) => {
    hide();
    if (e.persisted) document.body.classList.add('ma-page-ready');
  });

  /* ── Intercept internal navigation clicks (capturing phase) ── */
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
