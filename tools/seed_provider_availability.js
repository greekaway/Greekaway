#!/usr/bin/env node
/**
 * Seed 30 fake partners and 3-4 availability rows each for dates 2025-11-05..2025-11-11
 * No changes to server.js; uses DB-specific NOW() function per user request.
 */

const path = require('path');
const crypto = require('crypto');

try { require('dotenv').config(); } catch (_) {}

const hasPostgres = !!process.env.DATABASE_URL;

async function main(){
  if (hasPostgres) return seedPg();
  return seedSqlite();
}

function pickSlots(i){
  const slots = [
    { s: '08:00', e: '12:00', notes: 'Morning slot' },
    { s: '09:00', e: '13:00', notes: 'Late morning' },
    { s: '10:00', e: '14:00', notes: 'Midday slot' },
    { s: '13:00', e: '17:00', notes: 'Afternoon slot' },
  ];
  // Rotate starting index by provider index for variety
  const start = i % slots.length;
  return [0,1,2,3].map(k => slots[(start + k) % slots.length]);
}

function dayList(){
  // 2025-11-05..2025-11-11 inclusive
  const out = [];
  for (let d = 5; d <= 11; d++) {
    out.push(`2025-11-${String(d).padStart(2,'0')}`);
  }
  return out;
}

async function seedPg(){
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS partners (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS provider_availability (
      id TEXT PRIMARY KEY,
      provider_id TEXT,
      available_date TEXT,
      start_time TEXT,
      end_time TEXT,
      notes TEXT,
      updated_at TEXT,
      admin_user TEXT
    )`);

    const days = dayList();
    for (let i = 1; i <= 30; i++) {
      const pid = `fp${String(i).padStart(2,'0')}`;
      const name = `Fake Provider ${String(i).padStart(2,'0')}`;
      const email = `${pid}@example.com`;
      await client.query(`INSERT INTO partners (id,name,email) VALUES ($1,$2,$3)
                          ON CONFLICT (id) DO NOTHING`, [pid, name, email]);
      const chosenDays = [ days[(i+0)%days.length], days[(i+2)%days.length], days[(i+4)%days.length], days[(i+6)%days.length] ];
      const slots = pickSlots(i);
      for (let j = 0; j < 4; j++) {
        const id = crypto.randomUUID();
        const available_date = chosenDays[j % chosenDays.length];
        const slot = slots[j % slots.length];
        const notes = `${slot.notes} – ${name}`;
        await client.query(
          `INSERT INTO provider_availability (id, provider_id, available_date, start_time, end_time, notes, updated_at, admin_user)
           VALUES ($1,$2,$3,$4,$5,$6, now(), $7)
           ON CONFLICT (id) DO NOTHING`,
          [id, pid, available_date, slot.s, slot.e, notes, 'seed-script']
        );
      }
    }
    console.log('Seed complete: Postgres');
  } finally {
    await client.end();
  }
}

async function seedSqlite(){
  const Database = require('better-sqlite3');
  const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite3');
  const db = new Database(DB_PATH);
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS partners (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS provider_availability (
      id TEXT PRIMARY KEY,
      provider_id TEXT,
      available_date TEXT,
      start_time TEXT,
      end_time TEXT,
      notes TEXT,
      updated_at TEXT,
      admin_user TEXT
    )`);

    const insPartner = db.prepare(`INSERT OR IGNORE INTO partners (id,name,email) VALUES (?,?,?)`);
    const insAvail = db.prepare(`INSERT OR IGNORE INTO provider_availability
      (id, provider_id, available_date, start_time, end_time, notes, updated_at, admin_user)
      VALUES (@id, @provider_id, @available_date, @start_time, @end_time, @notes, datetime('now'), @admin_user)`);

    const days = dayList();
    for (let i = 1; i <= 30; i++) {
      const pid = `fp${String(i).padStart(2,'0')}`;
      const name = `Fake Provider ${String(i).padStart(2,'0')}`;
      const email = `${pid}@example.com`;
      insPartner.run(pid, name, email);
      const chosenDays = [ days[(i+0)%days.length], days[(i+2)%days.length], days[(i+4)%days.length], days[(i+6)%days.length] ];
      const slots = pickSlots(i);
      for (let j = 0; j < 4; j++) {
        insAvail.run({
          id: crypto.randomUUID(),
          provider_id: pid,
          available_date: chosenDays[j % chosenDays.length],
          start_time: slots[j % slots.length].s,
          end_time: slots[j % slots.length].e,
          notes: `${slots[j % slots.length].notes} – ${name}`,
          admin_user: 'seed-script'
        });
      }
    }
    console.log('Seed complete: SQLite');
  } finally {
    db.close();
  }
}

main().catch((e) => { console.error('Seed failed', e && e.message ? e.message : e); process.exit(1); });
