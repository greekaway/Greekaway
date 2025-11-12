#!/usr/bin/env node
/**
 * auto_geocode_trips.js
 * -------------------------------------------------------
 * Automatically enrich trip JSON files under public/data/trips/*.json
 * with lat/lng coordinates and a map.waypoints array when missing.
 *
 * HOW IT WORKS
 * - For each trip JSON, iterate stops.
 * - If a stop has address but no lat/lng, call a geocoding provider.
 * - Provider defaults to Open-Meteo geocoding (no API key) or can be overridden
 *   via env GW_GEOCODE_ENDPOINT (must return JSON array with lat/lon fields or
 *   an object similar to Nominatim / generic { latitude, longitude } naming).
 * - Writes updated JSON back (unless --dry-run).
 * - If any lat/lng found for >=2 stops and no map.waypoints exists, create
 *   map.center (first stop) and map.zoom ~12 plus waypoints list.
 *
 * USAGE
 *   node tools/auto_geocode_trips.js            # process all trips
 *   node tools/auto_geocode_trips.js acropolis  # process only acropolis.json
 *   node tools/auto_geocode_trips.js --dry-run  # show changes but don't write
 *
 * SAFE MODE / RATE LIMITING
 * - Simple 800ms delay between geocode calls to be polite.
 * - Caches results in memory during one run to avoid duplicate requests.
 *
 * OUTPUT
 * - Logs enriched stops and map creation.
 * - Exits with code 0 on success; 1 on fatal error.
 */
const fs = require('fs');
const path = require('path');
const fetch = global.fetch || ((...args) => import('node-fetch').then(({default: f}) => f(...args)));

const TRIPS_DIR = path.join(__dirname, '..', 'public', 'data', 'trips');
const ARG_TRIP = process.argv.slice(2).find(a => !a.startsWith('--')) || null;
const DRY_RUN = process.argv.includes('--dry-run');
const CUSTOM_ENDPOINT = (process.env.GW_GEOCODE_ENDPOINT || '').trim();
const DELAY_MS = 800;

const cache = new Map();

async function geocode(address){
  const key = address.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);
  let result = null;
  try {
    if (CUSTOM_ENDPOINT) {
      const url = CUSTOM_ENDPOINT.replace(/\/$/, '') + '?' + new URLSearchParams({ q: address }).toString();
      const resp = await fetch(url, { headers: { 'User-Agent': 'Greekaway-Geocode/1.0' } });
      const json = await resp.json();
      // Try several shapes
      if (Array.isArray(json) && json.length) {
        const r = json[0];
        const lat = r.lat || r.latitude || r.y || r.latitudes; // attempt variations
        const lon = r.lon || r.lng || r.longitude || r.x || r.longitudes;
        if (lat && lon) result = { lat: parseFloat(lat), lng: parseFloat(lon) };
      } else if (json && typeof json === 'object') {
        const r = json;
        const lat = r.lat || r.latitude;
        const lon = r.lon || r.lng || r.longitude;
        if (lat && lon) result = { lat: parseFloat(lat), lng: parseFloat(lon) };
      }
    } else {
      // Default: Open-Meteo geocoding (name only, best-effort)
      const url = 'https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(address);
      const resp = await fetch(url, { headers: { 'User-Agent': 'Greekaway-Geocode/1.0' } });
      const json = await resp.json();
      if (json && json.results && json.results[0]) {
        result = { lat: json.results[0].latitude, lng: json.results[0].longitude };
      }
    }
  } catch(e){
    console.warn('geocode failed for', address, e.message || e);
  }
  if (!result) {
    console.warn('No geocode result for', address);
    result = null;
  }
  cache.set(key, result);
  return result;
}

function readTrips(){
  const files = fs.readdirSync(TRIPS_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => ({ file: f, full: path.join(TRIPS_DIR, f) }));
}

async function processTrip(fileInfo){
  const raw = fs.readFileSync(fileInfo.full, 'utf8');
  let data;
  try { data = JSON.parse(raw); } catch(e){ console.error('Invalid JSON', fileInfo.file, e.message); return; }
  const stops = Array.isArray(data.stops) ? data.stops : [];
  let changed = false;
  for (const stop of stops) {
    if (!stop) continue;
    if ((stop.lat == null || stop.lng == null) && stop.address) {
      const coords = await geocode(stop.address);
      if (coords) {
        stop.lat = coords.lat;
        stop.lng = coords.lng;
        changed = true;
        console.log('Enriched stop lat/lng:', stop.address, coords);
      }
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }
  // Build map if missing and we have at least 2 coords
  const haveCoords = stops.filter(s => typeof s.lat === 'number' && typeof s.lng === 'number');
  if ((!data.map || !data.map.waypoints) && haveCoords.length >= 2) {
    data.map = data.map || {};
    data.map.center = data.map.center || { lat: haveCoords[0].lat, lng: haveCoords[0].lng };
    data.map.zoom = data.map.zoom || 12;
    data.map.waypoints = haveCoords.map(s => ({ lat: s.lat, lng: s.lng }));
    changed = true;
    console.log('Created map.waypoints for', data.id, 'count=', data.map.waypoints.length);
  }
  if (changed) {
    if (DRY_RUN) {
      console.log('[dry-run] Would write changes to', fileInfo.file);
    } else {
      fs.writeFileSync(fileInfo.full, JSON.stringify(data, null, 2));
      console.log('Updated', fileInfo.file);
    }
  } else {
    console.log('No changes needed for', fileInfo.file);
  }
}

(async () => {
  try {
    const all = readTrips();
    const targets = ARG_TRIP ? all.filter(t => t.file === ARG_TRIP + '.json') : all;
    if (!targets.length) { console.error('No matching trip files.'); process.exit(1); }
    for (const t of targets) {
      console.log('\n--- Processing', t.file, '---');
      await processTrip(t);
    }
    console.log('\nDone.');
    process.exit(0);
  } catch(e){
    console.error('Fatal error:', e.message || e);
    process.exit(1);
  }
})();
