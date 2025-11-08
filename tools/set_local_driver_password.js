#!/usr/bin/env node
// Create or update a local driver with a known bcrypt password under provider id=999
// Usage: node tools/set_local_driver_password.js [password] [email] [name] [phone]
// Defaults: password=test1234, email=testdriver1@greekaway.com, name=Giorgos Driver, phone=+306912345678
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const crypto = require('crypto');

const password = process.argv[2] || 'test1234';
const email = (process.argv[3] || 'testdriver1@greekaway.com').toLowerCase();
const name = process.argv[4] || 'Giorgos Driver';
const phone = process.argv[5] || '+306912345678';
const provider_id = '999';

function ensure(db){
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
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS drivers_provider_email_idx ON drivers(provider_id, email)'); } catch(_){}
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS drivers_provider_phone_idx ON drivers(provider_id, phone)'); } catch(_){}
}

function main(){
  const dbPath = path.join(__dirname,'..','data','db.sqlite3');
  const db = new Database(dbPath);
  ensure(db);
  const now = new Date().toISOString();
  const hash = bcrypt.hashSync(password, 10);
  // Try to find existing driver by email or phone for the provider
  let row = db.prepare('SELECT id FROM drivers WHERE provider_id = ? AND (lower(email)=lower(?) OR phone = ?) LIMIT 1').get(provider_id, email, phone);
  const id = row && row.id ? row.id : crypto.randomUUID();
  if (row && row.id){
    db.prepare('UPDATE drivers SET name=?, email=?, phone=?, status=?, activated_at=?, password_hash=?, invite_token=NULL WHERE id=?')
      .run(name, email, phone, 'active', now, hash, id);
  } else {
    db.prepare('INSERT INTO drivers (id, provider_id, name, email, phone, status, activated_at, password_hash, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, provider_id, name, email, phone, 'active', now, hash, now);
  }
  db.close();
  console.log(JSON.stringify({ ok:true, id, provider_id, email, phone, name, password }));
}

if (require.main === module) main();
