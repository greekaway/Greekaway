// === Overlay functions ===
function openOverlay(id){
  document.querySelectorAll('.overlay').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(id);
  if(el) el.classList.add('active');
}

function closeOverlay(id){
  const el = document.getElementById(id);
  if(el) el.classList.remove('active');
}

// === Load trips dynamically from trip.json ===
async function loadTrips() {
  try {
    const response = await fetch('trips/trip.json');
    const trips = await response.json();

    const tripsContainer = document.getElementById('tripsContainer');
    if (!tripsContainer) return; // αν δεν υπάρχει container στο index, βγαίνουμε

    trips.forEach(trip => {
      const card = document.createElement('div');
      card.className = 'trip-card';
      card.innerHTML = `
        <h3>${trip.title}</h3>
        <p>${trip.description}</p>
        <a href="trips/trip.html?id=${trip.id}">Δείτε λεπτομέρειες</a>
      `;
      tripsContainer.appendChild(card);
    });
  } catch (error) {
    console.error("Σφάλμα φόρτωσης trips:", error);
  }
}

// === Run on load ===
document.addEventListener('DOMContentLoaded', () => {
  loadTrips();
});
