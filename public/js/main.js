/* ---------- Κοινές UI συναρτήσεις ---------- */
function toggleMenu(){
  const menu = document.getElementById('menuDrop');
  if(!menu) return;
  menu.style.display = (menu.style.display==='flex') ? 'none' : 'flex';
}
document.addEventListener('click', (e) => {
  const menu = document.getElementById('menuDrop');
  const hamburger = document.querySelector('.hamburger');
  if (menu && menu.style.display === 'flex' && !menu.contains(e.target) && !hamburger.contains(e.target)) {
    menu.style.display = 'none';
  }
});
function navigateTo(id){
  document.querySelectorAll('.overlay').forEach(el => el.classList.remove('active'));
  const menu = document.getElementById('menuDrop');
  if (menu) menu.style.display = 'none';
  const target = document.getElementById(id);
  if(target){ target.scrollIntoView({behavior:'smooth'}); }
}
function openOverlay(id){
  document.querySelectorAll('.overlay').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}
function closeOverlay(id){
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

/* ---------- Google Map (με ίδια κουμπάκια όπως παλιά) ---------- */
let map, routeBounds, directionsRenderer;

function initMap(){
  const mapEl = document.getElementById('map');
  if(!mapEl) return; // welcome page δεν έχει χάρτη

  const center = (window.TRIP_CENTER) ? window.TRIP_CENTER : {lat:38.5, lng:22.0};
  map = new google.maps.Map(mapEl, {
    center, zoom: 8, mapTypeId: 'roadmap',
    zoomControl: true,           // αφήνουμε τα default +/- της Google
    mapTypeControl: true,
    streetViewControl: true,
    fullscreenControl: false     // δικό μας ⤢
  });

  const service = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({ map });

  const waypoints = (window.TRIP_WAYPOINTS || []).map(loc => ({location: loc, stopover: true}));

  service.route({
    origin: "Athens, Greece",
    destination: "Athens, Greece",
    waypoints,
    travelMode: "DRIVING"
  }, (result, status) => {
    if (status === "OK") {
      directionsRenderer.setDirections(result);
      if (result.routes && result.routes[0] && result.routes[0].bounds){
        routeBounds = result.routes[0].bounds;
        map.fitBounds(routeBounds);
      }
    } else {
      console.warn('Directions request failed:', status);
    }
  });

  // --- Custom Controls: ⤢ Fullscreen, ↺ Reset ---
  const fsBtn = document.createElement('div');
  fsBtn.className = 'gm-custom-btn';
  fsBtn.title = 'Πλήρης οθόνη';
  fsBtn.textContent = '⤢';
  fsBtn.onclick = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        fsBtn.textContent = '⤢';
      } else {
        await mapEl.requestFullscreen();
        fsBtn.textContent = '✕';
      }
    } catch (e) {
      // Fallback χωρίς native fullscreen
      fsBtn.textContent = (fsBtn.textContent==='⤢') ? '✕' : '⤢';
      mapEl.classList.toggle('fake-fullscreen');
    }
  };

  const resetBtn = document.createElement('div');
  resetBtn.className = 'gm-custom-btn';
  resetBtn.title = 'Επανέφερε διαδρομή';
  resetBtn.textContent = '↺';
  resetBtn.onclick = () => { if(routeBounds) map.fitBounds(routeBounds); };

  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(fsBtn);
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(resetBtn);

  // Συγχρονισμός εικονιδίου όταν βγαίνουμε από fullscreen
  ['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange']
    .forEach(evt => document.addEventListener(evt, () => {
      fsBtn.textContent = document.fullscreenElement ? '✕' : '⤢';
    }));
}