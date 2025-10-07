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

  // Αρχικοποίηση χάρτη Greekaway
  const map = new google.maps.Map(mapElement, {
    zoom: 7,
    center: window.TRIP_CENTER || { lat: 38.7, lng: 20.65 },
    mapTypeId: "satellite",
    disableDefaultUI: true, // ❌ απενεργοποιεί zoom/fullscreen controls
    streetViewControl: true, // κρατάμε το ανθρωπάκι αλλά θα το στυλάρουμε
    mapTypeControl: false,
    fullscreenControl: false,
  });

  // Προσθήκη custom κουμπιών
  addMapControls(map);

  // Προσθήκη Polyline (Αθήνα → Λευκάδα)
  const routeCoordinates = [
    { lat: 37.9838, lng: 23.7275 }, // Αθήνα
    { lat: 38.7, lng: 20.65 }       // Λευκάδα
  ];

  const routeLine = new google.maps.Polyline({
    path: routeCoordinates,
    geodesic: true,
    strokeColor: "#f9d65c", // χρυσό Greekaway
    strokeOpacity: 0.9,
    strokeWeight: 4,
  });

  routeLine.setMap(map);

  // Προσθήκη markers
  const markers = [
    { position: { lat: 37.9838, lng: 23.7275 }, title: "Αθήνα" },
    { position: { lat: 38.7, lng: 20.65 }, title: "Λευκάδα" }
  ];

  markers.forEach(m => new google.maps.Marker({
    position: m.position,
    map,
    title: m.title,
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
    map.setZoom(7);
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

  map.controls[google.maps.ControlPosition.RIGHT_TOP].push(controlDiv);
}

// ----------------------
// Στυλ για custom κουμπιά
// ----------------------
function styleMapButton(button, title) {
  button.title = title;
  button.style.background = "#0d1a26"; // σκούρο μπλε
  button.style.color = "#f9d65c";      // χρυσό
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