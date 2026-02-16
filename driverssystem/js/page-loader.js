/* ═══════════════════════════════════════════════════════
   Page Transition Loader – DriversSystem
   
   Two roles:
   A) INCOMING – page-loader.css creates a body::before/::after
      overlay visible from first paint. This script adds
      .ds-page-ready to <body> once everything is rendered,
      which fades the overlay out and reveals the page instantly.
   B) OUTGOING – Injects a .ds-page-loader div that is shown
      on nav-click so the user sees a spinner while the browser
      navigates to the next page.
   ═══════════════════════════════════════════════════════ */

(() => {
  /* ── A. Hide the INCOMING overlay once page is ready ── */
  const markReady = () => {
    requestAnimationFrame(() => {
      document.body.classList.add('ds-page-ready');
    });
  };

  if (document.readyState === 'complete') {
    markReady();
  } else {
    window.addEventListener('load', markReady);
  }

  /* ── B. Create OUTGOING loader element ── */
  const loader = document.createElement('div');
  loader.className = 'ds-page-loader';
  loader.id = 'dsPageLoader';
  loader.setAttribute('aria-hidden', 'true');
  loader.innerHTML = '<div class="ds-page-loader__spinner"></div>';
  document.body.prepend(loader);

  const show = () => loader.classList.add('ds-page-loader--active');
  const hide = () => loader.classList.remove('ds-page-loader--active');

  /* ── Hide on pageshow (handles bfcache / back-forward) ── */
  window.addEventListener('pageshow', (e) => {
    hide();
    // Also re-mark body ready in case of bfcache restore
    if (e.persisted) document.body.classList.add('ds-page-ready');
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
