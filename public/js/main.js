// ==============================
// main.js — Greekaway (ενιαίο, τελικό διορθωμένο)
// ==============================

// Lightweight logger: set debug = true to enable console output during development.
const G = {
  debug: false,
  log: (...a) => { if (G.debug) console.log(...a); },
  warn: (...a) => { if (G.debug) console.warn(...a); },
  error: (...a) => { if (G.debug) console.error(...a); }
};

// Temporary flag to disable any flatpickr calendar initialization in the booking overlay
// Allow only the inline calendar inside the overlay; prevent other calendars/popups
const GW_DISABLE_BOOKING_CALENDAR = false;
// Return translation for key if available; otherwise, return fallback
function tSafe(key, fallback){
  try {
    const v = (typeof window.t === 'function') ? window.t(key) : '';
    if (v && v !== key) return v;
  } catch(_){ }
  return fallback;
}

// Map current language to flatpickr locale pack key
function getFlatpickrLocale() {
  try {
    const lang = getCurrentLang();
    const l10n = (window.flatpickr && window.flatpickr.l10ns) ? window.flatpickr.l10ns : null;
    if (!l10n) return 'default';
    // Greek uses 'gr' in flatpickr
    if (lang === 'el') return l10n.gr || 'gr';
    // English is default when no l10n specified
    if (lang === 'en') return 'default';
    // direct mapping for fr, de, he if loaded
    if (l10n[lang]) return l10n[lang];
    return 'default';
  } catch(_) { return 'default'; }
}

// Global i18n helpers used by multiple blocks
function getCurrentLang() {
  return (window.currentI18n && window.currentI18n.lang) || localStorage.getItem('gw_lang') || 'el';
}

function getLocalized(field) {
  const currentLang = getCurrentLang();
  if (!field) return '';
  if (typeof field === 'string') return field; // legacy single-language
  if (typeof field === 'object') return field[currentLang] || field['el'] || Object.values(field)[0] || '';
  return '';
}

// Helper: ensure we have a data version to cache-bust /public/data JSON in prod
async function getDataVersionEnsure(){
  if (typeof window.__GW_DATA_VER !== 'undefined') return window.__GW_DATA_VER || '';
  try {
    const r = await fetch('/version.json', { cache: 'no-cache' });
    if (r.ok) {
      const j = await r.json();
      window.__GW_DATA_VER = (j && j.dataVersion) ? String(j.dataVersion) : '';
      return window.__GW_DATA_VER;
    }
  } catch(_){ }
  window.__GW_DATA_VER = '';
  return '';
}

// ---------- [A] Λίστα Κατηγοριών (trips.html) ----------
document.addEventListener("DOMContentLoaded", () => {
  try {
    const url = new URL(window.location.href);
    const smoke = url.searchParams.get('smoke');
    if ((typeof navigator !== 'undefined' && navigator.webdriver) || smoke === '1') {
      document.body.classList.add('booking-testing');
    }
  } catch(_) {}
  const categoriesContainer = document.getElementById("categories-container");
  if (!categoriesContainer) return; // αν δεν είμαστε σε trips.html συνέχισε στα επόμενα μπλοκ
  // indicate this is the category-listing view
  document.body.dataset.view = 'category';

  function renderCategories(cats){
    const container = document.getElementById("categories-container");
    if (!container) return;
    container.innerHTML = "";
    cats.forEach(cat => {
      const btn = document.createElement("button");
      btn.className = "category-btn";
      const catTitle = getLocalized(cat.title) || '';
      btn.innerHTML = `<img src="${cat.image}" alt="${catTitle}"><span class="cat-label">${catTitle}</span>`;
      btn.dataset.cat = cat.id;
      btn.classList.add(`cat-${cat.id}`);
      btn.title = catTitle;
      btn.addEventListener("click", () => { window.location.href = `/categories/${cat.id}.html`; });
      container.appendChild(btn);
      if (["sea","mountain","culture"].includes(cat.id)) {
        const delay = (["sea","mountain","culture"].indexOf(cat.id) * 100) + 90;
        setTimeout(() => btn.classList.add('cinematic'), delay);
      }
    });
  }

  (async () => {
    const dv = await getDataVersionEnsure();
    return fetch(`/data/categories.json${dv ? ('?v='+encodeURIComponent(dv)) : ''}`)
  })()
    .then(r => {
      if (!r.ok) throw new Error("Αποτυχία φόρτωσης categories.json");
      return r.json();
    })
    .then(cats => {
      window.__gwCategories = cats;
      renderCategories(cats);
      // Re-render titles on language switch
      window.addEventListener('i18n:changed', () => {
        try { renderCategories(window.__gwCategories || cats); } catch(_) {}
      });
    })
  .catch(err => G.error("Σφάλμα φόρτωσης κατηγοριών:", err));
});

// ---------- [B] Σελίδα Κατηγορίας (π.χ. /categories/culture.html) ----------
document.addEventListener("DOMContentLoaded", () => {
  const tripsContainer = document.getElementById("trips-container");
  if (!tripsContainer) return; // αν δεν είμαστε σε σελίδα κατηγορίας, πήγαινε στο [C]

  const category = document.body.dataset.category; // π.χ. "culture"
  // ensure view flag for listing pages
  document.body.dataset.view = 'category';
  if (!category) return;

  function renderCategoryTrips(allTrips){
    const container = document.getElementById("trips-container");
    if (!container) return;
    container.innerHTML = "";
    allTrips
      .filter(t => t.category === category)
      .forEach(trip => {
        const card = document.createElement("div");
        card.className = "trip-card";
        card.dataset.tripId = trip.id;
        if (trip.id === 'lefkas') {
          card.style.setProperty('background-color', '#0E1520', 'important');
          card.style.setProperty('background-image', 'none', 'important');
          card.style.setProperty('box-shadow', 'inset 0 0 0 1px #0E1520, 0 6px 18px rgba(0,0,0,0.48)', 'important');
          card.style.setProperty('filter', 'none', 'important');
          card.style.setProperty('backdrop-filter', 'none', 'important');
          card.style.setProperty('border', 'none', 'important');
          card.style.setProperty('outline', 'none', 'important');
        }
        if (trip.id === 'olympia' || trip.id === 'lefkas' || trip.id === 'parnassos') card.classList.add('logo-pop');
        card.dataset.cat = trip.category || category;
        card.classList.add(`cat-${trip.category || category}`);
        card.innerHTML = `<h3>${getLocalized(trip.title)}</h3>`;
        card.addEventListener("click", () => {
          try { sessionStorage.setItem('highlightTrip', trip.id); } catch(e) {}
          window.location.href = `/trips/trip.html?id=${trip.id}`;
        });
        container.appendChild(card);
      });

    if (!container.children.length) {
      const noTrips = (window.t && typeof window.t === 'function') ? window.t('trips.noneFound') : 'No trips found in this category.';
      container.innerHTML = `<p>${noTrips}</p>`;
    }
  }

  ;(async () => {
    const dv = await getDataVersionEnsure();
    return fetch(`/data/tripindex.json${dv ? ('?v='+encodeURIComponent(dv)) : ''}`)
  })()
    .then(r => r.json())
    .then(allTrips => {
      window.__gwCategoryTrips = allTrips;
      renderCategoryTrips(allTrips);
      window.addEventListener('i18n:changed', () => {
        try { renderCategoryTrips(window.__gwCategoryTrips || allTrips); } catch(_) {}
      });
    })
  .catch(err => G.error("Σφάλμα tripindex:", err));
});

