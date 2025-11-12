#!/usr/bin/env node
const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '..', 'data', 'db.sqlite3'));
const bid = process.argv[2];
if (!bid) { console.error('Usage: node scripts/assign_booking.js <booking_id> [driver_email]'); process.exit(1); }
const driverEmail = process.argv[3] || 'testdriver@greekaway.com';
const d = db.prepare('SELECT id FROM drivers WHERE lower(email)=lower(?) LIMIT 1').get(String(driverEmail));
if (!d) { console.error('Driver not found:', driverEmail); process.exit(2); }
const b = db.prepare('SELECT id FROM bookings WHERE id = ?').get(String(bid));
if (!b) { console.error('Booking not found:', bid); process.exit(3); }
const res = db.prepare("UPDATE bookings SET assigned_driver_id = ?, updated_at = datetime('now') WHERE id = ?").run(d.id, b.id);
console.log(JSON.stringify({ ok:true, assigned_driver_id: d.id, booking_id: b.id, changes: res.changes }));
