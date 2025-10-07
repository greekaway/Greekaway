// ==============================
// main.js – Greekaway (Αθήνα → Λευκάδα με σωστό zoom & custom controls)
// ==============================

// ----------------------
// Φόρτωση εκδρομών
// ----------------------
document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("trips-container");
  if (!container) return;

  fetch("../data/trip.json")
    .then(r => (r.ok ? r.json() : Promise.reject("Αποτυχία φόρτωσης trip.json")))
    .then(trips => {
      container.innerHTML = "";
      trips.forEach(trip => {
        const card = document.createElement("div");
        card.className = "trip-card";
        card.innerHTML = `
          <img src="../images/${trip.image}" alt="${trip.title}">
          <h2>${trip.title}</h2>
          <p><strong>Κατηγορία:</strong> ${trip.category}</p>
          <p>${trip.description}</p>
          <a href="${getTripUrl(trip)}" class="trip-btn">Περισσότερα</a>`;
        container.appendChild(card);
      });
    })
    .catch(err => {
      console.error(err);
      container.innerHTML = "<p>Σφάλμα φόρτωσης εκδρομών.</p>";
    });
});

function getTripUrl(trip) {
  const title = (trip.title || "").toLowerCase();
  if (title.includes("λευκάδ")) return "./sea/lefkas/lefkas.html";
  if (title.includes("δελφ")) return "./culture/delphi/delphi.html";
  return "#";
}

// ==============================
// Google Map + Route (Αθήνα → Λευκάδα)
// ==============================
let routeBounds = null;
let directionsRenderer = null;
let map = null;

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 7,
    center: { lat: 38.5, lng: 22.5 },
    mapTypeId: "satellite",
    fullscreenControl: false,    // έχουμε δικό μας κουμπί
    mapTypeControl: true,
    streetViewControl: true,     // "ανθρωπάκι"
    rotateControl: false
  });

  const directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map,
    suppressMarkers: false, // δείχνει A-B-C-D pins
    preserveViewport: false,
    polylineOptions: { strokeColor: "#f9d65c", strokeWeight: 5, strokeOpacity: 0.95 }
  });

  // --- Waypoints στη Λευκάδα (μπορείς να προσθέσεις/αλλάξεις ελεύθερα)
  const waypts = [
    { location: "Rachi Exanthia, Lefkada, Greece", stopover: true },
    { location: "Kathisma Beach, Lefkada, Greece", stopover: true },
    { location: "Nidri, Lefkada, Greece", stopover: true }
  ];

  directionsService.route(
    {
      origin: "Athens, Greece",
      destination: "Lefkada, Greece",
      waypoints: waypts,
      optimizeWaypoints: true,
      travelMode: google.maps.TravelMode.DRIVING
    },
    (result, status) => {
      if (status === "OK" && result && result.routes && result.routes[0]) {
        directionsRenderer.setDirections(result);
        routeBounds = result.routes[0].bounds;

        // Zoom πάνω στη διαδρομή με μικρό padding για να "αναπνέει"
        if (routeBounds) {
          // το δεύτερο όρισμα είναι padding σε px
          if (typeof map.fitBounds === "function") {
            map.fitBounds(routeBounds, 60);
          } else {
            map.fitBounds(routeBounds);
          }
        }

        // "Έξυπνο" clamp στο zoom για να μη δείχνει υπερβολικά μακριά ή κοντά
        google.maps.event.addListenerOnce(map, "bounds_changed", () => {
          const z = map.getZoom();
          if (z < 7.5) map.setZoom(7.5);
          if (z > 9) map.setZoom(9);
        });
      } else {
        console.warn("Αποτυχία διαδρομής:", status);
      }
    }
  );

  // ---- Custom κουμπί Fullscreen (⤢ / ✕) ----
  const fsBtn = document.createElement("div");
  fsBtn.className = "gm-custom-btn";
  fsBtn.title = "Πλήρης οθόνη";
  fsBtn.textContent = "⤢";
  fsBtn.addEventListener("click", async () => {
    const mapEl = map.getDiv();
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        fsBtn.textContent = "⤢";
      } else {
        await mapEl.requestFullscreen();
        fsBtn.textContent = "✕";
      }
    } catch (e) {
      // Fallback για browsers που δεν υποστηρίζουν καλά Fullscreen API
      const on = !document.body.classList.contains("fs-active");
      document.body.classList.toggle("fs-active", on);
      fsBtn.textContent = on ? "✕" : "⤢";
    }
  });
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(fsBtn);

  // ---- Custom κουμπί Reset (↺) → επαναφέρει το αρχικό view της διαδρομής ----
  const resetBtn = document.createElement("div");
  resetBtn.className = "gm-custom-btn";
  resetBtn.title = "Επανέφερε τη διαδρομή";
  resetBtn.textContent = "↺";
  resetBtn.addEventListener("click", () => {
    if (routeBounds) {
      if (typeof map.fitBounds === "function") {
        map.fitBounds(routeBounds, 60);
      } else {
        map.fitBounds(routeBounds);
      }
      google.maps.event.addListenerOnce(map, "bounds_changed", () => {
        const z = map.getZoom();
        if (z < 7.5) map.setZoom(7.5);
        if (z > 9) map.setZoom(9);
      });
    }
    // ξαναζωγράφισε τη διαδρομή όπως φορτώθηκε
    if (directionsRenderer) {
      const dir = directionsRenderer.getDirections();
      if (dir) directionsRenderer.setDirections(dir);
    }
  });
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(resetBtn);

  // Συγχρονισμός εικονιδίου fullscreen όταν αλλάζει η κατάσταση
  ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"]
    .forEach(evt => document.addEventListener(evt, () => {
      const active = !!document.fullscreenElement || document.body.classList.contains("fs-active");
      fsBtn.textContent = active ? "✕" : "⤢";
      if (!active) document.body.classList.remove("fs-active");
    }));

  // Διατήρηση σωστού framing σε αλλαγή μεγέθους/προσανατολισμού
  window.addEventListener("resize", () => {
    if (routeBounds) {
      if (typeof map.fitBounds === "function") {
        map.fitBounds(routeBounds, 60);
      } else {
        map.fitBounds(routeBounds);
      }
    }
  });
}

// Κάνε την initMap διαθέσιμη για το callback του Google Maps script
window.initMap = initMap;

// ==============================
// Στυλ για τα custom κουμπιά
// ==============================
const style = document.createElement("style");
style.textContent = `
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
.gm-custom-btn:active { transform: scale(0.97); }
`;
document.head.appendChild(style);