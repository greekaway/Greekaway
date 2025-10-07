// ==============================
// main.js – Greekaway (Λευκάδα: Αθήνα → Λευκάδα με σωστό zoom)
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
  const title = trip.title.toLowerCase();
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
    fullscreenControl: false,
    mapTypeControl: true,
    streetViewControl: true,
    rotateControl: false
  });

  const directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map,
    suppressMarkers: false, // ✅ δείχνει A-B-C-D pins
    preserveViewport: false,
    polylineOptions: { strokeColor: "#f9d65c", strokeWeight: 5, strokeOpacity: 0.95 }
  });

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
      if (status === "OK") {
        directionsRenderer.setDirections(result);
        routeBounds = result.routes[0].bounds;

        // ✅ Zoom πάνω στη διαδρομή
        map.fitBounds(routeBounds);

        // ✅ "Έξυπνο" zoom fix – ώστε να μη δείχνει όλη τη Μεσόγειο
        google.maps.event.addListenerOnce(map, "bounds_changed", () => {
          const currentZoom = map.getZoom();
          if (currentZoom < 7.5) map.setZoom(7.5);
          if (currentZoom > 9) map.setZoom(9);
        });
      } else {
        console.warn("Αποτυχία διαδρομής:", status);
      }
    }
  );

  // ---- Custom κουμπιά (⤢ και ↺) ----
  const fsBtn = document.createElement("div");
  fsBtn.className = "gm-custom-btn";
  fsBtn.title = "Πλήρης οθόνη";
  fsBtn.textContent = "⤢";
  fsBtn.addEventListener("click", async () => {
    const mapEl = map.getDiv();
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      fsBtn.textContent = "⤢";
    } else {
      await mapEl.requestFullscreen();
      fsBtn.textContent = "✕";
    }
  });
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(fsBtn);

  const resetBtn = document.createElement("div");
  resetBtn.className = "gm-custom-btn";
  resetBtn.title = "Επανέφερε τη διαδρομή";
  resetBtn.textContent = "↺";
  resetBtn.addEventListener("click", () => {
    if (routeBounds) {
      map.fitBounds(routeBounds);
      google.maps.event.addListenerOnce(map, "bounds_changed", () => {
        const currentZoom = map.getZoom();
        if (currentZoom < 7.5) map.setZoom(7.5);
        if (currentZoom > 9) map.setZoom(9);
      });
    }
  });
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(resetBtn);

  ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"]
    .forEach(evt => document.addEventListener(evt, () => {
      fsBtn.textContent = document.fullscreenElement ? "✕" : "⤢";
    }));
}

// ==============================
// Στυλ για κουμπιά
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
  transition:background 0.3s;
}
.gm-custom-btn:hover {
  background:#004080;
}`;
document.head.appendChild(style);