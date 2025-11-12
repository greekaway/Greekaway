#!/usr/bin/env node
/**
 * Δημιουργεί έναν δοκιμαστικό Provider (Partner) για login στο Provider Panel.
 * Προεπιλογή (μπορείς να τα αλλάξεις με flags):
 *   email: provider@test.com
 *   password: provider123
 *   name: Demo Provider
 *
 * Χρήση:
 *   node scripts/create_test_provider.js [--email provider@test.com] [--password provider123] [--name "Demo Provider"]
 *
 * Υποστηρίζει SQLite (data/db.sqlite3) και Postgres (αν έχει οριστεί DATABASE_URL).
 */

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

function flag(name, def=null){
  const a = process.argv;
  const k = `--${name}`;
  const i = a.findIndex(x => x === k || x.startsWith(k+'='));
  if (i === -1) return def;
  const cur = a[i];
  if (cur.includes('=')) return cur.split('=')[1];
  const next = a[i+1];
  if (next && !next.startsWith('--')) return next;
  return true;
}

async function main(){
  const email = String(flag('email','provider@test.com')).toLowerCase();
  const password = String(flag('password','provider123'));
  const name = String(flag('name','Demo Provider'));
  const now = new Date().toISOString();
  const password_hash = await bcrypt.hash(password, 10);
  const hasPostgres = !!process.env.DATABASE_URL;

  if (hasPostgres){
    const { Client } = require('pg');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS partners (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT,
        password_hash TEXT,
        panel_enabled INTEGER,
        last_seen TEXT
      )`);
      const { rows } = await client.query('SELECT id FROM partners WHERE lower(email)=lower($1) LIMIT 1', [email]);
      if (rows && rows[0]){
        await client.query('UPDATE partners SET name=$1, password_hash=$2, panel_enabled=$3, last_seen=$4 WHERE id=$5', [name, password_hash, 1, now, rows[0].id]);
        console.log('Updated existing provider:', email);
      } else {
        const crypto = require('crypto');
        const id = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');
        await client.query('INSERT INTO partners (id, name, email, password_hash, panel_enabled, last_seen) VALUES ($1,$2,$3,$4,$5,$6)', [id, name, email, password_hash, 1, now]);
        console.log('Created provider:', email, 'id:', id);
      }
    } finally {
      await client.end();
    }
  } else {
    const Database = require('better-sqlite3');
    const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite3');
    try { fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true }); } catch(_){}
    const db = new Database(DB_PATH);
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS partners (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT,
        password_hash TEXT,
        panel_enabled INTEGER,
        last_seen TEXT
      )`);
      const row = db.prepare('SELECT id FROM partners WHERE lower(email)=lower(?) LIMIT 1').get(email);
      if (row){
        db.prepare('UPDATE partners SET name=?, password_hash=?, panel_enabled=?, last_seen=? WHERE id=?').run(name, password_hash, 1, now, row.id);
        console.log('Updated existing provider:', email);
      } else {
        const crypto = require('crypto');
        const id = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');
        db.prepare('INSERT INTO partners (id, name, email, password_hash, panel_enabled, last_seen) VALUES (?,?,?,?,?,?)').run(id, name, email, password_hash, 1, now);
        console.log('Created provider:', email, 'id:', id);
      }
    } finally {
      db.close();
    }
  }
  console.log('Provider ready. Login at /provider with the configured credentials.');
}

main().catch(e => { console.error('Error:', e && e.message ? e.message : e); process.exit(1); });
