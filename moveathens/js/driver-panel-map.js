/**
 * MoveAthens Driver Panel — Fullscreen Live Map
 * Leaflet + OpenStreetMap (free, no API key).
 * Shows driver's live location arrow + zooms to new route.
 */
(() => {
  'use strict';

  let map = null;
  let tileLayer = null;
  let driverMarker = null;
  let pickupMarker = null;
  let dropoffMarker = null;
  let routeLine = null;
  let watchId = null;
  let lastHeading = 0;
  let hasUserInteracted = false;
  let initialized = false;

  // Athens center as default
  const DEFAULT_CENTER = [37.9838, 23.7275];
  const DEFAULT_ZOOM = 13;

  // Tile URLs — Voyager for both modes (dark via CSS filter)
  const TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  /** Get current theme */
  function isDarkMode() {
    return document.documentElement.getAttribute('data-theme') !== 'light';
  }

  /** Create the driver arrow SVG (navigation style — dark in both modes) */
  function makeDriverIcon() {
    return L.divIcon({
      className: 'ma-dp-map-driver-icon',
      html: `<svg viewBox="0 0 48 48" width="48" height="48" style="transform:rotate(${lastHeading}deg)">
        <circle cx="24" cy="24" r="22" fill="rgba(0,0,0,0.08)"/>
        <circle cx="24" cy="24" r="14" fill="#1a1a2e" stroke="#fff" stroke-width="2.5"/>
        <path d="M24 14 L30 30 L24 26 L18 30 Z" fill="#fff" stroke="none"/>
      </svg>`,
      iconSize: [48, 48],
      iconAnchor: [24, 24]
    });
  }

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

  /** Initialize the fullscreen Leaflet map */
  function init() {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById('dpMapContainer');
    if (!container) return;

    // Mark app as map-active for CSS
    const app = document.querySelector('.ma-dp-app');
    if (app) app.setAttribute('data-map-active', '');

    map = L.map(container, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: false
    });

    // Same Voyager tiles for both modes (dark via CSS filter on tile pane)
    tileLayer = L.tileLayer(TILES, {
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(map);

    // Apply dark filter if needed
    applyTileFilter();

    // Small attribution
    L.control.attribution({ position: 'bottomleft', prefix: false })
      .addAttribution('© <a href="https://carto.com" style="color:#6b7280">CARTO</a> © <a href="https://osm.org" style="color:#6b7280">OSM</a>')
      .addTo(map);

    // Track user interaction
    map.on('dragstart', () => { hasUserInteracted = true; });

    // Listen for theme changes (MutationObserver on data-theme)
    const observer = new MutationObserver(() => { switchTiles(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Start watching driver location
    startGeolocation();
  }

  /** Apply/remove CSS filter on tiles for dark mode */
  function applyTileFilter() {
    if (!map) return;
    const pane = map.getPane('tilePane');
    if (!pane) return;
    if (isDarkMode()) {
      pane.style.filter = 'invert(100%) hue-rotate(180deg) brightness(92%) contrast(85%) saturate(120%)';
    } else {
      pane.style.filter = 'none';
    }
  }

  /** Switch tile appearance when theme changes */
  function switchTiles() {
    applyTileFilter();
  }

  /** Start watching the driver's GPS position + heading */
  function startGeolocation() {
    if (!navigator.geolocation) return;

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        // Use heading if available (moving device)
        if (pos.coords.heading != null && !isNaN(pos.coords.heading)) {
          lastHeading = pos.coords.heading;
        }
        updateDriverPosition(lat, lng);
      },
      (err) => {
        console.warn('[map] Geolocation error:', err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000
      }
    );
  }

  /** Update the driver's arrow on the map */
  function updateDriverPosition(lat, lng) {
    if (!map) return;

    const icon = makeDriverIcon();

    if (!driverMarker) {
      driverMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map);
      // First fix: center on driver
      if (!hasUserInteracted) {
        map.setView([lat, lng], 14, { animate: true });
      }
    } else {
      driverMarker.setLatLng([lat, lng]);
      driverMarker.setIcon(icon); // Update rotation
    }
  }

  /** Show route pickup + dropoff when a new request arrives */
  function showRoute(card) {
    if (!map) return;

    clearRoute();
    hasUserInteracted = false;

    let pickupLat, pickupLng, dropoffLat, dropoffLng, pickupLabel, dropoffLabel;

    if (card.is_arrival) {
      pickupLat = parseFloat(card.destination_lat);
      pickupLng = parseFloat(card.destination_lng);
      dropoffLat = parseFloat(card.hotel_lat);
      dropoffLng = parseFloat(card.hotel_lng);
      pickupLabel = 'Παραλαβή (Αεροδρόμιο/Λιμάνι)';
      dropoffLabel = 'Αποβίβαση (Ξενοδοχείο)';
    } else {
      pickupLat = parseFloat(card.hotel_lat);
      pickupLng = parseFloat(card.hotel_lng);
      dropoffLat = parseFloat(card.destination_lat);
      dropoffLng = parseFloat(card.destination_lng);
      pickupLabel = 'Παραλαβή (Ξενοδοχείο)';
      dropoffLabel = 'Αποβίβαση (Αεροδρόμιο/Λιμάνι)';
    }

    if (pickupLat && pickupLng) {
      pickupMarker = L.marker([pickupLat, pickupLng], { icon: pickupIcon })
        .addTo(map).bindPopup(pickupLabel);
    }
    if (dropoffLat && dropoffLng) {
      dropoffMarker = L.marker([dropoffLat, dropoffLng], { icon: dropoffIcon })
        .addTo(map).bindPopup(dropoffLabel);
    }

    // Dashed line A→B
    if (pickupLat && pickupLng && dropoffLat && dropoffLng) {
      routeLine = L.polyline(
        [[pickupLat, pickupLng], [dropoffLat, dropoffLng]],
        { color: '#46d3ff', weight: 3, opacity: 0.7, dashArray: '8 6' }
      ).addTo(map);
    }

    // Fit bounds (driver + route)
    const bounds = L.latLngBounds([]);
    if (pickupLat && pickupLng) bounds.extend([pickupLat, pickupLng]);
    if (dropoffLat && dropoffLng) bounds.extend([dropoffLat, dropoffLng]);
    if (driverMarker) bounds.extend(driverMarker.getLatLng());

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [60, 40], maxZoom: 14, animate: true });
    }
  }

  /** Remove route markers/line */
  function clearRoute() {
    if (pickupMarker) { map.removeLayer(pickupMarker); pickupMarker = null; }
    if (dropoffMarker) { map.removeLayer(dropoffMarker); dropoffMarker = null; }
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  }

  /** Re-center on driver */
  function recenterOnDriver() {
    hasUserInteracted = false;
    if (driverMarker && map) {
      map.setView(driverMarker.getLatLng(), 14, { animate: true });
    }
  }

  /** Invalidate size (call after tab switch) */
  function resize() {
    if (map) setTimeout(() => map.invalidateSize(), 100);
  }

  /** Show/hide map based on active tab */
  function setVisible(visible) {
    const wrap = document.querySelector('.ma-dp-map-wrap');
    const btn = document.getElementById('dpMapRecenter');
    if (wrap) wrap.style.display = visible ? '' : 'none';
    if (btn) btn.style.display = visible ? '' : 'none';
    if (visible) resize();
  }

  /** Cleanup */
  function destroy() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (map) { map.remove(); map = null; }
    driverMarker = null;
    pickupMarker = null;
    dropoffMarker = null;
    routeLine = null;
    tileLayer = null;
    initialized = false;
    hasUserInteracted = false;
  }

  window.DpMap = { init, showRoute, clearRoute, recenterOnDriver, resize, setVisible, destroy };
})();
