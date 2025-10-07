// === main.js ===

// Όταν φορτώνει η σελίδα
window.addEventListener("load", loadTrip);

async function loadTrip() {
  const params = new URLSearchParams(window.location.search);
  const id = parseInt(params.get("id"));

  // Φόρτωση του JSON με όλες τις εκδρομές
  const res = await fetch("trip.json");
  const trips = await res.json();

  // Αν υπάρχει id -> εμφάνισε ΜΙΑ εκδρομή
  if (id) {
    const trip = trips.find(t => t.id === id);
    if (!trip) return;

    document.getElementById("trip-title").textContent = trip.title;

    const content = document.getElementById("trip-content");
    content.innerHTML = `
      <img src="${trip.image}" alt="${trip.title}">
      <p><strong>Κατηγορία:</strong> ${trip.category}</p>
      <p>${trip.details}</p>
    `;

    initMap(trip.title); // Χάρτης
  }

  // Αν ΔΕΝ υπάρχει id -> εμφάνισε όλες τις εκδρομές σε λίστα
  else {
    const content = document.getElementById("trip-content");
    content.innerHTML = "<h2>Όλες οι Εκδρομές</h2>" +
      trips.map(t => `
        <div class="card">
          <img src="${t.image}" alt="${t.title}">
          <h3>${t.title}</h3>
          <p>${t.description}</p>
          <a href="trip.html?id=${t.id}" class="btn">Δες περισσότερα</a>
        </div>
      `).join("");
  }
}

// === Google Map ===
function initMap(destination) {
  const map = new google.maps.Map(document.getElementById("map"), {
    zoom: 6,
    center: { lat: 38.5, lng: 23.5 },
    mapTypeId: "roadmap"
  });

  const service = new google.maps.places.PlacesService(map);
  const request = { query: destination, fields: ["geometry", "name"] };

  service.findPlaceFromQuery(request, (results, status) => {
    if (status === google.maps.places.PlacesServiceStatus.OK && results[0]) {
      map.setCenter(results[0].geometry.location);
      new google.maps.Marker({
        map,
        position: results[0].geometry.location,
        title: results[0].name
      });
    }
  });
}