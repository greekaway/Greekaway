#!/usr/bin/env node
/**
 * Extra cleanup for demo/test data beyond bookings:
 * - provider_availability: delete where is_demo=1 or seed_source LIKE 'demo%'
 * - trip_assignments: same (if table exists)
 * - Remove bookings (and related dispatch_log) that contain specific legacy addresses
 *   in pickup fields or metadata: "Ιπποκράτους 43", "Ρουμπέση 7", "Μακεδονίας 159".
 *
 * Usage:
 *   node scripts/cleanup_demo_extras.js
 */
const path = require('path');

function getDb(){
  const Database = require('better-sqlite3');
  return new Database(path.join(__dirname, '..', 'data', 'db.sqlite3'));
}

function hasTable(db, t){
  try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t); } catch(_) { return false; }
}
function colSet(db, t){
  try { return new Set(db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name)); } catch(_) { return new Set(); }
}

function run(){
  const db = getDb();
  const deleted = { provider_availability: 0, trip_assignments: 0, bookings_by_addr: 0, dispatch_by_addr: 0 };
  try {
    // 1) provider_availability (if flags exist)
    if (hasTable(db, 'provider_availability')){
      const cols = colSet(db, 'provider_availability');
      if (cols.has('is_demo') || cols.has('seed_source')){
        const info = db.prepare("DELETE FROM provider_availability WHERE COALESCE(is_demo,0)=1 OR LOWER(COALESCE(seed_source,'')) LIKE 'demo%'").run();
        deleted.provider_availability = info.changes || 0;
      }
    }

    // 2) trip_assignments (if table and flags exist)
    if (hasTable(db, 'trip_assignments')){
      const cols = colSet(db, 'trip_assignments');
      if (cols.has('is_demo') || cols.has('seed_source')){
        const info = db.prepare("DELETE FROM trip_assignments WHERE COALESCE(is_demo,0)=1 OR LOWER(COALESCE(seed_source,'')) LIKE 'demo%'").run();
        deleted.trip_assignments = info.changes || 0;
      }
    }

    // 3) Delete bookings containing legacy addresses (and related dispatch_log)
    const like1 = '%Ιπποκράτους 43%';
    const like2 = '%Ρουμπέση 7%';
    const like3 = '%Μακεδονίας 159%';
    const matchSql = `(
      COALESCE(pickup_location,'') LIKE ? OR COALESCE(pickup_address,'') LIKE ? OR COALESCE(metadata,'') LIKE ? OR
      COALESCE(pickup_location,'') LIKE ? OR COALESCE(pickup_address,'') LIKE ? OR COALESCE(metadata,'') LIKE ? OR
      COALESCE(pickup_location,'') LIKE ? OR COALESCE(pickup_address,'') LIKE ? OR COALESCE(metadata,'') LIKE ?
    )`;
    let ids = [];
    try {
      ids = db.prepare(`SELECT id FROM bookings WHERE ${matchSql}`).all(like1,like1,like1, like2,like2,like2, like3,like3,like3).map(r => r.id);
    } catch(_) { ids = []; }
    if (ids.length){
      const placeholders = ids.map(() => '?').join(',');
      try {
        deleted.dispatch_by_addr = (db.prepare(`DELETE FROM dispatch_log WHERE booking_id IN (${placeholders})`).run(...ids).changes) || 0;
      } catch(_){ /* table may not exist */ }
      deleted.bookings_by_addr = (db.prepare(`DELETE FROM bookings WHERE id IN (${placeholders})`).run(...ids).changes) || 0;
    }

    console.log(JSON.stringify({ ok: true, deleted }));
  } finally {
    try { db.close(); } catch(_){ }
  }
}

run();
