require('./env');
const https = require('https');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const cache = new Map(); // key: address -> { lat, lng, formatted_address, ts }

function fromCache(address){
  const it = cache.get(address);
  if (!it) return null;
  if ((Date.now() - it.ts) > CACHE_TTL_MS) { cache.delete(address); return null; }
  return { lat: it.lat, lng: it.lng, formatted_address: it.formatted_address };
}

function toCache(address, result){
  cache.set(address, { ...result, ts: Date.now() });
}

function httpsGet(url){
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

async function forwardGeocode(address){
  try {
    const addr = String(address || '').trim();
    if (!addr) return null;
    const cached = fromCache(addr);
    if (cached) return cached;
    const key = (process.env.GOOGLE_MAPS_API_KEY || '').toString().trim();
    if (!key) return null;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&language=el&region=gr&key=${key}`;
    let json = null;
    if (typeof fetch === 'function'){
      const r = await fetch(url);
      json = await r.json();
    } else {
      const r = await httpsGet(url);
      json = JSON.parse(r.body || '{}');
    }
    const first = json && Array.isArray(json.results) && json.results[0];
    if (first && first.geometry && first.geometry.location){
      const out = { lat: Number(first.geometry.location.lat), lng: Number(first.geometry.location.lng), formatted_address: first.formatted_address || addr };
      toCache(addr, out);
      return out;
    }
    return null;
  } catch (_) {
    return null;
  }
}

module.exports = { forwardGeocode };
