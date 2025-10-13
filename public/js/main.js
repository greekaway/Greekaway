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

// ---------- [A] Λίστα Κατηγοριών (trips.html) ----------
document.addEventListener("DOMContentLoaded", () => {
  const categoriesContainer = document.getElementById("categories-container");
  if (!categoriesContainer) return; // αν δεν είμαστε σε trips.html συνέχισε στα επόμενα μπλοκ
  // indicate this is the category-listing view
  document.body.dataset.view = 'category';

  fetch("/data/categories.json")
    .then(r => {
      if (!r.ok) throw new Error("Αποτυχία φόρτωσης categories.json");
      return r.json();
    })
    .then(cats => {
      categoriesContainer.innerHTML = "";
      cats.forEach(cat => {
        const btn = document.createElement("button");
        btn.className = "category-btn";

  // ΜΟΝΟ η εικόνα (ο τίτλος υπάρχει ήδη πάνω στην ίδια την εικόνα)
  const catTitle = getLocalized(cat.title) || '';
  btn.innerHTML = `<img src="${cat.image}" alt="${catTitle}"><span class="cat-label">${catTitle}</span>`;
  // expose category id for styling and accessibility
  btn.dataset.cat = cat.id;
  btn.classList.add(`cat-${cat.id}`);
  btn.title = catTitle;

        btn.addEventListener("click", () => {
          // Μετάβαση στη σελίδα της κατηγορίας
          window.location.href = `/categories/${cat.id}.html`;
        });

        // Apply cinematic entrance for the three main categories (sea, mountain, culture)
        categoriesContainer.appendChild(btn);
        if (['sea','mountain','culture'].includes(cat.id)) {
          // tiny stagger so entrance feels natural
          const delay = (['sea','mountain','culture'].indexOf(cat.id) * 100) + 90;
          setTimeout(() => btn.classList.add('cinematic'), delay);
        }
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

  fetch("/data/tripindex.json")
    .then(r => r.json())
    .then(allTrips => {
      tripsContainer.innerHTML = "";
      allTrips
        .filter(t => t.category === category)
        .forEach(trip => {
          const card = document.createElement("div");
          card.className = "trip-card";
          // expose trip id so we can target specific cards (e.g. lefkas) with CSS
          card.dataset.tripId = trip.id;
          // If this is the Lefkada card, force the dark navy inline to avoid stylesheet overrides
          if (trip.id === 'lefkas') {
            // use setProperty with priority 'important' so it's inline-important
            card.style.setProperty('background-color', '#0E1520', 'important');
            card.style.setProperty('background-image', 'none', 'important');
            // inset 1px mask plus slightly stronger outer depth shadow to balance perceived tone
            card.style.setProperty('box-shadow', 'inset 0 0 0 1px #0E1520, 0 6px 18px rgba(0,0,0,0.48)', 'important');
            card.style.setProperty('filter', 'none', 'important');
            card.style.setProperty('backdrop-filter', 'none', 'important');
            card.style.setProperty('border', 'none', 'important');
            // (already applied above) subtle outer shadow + inset mask applied to blend perfectly
            card.style.setProperty('outline', 'none', 'important');
          }
          // If this is the olympia, lefkas, or parnassos trip, add the logo-pop animation class
          if (trip.id === 'olympia' || trip.id === 'lefkas' || trip.id === 'parnassos') card.classList.add('logo-pop');
          // add category metadata so we can style per-category
          card.dataset.cat = trip.category || category;
          card.classList.add(`cat-${trip.category || category}`);
          card.innerHTML = `<h3>${getLocalized(trip.title)}</h3>`;
          card.addEventListener("click", () => {
            // Mark this trip so the destination page can show a persistent highlight
            try { sessionStorage.setItem('highlightTrip', trip.id); } catch(e) {}
            // ΜΟΝΟ ΕΝΑ trip.html — δίνουμε id με query
            window.location.href = `/trips/trip.html?id=${trip.id}`;
          });
          tripsContainer.appendChild(card);
        });

      if (!tripsContainer.children.length) {
        const noTrips = (window.t && typeof window.t === 'function') ? window.t('trips.noneFound') : 'No trips found in this category.';
        tripsContainer.innerHTML = `<p>${noTrips}</p>`;
      }
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
  fetch('/data/tripindex.json')
    .then(r => r.json())
    .then(all => {
      const meta = (all || []).find(t => t.id === tripId);
      if (meta && meta.category) document.body.dataset.category = meta.category;
    })
    .catch(() => {});

  fetch(`/data/trips/${tripId}.json`)
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
          stopEl.innerHTML = `
            <h3 class="stop-title">${stopLabel}: ${getLocalized(stop.name) || ""}</h3>
            <div class="video-wrap">
              <iframe
                src="${stop.video}"
                title="${getLocalized(stop.name) || "video"}"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen
                width="100%"
                height="315">
              </iframe>
            </div>
            <p class="stop-description">${getLocalized(stop.description) || ""}</p>
          `;
          stopsWrap.appendChild(stopEl);
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
    })
    .catch(err => {
      G.error("Σφάλμα εκδρομής:", err);
      document.getElementById("trip-section").innerHTML =
        "<p>Σφάλμα φόρτωσης δεδομένων εκδρομής.</p>";
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