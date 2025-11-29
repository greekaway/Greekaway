// Category page controller split from main.js to allow independent caching & deploys
(function(){
  document.addEventListener("DOMContentLoaded", () => {
    const tripsContainer = document.getElementById("trips-container");
    if (!tripsContainer) return; // not on category page
    const categoryTitleEl = document.getElementById('category-title') || document.querySelector('[data-role="category-title"]');
    const defaultHeadingText = categoryTitleEl ? categoryTitleEl.textContent.trim() : '';
    const categoryDescriptionEl = document.getElementById('category-description');
    const defaultDescriptionText = categoryDescriptionEl ? categoryDescriptionEl.textContent.trim() : '';
    const defaultDescriptionHidden = categoryDescriptionEl ? (categoryDescriptionEl.hasAttribute('hidden') || categoryDescriptionEl.hidden) : true;
    const defaultDocumentTitle = document.title;
    const documentTitleSuffix = (() => {
      const parts = defaultDocumentTitle.split(' - ');
      return parts.length > 1 ? parts.slice(1).join(' - ') : '';
    })();
    let currentCategoryMeta = null;
    let categoryMetaPromise = null;
    const RAW_UPLOADS_BASE = (window.UPLOADS_BASE_URL || window.PUBLIC_BASE_URL || (window.location && window.location.origin) || 'https://greekaway.com');
    const UPLOADS_BASE = String(RAW_UPLOADS_BASE || '').replace(/\/+$, '') || 'https://greekaway.com';
    const DEFAULT_CATEGORY_ICON = `${UPLOADS_BASE}/uploads/icons/default.svg`;

    let category = '';
    try {
      const params = new URLSearchParams(window.location.search);
      category = (params.get('slug') || '').trim();
    } catch(_) { /* ignore */ }
    if (!category) category = document.body.dataset.category || '';
    document.body.dataset.view = 'category';
    if (document.documentElement) document.documentElement.dataset.view = 'category';
    if (!category) {
      const missingTitle = tSafe('categories.missingTitle', 'Δεν βρέθηκε κατηγορία');
      const missingDesc = tSafe('categories.missingDescription', 'Επιστρέψτε στη λίστα και επιλέξτε μια διαθέσιμη κατηγορία.');
      if (categoryTitleEl) categoryTitleEl.textContent = missingTitle;
      if (categoryDescriptionEl) {
        categoryDescriptionEl.textContent = missingDesc;
        categoryDescriptionEl.removeAttribute('hidden');
      }
      tripsContainer.innerHTML = `<p class="no-trips">${tSafe('categories.missingSlug', 'Δεν βρέθηκε η συγκεκριμένη κατηγορία.')}</p>`;
      return;
    }
    document.body.dataset.category = category;
    if (document.documentElement) document.documentElement.dataset.category = category;

    const updateCategoryHeading = (meta) => {
      const localized = meta ? (getLocalized(meta.title) || meta.title || '') : '';
      if (categoryTitleEl) {
        categoryTitleEl.textContent = localized || defaultHeadingText || '';
      }
      if (categoryDescriptionEl) {
        const localizedDesc = meta ? (getLocalized(meta.description) || meta.description || '') : '';
        if (localizedDesc) {
          categoryDescriptionEl.textContent = localizedDesc;
          categoryDescriptionEl.removeAttribute('hidden');
        } else {
          categoryDescriptionEl.textContent = defaultDescriptionText || '';
          if (defaultDescriptionHidden || !categoryDescriptionEl.textContent.trim()) {
            categoryDescriptionEl.setAttribute('hidden','');
          } else {
            categoryDescriptionEl.removeAttribute('hidden');
          }
        }
      }
      if (localized) {
        document.title = documentTitleSuffix ? `${localized} - ${documentTitleSuffix}` : localized;
      } else {
        document.title = defaultDocumentTitle;
      }
    };

    const fetchCategoryMeta = () => {
      if (categoryMetaPromise) return categoryMetaPromise;
      categoryMetaPromise = (async () => {
        try {
          const cached = Array.isArray(window.__gwCategories) ? window.__gwCategories : null;
          if (cached && cached.length) {
            const match = cached.find(cat => (cat.slug || cat.id) === category);
            if (match) return match;
          }
        } catch(_) { /* ignore */ }
        const cats = await fetchPublishedCategoriesOnce();
        if (Array.isArray(cats)) {
          window.__gwCategories = cats;
          return cats.find(cat => (cat.slug || cat.id) === category) || null;
        }
        return null;
      })().catch(err => { G.error('Category meta load failed:', err); return null; });
      return categoryMetaPromise;
    };

    fetchCategoryMeta().then(meta => {
      currentCategoryMeta = meta;
      if (meta) {
        const canonicalSlug = meta.slug || meta.id || '';
        if (canonicalSlug) {
          category = canonicalSlug;
          document.body.dataset.category = canonicalSlug;
          if (document.documentElement) document.documentElement.dataset.category = canonicalSlug;
        }
      }
      updateCategoryHeading(meta);
      if (window.__gwCategoryTrips && Array.isArray(window.__gwCategoryTrips)) {
        try { renderCategoryTrips(window.__gwCategoryTrips); } catch(_) {}
      }
    });

    function renderCategoryTrips(allTrips){
      const container = document.getElementById("trips-container");
      if (!container) return;
      container.innerHTML = "";
      const targetValues = new Set();
      if (category) targetValues.add(category);
      if (currentCategoryMeta) {
        if (currentCategoryMeta.slug) targetValues.add(currentCategoryMeta.slug);
        if (currentCategoryMeta.id) targetValues.add(currentCategoryMeta.id);
      }
      allTrips
        .filter(t => t && targetValues.has(t.category))
        .forEach(trip => {
          const tile = document.createElement('div');
          tile.className = 'category-tile';
          const tripSlug = trip.slug || trip.id;
          const btn = document.createElement('button');
          btn.className = 'category-btn ga-card';
          btn.dataset.trip = tripSlug;
          btn.dataset.cat = trip.category || category;
          btn.classList.add(`cat-${trip.category || category}`);
          if (['olympia','lefkas','parnassos','acropolis'].includes(tripSlug)) btn.classList.add('logo-pop');
          btn.title = getLocalized(trip.title) || '';
          btn.addEventListener('click', () => {
            try { sessionStorage.setItem('highlightTrip', tripSlug); } catch(_) {}
            window.location.href = `/booking/mode-select?trip=${encodeURIComponent(tripSlug)}`;
          });
          const iconWrapper = document.createElement('div');
          iconWrapper.className = 'category-icon';
          try {
            let iconPath = trip.iconPath || '';
            if (!iconPath) iconPath = DEFAULT_CATEGORY_ICON;
            const isSvg = /\.svg(\?|$)/i.test(iconPath);
            if (isSvg) {
              fetch(iconPath, { cache:'no-store' })
                .then(r => r.ok ? r.text() : Promise.reject(new Error('svg_fetch_failed_'+r.status)))
                .then(txt => {
                  try {
                    const cleaned = txt.replace(/<\?xml[^>]*>/ig,'').replace(/<!DOCTYPE[^>]*>/ig,'');
                    const tmp = document.createElement('div');
                    tmp.innerHTML = cleaned;
                    const svg = tmp.querySelector('svg');
                    if (svg) {
                      svg.removeAttribute('width');
                      svg.removeAttribute('height');
                      svg.setAttribute('role','img');
                      svg.setAttribute('aria-label', btn.title || 'Trip icon');
                      svg.classList.add('svg-icon');
                      iconWrapper.appendChild(svg);
                    } else {
                      throw new Error('no_svg_tag');
                    }
                  } catch(e){
                    const imgFallback = document.createElement('img');
                    imgFallback.src = iconPath;
                    imgFallback.alt = btn.title || 'Trip icon';
                    imgFallback.className = 'svg-icon';
                    iconWrapper.appendChild(imgFallback);
                  }
                })
                .catch(_ => {
                  const imgFallback = document.createElement('img');
                  imgFallback.src = iconPath;
                  imgFallback.alt = btn.title || 'Trip icon';
                  imgFallback.className = 'svg-icon';
                  iconWrapper.appendChild(imgFallback);
                });
            } else {
              const imgEl = document.createElement('img');
              imgEl.src = iconPath;
              imgEl.alt = btn.title || 'Trip icon';
              imgEl.className = 'svg-icon';
              iconWrapper.appendChild(imgEl);
            }
          } catch(_){ /* ignore icon errors */ }
          btn.appendChild(iconWrapper);
          const caption = document.createElement('div');
          caption.className = 'category-caption';
          caption.textContent = getLocalized(trip.title);
          tile.appendChild(btn);
          tile.appendChild(caption);
          container.appendChild(tile);
        });

      if (!container.children.length) {
        const noTrips = (window.t && typeof window.t === 'function') ? window.t('trips.noneFound') : 'Δεν βρέθηκαν εκδρομές αυτή την κατηγορία';
        container.innerHTML = `<p class="no-trips">${noTrips}</p>`;
      }
    }

    (async () => fetch(`/api/public/trips`, { cache:'no-store' }))()
      .then(r => { if (!r.ok) throw new Error('Failed to load trips'); return r.json(); })
      .then(allTrips => {
        window.__gwCategoryTrips = allTrips;
        renderCategoryTrips(allTrips);
        window.addEventListener('i18n:changed', () => {
          try {
            renderCategoryTrips(window.__gwCategoryTrips || allTrips);
            updateCategoryHeading(currentCategoryMeta);
          } catch(_) {}
        });
      })
    .catch(err => G.error("Σφάλμα tripindex:", err));
  });
})();
