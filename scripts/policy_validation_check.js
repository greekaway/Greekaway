#!/usr/bin/env node
/**
 * Quick policy validation runner.
 * Usage:
 *   node scripts/policy_validation_check.js [--booking-id <id>] [--latest]
 * If neither is provided, it will use the latest booking.
 */

const path = require('path');

function flag(name, def=null){
  const a = process.argv; const k = `--${name}`; const i = a.findIndex(x => x === k || x.startsWith(k+'='));
  if (i === -1) return def; const cur = a[i]; if (cur.includes('=')) return cur.split('=')[1]; const next = a[i+1]; if (next && !next.startsWith('--')) return next; return true;
}

function getSqlite(){ const Database = require('better-sqlite3'); return new Database(path.join(__dirname, '..', 'data', 'db.sqlite3')); }

(async () => {
  const idFlag = flag('booking-id', null);
  let bookingId = idFlag && idFlag !== true ? String(idFlag) : null;
  if (!bookingId) {
    const db = getSqlite();
    try {
      const row = db.prepare('SELECT id FROM bookings ORDER BY created_at DESC LIMIT 1').get();
      bookingId = row && row.id;
    } finally { db.close(); }
  }
  if (!bookingId) {
    console.error('No bookings found. Create one and retry.');
    process.exit(2);
  }
  const svc = require('../services/policyService');
  const out = await svc.validateBeforeDispatch(bookingId);
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
