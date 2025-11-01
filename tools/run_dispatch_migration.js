#!/usr/bin/env node
/**
 * Run dispatch migration for SQLite or Postgres by detecting DATABASE_URL.
 * Applies only the relevant section from db/migrations/2025-11-01-dispatch.sql
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const MIG_PATH = path.join(__dirname, '..', 'db', 'migrations', '2025-11-01-dispatch.sql');

function extractSection(sql, dialect){
  const marker = `-- @dialect: ${dialect}`;
  const idx = sql.indexOf(marker);
  if (idx === -1) throw new Error(`Dialect section not found: ${dialect}`);
  const rest = sql.slice(idx + marker.length);
  const endIdx = rest.indexOf('-- @dialect:');
  return endIdx === -1 ? rest : rest.slice(0, endIdx);
}

async function runPg(sql){
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // Split by semicolons but carefully keep inside $$ blocks; naive split is acceptable here because we don't use semicolons within the DO $$ ... $$ body except standard.
    const stmts = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
    for (const s of stmts) {
      await client.query(s);
    }
    console.log('Migration applied: Postgres');
  } finally {
    await client.end();
  }
}

function runSqlite(sql){
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, '..', 'data', 'db.sqlite3');
  const db = new Database(dbPath);
  try {
    // Execute statements; ignore duplicate column errors for ALTERs
    const stmts = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
    for (const s of stmts) {
      try { db.exec(s); } catch (e) {
        const msg = (e && e.message) || '';
        if (/duplicate column|already exists/i.test(msg)) {
          // ignore
        } else {
          throw e;
        }
      }
    }
    console.log('Migration applied: SQLite');
  } finally {
    db.close();
  }
}

async function main(){
  const raw = fs.readFileSync(MIG_PATH, 'utf8');
  const hasPg = !!process.env.DATABASE_URL;
  if (hasPg) {
    const pgSql = extractSection(raw, 'postgres');
    await runPg(pgSql);
  } else {
    const sq = extractSection(raw, 'sqlite');
    runSqlite(sq);
  }
}

main().catch((e) => { console.error('Migration failed:', e && e.message ? e.message : e); process.exit(1); });
