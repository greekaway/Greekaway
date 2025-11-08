#!/usr/bin/env node
// Seed 3 demo drivers for local testing, associated with provider id=999 (tools/set_local_provider_password.js)
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'data', 'db.sqlite3');
const db = new Database(dbPath);

function ensureDriversSqlite(db){
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
}

function uuid(){ return (typeof crypto!=='undefined' && crypto.randomUUID) ? crypto.randomUUID() : require('crypto').randomUUID(); }

function main(){
  ensureDriversSqlite(db);
  const now = new Date().toISOString();
  const provider_id = '999';
  const rows = [
    { name:'Giorgos Driver', email:'testdriver1@greekaway.com', phone:'+306912345678' },
    { name:'Maria Driver',   email:'testdriver2@greekaway.com', phone:'+306931112233' },
    { name:'Nikos Driver',   email:'testdriver3@greekaway.com', phone:'+306945678912' },
  ];
  const upsert = db.prepare(`INSERT INTO drivers (id, provider_id, name, email, phone, vehicle_plate, notes, status, invite_token, invite_sent_at, activated_at, password_hash, created_at)
    VALUES (@id,@provider_id,@name,@email,@phone,@vehicle_plate,@notes,@status,@invite_token,@invite_sent_at,@activated_at,@password_hash,@created_at)`);
  let inserted = 0;
  for (const r of rows){
    try {
      const exists = db.prepare('SELECT id FROM drivers WHERE provider_id = ? AND lower(email) = lower(?) LIMIT 1').get(provider_id, r.email);
      if (exists) continue;
      upsert.run({ id: uuid(), provider_id, name:r.name, email:r.email, phone:r.phone, vehicle_plate:null, notes:null, status:'active', invite_token:null, invite_sent_at:null, activated_at:now, password_hash:null, created_at: now });
      inserted++;
    } catch(e){ console.error('insert error', e && e.message ? e.message : e); }
  }
  db.close();
  console.log(JSON.stringify({ ok:true, inserted }));
}

if (require.main === module) main();
