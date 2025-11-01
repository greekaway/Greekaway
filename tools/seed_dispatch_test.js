#!/usr/bin/env node
/**
 * Seed a test provider (id=999) and a confirmed booking linked to it.
 * Password: TestPass123 (bcrypt)
 */
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const hasPg = !!process.env.DATABASE_URL;

async function main(){
  if (hasPg) return seedPg();
  return seedSqlite();
}

async function seedPg(){
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS partners (id TEXT PRIMARY KEY, name TEXT, email TEXT)`);
    await client.query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS password_hash TEXT`);
    await client.query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS panel_enabled BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP NULL`);
    const pass = await bcrypt.hash('TestPass123', 10);
    await client.query(`INSERT INTO partners (id, name, email, password_hash, panel_enabled) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email, password_hash=EXCLUDED.password_hash, panel_enabled=EXCLUDED.panel_enabled`, ['999','TEST Driver', process.env.TEST_DRIVER_EMAIL || 'driver@example.com', pass, true]);
    await client.query(`CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY)`);
    await client.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status TEXT`);
    await client.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS date TEXT`);
    await client.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_name TEXT`);
    await client.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_email TEXT`);
    await client.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS trip_id TEXT`);
    await client.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS seats INTEGER`);
    await client.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS metadata TEXT`);
    await client.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS created_at TEXT`);
    await client.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at TEXT`);
    await client.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS partner_id TEXT`);
    const bid = 'bk_' + crypto.randomUUID().slice(0,8);
    const now = new Date().toISOString();
    const meta = {
      trip_title: 'Test Trip', start_date: now.slice(0,10), pickup_point: 'Syntagma Square', pickup_time: '09:00', dropoff_point: 'Monastiraki', people: 2, luggage: '2 small', customer_name: 'Γιάννης', customer_phone: '+3069XXXXXXXX', comments: 'No peanuts'
    };
    await client.query(`INSERT INTO bookings (id,status,date,user_name,user_email,trip_id,seats,metadata,created_at,updated_at,partner_id)
      VALUES ($1,'confirmed',$2,$3,$4,$5,$6,$7,$8,$8,$9)
      ON CONFLICT (id) DO NOTHING`, [bid, meta.start_date, meta.customer_name, process.env.TEST_CUSTOMER_EMAIL || 'test@example.com', 'test_trip', 2, JSON.stringify(meta), now, '999']);
    console.log('Seeded: Postgres booking', bid);
  } finally { await client.end(); }
}

async function seedSqlite(){
  const Database = require('better-sqlite3');
  const db = new Database(path.join(__dirname, '..', 'data', 'db.sqlite3'));
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS partners (id TEXT PRIMARY KEY, name TEXT, email TEXT)`);
    try { db.exec('ALTER TABLE partners ADD COLUMN password_hash TEXT'); } catch(_){}
    try { db.exec('ALTER TABLE partners ADD COLUMN panel_enabled INTEGER DEFAULT 0'); } catch(_){}
    try { db.exec('ALTER TABLE partners ADD COLUMN last_seen TEXT'); } catch(_){}
    const pass = await bcrypt.hash('TestPass123', 10);
    db.prepare('INSERT OR REPLACE INTO partners (id,name,email,password_hash,panel_enabled) VALUES (?,?,?,?,1)')
      .run('999','TEST Driver', process.env.TEST_DRIVER_EMAIL || 'driver@example.com', pass);
    db.exec(`CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY)`);
    try { db.exec('ALTER TABLE bookings ADD COLUMN status TEXT'); } catch(_){}
    try { db.exec('ALTER TABLE bookings ADD COLUMN date TEXT'); } catch(_){}
    try { db.exec('ALTER TABLE bookings ADD COLUMN user_name TEXT'); } catch(_){}
    try { db.exec('ALTER TABLE bookings ADD COLUMN user_email TEXT'); } catch(_){}
    try { db.exec('ALTER TABLE bookings ADD COLUMN trip_id TEXT'); } catch(_){}
    try { db.exec('ALTER TABLE bookings ADD COLUMN seats INTEGER'); } catch(_){}
    try { db.exec('ALTER TABLE bookings ADD COLUMN metadata TEXT'); } catch(_){}
    try { db.exec('ALTER TABLE bookings ADD COLUMN created_at TEXT'); } catch(_){}
    try { db.exec('ALTER TABLE bookings ADD COLUMN updated_at TEXT'); } catch(_){}
    try { db.exec('ALTER TABLE bookings ADD COLUMN partner_id TEXT'); } catch(_){}
    const bid = 'bk_' + crypto.randomUUID().slice(0,8);
    const now = new Date().toISOString();
    const meta = { trip_title: 'Test Trip', start_date: now.slice(0,10), pickup_point: 'Syntagma Square', pickup_time: '09:00', dropoff_point: 'Monastiraki', people: 2, luggage: '2 small', customer_name: 'Γιάννης', customer_phone: '+3069XXXXXXXX', comments: 'No peanuts' };
    db.prepare(`INSERT OR REPLACE INTO bookings (id,status,date,user_name,user_email,trip_id,seats,metadata,created_at,updated_at,partner_id) VALUES (@id,'confirmed',@date,@user_name,@user_email,@trip_id,@seats,@metadata,@now,@now,@partner_id)`)  
      .run({ id: bid, date: meta.start_date, user_name: meta.customer_name, user_email: process.env.TEST_CUSTOMER_EMAIL || 'test@example.com', trip_id: 'test_trip', seats: 2, metadata: JSON.stringify(meta), now, partner_id: '999' });
    console.log('Seeded: SQLite booking', bid);
  } finally { db.close(); }
}

main().catch((e) => { console.error(e); process.exit(1); });
