#!/usr/bin/env node
const path = require('path');
const [,, trip, date, cap] = process.argv;
if (!trip || !date || !cap) {
  console.error('Usage: node tools/set_capacity.js <trip_id> <YYYY-MM-DD> <capacity>');
  process.exit(1);
}
try {
  const Database = require('better-sqlite3');
  const db = new Database(path.join(__dirname, '..', 'data', 'db.sqlite3'));
  db.exec(`CREATE TABLE IF NOT EXISTS capacities (trip_id TEXT, date TEXT, capacity INTEGER, PRIMARY KEY(trip_id, date))`);
  db.prepare('INSERT OR REPLACE INTO capacities (trip_id, date, capacity) VALUES (?,?,?)').run(trip, date, parseInt(cap,10));
  db.close();
  console.log('ok');
} catch (e) {
  console.error('error', e && e.message ? e.message : e);
  process.exit(1);
}
