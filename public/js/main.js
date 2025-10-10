// ==============================
// main.js — Greekaway (ενιαίο, τελικό διορθωμένο)
// ==============================

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
  btn.innerHTML = `<img src="${cat.image}" alt="${cat.title}">`;
  // expose category id for styling and accessibility
  btn.dataset.cat = cat.id;
  btn.classList.add(`cat-${cat.id}`);
  btn.title = cat.title;

        btn.addEventListener("click", () => {
          // Μετάβαση στη σελίδα της κατηγορίας
          window.location.href = `/categories/${cat.id}.html`;
        });

        categoriesContainer.appendChild(btn);
      });
    })
    .catch(err => console.error("Σφάλμα φόρτωσης κατηγοριών:", err));
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
          // If this is the olympia trip, add the logo-pop animation class
          if (trip.id === 'olympia') card.classList.add('logo-pop');
          // add category metadata so we can style per-category
          card.dataset.cat = trip.category || category;
          card.classList.add(`cat-${trip.category || category}`);
          card.innerHTML = `<h3>${trip.title}</h3>`;
          card.addEventListener("click", () => {
            // ΜΟΝΟ ΕΝΑ trip.html — δίνουμε id με query
            window.location.href = `/trips/trip.html?id=${trip.id}`;
          });
          tripsContainer.appendChild(card);
        });

      if (!tripsContainer.children.length) {
        tripsContainer.innerHTML =
          "<p>Δεν βρέθηκαν εκδρομές σε αυτή την κατηγορία.</p>";
      }
    })
    .catch(err => console.error("Σφάλμα tripindex:", err));
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

  fetch(`/data/trips/${tripId}.json`)
    .then(r => {
      if (!r.ok) throw new Error("Αποτυχία φόρτωσης δεδομένων εκδρομής");
      return r.json();
    })
    .then(trip => {
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
      if (titleEl) titleEl.textContent = trip.title || "";
      if (descEl) descEl.textContent = trip.description || "";

      const stopsWrap = document.getElementById("stops");
      stopsWrap.innerHTML = "";
      (trip.stops || []).forEach((stop, i) => {
        const stopEl = document.createElement("div");
        stopEl.className = "trip-stop";
        stopEl.innerHTML = `
          <h3>Στάση ${i + 1}: ${stop.name || ""}</h3>
          <div class="video-box">
            <iframe
              src="${stop.video}"
              title="${stop.name || "video"}"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen
              width="100%"
              height="315">
            </iframe>
          </div>
          <p class="stop-description">${stop.description || ""}</p>
        `;
        stopsWrap.appendChild(stopEl);
      });

      if (trip.map && trip.map.waypoints && trip.map.waypoints.length >= 2) {
        ensureGoogleMaps(() => renderRoute(trip.map));
      }
    })
    .catch(err => {
      console.error("Σφάλμα εκδρομής:", err);
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
      console.error("Google Maps δεν φορτώθηκε εγκαίρως.");
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

  // Initial styled (dark/grayscale) look for first impression
  // We'll register this styled map type and set it as the initial view.
  const initialStyle = [
    { elementType: 'geometry', stylers: [{ color: '#1f2c3a' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#9ea7ae' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#172026' }] },
    {
      featureType: 'administrative.locality',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#cfcfcf' }]
    },
    {
      featureType: 'poi',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#bdbdbd' }]
    },
    {
      featureType: 'poi.business',
      stylers: [{ visibility: 'off' }]
    },
    {
      featureType: 'road',
      elementType: 'geometry',
      stylers: [{ color: '#2b3945' }]
    },
    {
      featureType: 'road',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#8aa0b0' }]
    },
    {
      featureType: 'transit',
      stylers: [{ visibility: 'simplified' }]
    },
    {
      featureType: 'water',
      elementType: 'geometry',
      stylers: [{ color: '#183241' }]
    }
  ];

  try {
    const styledMapType = new google.maps.StyledMapType(initialStyle, { name: 'Initial' });
    map.mapTypes.set('styled_map', styledMapType);
    // show the styled map first for a distinct initial look
    map.setMapTypeId('styled_map');

    // revert to normal roadmap after a short delay, or on user interaction
    const revert = () => {
      if (map && map.getMapTypeId && map.getMapTypeId() === 'styled_map') {
        map.setMapTypeId('roadmap');
      }
    };

    const timeoutId = setTimeout(revert, 3000);
    // if user interacts (mousedown/touchstart) revert immediately
    map.addListener('mousedown', () => { clearTimeout(timeoutId); revert(); });
    map.addListener('touchstart', () => { clearTimeout(timeoutId); revert(); });
  } catch (e) {
    // If maps API isn't fully available for styled types, silently continue
    console.warn('Styled map not applied:', e);
  }

  directionsService = new google.maps.DirectionsService();
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
      directionsRenderer.setDirections(res);
    } else {
      console.error("Σφάλμα διαδρομής:", status);
    }
  });
}