// ---------- [C] Σελίδα Εκδρομής (/trips/trip.html?id=olympia) ----------
document.addEventListener("DOMContentLoaded", () => {
  const tripSection = document.getElementById("trip-section");
  if (!tripSection) return; // αν δεν είμαστε σε trip.html, τέλος

  const params = new URLSearchParams(window.location.search);
  const tripId = params.get("id");
  if (!tripId) {
    document.getElementById("trip-section").innerHTML =
      "<p>Δεν δόθηκε εκδρομή (λείπει το ?id=...).</p>";
    return;
  }

  // Try to set category early from tripindex so per-category background
  // appears as soon as possible (before the full trip JSON finishes loading).
  ;(async () => {
    const dv = await getDataVersionEnsure();
    return fetch(`/data/tripindex.json${dv ? ('?v='+encodeURIComponent(dv)) : ''}`)
  })()
    .then(r => r.json())
    .then(all => {
      const meta = (all || []).find(t => t.id === tripId);
      if (meta && meta.category) document.body.dataset.category = meta.category;
    })
    .catch(() => {});

  ;(async () => {
    const dv = await getDataVersionEnsure();
    return fetch(`/data/trips/${tripId}.json${dv ? ('?v='+encodeURIComponent(dv)) : ''}`)
  })()
    .then(r => {
      if (!r.ok) throw new Error("Αποτυχία φόρτωσης δεδομένων εκδρομής");
      return r.json();
    })
    .then(trip => {
  // If this is olympia or parnassos, give the trip page a navy background override
  if (trip.id === 'olympia' || trip.id === 'parnassos') document.body.classList.add('navy-bg');
      // If user clicked a trip card, keep a persistent highlight on arrival
      try {
        const h = sessionStorage.getItem('highlightTrip');
        if (h === tripId) document.body.classList.add('highlight-trip');
      } catch (e) {}

      const titleEl = document.getElementById("trip-title");
      const descEl = document.getElementById("trip-description");
      // set page category so background and styles match
        if (trip.category) {
          document.body.dataset.category = trip.category;
        } else {
          // fallback: find category from tripindex.json
          fetch('/data/tripindex.json')
            .then(r => r.json())
            .then(all => {
              const meta = (all || []).find(t => t.id === tripId);
              if (meta && meta.category) document.body.dataset.category = meta.category;
            })
            .catch(() => {});
        }
        // indicate this is an individual trip view so CSS can target it
        document.body.dataset.view = 'trip';

      // store loaded trip and render localized fields via a function so we can re-render on language change
      window.__loadedTrip = trip;

      function renderTripLocalized() {
        const t = window.__loadedTrip || trip;
        if (!t) return;
        if (titleEl) titleEl.textContent = getLocalized(t.title) || "";
        if (descEl) descEl.textContent = getLocalized(t.description) || "";

        const stopsWrap = document.getElementById("stops");
        if (!stopsWrap) return;
        stopsWrap.innerHTML = "";
        (t.stops || []).forEach((stop, i) => {
          const stopEl = document.createElement("div");
          // use video-card so CSS applies rounded card, padding and shadow
          stopEl.className = "trip-stop video-card";
          const stopLabelTemplate = (window.t && typeof window.t === 'function') ? window.t('stop.label') : 'Stop {n}';
          const stopLabel = stopLabelTemplate.replace('{n}', String(i + 1));
          const titleHtml = `<h3 class="stop-title">${stopLabel}: ${getLocalized(stop.name) || ""}</h3>`;
          const videos = Array.isArray(stop.videos) && stop.videos.length ? stop.videos : (stop.video ? [stop.video] : []);

          let videoArea = '';
          if (videos.length <= 1) {
            const v = videos[0] || '';
            videoArea = `
              <div class="video-wrap">
                <iframe
                  src="${v}"
                  title="${getLocalized(stop.name) || 'video'}"
                  frameborder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowfullscreen
                  loading="lazy"
                  width="100%"
                  height="315"></iframe>
              </div>`;
          } else {
            const slides = videos.map((url, idx) => `
              <div class="carousel-slide" data-idx="${idx}">
                <div class="video-wrap">
                  <iframe
                    data-src="${url}"
                    title="${(getLocalized(stop.name) || 'video') + ' — ' + (idx+1)}"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowfullscreen
                    loading="lazy"
                    width="100%"
                    height="315"></iframe>
                  <button class="slide-arrow left" type="button" data-i18n-aria="carousel.prev">&#10094;</button>
                  <button class="slide-arrow right" type="button" data-i18n-aria="carousel.next">&#10095;</button>
                </div>
              </div>`).join('');
            videoArea = `
              <div class="video-carousel peek" data-count="${videos.length}">
                <div class="carousel-viewport" tabindex="0" aria-label="Video carousel">
                  <div class="carousel-track">${slides}</div>
                  <div class="carousel-edge left" aria-hidden="true"></div>
                  <div class="carousel-edge right" aria-hidden="true"></div>
                </div>
              </div>`;
          }

          stopEl.innerHTML = `
            ${titleHtml}
            ${videoArea}
            <p class="stop-description">${getLocalized(stop.description) || ""}</p>
          `;
          stopsWrap.appendChild(stopEl);

          // Initialize carousel if present
          const carousel = stopEl.querySelector('.video-carousel');
          if (carousel) initScrollSnapCarousel(carousel);
        });

        // Render experience description below the last video on mobile
        if (t.experience) {
          const expEl = document.createElement('div');
          expEl.className = 'trip-experience card video-card';
          const expTitle = (window.t && typeof window.t === 'function') ? window.t('trip.experienceTitle') : 'Experience';
          expEl.innerHTML = `<h3 class="stop-title">${expTitle}</h3><p>${getLocalized(t.experience)}</p>`;
          stopsWrap.appendChild(expEl);
        }
      }

      // initial render
      renderTripLocalized();

      // Apply global carousel config to CSS variables once
      try {
        const C = window.GW_CAROUSEL_CONFIG || {};
        const rootStyle = document.documentElement && document.documentElement.style;
        if (rootStyle && C) {
          if (C.videoRadiusPx != null) rootStyle.setProperty('--video-radius', `${C.videoRadiusPx}px`);
          if (C.mobile && C.mobile.peek) rootStyle.setProperty('--cfg-peek-mobile', C.mobile.peek);
          if (C.mobile && C.mobile.gap) rootStyle.setProperty('--cfg-gap-mobile', C.mobile.gap);
          if (C.desktop && C.desktop.peek) rootStyle.setProperty('--cfg-peek-desktop', C.desktop.peek);
          if (C.desktop && C.desktop.gap) rootStyle.setProperty('--cfg-gap-desktop', C.desktop.gap);
        }
      } catch(_) {}

      // Native scroll-snap carousel with mouse drag, touch swipe and lazy-loading
  function initScrollSnapCarousel(root) {
  const viewport = root.querySelector('.carousel-viewport');
  const track = root.querySelector('.carousel-track');
  const slides = Array.from(root.querySelectorAll('.carousel-slide'));
  const edgeLeft = root.querySelector('.carousel-edge.left');
  const edgeRight = root.querySelector('.carousel-edge.right');
        if (!viewport || !track || slides.length < 2) return;

        // No dots: YouTube-like shelf UI (only swipe/drag + subtle peek)

        // Lazy load helper: set src from data-src for visible and neighbor
        const lazyLoadIndex = (i) => {
          [i-1, i, i+1].forEach(k => {
            if (k < 0 || k >= slides.length) return;
            const ifr = slides[k].querySelector('iframe');
            if (ifr && !ifr.src) {
              const ds = ifr.getAttribute('data-src');
              if (ds) ifr.src = ds;
            }
          });
        };

        // On scroll, compute nearest index
        let curIdx = 0;
        const computeIndex = () => {
          // pick the slide whose left edge is closest to current scrollLeft (robust to non-100% widths)
          let best = 0;
          let bestDist = Infinity;
          const sl = viewport.scrollLeft;
          for (let i = 0; i < slides.length; i++) {
            const left = slides[i].offsetLeft;
            const d = Math.abs(left - sl);
            if (d < bestDist) { bestDist = d; best = i; }
          }
          return best;
        };

        const onScroll = () => {
          const i = computeIndex();
          if (i !== curIdx) {
            curIdx = i;
            lazyLoadIndex(curIdx);
          }
          // Toggle arrows and edge hints
          const maxScroll = track.scrollWidth - viewport.clientWidth;
          const atStart = viewport.scrollLeft <= 2;
          const atEnd = viewport.scrollLeft >= (maxScroll - 2);
          if (edgeLeft) edgeLeft.style.opacity = atStart ? '0' : '1';
          if (edgeRight) edgeRight.style.opacity = atEnd ? '0' : '1';
          // Mark current slide to control per-slide arrows visibility
          slides.forEach((s, idx) => s.classList.toggle('is-current', idx === curIdx));
        };
        viewport.addEventListener('scroll', onScroll, { passive: true });

        // Per-slide arrow buttons
        slides.forEach((slide) => {
          const prevBtn = slide.querySelector('.slide-arrow.left');
          const nextBtn = slide.querySelector('.slide-arrow.right');
          if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); goToIndex(Math.max(0, curIdx - 1)); });
          if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); goToIndex(Math.min(slides.length - 1, curIdx + 1)); });
        });

        // No dots; navigation only via swipe/drag or wheel

        const goToIndex = (idx) => {
          const target = slides[idx] ? slides[idx].offsetLeft : idx * viewport.clientWidth;
          viewport.scrollTo({ left: target, behavior: 'smooth' }); // uses browser's default smooth easing; consistent across slides
        };

        // Keyboard navigation for desktop (focus the viewport and use arrow keys)
        viewport.addEventListener('keydown', (e) => {
          // Only handle when viewport has focus
          if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
          e.preventDefault();
          if (e.key === 'ArrowLeft') {
            goToIndex(Math.max(0, curIdx - 1));
          } else if (e.key === 'ArrowRight') {
            goToIndex(Math.min(slides.length - 1, curIdx + 1));
          } else if (e.key === 'Home') {
            goToIndex(0);
          } else if (e.key === 'End') {
            goToIndex(slides.length - 1);
          }
        });

        // Make sure viewport is focusable programmatically if not already (safety)
        if (!viewport.hasAttribute('tabindex')) viewport.setAttribute('tabindex', '0');

        // Drag/swipe to page exactly one slide per gesture
        let isDown = false, startX = 0, startLeft = 0, startIdx = 0, dragStartTime = 0;
        viewport.addEventListener('mousedown', (e) => {
          isDown = true;
          startX = e.clientX;
          startLeft = viewport.scrollLeft;
          startIdx = computeIndex();
          dragStartTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          viewport.classList.add('dragging');
          e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => {
          if (!isDown) return;
          const dx = e.clientX - startX;
          viewport.scrollLeft = startLeft - dx;
        });
        const C = window.GW_CAROUSEL_CONFIG || {};
        const swipe = C.swipe || {};
        const thresholdFrac = (typeof swipe.thresholdFrac === 'number') ? swipe.thresholdFrac : 0.06;
        const minFlickDeltaPx = (typeof swipe.minFlickDeltaPx === 'number') ? swipe.minFlickDeltaPx : 16;
        const maxFlickMs = (typeof swipe.maxFlickMs === 'number') ? swipe.maxFlickMs : 250;
        const minVelocityPxPerMs = (typeof swipe.minVelocityPxPerMs === 'number') ? swipe.minVelocityPxPerMs : 0.6;

        window.addEventListener('mouseup', () => {
          if (!isDown) return;
          isDown = false;
          viewport.classList.remove('dragging');
          const delta = viewport.scrollLeft - startLeft; // >0 if moved towards next
          const w = viewport.clientWidth;
          const threshold = Math.max(20, w * thresholdFrac);
          const dt = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - dragStartTime;
          const velocity = Math.abs(delta) / Math.max(1, dt); // px per ms
          const fastFlick = (velocity > minVelocityPxPerMs) || (dt < maxFlickMs && Math.abs(delta) > minFlickDeltaPx);
          let target = startIdx;
          if (delta > 0 && (Math.abs(delta) > threshold || fastFlick)) target = Math.min(slides.length - 1, startIdx + 1);
          else if (delta < 0 && (Math.abs(delta) > threshold || fastFlick)) target = Math.max(0, startIdx - 1);
          goToIndex(target);
        });
        // Touch swipe with controlled paging (disable native momentum)
        viewport.addEventListener('touchstart', (e) => {
          if (!(e.touches && e.touches[0])) return;
          isDown = true;
          startX = e.touches[0].clientX;
          startLeft = viewport.scrollLeft;
          startIdx = computeIndex();
          dragStartTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          viewport.classList.add('dragging');
        }, { passive: true });
        window.addEventListener('touchmove', (e) => {
          if (!isDown || !(e.touches && e.touches[0])) return;
          const dx = e.touches[0].clientX - startX;
          viewport.scrollLeft = startLeft - dx;
          e.preventDefault(); // prevent momentum
        }, { passive: false });
        window.addEventListener('touchend', () => {
          if (!isDown) return;
          isDown = false;
          viewport.classList.remove('dragging');
          const delta = viewport.scrollLeft - startLeft;
          const w = viewport.clientWidth;
          const threshold = Math.max(20, w * thresholdFrac);
          const dt = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - dragStartTime;
          const velocity = Math.abs(delta) / Math.max(1, dt);
          const fastFlick = (velocity > minVelocityPxPerMs) || (dt < maxFlickMs && Math.abs(delta) > minFlickDeltaPx);
          let target = startIdx;
          if (delta > 0 && (Math.abs(delta) > threshold || fastFlick)) target = Math.min(slides.length - 1, startIdx + 1);
          else if (delta < 0 && (Math.abs(delta) > threshold || fastFlick)) target = Math.max(0, startIdx - 1);
          goToIndex(target);
        }, { passive: true });

        // Trackpad wheel: treat a substantial horizontal wheel as a single page
        let wheelCooldown = false;
        viewport.addEventListener('wheel', (e) => {
          // Prefer horizontal deltas; if vertical dominant, ignore
          const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
          if (!dx) return;
          if (wheelCooldown) { e.preventDefault(); return; }
          const dir = dx > 0 ? 1 : -1;
          const next = Math.max(0, Math.min(slides.length - 1, curIdx + dir));
          if (next !== curIdx) {
            e.preventDefault();
            goToIndex(next);
            wheelCooldown = true;
            const cooldown = (window.GW_CAROUSEL_CONFIG && window.GW_CAROUSEL_CONFIG.wheelStepCooldownMs) || 280;
            setTimeout(() => { wheelCooldown = false; }, cooldown);
          }
        }, { passive: false });
  // Initial state
        // Preload first and neighbor
        lazyLoadIndex(0);
        // Ensure edge/arrows visibility initial and correct snap state
        requestAnimationFrame(onScroll);
        window.addEventListener('resize', () => { requestAnimationFrame(onScroll); });
      }

      // listen for language changes and re-render localized content
      window.addEventListener('i18n:changed', () => {
        try{ renderTripLocalized(); } catch(e){ G.error('i18n render failed', e); }
      });

      if (trip.map && trip.map.waypoints && trip.map.waypoints.length >= 2) {
        ensureGoogleMaps(() => renderRoute(trip.map));
      }

      // Show back-to-categories button when on a trip page
      const backBtn = document.getElementById('backToCatsBtn');
      if (backBtn) {
        backBtn.style.display = 'flex';
        backBtn.addEventListener('click', () => {
          // If we know the category, go to that category page; otherwise go to trips listing
          const cat = document.body.dataset.category;
          if (cat) window.location.href = `/categories/${cat}.html`;
          else window.location.href = '/trips.html';
        });
      }
      // Ensure the footer central booking button opens the booking/calendar overlay for this trip
      try {
        const central = document.querySelector('footer a.central-btn');
        if (central && window.__loadedTrip && window.__loadedTrip.id) {
          // make the central button open the booking overlay instead of navigating directly to checkout
          central.setAttribute('href', 'javascript:void(0)');
          central.removeAttribute('onclick');
          central.addEventListener('click', (ev) => {
            try {
              ev.preventDefault();
              const tripId = window.__loadedTrip.id;
              const tripTitle = getLocalized(window.__loadedTrip.title) || tripId;
              const titleEl = document.getElementById('bookingOverlayTitle');
              if (titleEl) {
                const prefix = (typeof window.t === 'function') ? window.t('booking.title') : 'Booking';
                titleEl.textContent = `${prefix} — ${tripTitle}`;
              }
              const tripIdInput = document.getElementById('bookingTripId');
              if (tripIdInput) tripIdInput.value = tripId;
              // start multi-step flow at Step 1 (calendar)
              startBookingFlow();
            } catch (err) { G.warn('Failed to start booking flow', err); }
          }, { passive: true });
        }
        // Also attach a delegated click handler to survive footer re-injection
        document.addEventListener('click', (ev) => {
          try {
            const link = ev.target && ev.target.closest && ev.target.closest('a.central-btn');
            if (!link) return;
            if (!document.getElementById('bookingOverlay') || !window.__loadedTrip || !window.__loadedTrip.id) return;
            ev.preventDefault();
            const tripId = window.__loadedTrip.id;
            const tripTitle = getLocalized(window.__loadedTrip.title) || tripId;
            const titleEl = document.getElementById('bookingOverlayTitle');
            if (titleEl) {
              const prefix = (typeof window.t === 'function') ? window.t('booking.title') : 'Booking';
              titleEl.textContent = `${prefix} — ${tripTitle}`;
            }
            const tripIdInput = document.getElementById('bookingTripId');
            if (tripIdInput) tripIdInput.value = tripId;
            startBookingFlow();
          } catch(e) { /* noop */ }
        }, { passive: false });
      } catch (e) { G.warn('Failed to wire central booking button', e); }

      // Multi-step booking flow helpers
      function startBookingFlow() {
        try {
          openOverlay('bookingOverlay');
          try { document.getElementById('bookingOverlay').classList.add('step1-active'); } catch(e){}
          // transform overlay-inner into step container
          const overlayInner = document.querySelector('#bookingOverlay .overlay-inner');
          if (!overlayInner) return;
          const tripForHeader = window.__loadedTrip || {};
          const stepDesc = (typeof getLocalized === 'function') ? (getLocalized(tripForHeader.description) || '') : '';
          const stepTitle = (typeof getLocalized === 'function') ? (getLocalized(tripForHeader.title) || '') : '';
          overlayInner.innerHTML = `
            <div id="step1" class="booking-step">
              <div class="step-meta">
                <div class="step-indicator" data-i18n="booking.step1_of3">${tSafe('booking.step1_of3','Step 1 of 3')}</div>
                <div class="trip-title">${stepTitle}</div>
                <div class="trip-desc">${stepDesc}</div>
              </div>
              <div class="trip-hero-title">${stepTitle}</div>
              <div class="calendar-card">
                <div class="calendar-full">
                  <input id="calendarFull" />
                </div>
              </div>
              <div id="occupancyIndicator" class="occupancy-indicator" aria-live="polite" style="text-align:center;margin-top:10px;">
                <span class="occ-pill"><span class="occ-label" data-i18n="booking.occupancy">${tSafe('booking.occupancy','Occupancy')}</span>: <span class="occ-count">—/7</span></span>
              </div>
              <div id="availabilityBlock" class="availability-block" style="display:none"></div>
              <div class="booking-actions">
                <button id="s1Cancel" class="btn btn-secondary" data-i18n="ui.back">${tSafe('ui.back','Back')}</button>
                <button id="s1Next" class="btn btn-primary" data-i18n="booking.next">${tSafe('booking.next','Next')}</button>
              </div>
            </div>
            <div id="step2" class="booking-step" style="display:none"></div>
            <div id="step3" class="booking-step" style="display:none"></div>
          `;

          // init full-screen flatpickr on #calendarFull using trip unavailable_dates
          const calEl = document.getElementById('calendarFull');
          const trip = window.__loadedTrip || {};
          const disabledDates = trip.unavailable_dates || [];
          if (!GW_DISABLE_BOOKING_CALENDAR && window.flatpickr && calEl) {
            // Use Greek locale (gr) for month/day names and Monday-first week
            try { if (window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.gr) { /* locale loaded */ } } catch(_){ }
            const fpLocale = getFlatpickrLocale();
            const fpOpts = {
              inline: true,
              altInput: false,
              monthSelectorType: 'static',
              dateFormat: 'Y-m-d',
              defaultDate: (new Date()).toISOString().slice(0,10),
              minDate: (new Date()).toISOString().slice(0,10),
              disable: disabledDates,
              locale: fpLocale,
              onReady: function(selectedDates, dateStr, instance) {
                try {
                  const cal = instance && instance.calendarContainer;
                  if (!cal) return;
                  // Add persistent step indicator at top of calendar
                  if (!cal.querySelector('.cal-step-indicator')) {
                    const step = document.createElement('div');
                    step.className = 'cal-step-indicator';
                    step.setAttribute('data-i18n','booking.step1_of3');
                    step.textContent = (typeof window.t==='function')?window.t('booking.step1_of3'):'Step 1 of 3';
                    cal.insertBefore(step, cal.firstChild);
                  }
                  // Force month selector to static text (hide dropdown if theme injected one)
                  const monthSelect = cal.querySelector('select.flatpickr-monthDropdown-months');
                  const curMonthSpan = cal.querySelector('.cur-month');
                  if (monthSelect && curMonthSpan) {
                    const opt = monthSelect.options[monthSelect.selectedIndex];
                    if (opt) curMonthSpan.textContent = opt.textContent;
                    monthSelect.style.display = 'none';
                  }
                  // Make year non-interactive to avoid up/down changing year inadvertently
                  const yearInput = cal.querySelector('.cur-year');
                  const yearWrap = cal.querySelector('.numInputWrapper');
                  if (yearInput) {
                    yearInput.setAttribute('readonly', 'readonly');
                    yearInput.addEventListener('wheel', (e)=>{ e.preventDefault(); }, { passive: false });
                    yearInput.addEventListener('keydown', (e)=>{
                      if (['ArrowUp','ArrowDown','PageUp','PageDown'].includes(e.key)) e.preventDefault();
                    });
                    // Force bold year across devices (inline style beats theme rules)
                    try { yearInput.style.fontWeight = '800'; yearInput.style.setProperty('font-variation-settings', "'wght' 800", 'important'); } catch(_){}
                  }
                  if (yearWrap) { yearWrap.style.pointerEvents = 'none'; }
                  // Ensure month nav chevrons are visible
                  const prev = cal.querySelector('.flatpickr-prev-month');
                  const next = cal.querySelector('.flatpickr-next-month');
                  if (prev) { prev.style.visibility = 'visible'; prev.style.opacity = '1'; }
                  if (next) { next.style.visibility = 'visible'; next.style.opacity = '1'; }
                } catch(_){}
              },
                onChange: (selectedDates, dateStr) => {
                  try { document.getElementById('bookingDate').value = dateStr; } catch(e){}
                  try { showAvailability(dateStr); } catch(e){}
                }
            };
            window.flatpickr(calEl, fpOpts);
          }

            // show availability for the default date immediately
            try { const def = (new Date()).toISOString().slice(0,10); document.getElementById('bookingDate').value = def; showAvailability(def); } catch(e){}

          // wire buttons
          const goStep2 = () => {
            try { document.getElementById('bookingOverlay').classList.remove('step1-active'); } catch(e){}
            // Navigate in the SAME tab to avoid any browser opening extra Google/new-tab pages
            // Persist trip info for Step 2 header
            try {
              sessionStorage.setItem('gw_trip_title', stepTitle || '');
              sessionStorage.setItem('gw_trip_desc', stepDesc || '');
            } catch(_) {}
            try {
              const origin = (window.location && window.location.origin) || (window.location.protocol + '//' + window.location.host) || '';
              const absUrl = origin ? (new URL('/step2.html', origin).href) : '/step2.html';
              try { window.location.assign(absUrl); }
              catch(_e1){ try { window.location.href = absUrl; } catch(_e2){ setTimeout(()=>{ window.location.href = '/step2.html'; }, 0); } }
            } catch(_){ window.location.href = '/step2.html'; }
          };
          document.getElementById('s1Next').addEventListener('click', (ev) => { try{ ev.preventDefault(); }catch(_){ } goStep2(); });
          document.getElementById('s1Cancel').addEventListener('click', () => { try { document.getElementById('bookingOverlay').classList.remove('step1-active'); } catch(e){} closeOverlay('bookingOverlay'); renderOriginalOverlayInner(); });

          // Ensure translations are applied to the freshly injected step (once and with a short retry)
          try { if (window.currentI18n && window.setLanguage) window.setLanguage(window.currentI18n.lang); } catch(_){ }
          try { setTimeout(() => { if (window.currentI18n && window.setLanguage) window.setLanguage(window.currentI18n.lang); }, 80); } catch(_){ }

          // Refresh step1 localized bits when language changes (title/desc and availability message)
          try {
            const onLang = () => {
              try {
                const tripForHeader2 = window.__loadedTrip || {};
                const stepDesc2 = (typeof getLocalized === 'function') ? (getLocalized(tripForHeader2.description) || '') : '';
                const stepTitle2 = (typeof getLocalized === 'function') ? (getLocalized(tripForHeader2.title) || '') : '';
                const titleEl2 = document.querySelector('#step1 .trip-title');
                const descEl2 = document.querySelector('#step1 .trip-desc');
                if (titleEl2) titleEl2.textContent = stepTitle2;
                if (descEl2) descEl2.textContent = stepDesc2;
              } catch(_){ }
              try {
                const calEl2 = document.getElementById('calendarFull');
                if (calEl2 && calEl2._flatpickr) {
                  const inst = calEl2._flatpickr;
                  const selected = inst.selectedDates && inst.selectedDates[0] ? inst.formatDate(inst.selectedDates[0], 'Y-m-d') : calEl2.value;
                  inst.destroy();
                  const fpLocale2 = getFlatpickrLocale();
                  window.flatpickr(calEl2, {
                    inline: true,
                    altInput: false,
                    monthSelectorType: 'static',
                    dateFormat: 'Y-m-d',
                    defaultDate: selected || (new Date()).toISOString().slice(0,10),
                    minDate: (new Date()).toISOString().slice(0,10),
                    disable: (window.__loadedTrip && window.__loadedTrip.unavailable_dates) || [],
                    locale: fpLocale2,
                    onReady: function(selectedDates, dateStr, instance){
                      try {
                        const cal = instance && instance.calendarContainer;
                        if (!cal) return;
                        if (!cal.querySelector('.cal-step-indicator')) {
                          const step = document.createElement('div');
                          step.className = 'cal-step-indicator';
                          step.setAttribute('data-i18n','booking.step1_of3');
                          step.textContent = (typeof window.t==='function')?window.t('booking.step1_of3'):'Step 1 of 3';
                          cal.insertBefore(step, cal.firstChild);
                        }
                        const monthSelect = cal.querySelector('select.flatpickr-monthDropdown-months');
                        const curMonthSpan = cal.querySelector('.cur-month');
                        if (monthSelect && curMonthSpan) {
                          const opt = monthSelect.options[monthSelect.selectedIndex];
                          if (opt) curMonthSpan.textContent = opt.textContent;
                          monthSelect.style.display = 'none';
                        }
                        const yearInput = cal.querySelector('.cur-year');
                        const yearWrap = cal.querySelector('.numInputWrapper');
                        if (yearInput) {
                          yearInput.setAttribute('readonly', 'readonly');
                          yearInput.addEventListener('wheel', (e)=>{ e.preventDefault(); }, { passive: false });
                          yearInput.addEventListener('keydown', (e)=>{
                            if (['ArrowUp','ArrowDown','PageUp','PageDown'].includes(e.key)) e.preventDefault();
                          });
                          try { yearInput.style.fontWeight = '800'; yearInput.style.setProperty('font-variation-settings', "'wght' 800", 'important'); } catch(_){ }
                        }
                        if (yearWrap) { yearWrap.style.pointerEvents = 'none'; }
                        const prev = cal.querySelector('.flatpickr-prev-month');
                        const next = cal.querySelector('.flatpickr-next-month');
                        if (prev) { prev.style.visibility = 'visible'; prev.style.opacity = '1'; }
                        if (next) { next.style.visibility = 'visible'; next.style.opacity = '1'; }
                      } catch(_){ }
                    },
                    onChange: (selectedDates, dateStr) => {
                      try { document.getElementById('bookingDate').value = dateStr; } catch(e){}
                      try { showAvailability(dateStr); } catch(e){}
                    }
                  });
                }
              } catch(_){ }
              try {
                const cur = document.getElementById('calendarFull') && document.getElementById('calendarFull').value;
                if (cur) showAvailability(cur);
              } catch(_){ }
            };
            window.addEventListener('i18n:changed', onLang);
          } catch(_){ }
        } catch (e) { G.warn('startBookingFlow failed', e); }
      }

      function renderOriginalOverlayInner() {
        const overlayInner = document.querySelector('#bookingOverlay .overlay-inner');
        if (!overlayInner) return;
        // Re-render the original form markup by reloading the page part — easiest is to reload the trip page
        // but to be lightweight, simply reload the window to reset overlay state
        window.location.reload();
      }

      function showStep2() {
        try {
          try { document.getElementById('bookingOverlay').classList.remove('step1-active'); } catch(e){}
          const step2 = document.getElementById('step2');
          const step1 = document.getElementById('step1');
          if (!step2 || !step1) return;
          step1.style.display = 'none';
          // render traveler detail form into step2
          step2.style.display = 'block';
          step2.innerHTML = `
            <div class="step-card form-narrow">
              <div class="progress-steps" data-i18n="booking.step2_of3" style="margin-bottom:6px;font-size:13px;color:#c9a24a;">${(typeof window.t==='function')?window.t('booking.step2_of3'):'Step 2 of 3'}</div>
              <h2 data-i18n="booking.traveler_profile">${(typeof window.t==='function')?window.t('booking.traveler_profile'):'Traveler Profile'}</h2>
              <div style="margin-top:12px">
                <label data-i18n="booking.seats">${(typeof window.t==='function')?window.t('booking.seats'):'Seats'}</label>
                <div class="seats-price" style="margin-top:6px;display:flex;align-items:center;gap:12px;">
                  <div class="seat-control"><button class="seat-dec">−</button><input id="bookingSeats2" type="number" value="1" min="1" max="10"><button class="seat-inc">+</button></div>
                  <div id="miniPrice" class="price-badge">—</div>
                </div>
              </div>
              <div style="margin-top:12px"><label data-i18n="checkout.name">${(typeof window.t==='function')?window.t('checkout.name'):'Name'}</label><input id="bookingName2" type="text" /></div>
              <div style="margin-top:12px"><label data-i18n="checkout.email">${(typeof window.t==='function')?window.t('checkout.email'):'Email'}</label><input id="bookingEmail2" type="email" /></div>
              <div style="margin-top:12px"><label data-i18n="booking.traveler_profile">${(typeof window.t==='function')?window.t('booking.traveler_profile'):'Traveler Profile'}</label>
                <select id="travelerProfile2" class="profile-select">
                  <option value="explorer" data-i18n="booking.traveler_type_options.explorer">🌍 ${(typeof window.t==='function')?window.t('booking.traveler_type_options.explorer'):'Explorers'}</option>
                  <option value="relaxed" data-i18n="booking.traveler_type_options.relaxed">😌 ${(typeof window.t==='function')?window.t('booking.traveler_type_options.relaxed'):'Relaxed Travelers'}</option>
                  <option value="family" data-i18n="booking.traveler_type_options.family">👨‍👩‍👧 ${(typeof window.t==='function')?window.t('booking.traveler_type_options.family'):'Family Style'}</option>
                  <option value="solo" data-i18n="booking.traveler_type_options.solo">🚶 ${(typeof window.t==='function')?window.t('booking.traveler_type_options.solo'):'Solo Adventurers'}</option>
                </select>
              </div>
              <div style="margin-top:8px"><label data-i18n="booking.travel_style">${(typeof window.t==='function')?window.t('booking.travel_style'):'Travel Style'}</label>
                <select id="travelStyle2" class="profile-select">
                  <option value="sociable" data-i18n="booking.travel_style_options.sociable">👥 ${(typeof window.t==='function')?window.t('booking.travel_style_options.sociable'):'Sociable'}</option>
                  <option value="quiet" data-i18n="booking.travel_style_options.quiet">🤫 ${(typeof window.t==='function')?window.t('booking.travel_style_options.quiet'):'Quiet'}</option>
                  <option value="cultural" data-i18n="booking.travel_style_options.cultural">🏛️ ${(typeof window.t==='function')?window.t('booking.travel_style_options.cultural'):'Cultural'}</option>
                  <option value="nature" data-i18n="booking.travel_style_options.nature">🌲 ${(typeof window.t==='function')?window.t('booking.travel_style_options.nature'):'Nature-oriented'}</option>
                </select>
              </div>
              <div style="margin-top:8px"><label data-i18n="booking.preferred_language">${(typeof window.t==='function')?window.t('booking.preferred_language'):'Preferred Language'}</label>
                <select id="preferredLanguage2" class="profile-select">
                  <option value="en" data-i18n="booking.preferred_language_options.en">🇬🇧 ${(typeof window.t==='function')?window.t('booking.preferred_language_options.en'):'English'}</option>
                  <option value="fr" data-i18n="booking.preferred_language_options.fr">🇫🇷 ${(typeof window.t==='function')?window.t('booking.preferred_language_options.fr'):'Français'}</option>
                  <option value="de" data-i18n="booking.preferred_language_options.de">🇩🇪 ${(typeof window.t==='function')?window.t('booking.preferred_language_options.de'):'Deutsch'}</option>
                  <option value="el" data-i18n="booking.preferred_language_options.el">🇬🇷 ${(typeof window.t==='function')?window.t('booking.preferred_language_options.el'):'Ελληνικά'}</option>
                </select>
              </div>
              <div style="margin-top:8px"><label data-i18n="booking.daily_rhythm">${(typeof window.t==='function')?window.t('booking.daily_rhythm'):'Daily rhythm'}</label>
                <select id="travelTempo2" class="profile-select">
                  <option value="early" data-i18n="booking.daily_rhythm_options.early">🌅 ${(typeof window.t==='function')?window.t('booking.daily_rhythm_options.early'):'Early riser'}</option>
                  <option value="night" data-i18n="booking.daily_rhythm_options.night">🌙 ${(typeof window.t==='function')?window.t('booking.daily_rhythm_options.night'):'Night type'}</option>
                  <option value="talkative" data-i18n="booking.daily_rhythm_options.talkative">💬 ${(typeof window.t==='function')?window.t('booking.daily_rhythm_options.talkative'):'Talkative'}</option>
                  <option value="reserved" data-i18n="booking.daily_rhythm_options.reserved">🙊 ${(typeof window.t==='function')?window.t('booking.daily_rhythm_options.reserved'):'Reserved'}</option>
                </select>
              </div>
              <div style="margin-top:12px;">
                <div class="booking-actions">
                  <button id="s2Back" class="btn btn-secondary" data-i18n="ui.back">${(typeof window.t==='function')?window.t('ui.back'):'Back'}</button>
                  <button id="s2Next" class="btn btn-primary" data-i18n="booking.next">${(typeof window.t==='function')?window.t('booking.next'):'Next'}</button>
                </div>
              </div>
            </div>
          `;
          // Apply translations on newly injected markup (once + short retry)
          try { if (window.currentI18n && window.setLanguage) window.setLanguage(window.currentI18n.lang); } catch(_){ }
          try { setTimeout(() => { if (window.currentI18n && window.setLanguage) window.setLanguage(window.currentI18n.lang); }, 80); } catch(_){ }
          // copy any existing values from original hidden form to these new fields
          try { const seats = document.getElementById('bookingSeats'); if (seats) document.getElementById('bookingSeats2').value = seats.value; } catch(e){}
          try { const name = document.getElementById('bookingName'); if (name) document.getElementById('bookingName2').value = name.value; } catch(e){}
          try { const email = document.getElementById('bookingEmail'); if (email) document.getElementById('bookingEmail2').value = email.value; } catch(e){}
          // wire autofill for step2 fields (email -> name) and seat controls for step2
          try {
            const email2 = document.getElementById('bookingEmail2');
            const name2 = document.getElementById('bookingName2');
            if (email2 && name2) {
              email2.addEventListener('input', () => autofillNameFromEmail(email2, name2));
              email2.addEventListener('blur', () => autofillNameFromEmail(email2, name2));
            }
            const seats2 = document.getElementById('bookingSeats2');
            const dec2 = step2.querySelector('.seat-dec');
            const inc2 = step2.querySelector('.seat-inc');
            if (dec2 && inc2 && seats2) {
              dec2.addEventListener('click', (e) => { e.preventDefault(); const v = Math.max(parseInt(seats2.value || '1',10) - 1, parseInt(seats2.min || '1',10)); seats2.value = v; updateMiniPrice(); refreshProceedButtons(); });
              inc2.addEventListener('click', (e) => { e.preventDefault(); const v = Math.min(parseInt(seats2.value || '1',10) + 1, parseInt(seats2.max || '10',10)); seats2.value = v; updateMiniPrice(); refreshProceedButtons(); });
              seats2.addEventListener('input', () => { updateMiniPrice(); refreshProceedButtons(); });
            }
            // profile option wiring (toggle selected class and set hidden values)
            try {
              const wireProfile = (containerId, targetName) => {
                const container = document.getElementById(containerId);
                if (!container) return;
                // if this is a SELECT, just mirror value -> dataset.selected and restore from original
                if (container.tagName === 'SELECT') {
                  try {
                    const orig = document.getElementById(targetName);
                    if (orig && orig.value) container.value = orig.value;
                  } catch(e){}
                  container.dataset.selected = container.value || '';
                  container.addEventListener('change', () => { container.dataset.selected = container.value; });
                  return;
                }
                // legacy profile-card wiring (for any remaining card UI)
                container.querySelectorAll('.profile-option').forEach(opt => {
                  opt.addEventListener('click', (ev) => {
                    container.querySelectorAll('.profile-option').forEach(o => o.classList.remove('selected'));
                    opt.classList.add('selected');
                    container.dataset.selected = opt.dataset.value;
                  });
                });
                try {
                  const orig = document.getElementById(targetName);
                  if (orig && orig.value) {
                    const match = container.querySelector(`.profile-option[data-value="${orig.value}"]`);
                    if (match) match.classList.add('selected');
                    container.dataset.selected = orig.value;
                  }
                } catch(e){}
              };
              wireProfile('travelerProfile2', 'travelerProfile');
              wireProfile('travelStyle2', 'travelStyle');
              wireProfile('preferredLanguage2', 'preferredLanguage');
              wireProfile('travelTempo2', 'travelTempo');
            } catch(e){}
            // initial mini-price
            try { updateMiniPrice(); } catch(e){}
          } catch(e){}
          // wire step2 buttons
          document.getElementById('s2Back').addEventListener('click', () => { document.getElementById('step2').style.display='none'; document.getElementById('step1').style.display='block'; try { document.getElementById('bookingOverlay').classList.add('step1-active'); } catch(e){} });
          document.getElementById('s2Next').addEventListener('click', () => { showStep3(); });
        } catch (e) { G.warn('showStep2 failed', e); }
      }

      function showStep3() {
        try {
          try { document.getElementById('bookingOverlay').classList.remove('step1-active'); } catch(e){}
          const step2 = document.getElementById('step2');
          const step3 = document.getElementById('step3');
          if (!step3 || !step2) return;
          step2.style.display = 'none';
          step3.style.display = 'block';
          // read values and render summary
          const date = (document.querySelector('#calendarFull') && document.querySelector('#calendarFull').value) || document.getElementById('bookingDate') && document.getElementById('bookingDate').value;
          const seats = document.getElementById('bookingSeats2') ? document.getElementById('bookingSeats2').value : (document.getElementById('bookingSeats') ? document.getElementById('bookingSeats').value : 1);
          const name = document.getElementById('bookingName2') ? document.getElementById('bookingName2').value : (document.getElementById('bookingName') ? document.getElementById('bookingName').value : '');
          const email = document.getElementById('bookingEmail2') ? document.getElementById('bookingEmail2').value : (document.getElementById('bookingEmail') ? document.getElementById('bookingEmail').value : '');
          const trip = window.__loadedTrip || {};
          const base = trip.price_cents ? parseInt(trip.price_cents,10) : 5000;
          const total = (base * parseInt(seats || '1',10))/100;
          step3.innerHTML = `
            <div class="booking-confirmation step-card confirmation-view">
              <h2 data-i18n="booking.confirmation_title">${(typeof window.t==='function')?window.t('booking.confirmation_title'):'Booking Confirmation'}</h2>
              <div class="progress-steps" data-i18n="booking.step3_of3" style="margin-top:8px;margin-bottom:6px;font-size:13px;color:#c9a24a;">${(typeof window.t==='function')?window.t('booking.step3_of3'):'Step 3 of 3'}</div>
              <div style="text-align:left;margin-top:12px;"> <strong data-i18n="booking.trip">${(typeof window.t==='function')?window.t('booking.trip'):'Trip'}</strong>: ${getLocalized(trip.title) || ''}</div>
              <div style="text-align:left;margin-top:6px;"> <strong data-i18n="booking.date">${(typeof window.t==='function')?window.t('booking.date'):'Date'}</strong>: ${date}</div>
              <div style="text-align:left;margin-top:6px;"> <strong data-i18n="booking.seats">${(typeof window.t==='function')?window.t('booking.seats'):'Seats'}</strong>: ${seats}</div>
              <div style="text-align:left;margin-top:6px;"> <strong data-i18n="booking.total">${(typeof window.t==='function')?window.t('booking.total'):'Total'}</strong>: ${total.toLocaleString(getCurrentLang(), { style:'currency', currency:(trip.currency||'EUR').toUpperCase() })}</div>
              <div style="text-align:left;margin-top:6px;"> <strong data-i18n="checkout.name">${(typeof window.t==='function')?window.t('checkout.name'):'Name'}</strong>: ${name}</div>
              <div style="text-align:left;margin-top:6px;"> <strong data-i18n="checkout.email">${(typeof window.t==='function')?window.t('checkout.email'):'Email'}</strong>: ${email}</div>
              <div style="margin-top:18px;">
                <div class="booking-actions">
                  <button id="s3Edit" class="btn btn-secondary">${(typeof window.t==='function')?window.t('ui.back'):'Back'}</button>
                  <button id="s3Proceed" class="btn btn-primary" data-i18n="checkout.pay">${(typeof window.t==='function')?window.t('checkout.pay'):'Pay'}</button>
                </div>
              </div>
            </div>
          `;
          // Apply translations on confirmation view (once + short retry)
          try { if (window.currentI18n && window.setLanguage) window.setLanguage(window.currentI18n.lang); } catch(_){ }
          try { setTimeout(() => { if (window.currentI18n && window.setLanguage) window.setLanguage(window.currentI18n.lang); }, 80); } catch(_){ }
          // mark overlay as confirmation-active to trigger high-specificity iOS fixes
          try { document.getElementById('bookingOverlay').classList.add('confirmation-active'); } catch(e){}
          document.getElementById('s3Edit').addEventListener('click', () => { document.getElementById('step3').style.display='none'; document.getElementById('step2').style.display='block'; try{ document.getElementById('bookingOverlay').classList.remove('confirmation-active'); }catch(e){} refreshProceedButtons(); });
          document.getElementById('s3Proceed').addEventListener('click', async () => {
            // build booking payload and POST to /api/bookings
            const payload = {};
            payload.trip_id = window.__loadedTrip && window.__loadedTrip.id;
            payload.date = date;
            payload.seats = parseInt(seats || '1',10);
            payload.user_name = name;
            payload.user_email = email;
            try {
              const p2 = document.getElementById('travelerProfile2');
              payload.travelerProfile = p2 ? ((p2.dataset && p2.dataset.selected) || p2.value || '') : (document.getElementById('travelerProfile') ? document.getElementById('travelerProfile').value : '');
              const t2 = document.getElementById('travelStyle2');
              payload.travelStyle = t2 ? ((t2.dataset && t2.dataset.selected) || t2.value || '') : (document.getElementById('travelStyle') ? document.getElementById('travelStyle').value : '');
              const l2 = document.getElementById('preferredLanguage2');
              payload.preferredLanguage = l2 ? ((l2.dataset && l2.dataset.selected) || l2.value || '') : (document.getElementById('preferredLanguage') ? document.getElementById('preferredLanguage').value : '');
              const tempo2 = document.getElementById('travelTempo2');
              payload.travelTempo = tempo2 ? ((tempo2.dataset && tempo2.dataset.selected) || tempo2.value || '') : (document.getElementById('travelTempo') ? document.getElementById('travelTempo').value : '');
            } catch(e) {
              payload.travelerProfile = document.getElementById('travelerProfile') ? document.getElementById('travelerProfile').value : '';
              payload.travelStyle = document.getElementById('travelStyle') ? document.getElementById('travelStyle').value : '';
              payload.preferredLanguage = document.getElementById('preferredLanguage') ? document.getElementById('preferredLanguage').value : '';
              payload.travelTempo = document.getElementById('travelTempo') ? document.getElementById('travelTempo').value : '';
            }
            const trip = window.__loadedTrip || {};
            const baseCents = trip.price_cents ? parseInt(trip.price_cents,10) : 5000;
            payload.price_cents = Math.max(0, baseCents * payload.seats);
            try {
              const resp = await fetch('/api/bookings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
              const j = await resp.json();
              if (resp.ok && j.bookingId) {
                // redirect to checkout with bookingId
                window.location.href = `/checkout.html?trip=${encodeURIComponent(window.__loadedTrip.id)}&bookingId=${encodeURIComponent(j.bookingId)}`;
              } else {
                alert('Failed to create booking');
              }
            } catch (e) { alert('Network error'); }
          });
        } catch (e) { G.warn('showStep3 failed', e); }
      }

      // Attach booking form handlers (extracted so we can re-attach after in-place overlay re-renders)
      try { attachBookingFormHandlers(); } catch (e) { G.warn('Failed to attach booking form handler (initial)', e); }

      // Rebuild the original booking overlay inner HTML in-place and reattach handlers
      function renderOriginalOverlayInner() {
        const overlayInner = document.querySelector('#bookingOverlay .overlay-inner');
        if (!overlayInner) return;
        // reconstruct the original booking form markup (must match /public/trips/trip.html structure)
        overlayInner.innerHTML = `
      <h2 id="bookingOverlayTitle" data-i18n="booking.title">${(typeof window.t==='function')?window.t('booking.title'):'Booking'}</h2>
      <form id="bookingForm" class="booking-form">
        <input type="hidden" name="trip_id" id="bookingTripId">

        <div class="row">
          <label for="bookingDate" data-i18n="booking.date">${(typeof window.t==='function')?window.t('booking.date'):'Date'}</label>
          <input id="bookingDate" name="date" type="date" required data-i18n-placeholder="booking.date_placeholder" placeholder="${(typeof window.t==='function')?window.t('booking.date_placeholder'):'YYYY-MM-DD'}" />
        </div>

        <div class="row two-col">
          <div>
            <label for="bookingSeats" data-i18n="booking.seats">${(typeof window.t==='function')?window.t('booking.seats'):'Seats'}</label>
            <div class="seat-control">
              <button type="button" class="seat-dec" data-i18n-aria="booking.decrease" aria-label="${(typeof window.t==='function')?window.t('booking.decrease'):'Decrease'}">−</button>
              <input id="bookingSeats" name="seats" type="number" value="1" min="1" max="10" required />
              <button type="button" class="seat-inc" data-i18n-aria="booking.increase" aria-label="${(typeof window.t==='function')?window.t('booking.increase'):'Increase'}">+</button>
            </div>
          </div>

          <div>
            <label for="bookingPrice" data-i18n="booking.total">${(typeof window.t==='function')?window.t('booking.total'):'Total'}</label>
            <div id="bookingPrice" class="price-tag">—</div>
          </div>
        </div>

        <div class="row">
          <label for="bookingName" data-i18n="checkout.name">${(typeof window.t==='function')?window.t('checkout.name'):'Name'}</label>
          <input id="bookingName" name="user_name" type="text" data-i18n-placeholder="booking.name_placeholder" placeholder="${(typeof window.t==='function')?window.t('booking.name_placeholder'):'Full name'}" required />
        </div>

        <div class="row">
          <label for="bookingEmail" data-i18n="checkout.email">${(typeof window.t==='function')?window.t('checkout.email'):'Email'}</label>
          <input id="bookingEmail" name="user_email" type="email" data-i18n-placeholder="booking.email_placeholder" placeholder="${(typeof window.t==='function')?window.t('booking.email_placeholder'):'name@example.com'}" required />
        </div>

        <div class="row section-title"><h3 data-i18n="booking.traveler_profile">${(typeof window.t==='function')?window.t('booking.traveler_profile'):'Traveler Profile'}</h3></div>
        <div class="row two-col">
          <div>
            <label for="travelerProfile" data-i18n="booking.traveler_type">${(typeof window.t==='function')?window.t('booking.traveler_type'):'Traveler Type'}</label>
            <select id="travelerProfile" name="travelerProfile">
              <option value="explorer" data-i18n="booking.traveler_type_options.explorer">🌍 ${(typeof window.t==='function')?window.t('booking.traveler_type_options.explorer'):'Explorers'}</option>
              <option value="relaxed" data-i18n="booking.traveler_type_options.relaxed">😌 ${(typeof window.t==='function')?window.t('booking.traveler_type_options.relaxed'):'Relaxed Travelers'}</option>
              <option value="family" data-i18n="booking.traveler_type_options.family">👨‍👩‍👧 ${(typeof window.t==='function')?window.t('booking.traveler_type_options.family'):'Family Style'}</option>
              <option value="solo" data-i18n="booking.traveler_type_options.solo">🚶 ${(typeof window.t==='function')?window.t('booking.traveler_type_options.solo'):'Solo Adventurers'}</option>
            </select>
          </div>
          <div>
            <label for="travelStyle" data-i18n="booking.travel_style">${(typeof window.t==='function')?window.t('booking.travel_style'):'Travel Style'}</label>
            <select id="travelStyle" name="travelStyle">
              <option value="sociable" data-i18n="booking.travel_style_options.sociable">👥 ${(typeof window.t==='function')?window.t('booking.travel_style_options.sociable'):'Sociable'}</option>
              <option value="quiet" data-i18n="booking.travel_style_options.quiet">🤫 ${(typeof window.t==='function')?window.t('booking.travel_style_options.quiet'):'Quiet'}</option>
              <option value="cultural" data-i18n="booking.travel_style_options.cultural">🏛️ ${(typeof window.t==='function')?window.t('booking.travel_style_options.cultural'):'Cultural'}</option>
              <option value="nature" data-i18n="booking.travel_style_options.nature">🌲 ${(typeof window.t==='function')?window.t('booking.travel_style_options.nature'):'Nature-oriented'}</option>
            </select>
          </div>
        </div>

        <div class="row two-col">
          <div>
            <label for="preferredLanguage" data-i18n="booking.preferred_language">${(typeof window.t==='function')?window.t('booking.preferred_language'):'Preferred Language'}</label>
            <select id="preferredLanguage" name="preferredLanguage">
              <option value="en" data-i18n="booking.preferred_language_options.en">🇬🇧 ${(typeof window.t==='function')?window.t('booking.preferred_language_options.en'):'English'}</option>
              <option value="fr" data-i18n="booking.preferred_language_options.fr">🇫🇷 ${(typeof window.t==='function')?window.t('booking.preferred_language_options.fr'):'Français'}</option>
              <option value="de" data-i18n="booking.preferred_language_options.de">🇩🇪 ${(typeof window.t==='function')?window.t('booking.preferred_language_options.de'):'Deutsch'}</option>
              <option value="el" data-i18n="booking.preferred_language_options.el">🇬🇷 ${(typeof window.t==='function')?window.t('booking.preferred_language_options.el'):'Ελληνικά'}</option>
            </select>
          </div>
          <div>
            <label for="travelTempo" data-i18n="booking.daily_rhythm">${(typeof window.t==='function')?window.t('booking.daily_rhythm'):'Daily rhythm'}</label>
            <select id="travelTempo" name="travelTempo">
              <option value="early" data-i18n="booking.daily_rhythm_options.early">🌅 ${(typeof window.t==='function')?window.t('booking.daily_rhythm_options.early'):'Early riser'}</option>
              <option value="night" data-i18n="booking.daily_rhythm_options.night">🌙 ${(typeof window.t==='function')?window.t('booking.daily_rhythm_options.night'):'Night type'}</option>
              <option value="talkative" data-i18n="booking.daily_rhythm_options.talkative">💬 ${(typeof window.t==='function')?window.t('booking.daily_rhythm_options.talkative'):'Talkative'}</option>
              <option value="reserved" data-i18n="booking.daily_rhythm_options.reserved">🙊 ${(typeof window.t==='function')?window.t('booking.daily_rhythm_options.reserved'):'Reserved'}</option>
            </select>
          </div>
        </div>

        <div class="row actions">
          <button class="btn" type="submit" data-i18n="booking.create">${(typeof window.t==='function')?window.t('booking.create'):'Create booking'}</button>
          <button type="button" class="btn ghost" onclick="closeOverlay('bookingOverlay')" data-i18n="ui.cancel">${(typeof window.t==='function')?window.t('ui.cancel'):'Cancel'}</button>
        </div>
      </form>

      <div id="bookingResult" class="booking-result" style="display:none"></div>
        `;

        // if we have a loaded trip id, set it
        try { const tripIdInput = document.getElementById('bookingTripId'); if (tripIdInput && window.__loadedTrip && window.__loadedTrip.id) tripIdInput.value = window.__loadedTrip.id; } catch(e){}
        // reattach handlers for the newly inserted form
        try { attachBookingFormHandlers(); } catch(e) { G.warn('Failed to reattach booking form handlers after render', e); }
      }

      // Utility: update displayed price based on seats and trip data
      function updatePrice() {
        try {
          const seatsEl = document.getElementById('bookingSeats');
          const priceEl = document.getElementById('bookingPrice');
          const seats = seatsEl ? Math.max(1, parseInt(seatsEl.value || '1',10)) : 1;
          const trip = window.__loadedTrip || null;
          let baseCents = 5000;
          if (trip && trip.price_cents) baseCents = parseInt(trip.price_cents,10) || baseCents;
          const total = Math.max(0, baseCents * seats);
          if (priceEl) {
            priceEl.textContent = (total / 100).toLocaleString(getCurrentLang(), { style: 'currency', currency: (trip && trip.currency) ? trip.currency.toUpperCase() : 'EUR' });
            // animate price gently
            priceEl.classList.remove('animate');
            // reflow to restart animation
            void priceEl.offsetWidth;
            priceEl.classList.add('animate');
            setTimeout(() => { priceEl.classList.remove('animate'); }, 600);
          }
        } catch (e) { /* ignore */ }
      }

      // Attach booking form handlers (idempotent) — wires flatpickr, seat controls, submit and autofill
      function attachBookingFormHandlers() {
        try {
          const bookingForm = document.getElementById('bookingForm');
          if (!bookingForm) return;
          // avoid double-binding handlers on the same element
          if (bookingForm.dataset.handlersAttached === '1') return;
          bookingForm.dataset.handlersAttached = '1';

          // set trip id if available
          try { const tripIdInput = document.getElementById('bookingTripId'); if (tripIdInput && window.__loadedTrip && window.__loadedTrip.id) tripIdInput.value = window.__loadedTrip.id; } catch(e){}

          // Prepare UI: set min date to today and wire flatpickr if available
          try {
            const dateEl = document.getElementById('bookingDate');
            if (dateEl) {
              const today = new Date();
              const iso = today.toISOString().slice(0,10);
              dateEl.setAttribute('min', iso);
              // init flatpickr for a modern calendar picker (dark theme)
              try {
                if (!GW_DISABLE_BOOKING_CALENDAR && window.flatpickr) {
                  const fpLocale = getFlatpickrLocale();
                  window.flatpickr(dateEl, {
                    altInput: true,
                    altFormat: 'd F Y',
                    dateFormat: 'Y-m-d',
                    defaultDate: iso,
                    minDate: iso,
                    locale: fpLocale,
                    theme: 'dark',
                    animate: true,
                    onOpen: function() { dateEl.classList.add('fp-open'); },
                    onClose: function() { dateEl.classList.remove('fp-open'); }
                  });
                }
              } catch (e) { /* ignore flatpickr init errors */ }
            }

            const seatsEl = document.getElementById('bookingSeats');
            const dec = bookingForm.querySelector('.seat-dec');
            const inc = bookingForm.querySelector('.seat-inc');
            if (dec && inc && seatsEl) {
              dec.addEventListener('click', (e) => { e.preventDefault(); const v = Math.max(parseInt(seatsEl.value || '1',10) - 1, parseInt(seatsEl.min || '1',10)); seatsEl.value = v; updatePrice(true); });
              inc.addEventListener('click', (e) => { e.preventDefault(); const v = Math.min(parseInt(seatsEl.value || '1',10) + 1, parseInt(seatsEl.max || '10',10)); seatsEl.value = v; updatePrice(true); });
              seatsEl.addEventListener('input', () => { const v = Math.max(parseInt(seatsEl.min || '1',10), Math.min(parseInt(seatsEl.value || '1',10), parseInt(seatsEl.max || '10',10))); seatsEl.value = v; updatePrice(true); refreshProceedButtons(); });
            }
          } catch (e) { /* ignore UI setup errors */ }

          bookingForm.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const data = {};
            new FormData(bookingForm).forEach((v,k) => { data[k] = v; });
            // ensure numeric seats and compute price_cents client-side when possible
            data.seats = parseInt(data.seats || '1', 10) || 1;
            // compute price from loaded trip if available: prefer trip.price_cents or fallback
            try {
              const trip = window.__loadedTrip;
              let baseCents = null;
              if (trip && trip.price_cents) baseCents = parseInt(trip.price_cents,10);
              // If trip has no explicit price, assume a default (e.g. 5000 cents = €50) — keep conservative
              if (!baseCents) baseCents = 5000;
              data.price_cents = Math.max(0, baseCents * data.seats);
            } catch (e) { data.price_cents = 0; }
            // include traveler profile fields if present
            try {
              const profile = document.getElementById('travelerProfile'); if (profile) data.travelerProfile = profile.value;
              const style = document.getElementById('travelStyle'); if (style) data.travelStyle = style.value;
              const lang = document.getElementById('preferredLanguage'); if (lang) data.preferredLanguage = lang.value;
              const tempo = document.getElementById('travelTempo'); if (tempo) data.travelTempo = tempo.value;
            } catch (e) { /* ignore */ }
            try {
              const resp = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
              const json = await resp.json();
              const result = document.getElementById('bookingResult');
              if (!resp.ok) {
                if (result) { result.style.display = 'block'; result.style.background = '#ffe6e6'; result.textContent = json && json.error ? json.error : ((window.t && window.t('booking.error_create')) || 'Error creating booking'); }
                return;
              }
              // success: show link to proceed to checkout with booking id attached
              if (result) {
                result.style.display = 'block';
                result.style.background = '#e6ffe6';
                const bookingId = json && json.bookingId ? json.bookingId : null;
                if (bookingId) {
                  const href = `/checkout.html?trip=${encodeURIComponent(window.__loadedTrip.id)}&bookingId=${encodeURIComponent(bookingId)}`;
                  const created = (window.t && window.t('booking.created')) || 'Booking created';
                  const link = (window.t && window.t('booking.proceed_to_checkout')) || 'Proceed to Checkout';
                  result.innerHTML = `${created} (ID: ${bookingId}). <div style="margin-top:10px;"><a class="btn" href="${href}">${link}</a></div>`;
                } else {
                  result.textContent = (window.t && window.t('booking.created')) || 'Booking created';
                }
              }
            } catch (err) {
              G.error('Booking submit error', err);
              const result = document.getElementById('bookingResult');
              if (result) { result.style.display = 'block'; result.style.background = '#ffe6e6'; result.textContent = (window.t && window.t('booking.error_network')) || 'Network error creating booking'; }
            }
          });

          // wire email -> name autofill for original form
          try {
            const emailOrig = document.getElementById('bookingEmail');
            const nameOrig = document.getElementById('bookingName');
            if (emailOrig && nameOrig) {
              emailOrig.addEventListener('input', () => autofillNameFromEmail(emailOrig, nameOrig));
              emailOrig.addEventListener('blur', () => autofillNameFromEmail(emailOrig, nameOrig));
            }
          } catch(e){}

          // initial price update
          try { updatePrice(); } catch(e){}
        } catch (e) { G.warn('Failed to attach booking form handler', e); }
      }

      // Auto-complete name from email heuristics (simple local-part split)
      function autofillNameFromEmail(emailEl, nameEl) {
        try {
          const val = (emailEl && emailEl.value) || '';
          if (!val) return;
          if (nameEl && nameEl.value && nameEl.value.trim().length > 1) return; // don't override real names
          const local = val.split('@')[0] || '';
          // try to split on common separators and numbers; remove digits, handle lastname-like parts
          const cleaned = local.replace(/[0-9]+/g, '').replace(/(^|\.|_|-)([a-z])/g, (m,p,l) => ' ' + l).trim();
          const parts = cleaned.split(/\s+/).filter(Boolean).map(p => p.charAt(0).toUpperCase() + p.slice(1));
          if (parts.length) {
            // join into a two-part name if many parts (first + rest)
            const out = parts.length > 2 ? `${parts[0]} ${parts.slice(1).join(' ')}` : parts.join(' ');
            if (nameEl) nameEl.value = out;
          }
        } catch (e) {}
      }

      // update the mini price in step2 based on seats and trip.price_cents
      function updateMiniPrice() {
        try {
          const seats2 = document.getElementById('bookingSeats2');
          const mini = document.getElementById('miniPrice');
          const trip = window.__loadedTrip || {};
          const base = trip.price_cents ? parseInt(trip.price_cents,10) : 5000;
          const s = seats2 ? Math.max(1, parseInt(seats2.value || '1',10)) : 1;
          const total = (base * s) / 100;
          if (mini) mini.textContent = total.toLocaleString(getCurrentLang(), { style:'currency', currency: (trip.currency||'EUR').toUpperCase() });
          try { if (mini) { mini.classList.remove('pulse'); void mini.offsetWidth; mini.classList.add('pulse'); setTimeout(()=>{ mini.classList.remove('pulse'); }, 700); } } catch(e){}
        } catch(e){}
      }

      // Fetch availability for a trip/date and render into the availability block under the calendar
      async function showAvailability(dateStr) {
        try {
          const trip = window.__loadedTrip || {};
          if (!trip.id || !dateStr) {
            const el = document.getElementById('availabilityBlock'); if (el) { el.style.display='none'; }
            return;
          }
          const el = document.getElementById('availabilityBlock');
          const occ = document.getElementById('occupancyIndicator');
          if (!el) return;
          // Show the availability banner (without the step indicator prefix).
          el.style.display = 'block';
          el.textContent = tSafe('booking.loading_availability','Loading availability…');
          const q = new URLSearchParams({ trip_id: trip.id, date: dateStr });
          let capacity = 7, taken = 0, avail = 0;
          try {
            const resp = await fetch('/api/availability?' + q.toString());
            if (resp.ok) {
              const j = await resp.json();
              capacity = j.capacity || 7;
              taken = j.taken || 0;
              avail = Math.max(0, capacity - taken);
            }
          } catch(_) {}
          // Render compact occupancy “x/y” above the buttons
          try {
            if (occ) {
              const pill = occ.querySelector('.occ-pill');
              const occLabel = (window.t && window.t('booking.occupancy')) || 'Occupancy';
              const txt = `${occLabel}: ${taken}/${capacity}`;
              if (pill) pill.textContent = txt; else occ.textContent = txt;
              occ.dataset.taken = String(taken);
              occ.dataset.capacity = String(capacity);
            }
          } catch(e) {}
          // Show compact message only with DD-MM-YYYY format as requested.
          // Try to format ISO (YYYY-MM-DD) to DD-MM-YYYY; fallback to the original if parsing fails.
          const formattedDate = (() => {
            try {
              if (typeof dateStr === 'string') {
                const parts = dateStr.split('-');
                if (parts.length === 3) {
                  const [yy, mm, dd] = parts;
                  if (yy && mm && dd) return `${dd.padStart(2,'0')}-${mm.padStart(2,'0')}-${yy}`;
                }
                const d = new Date(dateStr);
                if (!isNaN(d)) {
                  const dd = String(d.getDate()).padStart(2,'0');
                  const mm = String(d.getMonth()+1).padStart(2,'0');
                  const yy = d.getFullYear();
                  return `${dd}-${mm}-${yy}`;
                }
              }
            } catch(_) {}
            return dateStr;
          })();
          const availMsg = tSafe('booking.availability_msg','Availability for {date}: total {capacity}, booked {taken}');
          const msg = availMsg
            .replace('{date}', formattedDate)
            .replace('{capacity}', String(capacity))
            .replace('{taken}', String(taken));
          // Show only the availability message here (step indicator lives in the calendar header)
          try { el.textContent = msg; } catch(_){ }
          // store last known availability on the block for other logic
          el.dataset.avail = String(avail);
          el.dataset.capacity = String(capacity);
          el.dataset.taken = String(taken);
          // enable/disable step1 Next button when availability is zero
          try { const btn = document.getElementById('s1Next'); if (btn) btn.disabled = (avail <= 0); } catch(e){}
        } catch (e) {
          try { const el = document.getElementById('availabilityBlock'); if (el) el.textContent = (window.t && window.t('booking.error_availability')) || 'Error checking availability'; } catch(_){ }
        }
      }

      // helper: refresh Next/Proceed buttons based on availability vs requested seats
      function refreshProceedButtons() {
        try {
          const availEl = document.getElementById('availabilityBlock');
          const avail = availEl && availEl.dataset && parseInt(availEl.dataset.avail || '-1',10) >= 0 ? parseInt(availEl.dataset.avail || '-1',10) : null;
          const seatsRequested = (() => {
            const s2 = document.getElementById('bookingSeats2'); if (s2) return parseInt(s2.value||'1',10);
            const s1 = document.getElementById('bookingSeats'); if (s1) return parseInt(s1.value||'1',10);
            return 1;
          })();
          // s2Next should be disabled if seatsRequested > avail (when avail is known)
          const s2Next = document.getElementById('s2Next'); if (s2Next && avail !== null) s2Next.disabled = (seatsRequested > avail);
          const s3Proceed = document.getElementById('s3Proceed'); if (s3Proceed && avail !== null) s3Proceed.disabled = (seatsRequested > avail);
        } catch (e) {}
      }

      // wire email -> name autofill for original and step2 forms
      try {
        const emailOrig = document.getElementById('bookingEmail');
        const nameOrig = document.getElementById('bookingName');
        if (emailOrig && nameOrig) {
          emailOrig.addEventListener('input', () => autofillNameFromEmail(emailOrig, nameOrig));
          emailOrig.addEventListener('blur', () => autofillNameFromEmail(emailOrig, nameOrig));
        }
      } catch(e){}

      // ensure price updates when overlay opens (observer set earlier in overlay open path)
      try { document.addEventListener('click', (ev) => { if (ev.target && ev.target.closest && ev.target.closest('a.central-btn')) setTimeout(updatePrice,150); }); } catch (e) {}
    })
    .catch(err => {
      G.error("Trip error:", err);
      const msg = (window.t && window.t('booking.error_trip')) || 'Error loading trip data';
      document.getElementById("trip-section").innerHTML =
        `<p>${msg}.</p>`;
    });
});

