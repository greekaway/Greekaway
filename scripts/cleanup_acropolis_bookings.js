#!/usr/bin/env node
const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '..', 'data', 'db.sqlite3'));
const from = process.argv[2] || '2025-11-01';
const to = process.argv[3] || '2025-11-30';
const del = db.prepare("DELETE FROM bookings WHERE trip_id = ? AND date >= ? AND date <= ?");
const info = del.run('acropolis', from, to);
console.log(JSON.stringify({ ok:true, deleted: info.changes, range: [from, to] }));
