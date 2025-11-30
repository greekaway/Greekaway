// Trip data loader for Greekaway Assistant
// - Reads trip JSON files from public/data/trips/*.json
// - Caches results in-memory with TTL
// - Maps Greek/English names to trip ids using tripindex.json and heuristics

const fs = require('fs');
const path = require('path');

const TRIPS_DIR = path.join(__dirname, '..', 'public', 'data', 'trips');
const TRIPINDEX_PATH = path.join(__dirname, '..', 'public', 'data', 'tripindex.json');

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

class TTLCache {
  constructor() { this.map = new Map(); }
  get(key) {
    const e = this.map.get(key);
    if (!e) return null;
    if (Date.now() > e.expiresAt) { this.map.delete(key); return null; }
    return e.value;
  }
  set(key, value, ttlMs = DEFAULT_TTL_MS) {
    this.map.set(key, { value, expiresAt: Date.now() + Math.max(1000, ttlMs) });
  }
}

const cache = new TTLCache();

function parseDurationDays(value) {
  if (value === null || typeof value === 'undefined') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.floor(num);
}

function safeReadJson(p) {
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (_) { return null; }
}

function normalizeName(s) {
  if (!s) return '';
  s = String(s).toLowerCase().trim();
  // strip accents (basic)
  try { s = s.normalize('NFD').replace(/\p{Diacritic}+/gu, ''); } catch(_) {}
  // greek specific rough normalizations
  s = s.replace(/λευκαδα/g, 'λευκαδα');
  return s;
}

let NAME_TO_ID = null;
let MAP_LOADED_AT = 0;
function buildNameMap() {
  const map = new Map();
  try {
    const idx = safeReadJson(TRIPINDEX_PATH) || [];
    for (const t of idx) {
      const id = t && t.id ? String(t.id) : null;
      if (!id) continue;
      const title = t.title || {};
      for (const v of Object.values(title)) {
        if (!v) continue;
        map.set(normalizeName(v), id);
      }
      // also the id itself
      map.set(normalizeName(id), id);
    }
  } catch (_) { /* ignore */ }
  // Heuristics for known trips that may not be listed in index
  map.set(normalizeName('Delphi'), 'delphi');
  map.set(normalizeName('Δελφοί'), 'delphi');
  map.set(normalizeName('Λευκάδα'), 'lefkas');
  map.set(normalizeName('Lefkada'), 'lefkas');
  NAME_TO_ID = map;
  MAP_LOADED_AT = Date.now();
}

function ensureNameMapFresh() {
  if (!NAME_TO_ID || (Date.now() - MAP_LOADED_AT > DEFAULT_TTL_MS)) buildNameMap();
}

function detectTripIdFromMessage(message) {
  ensureNameMapFresh();
  const m = normalizeName(message || '');
  for (const [name, id] of NAME_TO_ID.entries()) {
    if (name && m.includes(name)) return id;
  }
  // Fallback heuristics for common stems not present verbatim in titles
  try {
    if (/\blefka/i.test(m) || /\blefkad/i.test(m) || m.includes('λευκαδ')) return 'lefkas';
    if (/delph/i.test(m) || m.includes('δελφ')) return 'delphi';
  } catch(_) {}
  return null;
}

