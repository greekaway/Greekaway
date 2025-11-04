#!/usr/bin/env node
const path = require('path');
try {
  const Database = require('better-sqlite3');
  const db = new Database(path.join(__dirname, '..', 'data', 'db.sqlite3'));
  db.exec(`CREATE TABLE IF NOT EXISTS dispatch_log (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL,
    partner_id TEXT NOT NULL,
    sent_at TEXT NULL,
    sent_by TEXT,
    status TEXT NOT NULL,
    response_text TEXT NULL,
    payload_json TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_dispatch_book_partner ON dispatch_log(booking_id, partner_id);`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_dispatch_success ON dispatch_log(booking_id, partner_id) WHERE status = 'success';`);
  db.close();
  console.log('dispatch_log ensured');
} catch (e) {
  console.error('ensure_dispatch_sqlite error', e && e.message ? e.message : e);
  process.exit(1);
}
