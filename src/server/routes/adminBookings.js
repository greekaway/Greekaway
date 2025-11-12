'use strict';
/**
 * Admin Bookings routes
 * Endpoints:
 * - GET  /admin/bookings (filtered list)
 * - GET  /admin/bookings.csv (CSV export)
 * - POST /admin/bookings/:id/cancel (set status=canceled)
 * - POST /admin/bookings/:id/refund (Stripe refund if PI + set status=refunded)
 * Deps: bookingsDb (better-sqlite3 DB), checkAdminAuth(req)->bool, optional stripe
 */
// Phase 5: Extract admin bookings endpoints with full filters + CSV export

function registerAdminBookings(app, deps) {
  const { express, bookingsDb, checkAdminAuth, stripe } = deps;
  if (!app) throw new Error('registerAdminBookings: missing app');

  // Admin bookings JSON list (filters/pagination)
  app.get('/admin/bookings', (req, res) => {
    if (!checkAdminAuth(req)) { return res.status(403).send('Forbidden'); }
    try {
      const limit = Math.min(10000, Math.abs(parseInt(req.query.limit || '200', 10) || 200));
      const offset = Math.max(0, Math.abs(parseInt(req.query.offset || '0', 10) || 0));
      const status = req.query.status || null;
      const user_email = req.query.user_email || null;
      const trip_id = req.query.trip_id || null;
      const payment_intent_id = req.query.payment_intent_id || null;
      const date_from = req.query.date_from || null;
      const date_to = req.query.date_to || null;
      const min_amount = req.query.min_amount ? parseInt(req.query.min_amount, 10) : null;
      const max_amount = req.query.max_amount ? parseInt(req.query.max_amount, 10) : null;
      const sort = req.query.sort || 'created_at';
      const dir = (req.query.dir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      let rows = [];
      try {
        const Database = require('better-sqlite3');
        const db = bookingsDb || new Database(require('path').join(__dirname, '..', '..', '..', 'data', 'db.sqlite3'));
        const where = [];
        const params = [];
        if (status) { where.push('status = ?'); params.push(status); }
        if (user_email) { where.push('user_email = ?'); params.push(user_email); }
        if (trip_id) { where.push('trip_id = ?'); params.push(trip_id); }
        if (payment_intent_id) { where.push('payment_intent_id = ?'); params.push(payment_intent_id); }
        if (date_from) { where.push('created_at >= ?'); params.push(date_from); }
        if (date_to) { where.push('created_at <= ?'); params.push(date_to + ' 23:59:59'); }
        if (min_amount !== null && !isNaN(min_amount)) { where.push('price_cents >= ?'); params.push(min_amount); }
        if (max_amount !== null && !isNaN(max_amount)) { where.push('price_cents <= ?'); params.push(max_amount); }
        const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
        const allowedSort = ['created_at','price_cents','status','user_name'];
        const sortField = allowedSort.includes(sort) ? sort : 'created_at';
        const stmt = db.prepare(`SELECT * FROM bookings ${whereSql} ORDER BY ${sortField} ${dir} LIMIT ? OFFSET ?`);
        rows = stmt.all(...params, limit, offset);
        if (!bookingsDb) db.close();
      } catch (e) {
        return res.status(500).json({ error: 'Bookings DB not available' });
      }
      // parse metadata JSON where present
      rows = (rows || []).map(r => {
        if (r && r.metadata && typeof r.metadata === 'string') { try { r.metadata = JSON.parse(r.metadata); } catch(_){ } }
        return r;
      });
      return res.json(rows);
    } catch (err) {
      console.error('Admin bookings error:', err && err.stack ? err.stack : err);
      return res.status(500).send('Server error');
    }
  });

  // Admin bookings CSV export
  app.get('/admin/bookings.csv', (req, res) => {
    if (!checkAdminAuth(req)) { return res.status(403).send('Forbidden'); }
    try {
      const limit = Math.min(100000, Math.abs(parseInt(req.query.limit || '10000', 10) || 10000));
      const offset = Math.max(0, Math.abs(parseInt(req.query.offset || '0', 10) || 0));
      const status = req.query.status || null;
      const user_email = req.query.user_email || null;
      const trip_id = req.query.trip_id || null;
      const payment_intent_id = req.query.payment_intent_id || null;
      const date_from = req.query.date_from || null;
      const date_to = req.query.date_to || null;
      const min_amount = req.query.min_amount ? parseInt(req.query.min_amount, 10) : null;
      const max_amount = req.query.max_amount ? parseInt(req.query.max_amount, 10) : null;
      const sort = req.query.sort || 'created_at';
      const dir = (req.query.dir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      let rows = [];
      try {
        const Database = require('better-sqlite3');
        const db = bookingsDb || new Database(require('path').join(__dirname, '..', '..', '..', 'data', 'db.sqlite3'));
        const where = [];
        const params = [];
        if (status) { where.push('status = ?'); params.push(status); }
        if (user_email) { where.push('user_email = ?'); params.push(user_email); }
        if (trip_id) { where.push('trip_id = ?'); params.push(trip_id); }
        if (payment_intent_id) { where.push('payment_intent_id = ?'); params.push(payment_intent_id); }
        if (date_from) { where.push('created_at >= ?'); params.push(date_from); }
        if (date_to) { where.push('created_at <= ?'); params.push(date_to + ' 23:59:59'); }
        if (min_amount !== null && !isNaN(min_amount)) { where.push('price_cents >= ?'); params.push(min_amount); }
        if (max_amount !== null && !isNaN(max_amount)) { where.push('price_cents <= ?'); params.push(max_amount); }
        const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
        const allowedSort = ['created_at','price_cents','status','user_name'];
        const sortField = allowedSort.includes(sort) ? sort : 'created_at';
        const stmt = db.prepare(`SELECT * FROM bookings ${whereSql} ORDER BY ${sortField} ${dir} LIMIT ? OFFSET ?`);
        rows = stmt.all(...params, limit, offset);
        if (!bookingsDb) db.close();
      } catch (e) {
        return res.status(500).json({ error: 'Bookings DB not available' });
      }
      rows = (rows || []).map(r => { if (r && r.metadata && typeof r.metadata === 'string') { try { r.metadata = JSON.parse(r.metadata); } catch(_){ } } return r; });

      const keys = Array.from(new Set(rows.flatMap(obj => Object.keys(obj || {}))));
      const escape = (val) => { if (val === null || val === undefined) return ''; if (typeof val === 'object') val = JSON.stringify(val); return '"' + String(val).replace(/"/g, '""') + '"'; };
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      const ts = new Date().toISOString().replace(/[:.]/g,'').replace(/T/,'_').replace(/Z/,'');
      res.setHeader('Content-Disposition', `attachment; filename="bookings_${ts}.csv"`);
      res.write(keys.join(',') + '\n');
      for (const row of rows) { const vals = keys.map(k => escape(row[k])); res.write(vals.join(',') + '\n'); }
      res.end();
    } catch (err) {
      console.error('Admin bookings CSV error:', err && err.stack ? err.stack : err);
      return res.status(500).send('Server error');
    }
  });

  // Cancel booking
  app.post('/admin/bookings/:id/cancel', (req, res) => {
    if (!checkAdminAuth(req)) return res.status(403).send('Forbidden');
    try {
      const id = req.params.id;
      if (!bookingsDb) return res.status(500).json({ error: 'Bookings DB not available' });
      const now = new Date().toISOString();
      bookingsDb.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?').run('canceled', now, id);
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: 'Server error' }); }
  });

  // Refund booking
  app.post('/admin/bookings/:id/refund', async (req, res) => {
    if (!checkAdminAuth(req)) return res.status(403).send('Forbidden');
    try {
      const id = req.params.id;
      if (!bookingsDb) return res.status(500).json({ error: 'Bookings DB not available' });
      const row = bookingsDb.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      const pi = row.payment_intent_id;
      if (pi && stripe) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(pi);
          const latestCharge = paymentIntent && paymentIntent.latest_charge ? paymentIntent.latest_charge : (paymentIntent.charges && paymentIntent.charges.data && paymentIntent.charges.data[0] && paymentIntent.charges.data[0].id);
          if (latestCharge) { await stripe.refunds.create({ charge: latestCharge }); }
        } catch (_) { /* non-fatal */ }
      }
      const now = new Date().toISOString();
      bookingsDb.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?').run('refunded', now, id);
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: 'Server error' }); }
  });
}

module.exports = { registerAdminBookings };
