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

// Build a minimal structured summary for assistant reply
function buildTripSummary(trip, lang) {
  if (!trip) return null;
  const title = getLocalized(trip.title || {}, lang) || trip.id || '';
  const description = getLocalized(trip.description || {}, lang) || null;
  const stops = Array.isArray(trip.stops) ? trip.stops.map(s => ({
    name: getLocalized((s && s.name) || {}, lang),
    description: getLocalized((s && s.description) || {}, lang)
  })) : [];
  const includes = Array.isArray(trip.includes) ? trip.includes.map(x => (typeof x === 'string' ? x : getLocalized(x, lang))) : null; // may be missing
  const unavailable = Array.isArray(trip.unavailable_dates) ? trip.unavailable_dates : [];
  // duration: if present in JSON prefer it, else try to infer naive from description for Lefkada demo
  let duration = trip.duration || null;
  if (!duration && description) {
    const d = String(description).toLowerCase();
    if (/two\s+days|2\s+days|δύο\s+μέρ|2\s*ημερ/.test(d)) duration = '2 days';
    if (!duration && /day\s+trip|μονοημερη|1\s*day/.test(d)) duration = '1 day';
  }
  const priceCents = typeof trip.price_cents === 'number' ? trip.price_cents : null;
  return { title, description, stops, includes, unavailable, duration, priceCents };
}

module.exports = {
  detectTripIdFromMessage,
  readTripJsonById,
  buildTripSummary,
  getLocalized
};
