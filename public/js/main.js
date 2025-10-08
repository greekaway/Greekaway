// ==============================
// main.js – Greekaway (Αρχαία Ολυμπία)
// ==============================

document.addEventListener("DOMContentLoaded", () => {
  // Αν δεν υπάρχει container εκδρομής, δεν κάνουμε τίποτα
  const tripSection = document.getElementById("trip-section");
  if (!tripSection) return;

  // Παίρνουμε το id της εκδρομής από το URL (π.χ. ?id=olympia)
  const params = new URLSearchParams(window.location.search);
  const tripId = params.get("id") || "olympia"; // προεπιλογή για δοκιμή

  // Φόρτωση δεδομένων από το JSON
  fetch(`../data/trips/${tripId}.json`)
    .then(r => {
      if (!r.ok) throw new Error("Αποτυχία φόρτωσης δεδομένων");
      return r.json();
    })
    .then(trip => {
      // ====== Τίτλος & περιγραφή ======
      document.getElementById("trip-title").textContent = trip.title;
      document.getElementById("trip-description").textContent = trip.description;

      // ====== Βίντεο ανά στάση ======
      const stopsDiv = document.getElementById("stops");
      stopsDiv.innerHTML = ""; // καθαρισμός

      trip.stops.forEach((stop, index) => {
        const stopEl = document.createElement("div");
        stopEl.className = "trip-stop";

        stopEl.innerHTML = `
          <h3>Στάση ${index + 1}: ${stop.name}</h3>
          <div class="video-box">
            <iframe 
              src="${stop.video}" 
              title="${stop.name}" 
              frameborder="0" 
              allowfullscreen
              width="100%"
              height="315">
            </iframe>
          </div>
          <p class="stop-description">${stop.description}</p>
        `;

        stopsDiv.appendChild(stopEl);
      });

      // ====== Χάρτης με διαδρομή & στάσεις ======
      initMap(trip.map.waypoints, trip.map.center, trip.map.zoom);
    })
    .catch(err => {
      console.error("Σφάλμα:", err);
      document.getElementById("trip-section").innerHTML = "<p>Σφάλμα φόρτωσης δεδομένων εκδρομής.</p>";
    });
});


// ==============================
// Google Maps Route
// ==============================
let map, directionsService, directionsRenderer;

function initMap(waypoints, center, zoom) {
  const mapEl = document.getElementById("map");
  if (!mapEl) return;

  map = new google.maps.Map(mapEl, {
    center,
    zoom,
    mapTypeId: "roadmap"
  });

  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({ map });

  const origin = waypoints[0];
  const destination = waypoints[waypoints.length - 1];
  const stops = waypoints.slice(1, waypoints.length - 1).map(loc => ({
    location: loc,
    stopover: true
  }));

  const routeRequest = {
    origin,
    destination,
    waypoints: stops,
    travelMode: google.maps.TravelMode.DRIVING
  };

  directionsService.route(routeRequest, (result, status) => {
    if (status === "OK") {
      directionsRenderer.setDirections(result);
    } else {
      console.error("Σφάλμα διαδρομής:", status);
    }
  });
}