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
      console.log('[GREEKAWAY] DirectionsService returned OK');
      // set directions on the map and then apply a gentle auto-zoom which
      // focuses on the route but prevents showing an overly-wide area (like
      // the whole country). We keep default markers visible.
      directionsRenderer.setDirections(res);
      try {
        const route = res.routes && res.routes[0];
        console.log('[GREEKAWAY] route object present?', !!route);
        let bounds = null;
        if (route && route.bounds) {
          bounds = route.bounds;
          console.log('[GREEKAWAY] route.bounds provided by API');
        } else if (route && route.overview_path) {
          bounds = new google.maps.LatLngBounds();
          route.overview_path.forEach(p => bounds.extend(p));
          console.log('[GREEKAWAY] computed bounds from overview_path, points:', route.overview_path.length);
        }
        if (bounds) {
          // Fit bounds with a small visual padding
          map.fitBounds(bounds);
          // Clamp zoom so we don't show the entire country when route is very long
          const minFriendlyZoom = 8; // adjust this value as needed
          // map.getZoom() is available after fitBounds; if it's smaller than desired, boost it
          const z = map.getZoom();
          console.log('[GREEKAWAY] map.getZoom() after fitBounds ->', z);
          if (typeof z === 'number' && z < minFriendlyZoom) {
            map.setZoom(minFriendlyZoom);
            console.log('[GREEKAWAY] map zoom clamped to', minFriendlyZoom);
          }
        } else {
          console.log('[GREEKAWAY] no bounds available for route');
        }
      } catch (e) {
        console.warn('Could not apply gentle auto-zoom:', e);
      }
    } else {
      console.error("Σφάλμα διαδρομής:", status);
    }
  });
}