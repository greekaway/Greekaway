// main.js

// ---------------- Overlay helpers ----------------
function openOverlay(id) {
  document.querySelectorAll('.overlay').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeOverlay(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

function toggleMenu() {
  const menu = document.getElementById('menuDrop');
  menu.style.display = (menu.style.display === 'flex') ? 'none' : 'flex';
}

// ---------------- Trip loader ----------------
async function loadTrip() {
  const params = new URLSearchParams(window.location.search);
  const id = parseInt(params.get("id")) || 1; // default Λευκάδα

  const response = await fetch("trips.json");
  const trips = await response.json();
  const trip = trips.find(t => t.id === id);

  if (!trip) {
    document.getElementById("tripTitle").innerText = "Η εκδρομή δεν βρέθηκε";
    return;
  }

  // Τίτλος
  document.getElementById("tripTitle").innerHTML = `
    ${trip.title} <span class="price-top">${trip.price}</span>
  `;

  // Videos
  const videoSection = document.getElementById("tripVideos");
  videoSection.innerHTML = "";
  trip.videos.forEach(v => {
    const article = document.createElement("article");
    article.classList.add("card");
    article.innerHTML = `
      <h2>${v.title}</h2>
      <div class="video-wrap">
        <iframe src="${v.url}?rel=0&modestbranding=1" allowfullscreen></iframe>
      </div>
    `;
    videoSection.appendChild(article);
  });

  // Περιγραφή
  const desc = document.getElementById("tripDescription");
  desc.innerHTML = `
    <h2>${trip.title} – Λεπτομέρειες</h2>
    <p>${trip.details}</p>
  `;

  // Αποθήκευση στοιχείων για το χάρτη
  window.tripMapData = trip.map;
}

// ---------------- Google Maps ----------------
let map, directionsRenderer, routeBounds;

function initMap() {
  if (!window.tripMapData) return;

  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 8,
    center: window.tripMapData.center,
    mapTypeId: "satellite",
    fullscreenControl: false, // δικό μας κουμπί
    mapTypeControl: true,
    streetViewControl: true,
    rotateControl: true
  });

  const directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({ map: map });

  const waypts = window.tripMapData.waypoints.map(loc => ({ location: loc, stopover: true }));

  directionsService.route({
    origin: "Athens, Greece",
    destination: "Athens, Greece",
    waypoints: waypts,
    travelMode: "DRIVING"
  }, function(result, status) {
    if (status === "OK") {
      directionsRenderer.setDirections(result);
      if (result.routes[0].bounds) {
        routeBounds = result.routes[0].bounds;
        map.fitBounds(routeBounds);
      }
    }
  });

  // Custom controls (Fullscreen + Reset)
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
    if (routeBounds) map.fitBounds(routeBounds);
  });
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(resetBtn);
}

// ---------------- Εκκίνηση ----------------
window.addEventListener("load", loadTrip);
