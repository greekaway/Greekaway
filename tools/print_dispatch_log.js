#!/usr/bin/env node
const path = require('path');
try {
  const Database = require('better-sqlite3');
  const db = new Database(path.join(__dirname, '..', 'data', 'db.sqlite3'));
  const rows = db.prepare('SELECT booking_id, partner_id, status, response_text, sent_at, created_at FROM dispatch_log ORDER BY created_at DESC LIMIT 10').all();
  console.log(JSON.stringify(rows, null, 2));
  db.close();
} catch (e) {
  console.error('print_dispatch_log error', e && e.message ? e.message : e);
  process.exit(1);
}
