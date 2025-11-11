#!/usr/bin/env node
/**
 * Scan bookings metadata.stops and remove any stop whose address or name contains
 * 'Optimise' or 'Λεωφ. Αθηνών 206' (phantom waypoint). Persist cleaned metadata.
 * Usage: node scripts/remove_optimise_stops.js
 */
const path = require('path');
const Database = require('better-sqlite3');
const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite3');
const db = new Database(DB_PATH);
function likePhantom(text){
  if (!text) return false;
  const t = String(text).toLowerCase();
  return /optimise/.test(t) || /αθηνών\s*206/.test(t) || /λεωφ\.?\s*αθηνών\s*206/.test(t);
}
let changed = 0;
try {
  const rows = db.prepare('SELECT id, metadata FROM bookings').all();
  for (const r of rows){
    if (!r.metadata) continue;
    let meta; try { meta = JSON.parse(r.metadata); } catch(_) { continue; }
    if (!meta || !Array.isArray(meta.stops)) continue;
    const originalLen = meta.stops.length;
    meta.stops = meta.stops.filter(s => !likePhantom(s && (s.address||s.name||'')));
    if (meta.stops.length !== originalLen){
      db.prepare('UPDATE bookings SET metadata = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(meta), new Date().toISOString(), r.id);
      changed++;
      console.log('Cleaned phantom stop(s) from booking', r.id, 'remaining stops:', meta.stops.length);
    }
  }
  console.log('Done. Bookings updated:', changed);
} finally { db.close(); }
