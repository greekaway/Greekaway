// Live data providers for Greekaway Assistant
// - Weather via Open-Meteo (no API key required) or custom WEATHER_API_URL
// - Optional News via RSS (pluggable, off by default)
// Includes a small in-memory cache with TTL

const fetch = global.fetch || ((...args) => import('node-fetch').then(({default: f}) => f(...args)));

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const WEATHER_API_URL = (process.env.WEATHER_API_URL || '').trim();

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

async function fetchJsonWithCache(url, ttlMs = DEFAULT_TTL_MS) {
  const key = `json:${url}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const resp = await fetch(url, { headers: { 'User-Agent': 'Greekaway/1.0 live-data' } });
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
  const data = await resp.json();
  cache.set(key, data, ttlMs);
  return data;
}

// Geocode a place name to { name, country, latitude, longitude }
async function geocodePlace(name, lang = 'en') {
  const q = encodeURIComponent(String(name || '').trim());
  if (!q) throw new Error('Empty place');
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=${encodeURIComponent(lang)}&format=json`;
  const data = await fetchJsonWithCache(url);
  const r = data && data.results && data.results[0];
  if (!r) throw new Error('Place not found');
  return {
    name: r.name,
    country: r.country || null,
    latitude: r.latitude,
    longitude: r.longitude
  };
}

// Map Open-Meteo weathercode to simple text
function weatherCodeToText(code) {
  // Simplified mapping covering common codes
  const map = {
    0: 'clear sky',
    1: 'mainly clear',
    2: 'partly cloudy',
    3: 'overcast',
    45: 'foggy', 48: 'depositing rime fog',
    51: 'light drizzle', 53: 'moderate drizzle', 55: 'dense drizzle',
    56: 'light freezing drizzle', 57: 'dense freezing drizzle',
    61: 'light rain', 63: 'rain', 65: 'heavy rain',
    66: 'light freezing rain', 67: 'freezing rain',
    71: 'light snow', 73: 'snow', 75: 'heavy snow',
    77: 'snow grains',
    80: 'rain showers', 81: 'strong rain showers', 82: 'violent rain showers',
    85: 'snow showers', 86: 'heavy snow showers',
    95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'heavy thunderstorm with hail'
  };
  return map[code] || 'weather';
}

async function getCurrentWeatherByPlace(placeName, lang = 'en') {
  const place = await geocodePlace(placeName, lang);
  const base = (WEATHER_API_URL && /^https?:\/\//i.test(WEATHER_API_URL))
    ? WEATHER_API_URL.replace(/\/$/, '')
    : 'https://api.open-meteo.com/v1/forecast';
  const url = `${base}?latitude=${place.latitude}&longitude=${place.longitude}&current_weather=true`;
  const data = await fetchJsonWithCache(url);
  const cw = data && data.current_weather;
  if (!cw) throw new Error('No current weather');
  const conditions = weatherCodeToText(cw.weathercode);
  return {
    place: place.name,
    country: place.country,
    latitude: place.latitude,
    longitude: place.longitude,
    temperature_c: cw.temperature,
    windspeed_kmh: cw.windspeed,
    weathercode: cw.weathercode,
    conditions,
    time: cw.time
  };
}

function formatWeatherSnippet(w, lang = 'en') {
  // Keep English; OpenAI will rewrite in user language from overall prompt.
  const loc = w.country ? `${w.place}, ${w.country}` : w.place;
  return `Weather now in ${loc}: ${Math.round(w.temperature_c)}°C, ${w.conditions}, wind ${Math.round(w.windspeed_kmh)} km/h (as of ${w.time}).`;
}

// Optional minimal RSS headlines fetcher (disabled unless URL provided)
async function getRssHeadlines(rssUrl, max = 3) {
  if (!rssUrl) return [];
  const txtKey = `rss:${rssUrl}`;
  const cached = cache.get(txtKey);
  if (cached) return cached;
  const resp = await fetch(rssUrl, { headers: { 'User-Agent': 'Greekaway/1.0 live-data' } });
  if (!resp.ok) return [];
  const xml = await resp.text();
  // naive parse of <title> within <item>
  const items = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  const titleRegex = /<title>([\s\S]*?)<\/title>/i;
  let m;
  while ((m = itemRegex.exec(xml)) && items.length < max) {
    const itemXml = m[0];
    const tm = titleRegex.exec(itemXml);
    if (tm && tm[1]) {
      items.push(tm[1].replace(/\s+/g, ' ').trim());
    }
  }
  cache.set(txtKey, items, DEFAULT_TTL_MS);
  return items;
}

// Compose assistant context snippets based on requested fields
async function buildLiveContext({ place, lang = 'en', include = { weather: true, news: false }, rssUrl = null }) {
  const parts = [];
  const meta = {};
  if (include.weather && place) {
    try {
      const w = await getCurrentWeatherByPlace(place, lang);
      parts.push(formatWeatherSnippet(w, lang));
      meta.weather = w;
    } catch (e) {
      // non-fatal
    }
  }
  if (include.news && rssUrl) {
    try {
      const urls = Array.isArray(rssUrl) ? rssUrl : [rssUrl];
      const all = [];
      for (const u of urls) {
        const hs = await getRssHeadlines(u, 3);
        (hs || []).forEach(h => all.push(h));
      }
      const deduped = Array.from(new Set(all)).slice(0, 5);
      if (deduped.length) {
        parts.push(`Local headlines: ${deduped.join(' • ')}`);
        meta.news = deduped;
      }
    } catch (e) {}
  }
  return { text: parts.join(' \n'), meta };
}

module.exports = {
  cache,
  DEFAULT_TTL_MS,
  geocodePlace,
  getCurrentWeatherByPlace,
  formatWeatherSnippet,
  getRssHeadlines,
  buildLiveContext
};
