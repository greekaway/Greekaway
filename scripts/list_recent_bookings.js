#!/usr/bin/env node
const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '..', 'data', 'db.sqlite3'));
const rows = db.prepare('SELECT id, trip_id, date, partner_id, assigned_driver_id, pickup_location, pickup_points_json, metadata FROM bookings ORDER BY created_at DESC LIMIT 20').all();
const out = rows.map(r => {
  let meta = {}; try { meta = r.metadata ? JSON.parse(r.metadata) : {}; } catch(_){}
  return {
    id: r.id,
    trip_id: r.trip_id,
    date: r.date,
    partner_id: r.partner_id,
    assigned_driver: !!r.assigned_driver_id,
    has_pickup_points_json: !!r.pickup_points_json,
    has_meta_pickups: Array.isArray(meta.pickups),
    has_meta_stops: Array.isArray(meta.stops),
    pickup_location: r.pickup_location || null
  };
});
console.log(JSON.stringify(out, null, 2));
