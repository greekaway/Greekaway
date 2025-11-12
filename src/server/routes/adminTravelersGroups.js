'use strict';
/**
 * Admin Travelers / Groups / Feedback routes
 * Endpoints:
 * - GET  /admin/travelers
 * - GET  /admin/suggest-pairs
 * - GET  /admin/groups (JSON or HTML)
 * - POST /admin/groups (create/update/lock groups)
 * - POST /api/feedback (public submit)
 * - GET  /admin/feedback (list)
 * Deps: express, bookingsDb, checkAdminAuth(req)->bool
 */
// Phase 6: Travelers, groups, feedback, pairing endpoints
// registerAdminTravelersGroups(app, { express, bookingsDb, checkAdminAuth })

function registerAdminTravelersGroups(app, deps) {
  const { express, bookingsDb, checkAdminAuth } = deps;
  const path = require('path');
  const crypto = require('crypto');

  // Travelers list
  app.get('/admin/travelers', (req, res) => {
    if (!checkAdminAuth(req)) return res.status(403).send('Forbidden');
    try {
      if (!bookingsDb) return res.status(500).json({ error: 'DB not available' });
      const rows = bookingsDb.prepare('SELECT email,name,language,age_group,traveler_type,interest,sociality,children_ages,average_rating,updated_at FROM travelers ORDER BY updated_at DESC').all();
      rows.forEach(r => { try { if (r.children_ages && typeof r.children_ages === 'string' && r.children_ages.trim().startsWith('[')) r.children_ages = JSON.parse(r.children_ages); } catch(_){} });
      return res.json(rows);
    } catch (e) { return res.status(500).json({ error: 'Server error' }); }
  });

  // Suggest pairs (simple similarity + co_travel boost)
  app.get('/admin/suggest-pairs', (req, res) => {
    if (!checkAdminAuth(req)) return res.status(403).send('Forbidden');
    try {
      if (!bookingsDb) return res.status(500).json({ error: 'DB not available' });
      const trip_id = req.query.trip_id || null;
      const date = req.query.date || null;
      const bookings = bookingsDb.prepare('SELECT user_email, metadata FROM bookings WHERE status = ? AND (? IS NULL OR trip_id = ?) AND (? IS NULL OR date = ?)').all('confirmed', trip_id, trip_id, date, date);
      const emails = Array.from(new Set(bookings.map(b => (b.user_email || '').toLowerCase()).filter(Boolean)));
      if (emails.length < 2) return res.json([]);
      const profByEmail = {};
      const profs = bookingsDb.prepare('SELECT * FROM travelers WHERE email IN (' + emails.map(()=>'?').join(',') + ')').all(...emails);
      profs.forEach(p => { profByEmail[(p.email||'').toLowerCase()] = p; });
      const pairs = [];
      for (let i=0;i<emails.length;i++) {
        for (let j=i+1;j<emails.length;j++) {
          const a = emails[i], b = emails[j];
          const pa = profByEmail[a]||{}, pb = profByEmail[b]||{};
          let score = 0;
          if (pa.language && pb.language && pa.language === pb.language) score += 1;
          if (pa.age_group && pb.age_group && pa.age_group === pb.age_group) score += 1;
          if (pa.traveler_type && pb.traveler_type && pa.traveler_type === pb.traveler_type) score += 1;
          if (pa.interest && pb.interest && pa.interest === pb.interest) score += 1;
          if (pa.sociality && pb.sociality && pa.sociality === pb.sociality) score += 0.5;
          const row = bookingsDb.prepare('SELECT times FROM co_travel WHERE email_a = ? AND email_b = ? AND (? IS NULL OR trip_id = ?) AND (? IS NULL OR date = ?)').get(a,b,trip_id,trip_id,date,date) || { times: 0 };
          score += Math.min(2, row.times || 0);
          const ra = typeof pa.average_rating === 'number' ? pa.average_rating : null;
          const rb = typeof pb.average_rating === 'number' ? pb.average_rating : null;
          if (ra != null && rb != null) {
            const avg = (ra + rb) / 2;
            if (avg >= 4.5) score += 0.8; else if (avg >= 4.0) score += 0.5; else if (avg >= 3.0) score += 0.2; else if (avg < 2.0) score -= 1; else if (avg < 2.5) score -= 0.5;
          }
          pairs.push({ a, b, score });
        }
      }
      pairs.sort((x,y)=>y.score - x.score);
      return res.json(pairs);
    } catch (e) { return res.status(500).json({ error: 'Server error' }); }
  });

  // Groups page data (HTML fallback left in server.js if needed) – JSON only here
  app.get('/admin/groups', (req, res) => {
    if (!checkAdminAuth(req)) return res.status(403).send('Forbidden');
    try {
      if (!bookingsDb) return res.status(500).json({ error: 'DB not available' });
      const trip_id = req.query.trip_id || null;
      const date = req.query.date || null;
      // HTML fallback (parity with original inline route) if Accept asks for text/html
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
        const root = require('path').join(__dirname, '..', '..', '..');
        return res.sendFile(require('path').join(root, 'public', 'admin-groups.html'));
      }
      const groups = bookingsDb.prepare('SELECT id,trip_id,date,travelers,locked,created_at FROM groups WHERE (? IS NULL OR trip_id = ?) AND (? IS NULL OR date = ?) ORDER BY created_at DESC').all(trip_id, trip_id, date, date)
        .map(g => ({...g, travelers: (()=>{ try { return JSON.parse(g.travelers||'[]'); } catch(_){ return []; } })()}));
      let travelers = [];
      if (trip_id && date) {
        const rows = bookingsDb.prepare('SELECT user_name AS name, user_email AS email FROM bookings WHERE status = ? AND trip_id = ? AND date = ? AND grouped = 0').all('confirmed', trip_id, date);
        travelers = rows.map(r => {
          const p = bookingsDb.prepare('SELECT language, traveler_type, sociality, average_rating FROM travelers WHERE email = ?').get(r.email) || {};
          return { name: r.name || r.email, email: r.email, ...p };
        });
      }
      return res.json({ groups, travelers });
    } catch (e) { return res.status(500).json({ error: 'Server error' }); }
  });

  // Create/update groups
  app.post('/admin/groups', express.json(), (req, res) => {
    if (!checkAdminAuth(req)) return res.status(403).send('Forbidden');
    try {
      if (!bookingsDb) return res.status(500).json({ error: 'DB not available' });
      const { op, id, trip_id, date, travelers, lock } = req.body || {};
      if (!trip_id || !date) return res.status(400).json({ error: 'Missing trip_id/date' });
      const now = new Date().toISOString();
      if (op === 'create') {
        const gid = crypto.randomUUID();
        const arr = Array.isArray(travelers) ? travelers : [];
        bookingsDb.prepare('INSERT INTO groups (id,trip_id,date,travelers,locked,created_at) VALUES (?,?,?,?,?,?)').run(gid, trip_id, date, JSON.stringify(arr), 0, now);
        return res.json({ ok: true, id: gid });
      }
      if (op === 'update' && id) {
        const arr = Array.isArray(travelers) ? travelers : null;
        if (arr) bookingsDb.prepare('UPDATE groups SET travelers = ? WHERE id = ?').run(JSON.stringify(arr), id);
        if (lock === true) {
          bookingsDb.prepare('UPDATE groups SET locked = 1 WHERE id = ?').run(id);
          try {
            const g = bookingsDb.prepare('SELECT travelers FROM groups WHERE id = ?').get(id);
            const emails = g && g.travelers ? JSON.parse(g.travelers) : [];
            if (Array.isArray(emails) && emails.length) {
              const mark = bookingsDb.prepare('UPDATE bookings SET grouped = 1 WHERE user_email = ? AND trip_id = ? AND date = ?');
              emails.forEach(em => { try { mark.run(em, trip_id, date); } catch(_){ } });
            }
          } catch (_) {}
        }
        return res.json({ ok: true });
      }
      return res.status(400).json({ error: 'Invalid op' });
    } catch (e) { return res.status(500).json({ error: 'Server error' }); }
  });

  // Feedback submit
  app.post('/api/feedback', express.json(), (req, res) => {
    try {
      if (!bookingsDb) return res.status(500).json({ error: 'DB not available' });
      const { trip_id, traveler_email, rating, comment } = req.body || {};
      if (!trip_id || !traveler_email) return res.status(400).json({ error: 'Missing trip_id or traveler_email' });
      let r = rating;
      if (typeof r === 'string') {
        const x = r.toLowerCase();
        if (x === 'positive') r = 5; else if (x === 'neutral') r = 3; else if (x === 'negative') r = 1;
      }
      r = parseInt(r,10);
      if (!isFinite(r) || r < 1 || r > 5) r = 3;
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      bookingsDb.prepare('INSERT INTO feedback (id,trip_id,traveler_email,rating,comment,created_at) VALUES (?,?,?,?,?,?)').run(id, trip_id, traveler_email, r, comment || null, now);
      try { const agg = bookingsDb.prepare('SELECT AVG(rating) as avg FROM feedback WHERE traveler_email = ?').get(traveler_email); const avg = agg && typeof agg.avg === 'number' ? agg.avg : null; if (avg != null) bookingsDb.prepare('UPDATE travelers SET average_rating = ? WHERE email = ?').run(avg, traveler_email); } catch(_){ }
      return res.json({ ok: true, id });
    } catch (e) { return res.status(500).json({ error: 'Server error' }); }
  });

  // Feedback list (admin)
  app.get('/admin/feedback', (req, res) => {
    if (!checkAdminAuth(req)) return res.status(403).send('Forbidden');
    try {
      if (!bookingsDb) return res.status(500).json({ error: 'DB not available' });
      const rows = bookingsDb.prepare('SELECT id,trip_id,traveler_email,rating,comment,created_at FROM feedback ORDER BY created_at DESC').all();
      return res.json(rows);
    } catch (e) { return res.status(500).json({ error: 'Server error' }); }
  });
}

module.exports = { registerAdminTravelersGroups };
