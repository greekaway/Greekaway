#!/usr/bin/env node
/**
 * Seed 3 test bookings for provider/partner id=999
 * Titles: Santorini Tour, Delphi Day Trip, Meteora Adventure
 * Password for provider login: TestPass123 (email: driver@example.com)
 */
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const hasPg = !!process.env.DATABASE_URL;

function isoDatePlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}

async function main(){
  if (hasPg) return seedPg();
  return seedSqlite();
}

async function seedPg(){
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // Ensure partners table + columns
    await client.query(`CREATE TABLE IF NOT EXISTS partners (id TEXT PRIMARY KEY, name TEXT, email TEXT)`);
    await client.query(`DO $$ BEGIN BEGIN ALTER TABLE partners ADD COLUMN password_hash TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END; END $$;`);
    await client.query(`DO $$ BEGIN BEGIN ALTER TABLE partners ADD COLUMN panel_enabled BOOLEAN DEFAULT FALSE; EXCEPTION WHEN duplicate_column THEN NULL; END; END $$;`);
    await client.query(`DO $$ BEGIN BEGIN ALTER TABLE partners ADD COLUMN last_seen TIMESTAMP NULL; EXCEPTION WHEN duplicate_column THEN NULL; END; END $$;`);
    const pass = await bcrypt.hash('TestPass123', 10);
    await client.query(`INSERT INTO partners (id, name, email, password_hash, panel_enabled) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email, password_hash=EXCLUDED.password_hash, panel_enabled=EXCLUDED.panel_enabled`, ['999','TEST Driver', process.env.TEST_DRIVER_EMAIL || 'driver@example.com', pass, true]);

    // Ensure bookings table + required columns
    await client.query(`CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY)`);
    const cols = ['status TEXT', 'date TEXT', 'user_name TEXT', 'user_email TEXT', 'trip_id TEXT', 'seats INT', 'metadata TEXT', 'created_at TEXT', 'updated_at TEXT', 'partner_id TEXT'];
    for (const c of cols) {
      const name = c.split(' ')[0];
      await client.query(`DO $$ BEGIN BEGIN ALTER TABLE bookings ADD COLUMN ${name} ${c.split(' ').slice(1).join(' ')}; EXCEPTION WHEN duplicate_column THEN NULL; END; END $$;`);
    }

    const now = new Date().toISOString();
    const items = [
      { trip_id: 'santorini',   title: 'Santorini Tour',    date: isoDatePlus(1), pickup_point: 'Fira Bus Station',  dropoff_point: 'Oia Center',        pickup_time: '08:00', customer_name: 'Maria Papadopoulou', comments: 'Prefers window seat' },
      { trip_id: 'delphi',      title: 'Delphi Day Trip',   date: isoDatePlus(2), pickup_point: 'Syntagma Square',   dropoff_point: 'Monastiraki',       pickup_time: '07:30', customer_name: 'Nikos P.',           comments: 'Allergic to peanuts' },
      { trip_id: 'meteora',     title: 'Meteora Adventure', date: isoDatePlus(3), pickup_point: 'Larissa Station',   dropoff_point: 'Kalambaka Center',  pickup_time: '06:45', customer_name: 'Eleni K.',           comments: '1 carry-on bag' },
    ];

    for (let i=0;i<items.length;i++){
      const it = items[i];
      const id = 'bk_' + crypto.randomUUID().slice(0,8);
      const meta = {
        trip_title: it.title,
        start_date: it.date,
        pickup_point: it.pickup_point,
        dropoff_point: it.dropoff_point,
        pickup_time: it.pickup_time,
        customer_name: it.customer_name,
        customer_phone: '+3069' + Math.floor(10000000 + Math.random()*89999999),
        comments: it.comments
      };
      await client.query(`INSERT INTO bookings (id,status,date,user_name,user_email,trip_id,seats,metadata,created_at,updated_at,partner_id)
        VALUES ($1,'confirmed',$2,$3,$4,$5,$6,$7,$8,$8,$9)
        ON CONFLICT (id) DO NOTHING`, [id, it.date, it.customer_name, `customer${i+1}@example.com`, it.trip_id, 2, JSON.stringify(meta), now, '999']);
      console.log('Seeded (PG):', id, it.title, it.date);
    }
  } finally { await client.end(); }
}