// ---------- Google Maps helpers ----------
function ensureGoogleMaps(cb) {
  if (window.google && window.google.maps) return cb();
  const maxWaitMs = 7000;
  const t0 = Date.now();
  const timer = setInterval(() => {
    if (window.google && window.google.maps) {
      clearInterval(timer);
      cb();
    } else if (Date.now() - t0 > maxWaitMs) {
      clearInterval(timer);
  G.error("Google Maps δεν φορτώθηκε εγκαίρως.");
    }
  }, 120);
}

let map, directionsService, directionsRenderer;

function renderRoute(mapData) {
  const mapEl = document.getElementById("map");
  if (!mapEl) return;

  // Create the map centered on the provided coordinates
  map = new google.maps.Map(mapEl, {
    center: mapData.center || { lat: 38.0, lng: 23.7 },
    zoom: mapData.zoom || 7,
    mapTypeId: "roadmap",
  });

  // default map appearance (no initial styled dark theme)

  directionsService = new google.maps.DirectionsService();
  // Use default markers so origin/destination pins are visible to the user
  directionsRenderer = new google.maps.DirectionsRenderer({ map });

  const wps = mapData.waypoints;
  const origin = wps[0];
  const destination = wps[wps.length - 1];
  const midStops = wps
    .slice(1, wps.length - 1)
    .map((loc) => ({ location: loc, stopover: true }));

  const req = {
    origin,
    destination,
    waypoints: midStops,
    travelMode: google.maps.TravelMode.DRIVING,
  };

  directionsService.route(req, (res, status) => {
    if (status === "OK") {
      // simply render the directions on the map; do not auto-fit or force zoom.
      directionsRenderer.setDirections(res);
    } else {
      G.error("Σφάλμα διαδρομής:", status);
    }
  });
}