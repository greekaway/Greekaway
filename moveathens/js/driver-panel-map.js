/**
 * MoveAthens Driver Panel — Live Map
 * Leaflet + OpenStreetMap (free, no API key).
 * Shows driver's live location + zooms to new route pickup.
 */
(() => {
  'use strict';

  let map = null;
  let driverMarker = null;
  let pickupMarker = null;
  let dropoffMarker = null;
  let routeLine = null;
  let watchId = null;
  let hasUserInteracted = false; // don't fight the user's pan/zoom
  let initialized = false;

  // Athens center as default
  const DEFAULT_CENTER = [37.9838, 23.7275];
  const DEFAULT_ZOOM = 12;

  // Custom arrow icon for driver (SVG, cyan)
  const driverIcon = L.divIcon({
    className: 'ma-dp-map-driver-icon',
    html: `<svg viewBox="0 0 24 24" width="32" height="32">
      <circle cx="12" cy="12" r="11" fill="var(--ma-dp-accent, #46d3ff)" opacity="0.2"/>
      <circle cx="12" cy="12" r="6" fill="var(--ma-dp-accent, #46d3ff)" stroke="#fff" stroke-width="2"/>
    </svg>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  // Pickup icon (green pin)
  const pickupIcon = L.divIcon({
    className: 'ma-dp-map-pin',
    html: `<svg viewBox="0 0 24 36" width="28" height="42">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#00c896"/>
      <circle cx="12" cy="12" r="5" fill="#fff"/>
      <text x="12" y="15" text-anchor="middle" font-size="8" fill="#00c896" font-weight="bold">A</text>
    </svg>`,
    iconSize: [28, 42],
    iconAnchor: [14, 42],
    popupAnchor: [0, -42]
  });

  // Dropoff icon (red pin)
  const dropoffIcon = L.divIcon({
    className: 'ma-dp-map-pin',
    html: `<svg viewBox="0 0 24 36" width="28" height="42">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#ff4757"/>
      <circle cx="12" cy="12" r="5" fill="#fff"/>
      <text x="12" y="15" text-anchor="middle" font-size="8" fill="#ff4757" font-weight="bold">B</text>
    </svg>`,
    iconSize: [28, 42],
    iconAnchor: [14, 42],
    popupAnchor: [0, -42]
  });

  /** Initialize the Leaflet map inside the home tab */
  function init() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('dpMapContainer');
    if (!container) return;

    map = L.map(container, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: false
    });

    // OpenStreetMap dark-friendly tiles (CartoDB dark matter)
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const tileUrl = isDark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    L.tileLayer(tileUrl, {
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(map);

    // Small attribution bottom-right
    L.control.attribution({ position: 'bottomright', prefix: false })
      .addAttribution('© <a href="https://carto.com">CARTO</a> © <a href="https://osm.org">OSM</a>')
      .addTo(map);

    // Track user interaction (don't auto-recenter after manual pan)
    map.on('dragstart', () => { hasUserInteracted = true; });

    // Start watching driver location
    startGeolocation();
  }

  /** Start watching the driver's GPS position */
  function startGeolocation() {
    if (!navigator.geolocation) return;

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        updateDriverPosition(lat, lng);
      },
      (err) => {
        console.warn('[map] Geolocation error:', err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 15000
      }
    );
  }

  /** Update the driver's blue dot on the map */
  function updateDriverPosition(lat, lng) {
    if (!map) return;

    if (!driverMarker) {
      driverMarker = L.marker([lat, lng], { icon: driverIcon, zIndexOffset: 1000 }).addTo(map);
      // First fix: center map on driver
      if (!hasUserInteracted) {
        map.setView([lat, lng], 14, { animate: true });
      }
    } else {
      driverMarker.setLatLng([lat, lng]);
    }
  }

  /** Show route pickup + dropoff when a new request arrives */
  function showRoute(card) {
    if (!map) return;

    clearRoute();
    hasUserInteracted = false;

    // Determine pickup/dropoff based on is_arrival
    let pickupLat, pickupLng, dropoffLat, dropoffLng, pickupLabel, dropoffLabel;

    if (card.is_arrival) {
      // Arrival: pickup = airport/port (destination), dropoff = hotel
      pickupLat = parseFloat(card.destination_lat);
      pickupLng = parseFloat(card.destination_lng);
      dropoffLat = parseFloat(card.hotel_lat);
      dropoffLng = parseFloat(card.hotel_lng);
      pickupLabel = 'Παραλαβή (Αεροδρόμιο/Λιμάνι)';
      dropoffLabel = 'Αποβίβαση (Ξενοδοχείο)';
    } else {
      // Departure: pickup = hotel, dropoff = airport/port (destination)
      pickupLat = parseFloat(card.hotel_lat);
      pickupLng = parseFloat(card.hotel_lng);
      dropoffLat = parseFloat(card.destination_lat);
      dropoffLng = parseFloat(card.destination_lng);
      pickupLabel = 'Παραλαβή (Ξενοδοχείο)';
      dropoffLabel = 'Αποβίβαση (Αεροδρόμιο/Λιμάνι)';
    }

    // Place markers if coordinates exist
    if (pickupLat && pickupLng) {
      pickupMarker = L.marker([pickupLat, pickupLng], { icon: pickupIcon })
        .addTo(map)
        .bindPopup(pickupLabel);
    }
    if (dropoffLat && dropoffLng) {
      dropoffMarker = L.marker([dropoffLat, dropoffLng], { icon: dropoffIcon })
        .addTo(map)
        .bindPopup(dropoffLabel);
    }

    // Draw line between A→B
    if (pickupLat && pickupLng && dropoffLat && dropoffLng) {
      routeLine = L.polyline(
        [[pickupLat, pickupLng], [dropoffLat, dropoffLng]],
        { color: 'var(--ma-dp-accent, #46d3ff)', weight: 3, opacity: 0.7, dashArray: '8 6' }
      ).addTo(map);
    }

    // Fit map to show the route (include driver if visible)
    const bounds = L.latLngBounds([]);
    if (pickupLat && pickupLng) bounds.extend([pickupLat, pickupLng]);
    if (dropoffLat && dropoffLng) bounds.extend([dropoffLat, dropoffLng]);
    if (driverMarker) bounds.extend(driverMarker.getLatLng());

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: true });
    }
  }

  /** Remove route markers/line */
  function clearRoute() {
    if (pickupMarker) { map.removeLayer(pickupMarker); pickupMarker = null; }
    if (dropoffMarker) { map.removeLayer(dropoffMarker); dropoffMarker = null; }
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  }

  /** Re-center on driver (e.g. after route dismissed) */
  function recenterOnDriver() {
    hasUserInteracted = false;
    if (driverMarker && map) {
      map.setView(driverMarker.getLatLng(), 14, { animate: true });
    }
  }

  /** Invalidate size (call after tab switch to fix grey tiles) */
  function resize() {
    if (map) setTimeout(() => map.invalidateSize(), 100);
  }

  /** Cleanup */
  function destroy() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (map) {
      map.remove();
      map = null;
    }
    driverMarker = null;
    pickupMarker = null;
    dropoffMarker = null;
    routeLine = null;
    initialized = false;
    hasUserInteracted = false;
  }

  window.DpMap = { init, showRoute, clearRoute, recenterOnDriver, resize, destroy };
})();
