(function () {
  function getTripSlug() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('trip') || '';
    // allow simple slugs: letters, numbers, dash, underscore, dot
    const slug = raw.toLowerCase().trim().match(/[a-z0-9._-]+/g);
    return slug ? slug.join('') : '';
  }

  function setWarningVisible(visible) {
    const el = document.getElementById('trip-warning');
    if (!el) return;
    el.hidden = !visible;
  }

  function navigateTo(slug, mode) {
    let prevMode = '';
    try { prevMode = (localStorage.getItem('trip_mode')||'').toLowerCase(); } catch(_){ }
    try { localStorage.setItem('trip_mode', String(mode)); } catch(_) {}
    // Clear booking state only when mode actually changes
    try {
      if (window.clearBookingState && prevMode && prevMode !== String(mode).toLowerCase()) {
        window.clearBookingState();
      } else if (window.clearBookingState && !prevMode) {
        // first-time selection: treat as fresh start
        window.clearBookingState();
      }
    } catch(_){}
    if (!slug) return; // need a trip id to continue
    // Central trip page as Step 1
    const url = `/trips/trip.html?id=${encodeURIComponent(slug)}&mode=${encodeURIComponent(mode)}`;
    try { window.location.assign(url); }
    catch(_) { window.location.href = url; }
  }

  function ready() {
    const slug = getTripSlug();
    if (!slug) {
      setWarningVisible(true);
    }

    // Make background match the trip's category, like category/trip pages
    (function setCategoryBackground() {
      if (!slug) return;
      try {
        fetch('/data/tripindex.json', { cache: 'no-store' })
          .then(r => r.ok ? r.json() : [])
          .then(list => {
            const meta = (list || []).find(t => t.id === slug);
            if (meta && meta.category) {
              document.body.dataset.category = meta.category;
              document.documentElement.dataset.category = meta.category;
              document.body.dataset.view = document.body.dataset.view || 'category';
              document.documentElement.dataset.view = document.documentElement.dataset.view || 'category';
            }
          })
          .catch(() => {});
      } catch (_) {}
    })();

    const cards = document.querySelectorAll('.trip-mode-card[data-mode]');
    cards.forEach(function (card) {
      const mode = card.getAttribute('data-mode');
      function go() { navigateTo(slug, mode); }
      // Ensure any previous listeners are not duplicated
      card.addEventListener('click', go, { once: false });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
