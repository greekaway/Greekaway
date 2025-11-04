#!/usr/bin/env node
const path = require('path');
try {
  const Database = require('better-sqlite3');
  const db = new Database(path.join(__dirname, '..', 'data', 'db.sqlite3'));
  db.exec(`CREATE TABLE IF NOT EXISTS partner_mappings (trip_id TEXT PRIMARY KEY, partner_id TEXT, share_percent INTEGER DEFAULT 80, updated_at TEXT)`);
  const trip = process.argv[2] || 'delphi';
  const partner = process.argv[3] || 'p_delphi_guides';
  const share = parseInt(process.argv[4]||'80',10);
  const now = new Date().toISOString();
  db.prepare('INSERT INTO partner_mappings (trip_id,partner_id,share_percent,updated_at) VALUES (?,?,?,?) ON CONFLICT(trip_id) DO UPDATE SET partner_id=excluded.partner_id, share_percent=excluded.share_percent, updated_at=excluded.updated_at').run(trip, partner, share, now);
  db.close();
  console.log(JSON.stringify({ ok: true, trip, partner, share }));
} catch (e) {
  console.error('set_mapping error', e && e.message ? e.message : e);
  process.exit(1);
}
