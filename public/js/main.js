// ==============================
// main.js – Greekaway (διορθωμένη έκδοση)
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
// Google Map για τις σελίδες εκδρομών
// ==============================
function initMap() {
  const mapElement = document.getElementById("map");
  if (!mapElement) return;

  // Αρχικοποίηση χάρτη
  const map = new google.maps.Map(mapElement, {
    zoom: 7,
    center: { lat: 38.5, lng: 22.2 },
    mapTypeId: "satellite",
    disableDefaultUI: true,
    streetViewControl: true,
  });

  // Στυλ Street View (Pegman)
  const observer = new MutationObserver(() => {
    const pegman = document.querySelector("button[aria-label='Ενεργοποίηση Street View']") ||
                   document.querySelector("button[aria-label='Activate Street View']");
    if (pegman) {
      pegman.style.background = "#0d1a26";
      pegman.style.border = "2px solid #f9d65c";
      pegman.style.borderRadius = "10px";
      pegman.style.boxShadow = "0 2px 6px rgba(0,0,0,0.5)";
      pegman.onmouseenter = () => (pegman.style.background = "#004080");
      pegman.onmouseleave = () => (pegman.style.background = "#0d1a26");
    }
  });
  observer.observe(mapElement, { childList: true, subtree: true });

  // Προσθήκη custom κουμπιών
  addMapControls(map);

  // --- Οδική Διαδρομή (Αθήνα → Λευκάδα, με στάσεις) ---
  const directionsService = new google.maps.DirectionsService();
  const directionsRenderer = new google.maps.DirectionsRenderer({
    map,
    suppressMarkers: true,  // θα βάλουμε δικά μας pins
    preserveViewport: true,
    polylineOptions: {
      strokeColor: "#f9d65c",
      strokeWeight: 5,
      strokeOpacity: 0.95
    }
  });

  const ATHENS   = { lat: 37.9838, lng: 23.7275 };
  const LEFKADA  = { lat: 38.7069, lng: 20.6400 };
  const WAYPOINTS = [
    { location: { lat: 38.7449, lng: 20.6009 }, stopover: true }, // Kathisma Beach
    { location: { lat: 38.7169, lng: 20.6416 }, stopover: true }, // Rachi
    { location: { lat: 38.7084, lng: 20.7111 }, stopover: true }  // Nidri
  ];

  directionsService.route(
    {
      origin: ATHENS,
      destination: LEFKADA,
      waypoints: WAYPOINTS,
      travelMode: google.maps.TravelMode.DRIVING
    },
    (result, status) => {
      if (status === "OK" && result.routes.length) {
        directionsRenderer.setDirections(result);
        const bounds = result.routes[0].bounds;
        map.fitBounds(bounds);
      } else {
        console.warn("Αποτυχία διαδρομής:", status);
      }
    }
  );

  // Προσθήκη pins
  new google.maps.Marker({ position: ATHENS, map, title: "Αθήνα" });
  new google.maps.Marker({ position: LEFKADA, map, title: "Λευκάδα" });
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
    if (!document.fullscreenElement) map.getDiv().requestFullscreen();
    else document.exitFullscreen();
  };

  // Επαναφορά
  const resetBtn = document.createElement("button");
  resetBtn.innerHTML = "↺";
  styleMapButton(resetBtn, "Επαναφορά");
  resetBtn.onclick = () => {
    map.setZoom(7);
    map.setCenter({ lat: 38.5, lng: 22.2 });
  };

  // Εναλλαγή προβολής
  const toggleBtn = document.createElement("button");
  toggleBtn.innerHTML = "🗺️";
  styleMapButton(toggleBtn, "Αλλαγή προβολής");
  toggleBtn.onclick = () => {
    const current = map.getMapTypeId();
    map.setMapTypeId(current === "satellite" ? "roadmap" : "satellite");
  };

  controlDiv.append(fullscreenBtn, resetBtn, toggleBtn);
  map.controls[google.maps.ControlPosition.RIGHT_TOP].push(controlDiv);
}

// Στυλ custom κουμπιών
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
  button.onmouseenter = () => (button.style.background = "#004080");
  button.onmouseleave = () => (button.style.background = "#0d1a26");
}