// ==============================
// Google Map + Route (Αθήνα → Λευκάδα) – robust fit + custom controls
// Διαβάζει από window.TRIP_WAYPOINTS / window.TRIP_CENTER αν υπάρχουν στο page
// ==============================
let routeBounds = null;
let directionsRenderer = null;
let map = null;

function initMap() {
  const mapEl = document.getElementById("map");
  if (!mapEl) {
    console.warn("#map δεν βρέθηκε στο DOM.");
    return;
  }

  const hasWaypoints = Array.isArray(window.TRIP_WAYPOINTS) && window.TRIP_WAYPOINTS.length > 0;

  map = new google.maps.Map(mapEl, {
    zoom: 7,
    center: window.TRIP_CENTER || { lat: 38.5, lng: 22.5 },
    mapTypeId: "satellite",
    gestureHandling: "greedy",
    fullscreenControl: false,   // δικό μας κουμπί
    mapTypeControl: true,
    streetViewControl: true,    // ανθρωπάκι
    rotateControl: false
  });

  if (!hasWaypoints) {
    console.warn("TRIP_WAYPOINTS δεν βρέθηκαν — ο χάρτης φορτώθηκε κεντραρισμένος μόνο.");
    return;
  }

  const directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map,
    suppressMarkers: false,
    preserveViewport: false,
    polylineOptions: { strokeColor: "#f9d65c", strokeWeight: 5, strokeOpacity: 0.95 }
  });

  // Waypoints από το page
  const waypts = window.TRIP_WAYPOINTS.map(loc => ({ location: loc, stopover: true }));

  // Αθήνα → Λευκάδα
  directionsService.route(
    {
      origin: "Athens, Greece",
      destination: "Lefkada, Greece",
      waypoints: waypts,
      optimizeWaypoints: true,
      travelMode: google.maps.TravelMode.DRIVING
    },
    (result, status) => {
      if (status === "OK" && result?.routes?.[0]) {
        directionsRenderer.setDirections(result);
        routeBounds = getRouteBoundsSafe(result.routes[0]);
        robustFitRoute();

        // Αν αλλάξει η renderer (π.χ. optimizeWaypoints) → ξανά fit
        google.maps.event.addListenerOnce(directionsRenderer, "directions_changed", () => {
          const dir = directionsRenderer.getDirections();
          if (dir?.routes?.[0]) {
            routeBounds = getRouteBoundsSafe(dir.routes[0]);
            robustFitRoute();
          }
        });
      } else {
        console.warn("Αποτυχία διαδρομής:", status);
      }
    }
  );

  // ---- Fullscreen (⤢ / ✕) ----
  const fsBtn = document.createElement("div");
  fsBtn.className = "gm-custom-btn";
  fsBtn.title = "Πλήρης οθόνη";
  fsBtn.textContent = "⤢";
  fsBtn.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        fsBtn.textContent = "⤢";
      } else {
        await map.getDiv().requestFullscreen();
        fsBtn.textContent = "✕";
      }
    } catch {
      // Fallback
      const on = !document.body.classList.contains("fs-active");
      document.body.classList.toggle("fs-active", on);
      fsBtn.textContent = on ? "✕" : "⤢";
    }
    setTimeout(robustFitRoute, 120);
  });
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(fsBtn);

  // ---- Reset (↺) ----
  const resetBtn = document.createElement("div");
  resetBtn.className = "gm-custom-btn";
  resetBtn.title = "Επανέφερε τη διαδρομή";
  resetBtn.textContent = "↺";
  resetBtn.addEventListener("click", () => {
    const dir = directionsRenderer?.getDirections?.();
    if (dir?.routes?.[0]) {
      routeBounds = getRouteBoundsSafe(dir.routes[0]);
      robustFitRoute();
      directionsRenderer.setDirections(dir); // redraw
    }
  });
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(resetBtn);

  // Συγχρονισμός fullscreen icon + μικρό refit
  ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"]
    .forEach(evt => document.addEventListener(evt, () => {
      const active = !!document.fullscreenElement || document.body.classList.contains("fs-active");
      fsBtn.textContent = active ? "✕" : "⤢";
      if (!active) document.body.classList.remove("fs-active");
      setTimeout(robustFitRoute, 80);
    }));

  // Refit σε resize
  window.addEventListener("resize", () => setTimeout(robustFitRoute, 60));

  // Refit όταν φορτωθούν τα tiles
  google.maps.event.addListenerOnce(map, "tilesloaded", () => {
    setTimeout(robustFitRoute, 80);
    setTimeout(robustFitRoute, 300);
  });

  // ===== Helpers =====
  function robustFitRoute() {
    if (!routeBounds) return;
    // fit με padding ώστε να “αναπνέει”
    if (typeof map.fitBounds === "function") {
      map.fitBounds(routeBounds, 15);
    } else {
      map.fitBounds(routeBounds);
    }
    // clamp για να μη φύγει υπερβολικά μακριά/κοντά
    google.maps.event.addListenerOnce(map, "idle", () => {
      const z = map.getZoom();
      if (z < 8.5) map.setZoom(8.5);
    });
  }

  function getRouteBoundsSafe(route) {
    if (route.bounds) return route.bounds;
    const b = new google.maps.LatLngBounds();
    if (route.overview_path?.length) {
      route.overview_path.forEach(pt => b.extend(pt));
    } else if (route.legs?.length) {
      route.legs.forEach(leg => {
        if (leg.start_location) b.extend(leg.start_location);
        if (leg.end_location)   b.extend(leg.end_location);
        (leg.steps || []).forEach(st => {
          if (st.start_location) b.extend(st.start_location);
          if (st.end_location)   b.extend(st.end_location);
          (st.path || []).forEach(p => b.extend(p));
        });
      });
    }
    return b;
  }
}

