#!/usr/bin/env node
// tools/migrate_sqlite_to_postgres.js
// Migrate payments from local SQLite (data/db.sqlite3) to Postgres (DATABASE_URL)

const fs = require('fs');
const path = require('path');

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('ERROR: DATABASE_URL not set in environment. Set it to your Postgres connection string and retry.');
    process.exit(2);
  }

  // require lazily
  const Database = require('better-sqlite3');
  const { Client } = require('pg');

  const sqlitePath = path.join(__dirname, '..', 'data', 'db.sqlite3');
  if (!fs.existsSync(sqlitePath)) {
    console.error('No SQLite DB found at', sqlitePath);
    process.exit(1);
  }

  const sqlite = new Database(sqlitePath, { readonly: true });
  const rows = sqlite.prepare('SELECT id,status,event_id,amount,currency,timestamp FROM payments').all();
  console.log(`Found ${rows.length} payments in SQLite`);

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  // ensure table exists
  await client.query(`CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    status TEXT,
    event_id TEXT,
    amount INTEGER,
    currency TEXT,
    timestamp TIMESTAMPTZ
  )`);

  const upsertText = `INSERT INTO payments (id,status,event_id,amount,currency,timestamp) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, event_id = EXCLUDED.event_id, amount = EXCLUDED.amount, currency = EXCLUDED.currency, timestamp = EXCLUDED.timestamp`;

  let migrated = 0;
  for (const r of rows) {
    try {
      await client.query(upsertText, [r.id, r.status, r.event_id || null, r.amount || null, r.currency || null, r.timestamp || null]);
      migrated++;
    } catch (e) {
      console.warn('Failed to upsert', r.id, e && e.message ? e.message : e);
    }
  }

  console.log(`Migrated ${migrated}/${rows.length} payments to Postgres`);
  await client.end();
  process.exit(0);
}

main().catch(err => { console.error(err && err.stack ? err.stack : err); process.exit(1); });
