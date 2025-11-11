#!/usr/bin/env node
/**
 * Reset or create a driver with a new password for the Driver Panel.
 *
 * Usage examples:
 *   node scripts/reset_driver_password.js --email testdriver@greekaway.com --password driver123 --create
 *   node scripts/reset_driver_password.js --phone +3069XXXXXXX --password driver123
 *
 * Behavior:
 * - If DATABASE_URL is set, uses Postgres; otherwise uses SQLite at data/db.sqlite3
 * - Ensures drivers table exists (schema compatible with routes/driver.js)
 * - Finds driver by email (case-insensitive) or phone; updates password_hash and activates
 * - With --create it will insert a new row if no driver is found
 */

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const hasPostgres = !!process.env.DATABASE_URL;

function argvFlag(name){
  const a = process.argv;
  const idx = a.findIndex(x => x === `--${name}` || x.startsWith(`--${name}=`));
  if (idx === -1) return null;
  const cur = a[idx];
  if (cur.includes('=')) return cur.split('=').slice(1).join('=');
  const next = a[idx+1];
  if (next && !next.startsWith('--')) return next;
  return true; // boolean flag present
}

async function main(){
  const email = argvFlag('email');
  const phone = argvFlag('phone');
  const password = argvFlag('password');
  const createIfMissing = !!argvFlag('create');
  const name = argvFlag('name') || 'Driver';
  const providerId = argvFlag('provider_id') || null;

  if ((!email && !phone) || !password) {
    console.error('Usage: node scripts/reset_driver_password.js --email <email>|--phone <phone> --password <pwd> [--create] [--name "Full Name"] [--provider_id <id>]');
    process.exit(2);
  }

  const password_hash = await bcrypt.hash(String(password), 10);
  const now = new Date().toISOString();

  if (hasPostgres) {
    const { Client } = require('pg');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      // Ensure table exists
      await client.query(`CREATE TABLE IF NOT EXISTS drivers (
        id TEXT PRIMARY KEY,
        provider_id TEXT,
        name TEXT,
        email TEXT,
        phone TEXT,
        vehicle_plate TEXT,
        notes TEXT,
        status TEXT,
        invite_token TEXT,
        invite_sent_at TEXT,
        activated_at TEXT,
        password_hash TEXT,
        created_at TEXT
      )`);

      let row = null;
      if (email) {
        const { rows } = await client.query('SELECT * FROM drivers WHERE lower(email)=lower($1) LIMIT 1', [String(email)]);
        row = rows && rows[0] ? rows[0] : null;
      } else if (phone) {
        const { rows } = await client.query('SELECT * FROM drivers WHERE phone=$1 LIMIT 1', [String(phone)]);
        row = rows && rows[0] ? rows[0] : null;
      }

      if (row) {
        await client.query('UPDATE drivers SET password_hash=$1, status=$2, activated_at=$3 WHERE id=$4', [password_hash, 'active', now, row.id]);
        console.log(`Updated existing driver (${row.id}) with new password. status=active`);
      } else {
        if (!createIfMissing) {
          console.error('Driver not found. Re-run with --create to insert a new driver.');
          process.exit(3);
        }
        const crypto = require('crypto');
        const id = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');
        const fields = {
          id,
          provider_id: providerId,
          name,
          email: email || null,
          phone: phone || null,
          vehicle_plate: null,
          notes: null,
          status: 'active',
          invite_token: null,
          invite_sent_at: null,
          activated_at: now,
          password_hash,
          created_at: now
        };
        await client.query(
          `INSERT INTO drivers (id, provider_id, name, email, phone, vehicle_plate, notes, status, invite_token, invite_sent_at, activated_at, password_hash, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [fields.id, fields.provider_id, fields.name, fields.email, fields.phone, fields.vehicle_plate, fields.notes, fields.status, fields.invite_token, fields.invite_sent_at, fields.activated_at, fields.password_hash, fields.created_at]
        );
        console.log(`Created new driver (${id}) with status=active`);
      }
    } finally {
      await client.end();
    }
  } else {
    // SQLite path and directory
    const Database = require('better-sqlite3');
    const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite3');
    try { fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true }); } catch (_) {}
    const db = new Database(DB_PATH);
    try {
      // Ensure drivers table exists (mirror of routes/driver.js)
      db.exec(`CREATE TABLE IF NOT EXISTS drivers (
        id TEXT PRIMARY KEY,
        provider_id TEXT,
        name TEXT,
        email TEXT,
        phone TEXT,
        vehicle_plate TEXT,
        notes TEXT,
        status TEXT,
        invite_token TEXT,
        invite_sent_at TEXT,
        activated_at TEXT,
        password_hash TEXT,
        created_at TEXT
      )`);

      let row = null;
      if (email) {
        row = db.prepare('SELECT * FROM drivers WHERE lower(email)=lower(?) LIMIT 1').get(String(email));
      } else if (phone) {
        row = db.prepare('SELECT * FROM drivers WHERE phone = ? LIMIT 1').get(String(phone));
      }

      if (row) {
        db.prepare('UPDATE drivers SET password_hash=?, status=?, activated_at=? WHERE id=?').run(password_hash, 'active', now, row.id);
        console.log(`Updated existing driver (${row.id}) with new password. status=active`);
      } else {
        if (!createIfMissing) {
          console.error('Driver not found. Re-run with --create to insert a new driver.');
          process.exit(3);
        }
        const crypto = require('crypto');
        const id = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');
        const stmt = db.prepare(`INSERT INTO drivers (id, provider_id, name, email, phone, vehicle_plate, notes, status, invite_token, invite_sent_at, activated_at, password_hash, created_at)
                                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        stmt.run(id, providerId, name, email || null, phone || null, null, null, 'active', null, null, now, password_hash, now);
        console.log(`Created new driver (${id}) with status=active`);
      }
    } finally {
      db.close();
    }
  }
  console.log('Done. You can now login at: /driver/ with your identifier and new password.');
}

main().catch((e) => { console.error('Error:', e && e.message ? e.message : e); process.exit(1); });
