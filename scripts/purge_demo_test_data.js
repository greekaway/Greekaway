#!/usr/bin/env node
// Purge demo / test bookings and related manual payments safely.
// Criteria:
//  - Bookings where metadata contains is_demo=1 OR source starts with 'test_' OR '__test_seed' flag
//  - Bookings whose stops match known demo Athens addresses (Roubesi 7, Ippokratous 43, Ermou 2 etc)
//  - Manual payments linked to those bookings and marked __test_seed
// Provides --dry (default) and --apply modes.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DEMO_ADDRESSES = [
  'Ρουμπέση 7',
  'Ιπποκράτους 43',
  'Ερμού 2',
  'Διονυσίου Αεροπαγίτου 15',
  'Ακρόπολη Αθηνών',
  'Ακτή Κουμουνδούρου 20'
];

function isDemoMetadata(meta){
  if (!meta || typeof meta !== 'object') return false;
  if (meta.is_demo === 1 || meta.is_demo === true) return true;
  if (typeof meta.source === 'string' && /^test_/i.test(meta.source)) return true;
  if (meta.__test_seed) return true;
  if (typeof meta.trip_title === 'string' && /demo trip/i.test(meta.trip_title)) return true;
  if (Array.isArray(meta.stops)){
    const addrHit = meta.stops.some(s => {
      const a = (s && (s.address || s.pickup || s.location) || '').toLowerCase();
      return DEMO_ADDRESSES.some(d => a.includes(d.toLowerCase()));
    });
    if (addrHit) return true;
  }
  return false;
}

function main(){
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const dbPath = path.join(__dirname,'..','data','db.sqlite3');
  const db = new Database(dbPath);
  let candidates = [];
  try {
    const info = db.prepare("PRAGMA table_info('bookings')").all();
    const colNames = new Set(info.map(c => c.name));
    const rows = db.prepare('SELECT id, metadata' + (colNames.has('is_demo') ? ', is_demo' : '') + (colNames.has('source') ? ', source' : '') + (colNames.has('__test_seed') ? ', __test_seed' : '') + ' FROM bookings').all();
    for (const r of rows){
      let meta = null; try { meta = r.metadata ? JSON.parse(r.metadata) : {}; } catch(_){ meta = {}; }
      const topIsDemo = (colNames.has('is_demo') && (r.is_demo === 1 || r.is_demo === true));
      const topTestSeed = (colNames.has('source') && typeof r.source === 'string' && (/^test_/i.test(r.source) || /admin_rewire/i.test(r.source)));
      const topFlag = (colNames.has('__test_seed') && (r.__test_seed === 1 || r.__test_seed === true));
      if (topIsDemo || topTestSeed || topFlag || isDemoMetadata(meta)){
        candidates.push(r.id);
      }
    }
    // Manual payments (linked by booking_id) with test flag
    let mpRows = [];
    try { mpRows = db.prepare('SELECT id, booking_id, __test_seed FROM manual_payments').all(); } catch(_){ mpRows = []; }
    const mpCandidates = mpRows.filter(r => candidates.includes(r.booking_id) || r.__test_seed === 1).map(r=>r.id);

    if (!apply){
      console.log('--- DRY RUN (use --apply to delete) ---');
      console.log('Booking demo/test candidates:', candidates.length ? candidates.join(', ') : '(none)');
      console.log('Manual payment candidates:', mpCandidates.length ? mpCandidates.join(', ') : '(none)');
      console.log('Nothing deleted.');
      return;
    }
    // Apply deletion
    const now = new Date().toISOString();
    const delBook = db.prepare('DELETE FROM bookings WHERE id = ?');
    const delMP = db.prepare('DELETE FROM manual_payments WHERE id = ?');
    const delMPLog = db.prepare('DELETE FROM manual_payments_log WHERE manual_payment_id = ?');
    db.prepare('BEGIN').run();
    try {
      for (const id of candidates){ delBook.run(id); }
      for (const id of mpCandidates){ delMPLog.run(id); delMP.run(id); }
      db.prepare('COMMIT').run();
      console.log('Deleted bookings:', candidates.length);
      console.log('Deleted manual_payments:', mpCandidates.length);
    } catch(e){
      db.prepare('ROLLBACK').run();
      console.error('Rollback due to error:', e.message);
      process.exit(1);
    }
    console.log('Purge complete at', now);
  } finally {
    db.close();
  }
}

if (require.main === module) main();
