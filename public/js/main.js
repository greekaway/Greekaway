// main.js – Greekaway

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("trips-container");

  // Αν δεν υπάρχει το container (π.χ. σε άλλες σελίδες), μην τρέχει τίποτα
  if (!container) return;

  // Φόρτωση των δεδομένων από το trip.json
  fetch("../data/trip.json")
    .then(response => {
      if (!response.ok) {
        throw new Error("Αποτυχία φόρτωσης trip.json");
      }
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

// Δημιουργεί το σωστό URL για κάθε εκδρομή
function getTripUrl(trip) {
  const title = trip.title.toLowerCase();

  if (title.includes("λευκάδ")) {
    return "./sea/lefkas/lefkas.html";
  }
  if (title.includes("δελφ")) {
    return "./culture/delphi/delphi.html";
  }

  return "#";
}