async function seedSqlite(){
  const Database = require('better-sqlite3');
  const db = new Database(path.join(__dirname, '..', 'data', 'db.sqlite3'));
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS partners (id TEXT PRIMARY KEY, name TEXT, email TEXT)`);
    try { db.exec('ALTER TABLE partners ADD COLUMN password_hash TEXT'); } catch(_){}
    try { db.exec('ALTER TABLE partners ADD COLUMN panel_enabled INTEGER DEFAULT 0'); } catch(_){ }
    try { db.exec('ALTER TABLE partners ADD COLUMN last_seen TEXT'); } catch(_){ }
    const pass = await bcrypt.hash('TestPass123', 10);
    db.prepare('INSERT OR REPLACE INTO partners (id,name,email,password_hash,panel_enabled) VALUES (?,?,?,?,1)')
      .run('999','TEST Driver', process.env.TEST_DRIVER_EMAIL || 'driver@example.com', pass);

    db.exec(`CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY)`);
    const addCols = [ 'status TEXT', 'date TEXT', 'user_name TEXT', 'user_email TEXT', 'trip_id TEXT', 'seats INTEGER', 'metadata TEXT', 'created_at TEXT', 'updated_at TEXT', 'partner_id TEXT' ];
    for (const def of addCols) {
      const name = def.split(' ')[0];
      try { db.exec(`ALTER TABLE bookings ADD COLUMN ${name} ${def.split(' ').slice(1).join(' ')}`); } catch(_){ }
    }

    const now = new Date().toISOString();
    const items = [
      { trip_id: 'santorini',   title: 'Santorini Tour',    date: isoDatePlus(1), pickup_point: 'Fira Bus Station',  dropoff_point: 'Oia Center',        pickup_time: '08:00', customer_name: 'Maria Papadopoulou', comments: 'Prefers window seat' },
      { trip_id: 'delphi',      title: 'Delphi Day Trip',   date: isoDatePlus(2), pickup_point: 'Syntagma Square',   dropoff_point: 'Monastiraki',       pickup_time: '07:30', customer_name: 'Nikos P.',           comments: 'Allergic to peanuts' },
      { trip_id: 'meteora',     title: 'Meteora Adventure', date: isoDatePlus(3), pickup_point: 'Larissa Station',   dropoff_point: 'Kalambaka Center',  pickup_time: '06:45', customer_name: 'Eleni K.',           comments: '1 carry-on bag' },
    ];

    const insert = db.prepare(`INSERT OR REPLACE INTO bookings (id,status,date,user_name,user_email,trip_id,seats,metadata,created_at,updated_at,partner_id)
      VALUES (@id,'confirmed',@date,@user_name,@user_email,@trip_id,@seats,@metadata,@now,@now,@partner_id)`);

    items.forEach((it, idx) => {
      const id = 'bk_' + crypto.randomUUID().slice(0,8);
      const meta = {
        trip_title: it.title,
        start_date: it.date,
        pickup_point: it.pickup_point,
        dropoff_point: it.dropoff_point,
        pickup_time: it.pickup_time,
        customer_name: it.customer_name,
        customer_phone: '+3069' + Math.floor(10000000 + Math.random()*89999999),
        comments: it.comments
      };
      insert.run({ id, date: it.date, user_name: it.customer_name, user_email: `customer${idx+1}@example.com`, trip_id: it.trip_id, seats: 2, metadata: JSON.stringify(meta), now, partner_id: '999' });
      console.log('Seeded (SQLite):', id, it.title, it.date);
    });
  } finally { db.close(); }
}

main().catch((e) => { console.error(e); process.exit(1); });
