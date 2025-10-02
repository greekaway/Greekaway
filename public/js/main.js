// ---------- Overlays ----------
function openOverlay(id){
  document.querySelectorAll('.overlay').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(id);
  if(el) el.classList.add('active');
}

function closeOverlay(id){
  const el = document.getElementById(id);
  if(el) el.classList.remove('active');
}

// ---------- Φόρτωση Εκδρομών ----------
async function loadTrips() {
  try {
    const response = await fetch('trip.json');
    const trips = await response.json();

    // Containers
    const mountainContainer = document.getElementById('mountainTripsContainer');
    const seaContainer = document.getElementById('seaTripsContainer');
    const cityContainer = document.getElementById('cityTripsContainer');

    // Καθαρισμός πριν γεμίσουν
    mountainContainer.innerHTML = "";
    seaContainer.innerHTML = "";
    cityContainer.innerHTML = "";

    trips.forEach(trip => {
      const card = document.createElement('div');
      card.classList.add('trip-card');
      card.innerHTML = `
        <h3>${trip.title}</h3>
        <p>${trip.description}</p>
        <a href="trip.html?id=${trip.id}">Δείτε λεπτομέρειες</a>
      `;

      if(trip.category === "Βουνό") {
        mountainContainer.appendChild(card);
      } else if(trip.category === "Θάλασσα") {
        seaContainer.appendChild(card);
      } else if(trip.category === "Πόλη") {
        cityContainer.appendChild(card);
      }
    });

    // Αν δεν υπάρχει καμία εκδρομή σε μια κατηγορία
    if(!mountainContainer.hasChildNodes()) {
      mountainContainer.innerHTML = "<p>Δεν υπάρχουν εκδρομές σε αυτή την κατηγορία.</p>";
    }
    if(!seaContainer.hasChildNodes()) {
      seaContainer.innerHTML = "<p>Δεν υπάρχουν εκδρομές σε αυτή την κατηγορία.</p>";
    }
    if(!cityContainer.hasChildNodes()) {
      cityContainer.innerHTML = "<p>Δεν υπάρχουν εκδρομές σε αυτή την κατηγορία.</p>";
    }

  } catch (error) {
    console.error("Σφάλμα φόρτωσης εκδρομών:", error);
  }
}

// ---------- Εκκίνηση ----------
window.addEventListener('DOMContentLoaded', loadTrips);

