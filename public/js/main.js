// Διαβάζει το trips.json και φορτώνει το trip.html
async function loadTrip() {
  const params = new URLSearchParams(window.location.search);
  const id = parseInt(params.get("id"));
  if (!id) return;

  const res = await fetch("trip.json");
  const trips = await res.json();
  const trip = trips.find(t => t.id === id);
  if (!trip) return;

  // Τίτλος
  document.getElementById("trip-title").textContent = trip.title;

  // Περιεχόμενο
  const content = document.getElementById("trip-content");
  content.innerHTML = `
    <p>${trip.details}</p>
    ${trip.videos.map(v => `
      <div class="video-wrap">
        <iframe src="${v.url}?rel=0&modestbranding=1" title="${v.title}" allowfullscreen></iframe>
      </div>
    `).join("")}
  `;

  // Χάρτης
  initMap(trip.mapCenter, trip.waypoints);
}

// Google Map
function initMap(center, waypoints) {
  const map = new google.maps.Map(document.getElementById('map'), {
    zoom: 8,
    center: center,
    mapTypeId: 'satellite'
  });

  const directionsService = new google.maps.DirectionsService();
  const directionsRenderer = new google.maps.DirectionsRenderer({ map: map });

  directionsService.route({
    origin: "Athens, Greece",
    destination: "Athens, Greece",
    waypoints: waypoints.map(loc => ({ location: loc, stopover: true })),
    travelMode: "DRIVING"
  }, (result, status) => {
    if (status === "OK") {
      directionsRenderer.setDirections(result);
    }
  });
}

window.addEventListener("load", loadTrip);
