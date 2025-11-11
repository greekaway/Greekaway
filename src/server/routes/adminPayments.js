'use strict';
// Phase 7: Admin payments endpoints extracted from server.js
// registerAdminPayments(app, { checkAdminAuth, stripe })

function registerAdminPayments(app, deps) {
  const { checkAdminAuth, stripe } = deps;
  const fs = require('fs');
  const path = require('path');

  // List payments (JSON)
  app.get('/admin/payments', async (req, res) => {
    if (!checkAdminAuth(req)) return res.status(403).send('Forbidden');
    try {
      const limit = Math.min(10000, Math.abs(parseInt(req.query.limit || '200', 10) || 200));
      const offset = Math.max(0, Math.abs(parseInt(req.query.offset || '0', 10) || 0));
      const DATABASE_URL = process.env.DATABASE_URL || null;
      if (DATABASE_URL) {
        try {
          const { Client } = require('pg');
          const client = new Client({ connectionString: DATABASE_URL });
          await client.connect();
          const { rows } = await client.query('SELECT id,status,event_id AS "eventId",amount,currency,timestamp FROM payments ORDER BY timestamp DESC LIMIT $1 OFFSET $2', [limit, offset]);
          await client.end();
          return res.json(rows);
        } catch (_) { /* fallthrough */ }
      }
      try {
        const Database = require('better-sqlite3');
        const db = new Database(path.join(__dirname, '..', '..', '..', 'data', 'db.sqlite3'));
        const rows = db.prepare('SELECT id,status,event_id AS eventId,amount,currency,timestamp FROM payments ORDER BY timestamp DESC LIMIT ? OFFSET ?').all(limit, offset);
        return res.json(rows);
      } catch (_) { /* fallthrough */ }
      const paymentsPath = path.join(__dirname, '..', '..', '..', 'payments.json');
      if (!fs.existsSync(paymentsPath)) return res.json([]);
      const raw = fs.readFileSync(paymentsPath, 'utf8');
      const all = raw ? JSON.parse(raw) : {};
      const arr = Object.keys(all).map(k => ({ id: k, ...all[k] }));
      arr.sort((a,b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      return res.json(arr.slice(offset, offset + limit));
    } catch (e) { return res.status(500).send('Server error'); }
  });

  // CSV export
  app.get('/admin/payments.csv', async (req, res) => {
    if (!checkAdminAuth(req)) return res.status(403).send('Forbidden');
    try {
      const { status, from, to, min, max, limit } = req.query || {};
      let rows = [];
      const DATABASE_URL = process.env.DATABASE_URL || null;
      if (DATABASE_URL) {
        try {
          const { Client } = require('pg');
          const client = new Client({ connectionString: DATABASE_URL });
          await client.connect();
          const lim = parseInt(limit, 10) || 10000;
          const { rows: pgrows } = await client.query('SELECT id,status,event_id AS "eventId",amount,currency,timestamp,metadata FROM payments ORDER BY timestamp DESC LIMIT $1', [lim]);
          rows = pgrows; await client.end();
        } catch (_) { /* fallthrough */ }
      }
      if (rows.length === 0) {
        try {
          const Database = require('better-sqlite3');
          const db = new Database(path.join(__dirname, '..', '..', '..', 'data', 'db.sqlite3'));
          rows = db.prepare('SELECT id,status,event_id AS eventId,amount,currency,timestamp,metadata FROM payments ORDER BY timestamp DESC').all();
        } catch (_) { /* fallthrough */ }
      }
      if (rows.length === 0) {
        const paymentsPath = path.join(__dirname, '..', '..', '..', 'payments.json');
        if (fs.existsSync(paymentsPath)) {
          const raw = fs.readFileSync(paymentsPath, 'utf8');
          const all = raw ? JSON.parse(raw) : {};
          rows = Object.keys(all).map(k => ({ id: k, ...all[k] }));
        }
      }
      const filtered = (rows || []).filter(p => {
        try {
          if (status && String(p.status) !== status) return false;
          if (min) { const m = parseInt(min,10); if (Number(p.amount) < m) return false; }
          if (max) { const M = parseInt(max,10); if (Number(p.amount) > M) return false; }
          if (from) { const fromTs = new Date(from + 'T00:00:00Z').getTime(); const pt = p.timestamp ? new Date(p.timestamp).getTime() : NaN; if (isFinite(pt) && pt < fromTs) return false; }
          if (to) { const toTs = new Date(to + 'T23:59:59Z').getTime(); const pt = p.timestamp ? new Date(p.timestamp).getTime() : NaN; if (isFinite(pt) && pt > toTs) return false; }
          return true;
        } catch(_) { return false; }
      });
      const keys = Array.from(new Set(filtered.flatMap(obj => Object.keys(obj || {}))));
      const escape = (val) => { if (val === null || val === undefined) return ''; if (typeof val === 'object') val = JSON.stringify(val); return '"' + String(val).replace(/"/g, '""') + '"'; };
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      const ts = new Date().toISOString().replace(/[:.]/g,'').replace(/T/,'_').replace(/Z/,'');
      res.setHeader('Content-Disposition', `attachment; filename="payments_${ts}.csv"`);
      res.write(keys.join(',') + '\n');
      for (const row of filtered) { const vals = keys.map(k => escape(row[k])); res.write(vals.join(',') + '\n'); }
      res.end();
    } catch (e) { return res.status(500).send('Server error'); }
  });
}

module.exports = { registerAdminPayments };
