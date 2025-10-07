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
    .then(r => { if (!r.ok) throw new Error("Αποτυχία φόρτωσης trip.json"); return r.json(); })
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

function getTripUrl(trip) {
  const title = trip.title.toLowerCase();
  if (title.includes("λευκάδ")) return "./sea/lefkas/lefkas.html";
  if (title.includes("δελφ")) return "./culture/delphi/delphi.html";
  return "#";
}

// ==============================
// Google Map – τρέχει μόνο στη Λευκάδα
// ==============================
let routeBounds = null;

function initMap() {
  const isLefkas = (document.body.dataset.trip === "lefkas");
  const mapEl = document.getElementById("map");
  if (!isLefkas || !mapEl) return;

  // Χάρτης: δορυφόρος, χωρίς default UI, δικά μας controls
  const map = new google.maps.Map(mapEl, {
    center: { lat: 38.5, lng: 22.2 },   // Ελλάδα
    zoom: 7,
    mapTypeId: "satellite",
    disableDefaultUI: true,             // κρύβει τα άσπρα default κουμπιά
    mapTypeControl: true,               // θα στιλιστούν από CSS
    streetViewControl: true
  });

  // Styling pegman (άμεσο & όταν φορτώσει δυναμικά)
  const pegObs = new MutationObserver(()=>{
    const peg = document.querySelector(".gm-svpc");
    if (peg) {
      peg.style.background = "#1e2b3a";
      peg.style.borderRadius = "50%";
      peg.style.boxShadow = "0 2px 6px rgba(0,0,0,.4)";
    }
  });
  pegObs.observe(mapEl, {childList:true, subtree:true});

  // Custom controls: Fullscreen, Reset, Toggle MapType
  addMapControls(map);

  // Διαδρομή: Αθήνα -> (Kathisma, Rachi, Nidri) -> Λευκάδα
  const directionsService = new google.maps.DirectionsService();
  const directionsRenderer = new google.maps.DirectionsRenderer({
    map,
    suppressMarkers: true,
    polylineOptions: { strokeColor: "#f9d65c", strokeWeight: 4, strokeOpacity: 0.95 }
  });

  const req = {
    origin: "Athens, Greece",
    destination: "Lefkada, Greece",
    waypoints: [
      { location: "Kathisma Beach Lefkada", stopover: true },
      { location: "Rachi Exanthia Lefkada", stopover: true },
      { location: "Nidri Lefkada", stopover: true }
    ],
    travelMode: google.maps.TravelMode.DRIVING
  };

  directionsService.route(req, (result, status) => {
    if (status === "OK") {
      directionsRenderer.setDirections(result);
      routeBounds = result.routes[0].bounds;
      map.fitBounds(routeBounds);
    } else {
      console.warn("Directions failed:", status);
    }
  });

  // Markers (Αθήνα & Λευκάδα)
  new google.maps.Marker({ position:{ lat:37.9838, lng:23.7275 }, map, title:"Αθήνα" });
  new google.maps.Marker({ position:{ lat:38.7, lng:20.65 }, map, title:"Λευκάδα" });
}

// ---------- custom controls ----------
function addMapControls(map){
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "8px";
  wrap.style.marginTop = "10px";
  wrap.style.marginRight = "10px";

  const fsBtn = makeBtn("⤢","Πλήρης οθόνη");
  fsBtn.onclick = async ()=>{
    const el = map.getDiv();
    try{
      if (document.fullscreenElement){ await document.exitFullscreen(); fsBtn.textContent = "⤢"; }
      else { await el.requestFullscreen(); fsBtn.textContent = "✕"; }
    }catch(_){
      const on = !document.body.classList.contains("fs-active");
      document.body.classList.toggle("fs-active", on);
      fsBtn.textContent = on ? "✕" : "⤢";
    }
  };

  const resetBtn = makeBtn("↺","Επαναφορά");
  resetBtn.onclick = ()=>{ if (window.routeBounds) map.fitBounds(window.routeBounds); };

  const typeBtn = makeBtn("🗺️","Αλλαγή προβολής");
  typeBtn.onclick = ()=>{
    map.setMapTypeId(map.getMapTypeId()==="satellite" ? "roadmap" : "satellite");
  };

  wrap.appendChild(resetBtn);
  wrap.appendChild(typeBtn);
  wrap.appendChild(fsBtn);
  map.controls[google.maps.ControlPosition.RIGHT_TOP].push(wrap);

  // Συγχρονισμός εικονιδίου fullscreen
  ["fullscreenchange","webkitfullscreenchange","mozfullscreenchange","MSFullscreenChange"]
    .forEach(evt => document.addEventListener(evt, ()=>{
      const active = !!document.fullscreenElement || document.body.classList.contains("fs-active");
      fsBtn.textContent = active ? "✕" : "⤢";
      if (!active) document.body.classList.remove("fs-active");
    }));
}

function makeBtn(txt, title){
  const b = document.createElement("button");
  b.className = "gm-custom-btn";
  b.title = title;
  b.textContent = txt;
  return b;
}