function readTripJsonById(id) {
  const key = `trip:${id}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const file = path.join(TRIPS_DIR, `${id}.json`);
  const data = safeReadJson(file);
  if (data) cache.set(key, data, DEFAULT_TTL_MS);
  return data;
}

function getLocalized(obj, lang, fallbackKeys = ['en','el']) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj[lang]) return obj[lang];
  for (const k of fallbackKeys) { if (obj[k]) return obj[k]; }
  // last resort: first value
  const vals = Object.values(obj);
  return vals.length ? vals[0] : null;
}

function resolveTextField(value, lang) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return getLocalized(value, lang);
  return null;
}

function pickPrimaryMode(trip) {
  if (!trip || typeof trip !== 'object') return { key: null, data: null };
  const modes = trip.modes && typeof trip.modes === 'object' ? trip.modes : null;
  if (!modes) return { key: null, data: null };
  const keys = Object.keys(modes);
  if (!keys.length) return { key: null, data: null };
  const defaultKey = trip.defaultMode && modes[trip.defaultMode] ? trip.defaultMode : null;
  const candidateOrder = [];
  if (defaultKey) candidateOrder.push(defaultKey);
  candidateOrder.push(...keys.filter((k) => k !== defaultKey));
  for (const key of candidateOrder) {
    const block = modes[key];
    if (block && block.active !== false) return { key, data: block };
  }
  const fallbackKey = defaultKey || keys[0];
  return { key: fallbackKey, data: modes[fallbackKey] || null };
}

function formatDurationFromMode(mode, lang, legacyDuration) {
  if (mode) {
    const days = parseDurationDays(mode.duration_days);
    if (days !== null) {
      if (days >= 1) {
        const isGreek = String(lang || '').toLowerCase().startsWith('el');
        const unit = isGreek ? (days === 1 ? 'ημέρα' : 'ημέρες') : (days === 1 ? 'day' : 'days');
        return `${days} ${unit}`;
      }
      // 0 σημαίνει μονοήμερη με ροή ωρών -> θα πέσουμε στο mode.duration
    }
    if (mode.duration) return String(mode.duration);
  }
  return legacyDuration || null;
}

function normalizeStopTime(value) {
  if (value === null || typeof value === 'undefined') return '';
  let raw = typeof value === 'number' ? String(value) : String(value || '');
  raw = raw.trim();
  if (!raw) return '';
  const colonMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
  let hours;
  let minutes;
  if (colonMatch) {
    hours = parseInt(colonMatch[1], 10);
    minutes = parseInt(colonMatch[2], 10);
  } else if (/^\d{3,4}$/.test(raw)) {
    hours = parseInt(raw.slice(0, raw.length - 2), 10);
    minutes = parseInt(raw.slice(-2), 10);
  } else {
    return '';
  }
  if (!Number.isFinite(hours) || hours < 0 || hours > 23) return '';
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function toFloat(value) {
  if (value === null || typeof value === 'undefined') return null;
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '' || normalized === null || typeof normalized === 'undefined') return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

// Build a minimal structured summary for assistant reply
function buildTripSummary(trip, lang) {
  if (!trip) return null;
  const title = resolveTextField(trip.title, lang) || trip.id || '';
  const { data: mode } = pickPrimaryMode(trip);
  const description = resolveTextField(mode && mode.description, lang) || resolveTextField(trip.description, lang) || null;
  const stopsSource = Array.isArray(mode && mode.stops) ? mode.stops : (Array.isArray(trip.stops) ? trip.stops : []);
  const stops = stopsSource.map((s) => {
    const name = resolveTextField((s && (s.title || s.name)), lang);
    const desc = resolveTextField(s && s.description, lang);
    const time = normalizeStopTime(s && (s.arrivalTime || s.arrival_time || s.time));
    return { name, description: desc, time };
  });
  const includesSource = Array.isArray(mode && mode.includes) ? mode.includes : trip.includes;
  const includes = Array.isArray(includesSource)
    ? includesSource.map((x) => (typeof x === 'string' ? x : resolveTextField(x, lang))).filter(Boolean)
    : null;
  const unavailable = Array.isArray(trip.unavailable_dates) ? trip.unavailable_dates : [];
  // duration: prefer per-mode data, fallback to legacy root or inference
  let duration = formatDurationFromMode(mode, lang, trip.duration || null);
  if (!duration && description) {
    const d = String(description).toLowerCase();
    const isGreek = (lang && String(lang).toLowerCase().startsWith('el'));
    if (/two\s+days|2\s*days|δύο\s+μέρ|2\s*ημερ/.test(d)) duration = isGreek ? '2 μέρες' : '2 days';
    if (!duration && /day\s+trip|μονοημερη|μονοήμερη|1\s*day/.test(d)) duration = isGreek ? '1 μέρα' : '1 day';
  }
  let priceCents = typeof trip.price_cents === 'number' ? trip.price_cents : null;
  if (priceCents == null && mode) {
    const rawPrice = mode.charge_type === 'per_vehicle' ? mode.price_total : mode.price_per_person;
    if (Number.isFinite(rawPrice)) priceCents = Math.round(rawPrice * 100);
  }
  const currency = typeof trip.currency === 'string' ? trip.currency : 'EUR';
  // New departure info (optional)
  let departureTime = null;
  let departurePlace = null;
  if (trip && trip.departure) {
    if (trip.departure.departure_time) departureTime = String(trip.departure.departure_time);
    const rpName = trip.departure.reference_point && trip.departure.reference_point.name;
    if (rpName) departurePlace = String(rpName);
  }
  const pickupPointsSource = Array.isArray(mode && mode.busPickupPoints) ? mode.busPickupPoints : [];
  const busPickupPoints = pickupPointsSource
    .map((point) => {
      if (!point || typeof point !== 'object') return null;
      const title = resolveTextField(point.title, lang) || '';
      const address = resolveTextField(point.address, lang) || '';
      const departure = normalizeStopTime(point.departureTime || point.time);
      const lat = toFloat(point.lat ?? point.latitude);
      const lng = toFloat(point.lng ?? point.longitude);
      if (!title && !address && !departure && lat == null && lng == null) return null;
      return { title, address, departureTime: departure, lat, lng };
    })
    .filter(Boolean);
  return { title, description, stops, busPickupPoints, includes, unavailable, duration, priceCents, currency, departureTime, departurePlace };
}

module.exports = {
  detectTripIdFromMessage,
  readTripJsonById,
  buildTripSummary,
  getLocalized
};
