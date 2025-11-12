#!/usr/bin/env node
/**
 * Cleanup demo/test bookings and related dispatch logs from SQLite DB.
 * Heuristics match scripts/demo_sqlite_demo_ops.sql (emails @example.com, 'demo' markers).
 *
 * Usage:
 *   node scripts/cleanup_demo_bookings.js
 */
const path = require('path');

function getSqlite(){
  const Database = require('better-sqlite3');
  return new Database(path.join(__dirname, '..', 'data', 'db.sqlite3'));
}

function run(){
  const db = getSqlite();
  try {
    // Ensure tables exist to avoid errors on clean DBs
    db.exec(`CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY);
             CREATE TABLE IF NOT EXISTS dispatch_log (id TEXT PRIMARY KEY, booking_id TEXT, partner_id TEXT, status TEXT, created_at TEXT);`);

    // Count before
    const countBefore = db.prepare(`SELECT COUNT(1) AS c
      FROM bookings
      WHERE COALESCE("__test_seed", 0) = 1
         OR LOWER(COALESCE(user_email,'')) LIKE '%@example.com%'
         OR LOWER(COALESCE(user_email,'')) LIKE '%demo%'
         OR LOWER(COALESCE(user_name,'')) LIKE '%demo%'
         OR LOWER(COALESCE(seed_source,'')) LIKE '%demo%'
         OR trip_id IN ('DEMO_ACROPOLIS_TOUR','DEMO_USER_SPECIFIED_ROUTE','DEMO_CUSTOM_GOOGLE_TEST','DEMO_SCATTERED_GOOGLE_TEST','DEMO_SCATTERED_GOOGLE_TEST_PCODES')
    `).get().c;

    // Drop driver assignments first (non-destructive) so nothing shows in driver panel
    db.prepare(`UPDATE bookings
      SET assigned_driver_id = NULL, route_id = NULL
      WHERE COALESCE("__test_seed", 0) = 1
         OR LOWER(COALESCE(user_email,'')) LIKE '%@example.com%'
         OR LOWER(COALESCE(user_email,'')) LIKE '%demo%'
         OR LOWER(COALESCE(user_name,'')) LIKE '%demo%'
         OR LOWER(COALESCE(seed_source,'')) LIKE '%demo%'
         OR trip_id IN ('DEMO_ACROPOLIS_TOUR','DEMO_USER_SPECIFIED_ROUTE','DEMO_CUSTOM_GOOGLE_TEST','DEMO_SCATTERED_GOOGLE_TEST','DEMO_SCATTERED_GOOGLE_TEST_PCODES')
    `).run();

    // Delete related dispatch logs
    db.prepare(`DELETE FROM dispatch_log
      WHERE booking_id IN (
        SELECT id FROM bookings WHERE COALESCE("__test_seed", 0) = 1
           OR LOWER(COALESCE(user_email,'')) LIKE '%@example.com%'
           OR LOWER(COALESCE(user_email,'')) LIKE '%demo%'
           OR LOWER(COALESCE(user_name,'')) LIKE '%demo%'
           OR LOWER(COALESCE(seed_source,'')) LIKE '%demo%'
           OR trip_id IN ('DEMO_ACROPOLIS_TOUR','DEMO_USER_SPECIFIED_ROUTE','DEMO_CUSTOM_GOOGLE_TEST','DEMO_SCATTERED_GOOGLE_TEST','DEMO_SCATTERED_GOOGLE_TEST_PCODES')
      )
    `).run();

    // Delete bookings
    const info = db.prepare(`DELETE FROM bookings
      WHERE COALESCE("__test_seed", 0) = 1
         OR LOWER(COALESCE(user_email,'')) LIKE '%@example.com%'
         OR LOWER(COALESCE(user_email,'')) LIKE '%demo%'
         OR LOWER(COALESCE(user_name,'')) LIKE '%demo%'
         OR LOWER(COALESCE(seed_source,'')) LIKE '%demo%'
         OR trip_id IN ('DEMO_ACROPOLIS_TOUR','DEMO_USER_SPECIFIED_ROUTE','DEMO_CUSTOM_GOOGLE_TEST','DEMO_SCATTERED_GOOGLE_TEST','DEMO_SCATTERED_GOOGLE_TEST_PCODES')
    `).run();

    const countAfter = db.prepare(`SELECT COUNT(1) AS c
      FROM bookings
      WHERE COALESCE("__test_seed", 0) = 1
         OR LOWER(COALESCE(user_email,'')) LIKE '%@example.com%'
         OR LOWER(COALESCE(user_email,'')) LIKE '%demo%'
         OR LOWER(COALESCE(user_name,'')) LIKE '%demo%'
         OR LOWER(COALESCE(seed_source,'')) LIKE '%demo%'
         OR trip_id IN ('DEMO_ACROPOLIS_TOUR','DEMO_USER_SPECIFIED_ROUTE','DEMO_CUSTOM_GOOGLE_TEST','DEMO_SCATTERED_GOOGLE_TEST','DEMO_SCATTERED_GOOGLE_TEST_PCODES')
    `).get().c;

    console.log(JSON.stringify({ cleaned: info.changes || 0, before: countBefore, after: countAfter }));
  } finally {
    db.close();
  }
}

run();
