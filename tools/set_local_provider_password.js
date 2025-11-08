#!/usr/bin/env node
// Set or update local provider (partners row) for id=999 with a known bcrypt password.
// Usage: node tools/set_local_provider_password.js [password] [email]
// Defaults: password=LocalTest!123, email from TEST_DRIVER_EMAIL env or driver@example.com
// Safe to run multiple times; will create partners table if missing.
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const password = process.argv[2] || 'LocalTest!123';
const email = (process.argv[3] || process.env.TEST_DRIVER_EMAIL || 'driver@example.com').toLowerCase();
const id = '999';
const name = 'Local Provider Test';

function main(){
  const dbPath = path.join(__dirname,'..','data','db.sqlite3');
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS partners (id TEXT PRIMARY KEY, name TEXT, email TEXT, password_hash TEXT, panel_enabled INTEGER DEFAULT 0, last_seen TEXT)`);
  // Ensure email uniqueness to avoid ambiguous login selection (LIMIT 1 without ORDER can pick any)
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS partners_email_idx ON partners(email)'); } catch(_) { /* ignore */ }
  const now = new Date().toISOString();
  let hash;
  try {
    hash = bcrypt.hashSync(password, 10);
  } catch(e) {
    console.error('Failed to hash password:', e && e.message ? e.message : e);
    process.exit(1);
  }
  // Remove any duplicate rows for the same email (different id). We keep canonical id=999.
  try { db.prepare('DELETE FROM partners WHERE email = ? AND id != ?').run(email, id); } catch(_) {}
  // Upsert preserving enabled state (force enable)
  db.prepare(`INSERT INTO partners (id,name,email,password_hash,panel_enabled,last_seen) VALUES (@id,@name,@email,@hash,1,@now)
              ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email, password_hash=excluded.password_hash, panel_enabled=1, last_seen=excluded.last_seen`).run({ id, name, email, hash, now });
  db.close();
  console.log(JSON.stringify({ ok:true, id, email, panel_enabled:1, password: password, password_hash: hash }));
}

if (require.main === module) {
  main();
}
