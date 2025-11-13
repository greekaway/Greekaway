'use strict';
const fs = require('fs');
const path = require('path');

function safeReadJson(p){
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(_) { return null; }
}

function yyyymmdd(date){
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
}

// Compute a stable cache-busting version string like 20251113
// Priority: env BUILD_CACHE_BUST -> version.json build date -> today -> Date.now()
function computeCacheBust(rootDir){
  const env = (process.env.BUILD_CACHE_BUST || '').trim();
  if (env) return env;
  try {
    const vfPath = path.join(rootDir, 'version.json');
    const vf = safeReadJson(vfPath);
    if (vf && vf.build) {
      // Try to parse formats like 'YYYY-MM-DD HH:MM'
      const m = String(vf.build).match(/(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[1]}${m[2]}${m[3]}`;
    }
  } catch(_) {}
  try { return yyyymmdd(new Date()); } catch(_) { return String(Date.now()); }
}

module.exports = { computeCacheBust };
