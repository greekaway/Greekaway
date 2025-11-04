#!/usr/bin/env node
const path = require('path');
const [,, id, name, email] = process.argv;
if (!id || !email) { console.error('Usage: node tools/ensure_partner_row.js <id> <name> <email>'); process.exit(1); }
try {
  const Database = require('better-sqlite3');
  const db = new Database(path.join(__dirname, '..', 'data', 'db.sqlite3'));
  db.exec(`CREATE TABLE IF NOT EXISTS partners (id TEXT PRIMARY KEY, name TEXT, email TEXT, password_hash TEXT, panel_enabled INTEGER DEFAULT 0, last_seen TEXT)`);
  const now = new Date().toISOString();
  db.prepare('INSERT OR REPLACE INTO partners (id, name, email, panel_enabled, last_seen) VALUES (?,?,?,?,?)').run(id, name || id, email, 0, now);
  db.close();
  console.log('partner ensured');
} catch (e) {
  console.error('error', e && e.message ? e.message : e);
  process.exit(1);
}
