#!/usr/bin/env node
// Seed 3-4 fake bookings with multi-stop metadata for the test driver under provider_id=999
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite3');
const db = new Database(DB_PATH);

function ensure(){
  db.exec(`CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    status TEXT,
    payment_intent_id TEXT UNIQUE,
    event_id TEXT,
    user_name TEXT,
    user_email TEXT,
    trip_id TEXT,
    seats INTEGER,
    price_cents INTEGER,
    currency TEXT,
    metadata TEXT,
    created_at TEXT,
    updated_at TEXT,
    date TEXT,
    pickup_location TEXT,
    pickup_lat REAL,
    pickup_lng REAL,
    suitcases_json TEXT,
    special_requests TEXT,
    partner_id TEXT,
    assigned_driver_id TEXT
  )`);
}

function upsertBooking(b){
  const now = new Date().toISOString();
  const id = b.id || ('bk_' + crypto.randomBytes(4).toString('hex'));
  const ins = db.prepare(`INSERT INTO bookings (id,status,user_name,user_email,trip_id,seats,price_cents,currency,metadata,created_at,updated_at,date,pickup_location,partner_id,assigned_driver_id)
    VALUES (@id,@status,@user_name,@user_email,@trip_id,@seats,@price_cents,@currency,@metadata,@created_at,@updated_at,@date,@pickup_location,@partner_id,@assigned_driver_id)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status, metadata=excluded.metadata, updated_at=excluded.updated_at, date=excluded.date, pickup_location=excluded.pickup_location, partner_id=excluded.partner_id, assigned_driver_id=excluded.assigned_driver_id`);
  ins.run({ id, status: b.status||'confirmed', user_name: b.user_name||'Route Group', user_email: b.user_email||'group@example.com', trip_id: b.trip_id, seats: b.seats||1, price_cents: b.price_cents||0, currency: 'EUR', metadata: JSON.stringify(b.metadata||{}), created_at: now, updated_at: now, date: b.date, pickup_location: b.pickup_location||'', partner_id: b.partner_id||'999', assigned_driver_id: b.assigned_driver_id });
  return id;
}

function main(){
  ensure();
  const driver_id = process.env.DRIVER_ID || (process.argv[2] || '').trim() || null;
  if (!driver_id){
    console.error('Usage: node tools/seed_driver_routes.js <DRIVER_ID>');
    process.exit(1);
  }
  const date = '2025-11-09';
  const seeds = [
    { trip_id:'santorini', date, metadata: { pickup_time:'08:00', stops:[
      { id:1, name:'Maria Papadopoulou', time:'07:10', address:'Hotel Blue Sky', map:'https://maps.google.com/?q=Hotel+Blue+Sky' },
      { id:2, name:'Nikos P.', time:'07:25', address:'Santorini Port', map:'https://maps.google.com/?q=Santorini+Port' },
      { id:3, name:'Eleni K.', time:'07:40', address:'Oia Square', map:'https://maps.google.com/?q=Oia+Square' },
    ]}},
    { trip_id:'delphi', date, metadata: { pickup_time:'07:30', stops:[
      { id:1, name:'Giorgos T.', time:'06:50', address:'Syntagma Square', map:'https://maps.google.com/?q=Syntagma+Square' },
      { id:2, name:'Anna M.', time:'07:05', address:'Ambelokipi Metro', map:'https://maps.google.com/?q=Ambelokipi+Metro' },
      { id:3, name:'Kostas', time:'07:15', address:'Kifissia Center', map:'https://maps.google.com/?q=Kifissia+Center' },
      { id:4, name:'Sofia', time:'07:25', address:'Marousi Station', map:'https://maps.google.com/?q=Marousi+Station' },
    ]}},
    { trip_id:'meteora', date, metadata: { pickup_time:'08:15', stops:[
      { id:1, name:'Panagiotis', time:'07:30', address:'Larissa Station', map:'https://maps.google.com/?q=Larissa+Station' },
      { id:2, name:'Elena', time:'07:45', address:'Trikala Center', map:'https://maps.google.com/?q=Trikala+Center' },
    ]}},
  ];
  const inserted = seeds.map(s => upsertBooking({ ...s, assigned_driver_id: driver_id }));
  console.log(JSON.stringify({ ok:true, inserted }));
}

main();
