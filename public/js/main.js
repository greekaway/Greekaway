// ==============================
// main.js – Greekaway (τελική, διορθωμένη έκδοση)
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
Κώδικας ιστοσελίδας Λευκάδα διακοπές

<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Διήμερη Απόδραση στη Λευκάδα</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<style>
body { margin:0; font-family: Arial, sans-serif; }
header { position:fixed; top:0; left:0; right:0; background:#000; color:white; padding:10px; display:flex; justify-content:space-between; align-items:center; z-index:1000; }
header h1 { margin:0; font-size:1.2rem; color:white; }
.hamburger { font-size:1.5rem; cursor:pointer; color:white; background:#000; padding:5px 10px; border-radius:5px; }
nav.menu-drop { position:absolute; top:100%; right:0; background:#000; display:none; flex-direction:column; box-shadow:0 4px 8px rgba(0,0,0,0.2); z-index:1000; }
nav.menu-drop a { padding:10px; text-decoration:none; color:white; border-bottom:1px solid #333; }
nav.menu-drop a:hover { background:#222; }

main { padding:6rem 1rem 6rem 1rem; }

.card { margin-bottom:2rem; border:1px solid #ddd; border-radius:8px; padding:1rem; background:#f9f9f9; }
.card h2 { margin:0 0 0.5rem 0; color:#023e8a; }
.card h2 .price { color:red; font-size:1.3rem; font-weight:bold; margin-left:5px; }
.video-wrap { position:relative; padding-bottom:56.25%; height:0; overflow:hidden; margin-bottom:1rem; }
.video-wrap iframe { position:absolute; top:0; left:0; width:100%; height:100%; border:0; }

#map { width:100%; height:400px; margin-bottom:2rem; }

footer { position:fixed; bottom:0; left:0; right:0; background:#000; color:white; display:flex; justify-content:space-around; padding:0.5rem 0; z-index:1000; }
footer a { color:white; text-decoration:none; font-size:0.9rem; text-align:center; display:flex; flex-direction:column; align-items:center; }
footer a i { font-size:1.5rem; margin-bottom:2px; color:white; }

form { margin:2rem 0; display:flex; flex-direction:column; max-width:400px; }
form input, form select, form textarea, form button { margin-bottom:1rem; padding:10px; font-size:1rem; border-radius:5px; border:1px solid #ccc; }
form button { background:#000; color:white; border:none; cursor:pointer; }
form button:hover { background:#222; }

</style>
</head>
<body>

<header>
  <h1>Διήμερη Απόδραση στη Λευκάδα</h1>
  <div class="hamburger" onclick="toggleMenu()">☰</div>
  <nav class="menu-drop" id="menuDrop" aria-hidden="true">
    <a href="#hotel">Semiramis</a>
    <a href="#beach">Kathisma</a>
    <a href="#restaurant">Rachi</a>
    <a href="#cruise">Κρουαζιέρα</a>
    <a href="#nidri-cafe">Νυδρί</a>
    <a href="#booking-form">Online Κράτηση</a>
    <a href="#payment-form">Πληρωμή</a>
    <a href="#about-form">About Us</a>
  </nav>
</header>

<main>
  <div id="map"></div>

  <article class="card" id="hotel">
    <h2>
      Διήμερη απόδραση στη Λευκάδα με διανυκτέρευση και κρουαζιέρα
      <span class="price">330 € μόνο!</span>
    </h2>
    <p>Διαμονή στο ξενοδοχείο Semiramis στη Λευκάδα.</p>
    <div class="video-wrap">
      <iframe src="https://www.youtube-nocookie.com/embed/RXSymowNTz4?rel=0&modestbranding=1" title="Semiramis Hotel Lefkada" allowfullscreen></iframe>
    </div>
  </article>

  <article class="card" id="beach">
    <h2>Παραλία Kathisma</h2>
    <p>Απολαύστε μπάνιο στα γαλαζοπράσινα νερά της παραλίας Kathisma – δεν είναι Photoshop.</p>
    <div class="video-wrap">
      <iframe src="https://www.youtube-nocookie.com/embed/HLVY4mVRk3o?rel=0&modestbranding=1" title="Kathisma Beach Lefkada" allowfullscreen></iframe>
    </div>
  </article>

  <article class="card" id="restaurant">
    <h2>Εστιατόριο Rachi</h2>
    <p>Ηλιοβασίλεμα και φαγητό στο εστιατόριο Rachi.</p>
    <div class="video-wrap">
      <iframe src="https://www.youtube-nocookie.com/embed/8RlEPko1oU4?rel=0&modestbranding=1" title="Rachi Restaurant Lefkada" allowfullscreen></iframe>
    </div>
  </article>

  <article class="card" id="cruise">
    <h2>Κρουαζιέρα Νυδρί</h2>
    <p>Ολοήμερη κρουαζιέρα με Seven Islands.</p>
    <div class="video-wrap">
      <iframe src="https://www.youtube-nocookie.com/embed/oq4KHE-6lmM?rel=0&modestbranding=1" title="Nidri Cruise Lefkada" allowfullscreen></iframe>
    </div>
  </article>

  <article class="card" id="nidri-cafe">
    <h2>Καφές & Παγωτό Νυδρί</h2>
    <p>Απολαύστε καφέ και παγωτό στην πόλη του Νυδρί.</p>
    <div class="video-wrap">
      <iframe src="https://www.youtube-nocookie.com/embed/Z9Uyks-r1J8?rel=0&modestbranding=1" title="Cafe & Ice Cream Nidri Lefkada" allowfullscreen></iframe>
    </div>
  </article>

  <!-- Forms -->
  <article class="card" id="booking-form">
    <h2>Online Κράτηση</h2>
    <form>
      <input type="text" placeholder="Όνομα" required>
      <input type="email" placeholder="Email" required>
      <input type="date" placeholder="Ημερομηνία Άφιξης" required>
      <input type="number" placeholder="Αριθμός Ατόμων" min="1" required>
      <textarea placeholder="Σχόλια"></textarea>
      <button type="submit">Κράτηση</button>
    </form>
  </article>

  <article class="card" id="payment-form">
    <h2>Πληρωμή</h2>
    <form>
      <input type="text" placeholder="Όνομα" required>
      <input type="email" placeholder="Email" required>
      <input type="number" placeholder="Ποσό (€)" required>
      <select required>
        <option value="">Επιλογή Μεθόδου Πληρωμής</option>
        <option value="card">Κάρτα</option>
        <option value="paypal">PayPal</option>
      </select>
      <button type="submit">Πληρωμή</button>
    </form>
  </article>

  <article class="card" id="about-form">
    <h2>About Us / Επικοινωνία</h2>
    <form>
      <input type="text" placeholder="Όνομα" required>
      <input type="email" placeholder="Email" required>
      <textarea placeholder="Μήνυμα"></textarea>
      <button type="submit">Αποστολή</button>
    </form>
  </article>

</main>

<footer>
  <a href="#hotel"><i class="fas fa-home"></i>Home</a>
  <a href="#booking-form"><i class="fas fa-calendar-alt"></i>Online Κράτηση</a>
  <a href="#payment-form"><i class="fas fa-credit-card"></i>Πληρωμή</a>
  <a href="#about-form"><i class="fas fa-info-circle"></i>About Us</a>
</footer>

<script>
function toggleMenu(){
  const menu = document.getElementById('menuDrop');
  menu.style.display = (menu.style.display==='flex') ? 'none' : 'flex';
}
// ==============================
// Google Map + Route (Αθήνα → Λευκάδα)
// ==============================
let routeBounds = null;
let directionsRenderer = null;
let map = null;

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    zoom: 8,
    center: { lat: 38.5, lng: 22.5 },
    mapTypeId: 'satellite',
    fullscreenControl: true,
    mapTypeControl: true,
    streetViewControl: true,
    rotateControl: true
  });

  const directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map: map,
    suppressMarkers: true,
    polylineOptions: {
      strokeColor: '#f9d65c',
      strokeWeight: 5,
      strokeOpacity: 0.95
    }
  });

  // --- Διαδρομή με ενδιάμεσες στάσεις ---
  const waypts = [
    { location: 'Rachi Exanthia, Lefkada, Greece', stopover: true },
    { location: 'Kathisma Beach, Lefkada, Greece', stopover: true },
    { location: 'Nidri, Lefkada, Greece', stopover: true }
  ];

  directionsService.route({
    origin: 'Athens, Greece',
    destination: 'Lefkada, Greece',
    waypoints: waypts,
    travelMode: 'DRIVING'
  }, function(result, status) {
    if (status === 'OK' && result.routes.length) {
      directionsRenderer.setDirections(result);

      // ✅ Zoom ΜΟΝΟ πάνω στη διαδρομή
      routeBounds = result.routes[0].bounds;
      setTimeout(() => {
        map.fitBounds(routeBounds);
        setTimeout(() => map.setZoom(map.getZoom() - 0.3), 400);
      }, 300);
    } else {
      alert('Αποτυχία φόρτωσης διαδρομής: ' + status);
    }
  });

  /* --- Custom Controls --- */
  const fsBtn = document.createElement('div');
  fsBtn.className = 'gm-custom-btn';
  fsBtn.title = 'Πλήρης οθόνη';
  fsBtn.textContent = '⤢';
  fsBtn.addEventListener('click', async () => {
    const mapEl = map.getDiv();
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        fsBtn.textContent = '⤢';
      } else {
        await mapEl.requestFullscreen();
        fsBtn.textContent = '✕';
      }
    } catch (e) {
      const on = !document.body.classList.contains('fs-active');
      document.body.classList.toggle('fs-active', on);
      fsBtn.textContent = on ? '✕' : '⤢';
    }
  });
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(fsBtn);

  const resetBtn = document.createElement('div');
  resetBtn.className = 'gm-custom-btn';
  resetBtn.title = 'Επανέφερε τη διαδρομή';
  resetBtn.textContent = '↺';
  resetBtn.addEventListener('click', () => {
    if (routeBounds) map.fitBounds(routeBounds);
    if (directionsRenderer) {
      const dir = directionsRenderer.getDirections();
      if (dir) directionsRenderer.setDirections(dir);
    }
  });
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(resetBtn);

  // --- Ενημέρωση κουμπιών fullscreen ---
  ['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange']
    .forEach(evt => document.addEventListener(evt, () => {
      const active = !!document.fullscreenElement || document.body.classList.contains('fs-active');
      fsBtn.textContent = active ? '✕' : '⤢';
      if (!active) document.body.classList.remove('fs-active');
    }));


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

  // Πλήρης οθόνη
  const fullscreenBtn = document.createElement("button");
  fullscreenBtn.innerHTML = "⛶";
  styleMapButton(fullscreenBtn, "Πλήρης οθόνη");
  fullscreenBtn.onclick = () => {
    if (!document.fullscreenElement) map.getDiv().requestFullscreen();
    else document.exitFullscreen();
  };

  // Επαναφορά
  const resetBtn = document.createElement("button");
  resetBtn.innerHTML = "↺";
  styleMapButton(resetBtn, "Επαναφορά");
  resetBtn.onclick = () => {
    map.setZoom(7);
    map.setCenter({ lat: 38.5, lng: 22.2 });
  };

  // Εναλλαγή τύπου χάρτη
  const toggleBtn = document.createElement("button");
  toggleBtn.innerHTML = "🗺️";
  styleMapButton(toggleBtn, "Αλλαγή προβολής");
  toggleBtn.onclick = () => {
    const current = map.getMapTypeId();
    map.setMapTypeId(current === "satellite" ? "roadmap" : "satellite");
  };

  controlDiv.append(fullscreenBtn, resetBtn, toggleBtn);
  map.controls[google.maps.ControlPosition.RIGHT_TOP].push(controlDiv);
}

// Στυλ custom κουμπιών
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
  button.onmouseenter = () => (button.style.background = "#004080");
  button.onmouseleave = () => (button.style.background = "#0d1a26");
}