#!/usr/bin/env node
/*
  Seed demo data for Admin Suppliers page.
  - Creates ~30 partners with partner_type categories.
  - Inserts 3–5 bookings per partner with varied amounts, dates (last 3 months), payment_type, payout_status,
    and fills commission_cents and partner_share_cents.
  Safe to run multiple times: partners are idempotent by ID; bookings are appended with unique IDs per run.
*/
const path = require('path');
const fs = require('fs');

function hasPostgres(){ return !!process.env.DATABASE_URL; }
function getSqlite(){ const Database = require('better-sqlite3'); return new Database(path.join(__dirname, '..', 'data', 'db.sqlite3')); }

function rand(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function randInt(min, max){ return Math.floor(Math.random()*(max-min+1)) + min; }
function pickAmounts(){ return rand([8000,12000,15000,18000,25000,31000]); } // cents
function pickSeats(){ return rand([2,3,4,5,6]); }
function randomDateWithin(days){ const now = new Date(); const past = new Date(now.getTime() - randInt(0,days)*24*3600*1000); return past; }
function toIso(d){ const z = (n)=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`; }
function uuid(){ try { return require('crypto').randomUUID(); } catch(_) { return 'id_'+Date.now()+'_'+Math.random().toString(36).slice(2,8); } }

function ensureSchema(db){
  // partners
  db.exec(`CREATE TABLE IF NOT EXISTS partners (id TEXT PRIMARY KEY, name TEXT, email TEXT)`);
  try { db.exec('ALTER TABLE partners ADD COLUMN partner_type TEXT'); } catch(_) {}
  try { db.exec('ALTER TABLE partners ADD COLUMN last_seen TEXT'); } catch(_) {}
  // bookings base
  db.exec(`CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    status TEXT,
    date TEXT,
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
    updated_at TEXT
  )`);
  // add extended columns used by admin
  try { db.exec('ALTER TABLE bookings ADD COLUMN payment_type TEXT'); } catch(_) {}
  try { db.exec('ALTER TABLE bookings ADD COLUMN partner_id TEXT'); } catch(_) {}
  try { db.exec('ALTER TABLE bookings ADD COLUMN partner_share_cents INTEGER'); } catch(_) {}
  try { db.exec('ALTER TABLE bookings ADD COLUMN commission_cents INTEGER'); } catch(_) {}
  try { db.exec('ALTER TABLE bookings ADD COLUMN payout_status TEXT'); } catch(_) {}
  try { db.exec('ALTER TABLE bookings ADD COLUMN payout_date TEXT'); } catch(_) {}
  // payouts table (optional for details)
  db.exec(`CREATE TABLE IF NOT EXISTS payouts (
    id TEXT PRIMARY KEY,
    booking_id TEXT,
    partner_id TEXT,
    amount_cents INTEGER,
    currency TEXT,
    type TEXT,
    status TEXT,
    provider_id TEXT,
    failure_reason TEXT,
    created_at TEXT,
    updated_at TEXT,
    payout_date TEXT
  )`);
}

function makePartners(){
  const partners = [];
  const cats = [
    { type:'van', count:5, names:[
      'Aegean Transfer Co', 'Athens Express Vans', 'BlueRoad Transport', 'Ionian Shuttle', 'Peloponnese Rides'
    ]},
    { type:'hotel', count:5, names:[
      'Caldera View Hotel', 'Lefkada Coast Inn', 'Olympia Heritage Suites', 'Parnassos Chalet', 'Nidri Bay Rooms'
    ]},
    { type:'boat', count:4, names:[
      'Saronic Sailing', 'Cyclades Yachting', 'Ionian Blue Cruises', 'Aegean Catamarans'
    ]},
    { type:'guide', count:3, names:[
      'Athens City Walks', 'Delphi Mountain Guide', 'Olympia Storyteller'
    ]},
    { type:'restaurant', count:3, names:[
      'Taverna To Limani', 'Kalamata Olive Bistro', 'Santorini Sunset Dining'
    ]},
  ];
  cats.forEach(cat => {
    for (let i=0;i<cat.count;i++){
      const name = cat.names[i % cat.names.length];
      const id = (cat.type + '_' + (i+1)).toLowerCase();
      const email = name.toLowerCase().replace(/[^a-z]+/g,'.') + '@example.com';
      partners.push({ id, name, email, partner_type: cat.type });
    }
  });
  // add some tour providers to reach ~30 entries
  const extra = [
    { id:'van_6', name:'Thessaly Transfers', type:'van' },
    { id:'van_7', name:'Macedonia Shuttle', type:'van' },
    { id:'hotel_6', name:'Arcadia Boutique Hotel', type:'hotel' },
    { id:'hotel_7', name:'Nafplio Old Town Inn', type:'hotel' },
    { id:'boat_5', name:'Pelion Sailing Club', type:'boat' },
    { id:'guide_4', name:'Meteora Trail Guide', type:'guide' },
    { id:'restaurant_4', name:'Ionian Seafood House', type:'restaurant' },
    { id:'restaurant_5', name:'Athenian Mezze Bar', type:'restaurant' },
    { id:'guide_5', name:'Santorini Heritage Guide', type:'guide' },
    { id:'boat_6', name:'Corfu Yacht Rentals', type:'boat' },
  ];
  extra.forEach(e => partners.push({ id:e.id, name:e.name, email: e.name.toLowerCase().replace(/[^a-z]+/g,'.')+'@example.com', partner_type:e.type }));
  return partners;
}

function seed(){
  if (hasPostgres()){
    console.warn('Postgres detected (DATABASE_URL). This seed script currently seeds only the local SQLite DB (data/db.sqlite3).');
  }
  const db = getSqlite();
  try {
    ensureSchema(db);
    const partners = makePartners();
    const upPartner = db.prepare('INSERT INTO partners (id,name,email,partner_type,last_seen) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email, partner_type=excluded.partner_type, last_seen=excluded.last_seen');
    const insBooking = db.prepare(`INSERT INTO bookings (id,status,date,payment_intent_id,event_id,user_name,user_email,trip_id,seats,price_cents,currency,metadata,created_at,updated_at,payment_type,partner_id,partner_share_cents,commission_cents,payout_status,payout_date)
      VALUES (@id,@status,@date,@pi,@event,@user_name,@user_email,@trip_id,@seats,@price_cents,@currency,@metadata,@created_at,@updated_at,@payment_type,@partner_id,@partner_share_cents,@commission_cents,@payout_status,@payout_date)`);
    const insPayout = db.prepare(`INSERT INTO payouts (id,booking_id,partner_id,amount_cents,currency,type,status,created_at,updated_at,payout_date)
      VALUES (@id,@booking_id,@partner_id,@amount_cents,@currency,@type,@status,@created_at,@updated_at,@payout_date)`);

    const tripPool = ['athens_city', 'delphi_day', 'olympia_two_day', 'lefkas_boat', 'parnassos_mountain'];
    const userPool = ['maria@example.com','nikos@example.com','anna@example.com','john@example.com','dimitris@example.com'];

    let totalBookings = 0;
    db.transaction(() => {
      partners.forEach(p => {
        const lastSeen = toIso(new Date());
        upPartner.run(p.id, p.name, p.email, p.partner_type, lastSeen);
        const n = randInt(3,5);
        for (let i=0;i<n;i++){
          const created = randomDateWithin(90);
          const updated = new Date(created.getTime() + randInt(0, 10)*24*3600*1000);
          const dateOnly = created.toISOString().slice(0,10);
          const price_cents = pickAmounts();
          const commPercent = rand([15,18,20,22,25]);
          const commission_cents = Math.round(price_cents * (commPercent/100));
          const partner_share_cents = price_cents - commission_cents;
          const seats = pickSeats();
          const payment_type = rand(['stripe','manual']);
          const payout_status = rand(['sent','pending',null]);
          const booking = {
            id: uuid(),
            status: 'confirmed',
            date: dateOnly,
            pi: 'pi_demo_'+uuid(),
            event: null,
            user_name: 'Demo User',
            user_email: rand(userPool),
            trip_id: rand(tripPool),
            seats,
            price_cents,
            currency: 'eur',
            metadata: JSON.stringify({ trip_title: 'Demo Trip', pickup: 'Syntagma', pickup_time: '09:00' }),
            created_at: toIso(created),
            updated_at: toIso(updated),
            payment_type,
            partner_id: p.id,
            partner_share_cents,
            commission_cents,
            payout_status,
            payout_date: payout_status === 'sent' ? toIso(updated) : null,
          };
          insBooking.run(booking);
          // randomly add a payout record when sent
          if (booking.payout_status === 'sent' && Math.random() < 0.6){
            const payout = {
              id: uuid(), booking_id: booking.id, partner_id: p.id,
              amount_cents: booking.partner_share_cents, currency: 'eur', type: booking.payment_type,
              status: 'sent', created_at: booking.updated_at, updated_at: booking.updated_at, payout_date: booking.payout_date
            };
            try { insPayout.run(payout); } catch(_) {}
          }
          totalBookings++;
        }
      });
    })();

    console.log(`Seeded partners: ${partners.length}, bookings: ${totalBookings}`);
  } finally { try { db.close(); } catch(_){} }
}

if (require.main === module){ seed(); }
module.exports = { seed };
