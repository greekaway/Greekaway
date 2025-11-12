'use strict';
/**
 * Admin Maintenance routes
 * Endpoints:
 * - GET  /admin/backup-status
 * - POST /api/backup/export
 * - POST /api/admin/seed
 * - DELETE /api/admin/cleanup-demo
 * - DELETE /api/admin/cleanup-test-seeds
 * Deps: express, bookingsDb (optional), checkAdminAuth(req)->bool, ensureSeedColumns?(db)
 */
// Phase 6: Admin maintenance endpoints (seed, cleanup, backup)
// registerAdminMaintenance(app, { express, bookingsDb, checkAdminAuth, ensureSeedColumns })

function registerAdminMaintenance(app, deps) {
  const { express, bookingsDb, checkAdminAuth, ensureSeedColumns } = deps;
  const path = require('path');
  const fs = require('fs');
  const crypto = require('crypto');
  // Fallback local implementation if ensureSeedColumns not provided (maintains previous behavior)
  const addSeedColumns = ensureSeedColumns || function(db) {
    try { db.exec('ALTER TABLE bookings ADD COLUMN "__test_seed" INTEGER DEFAULT 0'); } catch(_){}
    try { db.exec('ALTER TABLE bookings ADD COLUMN seed_source TEXT'); } catch(_){}
    try { db.exec('ALTER TABLE payments ADD COLUMN "__test_seed" INTEGER DEFAULT 0'); } catch(_){}
    try { db.exec('ALTER TABLE payments ADD COLUMN seed_source TEXT'); } catch(_){}
    try { db.exec('ALTER TABLE manual_payments ADD COLUMN "__test_seed" INTEGER DEFAULT 0'); } catch(_){}
    try { db.exec('ALTER TABLE manual_payments ADD COLUMN seed_source TEXT'); } catch(_){}
    try { db.exec('ALTER TABLE partner_agreements ADD COLUMN "__test_seed" INTEGER DEFAULT 0'); } catch(_){}
    try { db.exec('ALTER TABLE partner_agreements ADD COLUMN seed_source TEXT'); } catch(_){}
  };

  // Backup status
  app.get('/admin/backup-status', (req, res) => {
    if (!checkAdminAuth(req)) return res.status(403).send('Forbidden');
    try {
      const os = require('os');
      const candidates = [];
      if (process.env.BACKUP_DIR) candidates.push(process.env.BACKUP_DIR);
      candidates.push(path.join(os.homedir(), 'greekaway_backups'));
      candidates.push('/var/data/greekaway_backups');
      candidates.push('/data/greekaway_backups');
      candidates.push('/opt/render/project/.data/greekaway_backups');
      const backupDir = candidates.find(p => { try { return p && fs.existsSync(p); } catch(_) { return false; } }) || (process.env.BACKUP_DIR || path.join(os.homedir(), 'greekaway_backups'));
      if (!fs.existsSync(backupDir)) return res.json({ backupsDir: backupDir, count: 0, latestDb: null, latestLog: null });
      const files = fs.readdirSync(backupDir).map(f => ({ name: f, path: path.join(backupDir, f) }));
      const dbFiles = files.filter(f => f.name.startsWith('db.sqlite3') && f.name.endsWith('.gz'));
      const logFiles = files.filter(f => f.name.startsWith('webhook.log') && f.name.endsWith('.gz'));
      const stat = (f) => { try { const s = fs.statSync(f.path); return { file: f.name, size: s.size, mtime: s.mtime }; } catch (e) { return null; } };
      const latest = (arr) => { const stats = arr.map(stat).filter(Boolean); stats.sort((a,b) => new Date(b.mtime) - new Date(a.mtime)); return stats[0] || null; };
      return res.json({ backupsDir: backupDir, count: files.length, latestDb: latest(dbFiles), latestLog: latest(logFiles) });
    } catch (e) { return res.status(500).send('Server error'); }
  });

  // On-demand backup export
  app.post('/api/backup/export', async (req, res) => {
    if (!checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const zlib = require('zlib');
      const os = require('os');
      const backupDirCandidates = [ process.env.BACKUP_DIR, path.join(os.homedir(), 'greekaway_backups'), path.join(__dirname, '..', '..', '..', 'data', 'db-backups') ].filter(Boolean);
      const backupDir = backupDirCandidates.find(p => { try { fs.mkdirSync(p, { recursive: true }); return true; } catch(_) { return false; } }) || path.join(__dirname, '..', '..', '..', 'data', 'db-backups');
      try { fs.mkdirSync(backupDir, { recursive: true }); } catch(_){ }
      const ts = new Date().toISOString().replace(/[:.]/g,'').replace(/T/,'_').replace(/Z/,'Z');
      const src = path.join(__dirname, '..', '..', '..', 'data', 'db.sqlite3');
      const dst = path.join(backupDir, `db.sqlite3.${ts}.gz`);
      if (!fs.existsSync(src)) return res.status(404).json({ error: 'DB not found' });
      const gzip = zlib.createGzip();
      const inp = fs.createReadStream(src);
      const out = fs.createWriteStream(dst);
      await new Promise((resolve, reject) => { inp.pipe(gzip).pipe(out).on('finish', resolve).on('error', reject); });
      return res.json({ ok: true, file: dst, note: 'Use /admin/backup-status to locate backups' });
    } catch (e) { return res.status(500).json({ error: 'Server error' }); }
  });

  // Seed endpoint
  app.post('/api/admin/seed', express.json({ limit: '5mb' }), async (req, res) => {
    if (!checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const payload = req.body && Object.keys(req.body).length ? req.body : null;
      let seed = payload;
      if (!seed) {
        try { const p = path.join(__dirname, '..', '..', '..', 'data', 'test-seeds', 'seed-admin-2025-11-04.json'); seed = JSON.parse(fs.readFileSync(p, 'utf8')); } catch(_){}
      }
      if (!seed || typeof seed !== 'object') return res.status(400).json({ error: 'Missing seed JSON' });
      const Database = require('better-sqlite3');
      const db = bookingsDb || new Database(path.join(__dirname, '..', '..', '..', 'data', 'db.sqlite3'));
  addSeedColumns(db);
      try { db.exec(`CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, status TEXT, event_id TEXT, amount INTEGER, currency TEXT, timestamp TEXT)`); } catch(_){ }
      try { db.exec(`CREATE TABLE IF NOT EXISTS manual_payments (id TEXT PRIMARY KEY, booking_id TEXT, partner_id TEXT, partner_name TEXT, trip_id TEXT, trip_title TEXT, date TEXT, amount_cents INTEGER, currency TEXT, iban TEXT, status TEXT, partner_balance_cents INTEGER, created_at TEXT, updated_at TEXT)`); } catch(_){ }
      try { db.exec(`CREATE TABLE IF NOT EXISTS partner_agreements (id TEXT PRIMARY KEY, partner_name TEXT, partner_email TEXT, stripe_account_id TEXT, onboarding_url TEXT, iban TEXT, vat_number TEXT, agreed INTEGER, ip TEXT, timestamp TEXT, source TEXT, agreement_hash TEXT, agreement_version TEXT)`); } catch(_){ }
      try {
        const os = require('os');
        const backupDir = path.join(os.homedir(), 'greekaway_backups');
        try { fs.mkdirSync(backupDir, { recursive: true }); } catch(_){ }
        const ts = new Date().toISOString().replace(/[:.]/g,'');
        const src = path.join(__dirname, '..', '..', '..', 'data', 'db.sqlite3');
        const dst = path.join(backupDir, `db.sqlite3.${ts}`);
        if (fs.existsSync(src)) { fs.copyFileSync(src, dst); }
      } catch(_){ }
      const nowIso = new Date().toISOString();
      const tx = db.transaction((s) => {
        const seedSource = s.seed_source || 'admin_rewire_20251104';
        if (Array.isArray(s.partners)) {
          const ins = db.prepare(`INSERT OR REPLACE INTO partner_agreements (id,partner_name,partner_email,stripe_account_id,onboarding_url,iban,vat_number,agreed,ip,timestamp,source,agreement_hash,agreement_version, "__test_seed", seed_source) VALUES (@id,@partner_name,@partner_email,@stripe_account_id,@onboarding_url,@iban,@vat_number,@agreed,@ip,@timestamp,@source,@agreement_hash,@agreement_version,@__test_seed,@seed_source)`);
          for (const p of s.partners) {
            ins.run({ id: p.id || crypto.randomUUID(), partner_name: p.partner_name || p.name || null, partner_email: p.partner_email || p.email || null, stripe_account_id: p.stripe_account_id || null, onboarding_url: p.onboarding_url || null, iban: p.iban || null, vat_number: p.vat_number || null, agreed: p.agreed ? 1 : 0, ip: p.ip || null, timestamp: p.timestamp || nowIso, source: p.source || 'seed', agreement_hash: p.agreement_hash || null, agreement_version: p.agreement_version || null, __test_seed: 1, seed_source: p.seed_source || seedSource });
          }
        }
        if (Array.isArray(s.bookings)) {
          const ins = db.prepare(`INSERT OR REPLACE INTO bookings (id,status,date,payment_intent_id,event_id,user_name,user_email,trip_id,seats,price_cents,currency,metadata,created_at,updated_at,partner_id, "__test_seed", seed_source) VALUES (@id,@status,@date,@payment_intent_id,@event_id,@user_name,@user_email,@trip_id,@seats,@price_cents,@currency,@metadata,@created_at,@updated_at,@partner_id,@__test_seed,@seed_source)`);
          for (const b of s.bookings) {
            const meta = b.metadata && typeof b.metadata === 'object' ? { ...b.metadata, __test_seed: true, seed_source: b.seed_source || seedSource } : { __test_seed: true, seed_source: b.seed_source || seedSource };
            ins.run({ id: b.id || crypto.randomUUID(), status: b.status || 'confirmed', date: b.date || null, payment_intent_id: b.payment_intent_id || null, event_id: b.event_id || null, user_name: b.user_name || null, user_email: b.user_email || null, trip_id: b.trip_id || null, seats: typeof b.pax === 'number' ? b.pax : (b.seats || 1), price_cents: (typeof b.total_cents === 'number') ? b.total_cents : (b.price_cents || 0), currency: b.currency || 'eur', metadata: JSON.stringify(meta), created_at: b.created_at || nowIso, updated_at: b.updated_at || nowIso, partner_id: b.partner_id || null, __test_seed: 1, seed_source: b.seed_source || seedSource });
          }
        }
        if (Array.isArray(s.payments)) {
          const ins = db.prepare(`INSERT OR REPLACE INTO payments (id,status,event_id,amount,currency,timestamp, "__test_seed", seed_source) VALUES (@id,@status,@event_id,@amount,@currency,@timestamp,@__test_seed,@seed_source)`);
          for (const p of s.payments) {
            ins.run({ id: p.id || crypto.randomUUID(), status: p.status || 'succeeded', event_id: p.event_id || null, amount: (typeof p.amount === 'number') ? p.amount : (typeof p.amount_cents === 'number' ? p.amount_cents : null), currency: p.currency || 'eur', timestamp: p.timestamp || nowIso, __test_seed: 1, seed_source: p.seed_source || seedSource });
          }
        }
        if (Array.isArray(s.manual_payments)) {
          const ins = db.prepare(`INSERT OR REPLACE INTO manual_payments (id,booking_id,partner_id,partner_name,trip_id,trip_title,date,amount_cents,currency,iban,status,partner_balance_cents,created_at,updated_at, "__test_seed", seed_source) VALUES (@id,@booking_id,@partner_id,@partner_name,@trip_id,@trip_title,@date,@amount_cents,@currency,@iban,@status,@partner_balance_cents,@created_at,@updated_at,@__test_seed,@seed_source)`);
          for (const m of s.manual_payments) {
            ins.run({ id: m.id || crypto.randomUUID(), booking_id: m.booking_id || null, partner_id: m.partner_id || null, partner_name: m.partner_name || null, trip_id: m.trip_id || null, trip_title: m.trip_title || null, date: m.date || nowIso.slice(0,10), amount_cents: (typeof m.amount_cents === 'number') ? m.amount_cents : (typeof m.amount === 'number' ? m.amount : 0), currency: m.currency || 'eur', iban: m.iban || null, status: m.status || 'pending', partner_balance_cents: (typeof m.partner_balance_cents === 'number') ? m.partner_balance_cents : (typeof m.partner_balance === 'number' ? m.partner_balance : 0), created_at: m.created_at || nowIso, updated_at: m.updated_at || nowIso, __test_seed: 1, seed_source: m.seed_source || seedSource });
          }
        }
      });
      tx(seed);
      if (!bookingsDb) db.close();
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: 'Server error' }); }
  });

  // Cleanup demo data
  app.delete('/api/admin/cleanup-demo', (req, res) => {
    if (!checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const Database = require('better-sqlite3');
      const db = bookingsDb || new Database(path.join(__dirname, '..', '..', '..', 'data', 'db.sqlite3'));
      const where = `COALESCE("__test_seed",0)=1 OR LOWER(COALESCE(user_email,'')) LIKE '%@example.com%' OR LOWER(COALESCE(user_email,'')) LIKE '%demo%' OR LOWER(COALESCE(user_name,'')) LIKE '%demo%' OR LOWER(COALESCE(seed_source,'')) LIKE '%demo%' OR COALESCE(is_demo,0)=1`;
      const cntB = db.prepare(`SELECT COUNT(1) AS c FROM bookings WHERE ${where}`).get().c || 0;
      const cntD = (()=>{ try { return db.prepare(`SELECT COUNT(1) AS c FROM dispatch_log WHERE booking_id IN (SELECT id FROM bookings WHERE ${where})`).get().c || 0; } catch(_) { return 0; } })();
      const dry = String(req.query.dry_run || '').trim() !== '' || String(req.query.confirm || '') === '';
      if (dry) { if (!bookingsDb) db.close(); return res.json({ ok: true, dry_run: true, bookings: cntB, dispatch_log: cntD }); }
      try { db.prepare(`DELETE FROM dispatch_log WHERE booking_id IN (SELECT id FROM bookings WHERE ${where})`).run(); } catch(_){ }
      db.prepare(`DELETE FROM bookings WHERE ${where}`).run();
      if (!bookingsDb) db.close();
      return res.json({ ok: true, deleted: { bookings: cntB, dispatch_log: cntD } });
    } catch (e) { return res.status(500).json({ error: 'Server error' }); }
  });

  // Cleanup test seeds
  app.delete('/api/admin/cleanup-test-seeds', (req, res) => {
    if (!checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const source = (req.query.source || 'admin_rewire_20251104').toString();
      const Database = require('better-sqlite3');
      const db = bookingsDb || new Database(path.join(__dirname, '..', '..', '..', 'data', 'db.sqlite3'));
  addSeedColumns(db);
      const delTables = ['bookings','payments','manual_payments','partner_agreements'];
      for (const t of delTables) { try { db.prepare(`DELETE FROM ${t} WHERE "__test_seed" = 1 OR seed_source = ?`).run(source); } catch(_){ } }
      if (!bookingsDb) db.close();
      return res.json({ ok: true, source });
    } catch (e) { return res.status(500).json({ error: 'Server error' }); }
  });
}

module.exports = { registerAdminMaintenance };
