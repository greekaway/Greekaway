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
    if (!slug) return;
    // Site uses a central trip page: /trips/trip.html?id={slug}
    const url = `/trips/trip.html?id=${encodeURIComponent(slug)}&mode=${encodeURIComponent(mode)}`;
    window.location.assign(url);
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
      card.addEventListener('click', go);
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
