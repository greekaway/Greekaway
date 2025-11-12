#!/usr/bin/env node
/**
 * Patch Acropolis bookings for a given date to include the 3 pickup points in pickup_points_json and metadata.pickups.
 * Defaults to today's date if not provided.
 *
 * Usage:
 *   node scripts/patch_acropolis_pickups.js [--date YYYY-MM-DD]
 */

const path = require('path');
const fs = require('fs');

function flag(name, def=null){
  const a = process.argv; const k = `--${name}`; const i = a.findIndex(x => x === k || x.startsWith(k+'='));
  if (i === -1) return def; const cur = a[i]; if (cur.includes('=')) return cur.split('=')[1]; const next = a[i+1]; if (next && !next.startsWith('--')) return next; return true;
}
function todayISO(){ return new Date().toISOString().slice(0,10); }

const TARGET_DATE = flag('date', todayISO());

function buildPickupPoints(){
  return [
    { address: 'Ρουμπέση 7, Αθήνα', pax: 2 },
    { address: 'Ηλία Ρογκάκου 2, Αθήνα', pax: 2 },
    { address: 'Ιπποκράτους 43, Αθήνα', pax: 2 },
  ];
}

function main(){
  const Database = require('better-sqlite3');
  const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite3');
  const db = new Database(DB_PATH);
  try {
    const rows = db.prepare(`SELECT id, metadata, pickup_points_json, pickup_location, date FROM bookings WHERE trip_id = ? AND date = ?`).all('acropolis', TARGET_DATE);
    const pickups = buildPickupPoints();
    let updated = 0;
    for (const row of rows){
      let meta = {}; try { meta = row.metadata ? JSON.parse(row.metadata) : {}; } catch(_){}
      meta.pickups = pickups.map(p => ({ address: p.address, pax: p.pax }));
      // Set a reasonable pickup_time placeholder; driver will compute ETAs anchored to trip's first stop
      if (!meta.pickup_time && !meta.time) meta.pickup_time = '09:00';
      const pickup_points_json = JSON.stringify(pickups);
      const metadata = JSON.stringify(meta);
      const firstAddr = pickups[0].address;
      db.prepare(`UPDATE bookings SET pickup_points_json = @ppj, metadata = @meta, pickup_location = COALESCE(pickup_location, @first) WHERE id = @id`).run({ id: row.id, ppj: pickup_points_json, meta: metadata, first: firstAddr });
      updated++;
    }
    console.log(JSON.stringify({ ok:true, date: TARGET_DATE, updated }));
  } finally {
    db.close();
  }
}

if (require.main === module){
  main();
}
