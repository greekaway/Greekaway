// ==============================
// main.js – Greekaway (τελική έκδοση)
// ==============================

// ----------------------
// Φόρτωση εκδρομών (trip cards)
// ----------------------
document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("trips-container");
  if (!container) return;

  fetch("../data/trip.json")
    .then(response => {
      if (!response.ok) throw new Error("Αποτυχία φόρτωσης trip.json");
      return response.json();
    })
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
          <a href="${getTripUrl(trip)}" class="trip-btn">Περισσότερα</a>
        `;
        container.appendChild(card);
      });
    })
    .catch(err => {
      console.error(err);
      container.innerHTML = "<p>Σφάλμα φόρτωσης εκδρομών.</p>";
    });
});

// Δημιουργεί σωστό URL για κάθε εκδρομή
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
    zoom: 8,
    center: { lat: 38.5, lng: 22.5 },
    mapTypeId: "satellite",
    fullscreenControl: true,
    mapTypeControl: true,
    streetViewControl: true,
    rotateControl: true
  });

  const directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map: map,
    suppressMarkers: true,
    polylineOptions: {
      strokeColor: "#f9d65c",
      strokeWeight: 5,
      strokeOpacity: 0.95
    }
  });

  // --- Διαδρομή με ενδιάμεσες στάσεις ---
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
      travelMode: google.maps.TravelMode.DRIVING
    },
    (result, status) => {
      if (status === "OK" && result.routes.length) {
        directionsRenderer.setDirections(result);
        routeBounds = result.routes[0].bounds;
        setTimeout(() => {
          map.fitBounds(routeBounds);
          setTimeout(() => map.setZoom(map.getZoom() - 0.3), 400);
        }, 300);
      } else {
        console.warn("Αποτυχία φόρτωσης διαδρομής:", status);
      }
    }
  );

  // Προσθήκη markers
  new google.maps.Marker({
    position: { lat: 37.9838, lng: 23.7275 },
    map,
    title: "Αθήνα"
  });
  new google.maps.Marker({
    position: { lat: 38.7, lng: 20.65 },
    map,
    title: "Λευκάδα"
  });

  /* --- Custom Controls --- */
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
      const on = !document.body.classList.contains("fs-active");
      document.body.classList.toggle("fs-active", on);
      fsBtn.textContent = on ? "✕" : "⤢";
    }
  });
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(fsBtn);
    const resetBtn = document.createElement("div");
  resetBtn.className = "gm-custom-btn";
  resetBtn.title = "Επανέφερε τη διαδρομή";
  resetBtn.textContent = "↺";
  resetBtn.addEventListener("click", () => {
    if (routeBounds) map.fitBounds(routeBounds);
    if (directionsRenderer) {
      const dir = directionsRenderer.getDirections();
      if (dir) directionsRenderer.setDirections(dir);
    }
  });
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(resetBtn);

  // --- Ενημέρωση κουμπιών fullscreen ---
  ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"]
    .forEach(evt => document.addEventListener(evt, () => {
      const active = !!document.fullscreenElement || document.body.classList.contains("fs-active");
      fsBtn.textContent = active ? "✕" : "⤢";
      if (!active) document.body.classList.remove("fs-active");
    }));
}

// ==============================
// Custom κουμπιά Greekaway
// ==============================
function addMapControls(map) {
  const controlDiv = document.createElement("div");
  controlDiv.style.position = "absolute";
  controlDiv.style.top = "10px";
  controlDiv.style.right = "10px";
  controlDiv.style.display = "flex";
  controlDiv.style.flexDirection = "column";
  controlDiv.style.gap = "8px";

  // Πλήρης οθόνη
  const fullscreenBtn = document.createElement("button");
  fullscreenBtn.innerHTML = "⛶";
  styleMapButton(fullscreenBtn, "Πλήρης οθόνη");
  fullscreenBtn.onclick = () => {
    if (!document.fullscreenElement) {
      map.getDiv().requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  // Επαναφορά θέσης
  const resetBtn = document.createElement("button");
  resetBtn.innerHTML = "↺";
  styleMapButton(resetBtn, "Επαναφορά");
  resetBtn.onclick = () => {
    if (routeBounds) map.fitBounds(routeBounds);
  };

  // Εναλλαγή τύπου χάρτη
  const toggleBtn = document.createElement("button");
  toggleBtn.innerHTML = "🗺️";
  styleMapButton(toggleBtn, "Αλλαγή προβολής");
  toggleBtn.onclick = () => {
    const currentType = map.getMapTypeId();
    map.setMapTypeId(currentType === "satellite" ? "roadmap" : "satellite");
  };

  controlDiv.appendChild(fullscreenBtn);
  controlDiv.appendChild(resetBtn);
  controlDiv.appendChild(toggleBtn);

  map.controls[google.maps.ControlPosition.RIGHT_TOP].push(controlDiv);
}

// ----------------------
// Στυλ για custom κουμπιά
// ----------------------
function styleMapButton(button, title) {
  button.title = title;
  button.style.background = "#0d1a26";
  button.style.color = "#f9d65c";
  button.style.border = "none";
  button.style.padding = "8px 10px";
  button.style.fontSize = "1.1rem";
  button.style.borderRadius = "8px";
  button.style.cursor = "pointer";
  button.style.boxShadow = "0 2px 6px rgba(0,0,0,0.4)";
  button.style.transition = "transform 0.2s, background 0.3s";
  button.onmouseenter = () => (button.style.background = "#004080");
  button.onmouseleave = () => (button.style.background = "#0d1a26");
}
