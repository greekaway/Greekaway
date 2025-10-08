// ==============================
// main.js – Google Map + Route (ενιαίο καθαρό)
// ==============================
let map, directionsRenderer, routeBounds;

function initMap() {
  const mapEl = document.getElementById("map");
  if (!mapEl) return console.warn("❗ Δεν βρέθηκε #map στο DOM");

  const waypoints = window.TRIP_WAYPOINTS?.map(loc => ({ location: loc, stopover: true })) || [];

  map = new google.maps.Map(mapEl, {
    zoom: 8,
    center: window.TRIP_CENTER || { lat: 38.5, lng: 22.5 },
    mapTypeId: "roadmap",
    gestureHandling: "greedy",
    fullscreenControl: false,
    mapTypeControl: true,
    streetViewControl: true
  });

  if (waypoints.length) {
    const service = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
      map,
      polylineOptions: { strokeColor: "#f9d65c", strokeWeight: 5, strokeOpacity: 0.95 }
    });

    service.route({
      origin: "Athens, Greece",
      destination: waypoints[waypoints.length - 1].location || "Lefkada, Greece",
      waypoints,
      travelMode: google.maps.TravelMode.DRIVING
    }, (result, status) => {
      if (status === "OK") {
        directionsRenderer.setDirections(result);
        routeBounds = result.routes[0].bounds;
        fitRoute();
      } else {
        console.warn("Αποτυχία διαδρομής:", status);
      }
    });
  }

  // --- Custom Fullscreen ---
  const fsBtn = createBtn("⤢", "Πλήρης οθόνη", async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        fsBtn.textContent = "⤢";
      } else {
        await mapEl.requestFullscreen();
        fsBtn.textContent = "✕";
      }
    } catch {
      document.body.classList.toggle("fs-active");
      fsBtn.textContent = document.body.classList.contains("fs-active") ? "✕" : "⤢";
    }
    setTimeout(fitRoute, 200);
  });
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(fsBtn);

  // --- Reset Route ---
  const resetBtn = createBtn("↺", "Επανέφερε διαδρομή", () => fitRoute());
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(resetBtn);

  // Συγχρονισμός fullscreen
  ["fullscreenchange","webkitfullscreenchange"].forEach(evt =>
    document.addEventListener(evt, () => {
      const active = !!document.fullscreenElement || document.body.classList.contains("fs-active");
      fsBtn.textContent = active ? "✕" : "⤢";
      if (!active) document.body.classList.remove("fs-active");
      setTimeout(fitRoute, 150);
    })
  );

  // Fit route helper
  function fitRoute() {
    if (routeBounds && map.fitBounds) map.fitBounds(routeBounds);
  }

  function createBtn(symbol, title, onClick) {
    const btn = document.createElement("div");
    btn.className = "gm-custom-btn";
    btn.textContent = symbol;
    btn.title = title;
    btn.onclick = onClick;
    return btn;
  }
}

// διαθέσιμο για callback
window.initMap = initMap;