#!/usr/bin/env node
/**
 * Verify there are no demo bookings or legacy-address stops.
 * Prints both a sample of SELECT id,trip_id,is_demo,seed_source and counts.
 */
const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '..', 'data', 'db.sqlite3'));

function colSet(){ return new Set(db.prepare('PRAGMA table_info(bookings)').all().map(c => c.name)); }
const cols = colSet();
const sel = `SELECT id, trip_id, ${cols.has('is_demo') ? 'is_demo' : 'NULL AS is_demo'}, ${cols.has('seed_source') ? 'seed_source' : 'NULL AS seed_source'} FROM bookings`;
const rows = db.prepare(sel).all();
console.log('SELECT id, trip_id, is_demo, seed_source FROM bookings;');
console.log(rows);

const likeDemo = '%"is_demo": true%';
const a1 = '%Ιπποκράτους 43%';
const a2 = '%Ρουμπέση 7%';
const a3 = '%Μακεδονίας 159%';
let cnt = 0;
try {
  cnt = db.prepare("SELECT COUNT(1) AS c FROM bookings WHERE LOWER(COALESCE(seed_source,'')) LIKE 'demo%' OR COALESCE(is_demo,0)=1 OR COALESCE(metadata,'') LIKE ? OR COALESCE(metadata,'') LIKE ? OR COALESCE(metadata,'') LIKE ?").get(likeDemo, a1, a2, a3).c;
} catch(_) {
  cnt = db.prepare("SELECT COUNT(1) AS c FROM bookings WHERE COALESCE(metadata,'') LIKE ? OR COALESCE(metadata,'') LIKE ? OR COALESCE(metadata,'') LIKE ?").get(a1, a2, a3).c;
}
console.log('DEMO_OR_ADDR_COUNT:', cnt);
db.close();