// διαθέσιμο για το Google Maps callback
window.initMap = initMap;

// ==============================
// Στυλ για τα custom κουμπιά
// ==============================
(function injectMapButtonsStyle(){
  if (document.getElementById("ga-map-btn-style")) return;
  const style = document.createElement("style");
  style.id = "ga-map-btn-style";
  style.textContent = `
.gm-custom-btn{
  background:#0d1a26; color:#f9d65c; border:none; border-radius:50%;
  padding:10px 12px; margin:10px; font-size:18px; line-height:18px; cursor:pointer;
  box-shadow:0 2px 6px rgba(0,0,0,0.4); transition:background .25s, transform .1s; user-select:none;
}
.gm-custom-btn:hover{ background:#004080; }
.gm-custom-btn:active{ transform:scale(0.97); }
`;
  document.head.appendChild(style);
})();
/* ==============================
   Custom Controls + Map Type Style
   ============================== */

// --- Κουμπί Πλήρους Οθόνης ---
const fsBtn = document.createElement('div');
fsBtn.className = 'gm-custom-btn';
fsBtn.title = 'Πλήρης οθόνη';
fsBtn.textContent = '⤢';
fsBtn.addEventListener('click', async () => {
  const mapEl = map.getDiv();
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      fsBtn.textContent = '⤢';
    } else {
      await mapEl.requestFullscreen();
      fsBtn.textContent = '✕';
    }
  } catch (e) {
    const on = !document.body.classList.contains('fs-active');
    document.body.classList.toggle('fs-active', on);
    fsBtn.textContent = on ? '✕' : '⤢';
  }
});
map.controls[google.maps.ControlPosition.TOP_RIGHT].push(fsBtn);

// --- Κουμπί Reset Διαδρομής ---
const resetBtn = document.createElement('div');
resetBtn.className = 'gm-custom-btn';
resetBtn.title = 'Επανέφερε τη διαδρομή';
resetBtn.textContent = '↺';
resetBtn.addEventListener('click', () => {
  if (routeBounds) map.fitBounds(routeBounds);
  if (directionsRenderer) {
    const dir = directionsRenderer.getDirections();
    if (dir) directionsRenderer.setDirections(dir);
  }
});
map.controls[google.maps.ControlPosition.TOP_RIGHT].push(resetBtn);

// --- Συγχρονισμός εικονιδίου fullscreen ---
['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange']
  .forEach(evt => document.addEventListener(evt, () => {
    const active = !!document.fullscreenElement || document.body.classList.contains('fs-active');
    fsBtn.textContent = active ? '✕' : '⤢';
    if (!active) document.body.classList.remove('fs-active');
  }));

/* ==============================
   Στυλ για όλα τα κουμπιά
   ============================== */
(function injectAllMapStyles(){
  const style = document.createElement('style');
  style.textContent = `

  /* Δικά μας custom κουμπιά (⤢, ↺) */
  .gm-custom-btn {
    background:#0d1a26;
    color:#f9d65c;
    border:none;
    border-radius:50%;
    padding:10px 12px;
    margin:10px;
    font-size:18px;
    line-height:18px;
    cursor:pointer;
    box-shadow:0 2px 6px rgba(0,0,0,0.4);
    transition:background 0.25s, transform 0.1s;
    user-select:none;
  }
  .gm-custom-btn:hover { background:#004080; }
  .gm-custom-btn:active { transform:scale(0.97); }

  /* Κουμπιά "Χάρτης / Δορυφόρος" της Google */
  .gm-style-mtc div > button {
    background:#0d1a26 !important;
    color:#f9d65c !important;
    border:none !important;
    border-radius:20px !important;
    padding:6px 14px !important;
    margin:2px !important;
    font-weight:bold !important;
    box-shadow:0 2px 6px rgba(0,0,0,0.4) !important;
    transition:background 0.25s ease, color 0.25s ease;
  }
  .gm-style-mtc div > button:hover {
    background:#002c59 !important;
    color:#fff !important;
  }
  .gm-style-mtc div > button[aria-pressed="true"] {
    background:#004080 !important;
    color:#fff !important;
  }
  `;
  document.head.appendChild(style);
})();
// ==============================
// Διορθωμένο style για Google κουμπιά "Χάρτης / Δορυφόρος"
// ==============================
(function styleGoogleMapTypeButtons(){
  function applyStyle() {
    const buttons = document.querySelectorAll('.gm-style button[role="menuitem"]');
    if (!buttons.length) return;

    buttons.forEach(btn => {
      btn.style.background = '#0d1a26';
      btn.style.color = '#f9d65c';
      btn.style.border = 'none';
      btn.style.borderRadius = '20px';
      btn.style.padding = '6px 14px';
      btn.style.margin = '2px';
      btn.style.fontWeight = 'bold';
      btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.4)';
      btn.style.transition = 'background 0.25s ease, color 0.25s ease';
    });

    const pressed = document.querySelector('.gm-style button[aria-pressed="true"]');
    if (pressed) {
      pressed.style.background = '#004080';
      pressed.style.color = '#fff';
    }
  }

  // Επαναλαμβάνει μέχρι να εμφανιστούν τα κουμπιά
  const interval = setInterval(() => {
    applyStyle();
    if (document.querySelectorAll('.gm-style button[role="menuitem"]').length) {
      clearInterval(interval);
    }
  }, 300);

  // Κι άλλη μία φορά στα 3s για σιγουριά
  setTimeout(applyStyle, 3000);
})();