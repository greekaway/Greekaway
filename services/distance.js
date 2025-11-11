const crypto = require('crypto');

// In-memory TTL cache for travel times between coordinate pairs
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map();

function cacheKey(a, b) {
  const aKey = `${Number(a.lat).toFixed(6)},${Number(a.lng).toFixed(6)}`;
  const bKey = `${Number(b.lat).toFixed(6)},${Number(b.lng).toFixed(6)}`;
  return aKey + '->' + bKey;
}

function setCache(key, seconds) {
  cache.set(key, { seconds, ts: Date.now() });
}

function getCache(key) {
  const it = cache.get(key);
  if (!it) return null;
  if ((Date.now() - it.ts) > CACHE_TTL_MS) { cache.delete(key); return null; }
  return it.seconds;
}

function haversineSeconds(a, b, avgKmh = 30) {
  const toRad = (x) => x * Math.PI / 180;
  const R = 6371; // km
  const dLat = toRad((b.lat || 0) - (a.lat || 0));
  const dLon = toRad((b.lng || 0) - (a.lng || 0));
  const lat1 = toRad(a.lat || 0);
  const lat2 = toRad(b.lat || 0);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const d = 2 * R * Math.asin(Math.sqrt(x)); // distance in km
  const hours = d / Math.max(5, avgKmh);
  return Math.round(hours * 3600);
}

async function getTravelSeconds(a, b) {
  try {
    if (!a || !b) return 0;
    if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) {
      // Without coordinates we can't reliably query; fallback to 10 min
      return 10 * 60;
    }
    const key = cacheKey(a, b);
    const cached = getCache(key);
    if (cached != null) return cached;

    const GOOGLE_KEY = (process.env.GOOGLE_MAPS_API_KEY || '').toString().trim();
    if (GOOGLE_KEY) {
      try {
        const origins = `${a.lat},${a.lng}`;
        const dests = `${b.lat},${b.lng}`;
        const departure = Math.floor(Date.now() / 1000);
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?units=metric&mode=driving&language=el&region=gr&departure_time=${departure}&origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(dests)}&key=${GOOGLE_KEY}`;
        const r = await fetch(url);
        const j = await r.json();
        const el = j && Array.isArray(j.rows) && j.rows[0] && j.rows[0].elements && j.rows[0].elements[0];
        let sec = null;
        if (el) {
          if (el.duration_in_traffic && el.duration_in_traffic.value != null) sec = el.duration_in_traffic.value;
          else if (el.duration && el.duration.value != null) sec = el.duration.value;
        }
        if (typeof sec === 'number' && isFinite(sec)) {
          setCache(key, sec);
          return sec;
        }
      } catch (e) {
        // continue to fallback
      }
    }
    const fallback = haversineSeconds(a, b, 30);
    setCache(key, fallback);
    console.warn('distance: fallback haversine used');
    return fallback;
  } catch (_) {
    return 0;
  }
}

module.exports = { getTravelSeconds };
