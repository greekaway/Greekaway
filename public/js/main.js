// ==============================
// main.js – Greekaway
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

  const map = new google.maps.Map(mapElement, {
    zoom: 11,
    center: window.TRIP_CENTER || { lat: 38.7, lng: 20.65 },
    mapTypeId: "satellite", // δορυφορική εκκίνηση
    disableDefaultUI: false,
  });

  // ---- Προσθήκη κουμπιών χάρτη ----
  addMapControls(map);

  // ---- Προσθήκη σημείων ενδιαφέροντος ----
  if (window.TRIP_WAYPOINTS && window.TRIP_WAYPOINTS.length > 0) {
    const geocoder = new google.maps.Geocoder();

    window.TRIP_WAYPOINTS.forEach((place) => {
      geocoder.geocode({ address: place }, (results, status) => {
        if (status === "OK" && results[0]) {
          new google.maps.Marker({
            map,
            position: results[0].geometry.location,
            title: place,
          });
        } else {
          console.warn("Αποτυχία geocoding για:", place, status);
        }
      });
    });
  }
}

// ==============================
// Custom κουμπιά Greekaway
// ==============================
function addMapControls(map) {
  // Δημιουργία container για τα κουμπιά
  const controlDiv = document.createElement("div");
  controlDiv.style.position = "absolute";
  controlDiv.style.top = "10px";
  controlDiv.style.right = "10px";
  controlDiv.style.display = "flex";
  controlDiv.style.flexDirection = "column";
  controlDiv.style.gap = "8px";

  // -------- Πλήρης οθόνη --------
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

  // -------- Επαναφορά θέσης --------
  const resetBtn = document.createElement("button");
  resetBtn.innerHTML = "↺";
  styleMapButton(resetBtn, "Επαναφορά");
  resetBtn.onclick = () => {
    map.setZoom(11);
    map.setCenter(window.TRIP_CENTER || { lat: 38.7, lng: 20.65 });
  };

  // -------- Εναλλαγή τύπου χάρτη --------
  const toggleBtn = document.createElement("button");
  toggleBtn.innerHTML = "🗺️";
  styleMapButton(toggleBtn, "Αλλαγή προβολής");
  toggleBtn.onclick = () => {
    const currentType = map.getMapTypeId();
    map.setMapTypeId(currentType === "satellite" ? "roadmap" : "satellite");
  };

  // Προσθήκη στο container
  controlDiv.appendChild(fullscreenBtn);
  controlDiv.appendChild(resetBtn);
  controlDiv.appendChild(toggleBtn);

  // Τοποθέτηση πάνω στο χάρτη
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