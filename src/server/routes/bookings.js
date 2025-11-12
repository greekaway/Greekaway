'use strict';
// Phase 5: Extract public booking endpoints preserving original logic.
// registerBookings(app, { express, bookingsDb, crypto })

function registerBookings(app, deps) {
  const { express, bookingsDb, crypto } = deps;
  if (!app) throw new Error('registerBookings: missing app');

  // Create booking (verbatim port of original complex logic)
  // Ensure JSON error responses even if body parsing fails
  app.post('/api/bookings', (req, res) => {
    try {
      const { user_name, user_email, trip_id, seats, price_cents, currency } = req.body || {};
      // Traveler profile fields from step2 (optional) + mapping helpers
      const mapTravelerType = (v) => { if (!v) return null; const x = String(v).toLowerCase(); if (x === 'explorer') return 'explore'; if (x === 'relaxed') return 'relax'; return x; };
      const mapInterest = (v) => { if (!v) return null; const x = String(v).toLowerCase(); if (x === 'cultural') return 'culture'; if (x === 'nature') return 'nature'; return x; };
      const mapSocial = (style, tempo) => { const s = style ? String(style).toLowerCase() : ''; const t = tempo ? String(tempo).toLowerCase() : ''; if (s === 'sociable' || t === 'talkative') return 'social'; if (s === 'quiet' || t === 'reserved') return 'quiet'; return null; };
      const language = req.body.language || req.body.preferredLanguage || null;
      const traveler_type = req.body.traveler_type || mapTravelerType(req.body.travelerProfile) || null;
      const interest = req.body.interest || mapInterest(req.body.travelStyle) || null;
      const sociality = req.body.sociality || mapSocial(req.body.travelStyle, req.body.travelTempo) || null;
      const childrenAges = Array.isArray(req.body.children_ages) ? req.body.children_ages : (typeof req.body.children_ages === 'string' ? req.body.children_ages : null);
      const profile = { language, age_group: req.body.age_group || null, traveler_type, interest, sociality, children_ages: childrenAges, user_email, user_name };
      const metadata = req.body.metadata || profile;
      if (!user_name || !user_email || !trip_id) return res.status(400).json({ error: 'Missing required fields' });
      let date = req.body.date || new Date().toISOString().slice(0,10);
      // Capacity checks (provider + legacy trip capacity)
      try {
        if (bookingsDb && trip_id) {
          let providerId = null;
            try { const map = bookingsDb.prepare('SELECT partner_id FROM partner_mappings WHERE trip_id = ?').get(trip_id); providerId = map && map.partner_id ? map.partner_id : null; } catch(_){ }
          if (providerId) {
            let capSum = 0, rowCount = 0;
            try {
              const r = bookingsDb.prepare('SELECT COALESCE(SUM(COALESCE(capacity,0)),0) AS cap, COUNT(1) AS cnt FROM provider_availability WHERE provider_id = ? AND (date = ? OR available_date = ?)').get(providerId, date, date) || { cap: 0, cnt: 0 };
              capSum = (typeof r.cap === 'number') ? r.cap : 0; rowCount = (typeof r.cnt === 'number') ? r.cnt : 0;
            } catch(_) {}
            if (rowCount > 0) {
              const takenRow = bookingsDb.prepare("SELECT COALESCE(SUM(seats),0) as s FROM bookings WHERE partner_id = ? AND date = ? AND status != 'canceled'").get(providerId, date) || { s: 0 };
              const taken = takenRow.s || 0; const requested = seats || 1;
              if ((taken + requested) > capSum || capSum <= 0) { return res.status(409).json({ error: 'No availability for selected date' }); }
            }
          }
        }
        if (bookingsDb) {
          const capRow = bookingsDb.prepare('SELECT capacity FROM capacities WHERE trip_id = ? AND date = ?').get(trip_id, date);
          if (capRow && typeof capRow.capacity === 'number') {
            const capacity = capRow.capacity || 0;
            const taken = bookingsDb.prepare('SELECT COALESCE(SUM(seats),0) as s FROM bookings WHERE trip_id = ? AND date = ? AND status != ?').get(trip_id, date, 'canceled').s || 0;
            if ((taken + (seats || 1)) > capacity) return res.status(409).json({ error: 'No availability for selected date' });
          }
        }
      } catch (e) { console.warn('Capacity check failed', e && e.message ? e.message : e); }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      if (!bookingsDb) return res.status(500).json({ error: 'Bookings DB not available' });
      // Partner mapping + structured columns
      let providerId = null; try { const m = bookingsDb.prepare('SELECT partner_id FROM partner_mappings WHERE trip_id = ?').get(trip_id); providerId = m && m.partner_id ? m.partner_id : null; } catch(_){ }
      const body = req.body || {};
      const metaObj = (() => { try { return metadata && typeof metadata === 'object' ? metadata : (metadata ? JSON.parse(String(metadata)) : {}); } catch(_) { return {}; } })();
      const pickStr = (...arr) => { const v = arr.find(x => x != null && String(x).trim() !== ''); return v == null ? '' : String(v); };
      const toNum = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
      const pickup_location = pickStr(body.pickup_location, body.pickup_point, body.pickup_address, body.pickup, body.from, body.start_location, metaObj.pickup_location, metaObj.pickup_point, metaObj.pickup_address, metaObj.pickup, metaObj.from, metaObj.start_location);
      const pickup_lat = toNum(body.pickup_lat ?? metaObj.pickup_lat);
      const pickup_lng = toNum(body.pickup_lng ?? metaObj.pickup_lng);
      const suitcases_raw = (body.suitcases ?? metaObj.suitcases ?? metaObj.luggage);
      const suitcases_json = Array.isArray(suitcases_raw) ? JSON.stringify(suitcases_raw) : (suitcases_raw && typeof suitcases_raw === 'object' ? JSON.stringify(suitcases_raw) : JSON.stringify(suitcases_raw == null || suitcases_raw === '' ? [] : [String(suitcases_raw)]));
      const special_requests = pickStr(body.special_requests, body.notes, metaObj.special_requests, metaObj.notes);
      const sourceVal = (typeof body.source === 'string' && body.source.trim()) ? String(body.source).trim() : (metaObj.source && String(metaObj.source).trim()) || null;
      const looksDemo = (() => { const m = (s) => (s||'').toString().toLowerCase(); const hasDemo = (s) => /demo|test|example\.com/.test(m(s)); return !!(hasDemo(user_email) || hasDemo(user_name) || hasDemo(sourceVal) || (metaObj && (metaObj.is_demo === true || metaObj.demo === true))); })();
      const finalSource = sourceVal || (looksDemo ? 'demo' : null);
      let inserted = false;
      if (providerId) {
        try {
          const insertWithPartner = bookingsDb.prepare('INSERT INTO bookings (id,status,payment_intent_id,event_id,user_name,user_email,trip_id,seats,price_cents,currency,metadata,created_at,updated_at,date,grouped,payment_type,partner_id,partner_share_cents,commission_cents,payout_status,payout_date,"__test_seed",seed_source,pickup_location,pickup_lat,pickup_lng,suitcases_json,special_requests) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
          insertWithPartner.run(id, 'pending', null, null, user_name, user_email, trip_id, seats || 1, price_cents || 0, currency || 'eur', metadata ? JSON.stringify(metadata) : null, now, now, date, 0, null, providerId, null, null, null, null, 0, null, pickup_location, pickup_lat, pickup_lng, suitcases_json, special_requests);
          inserted = true;
        } catch(_) { /* fallback below */ }
      }
      if (!inserted) {
        try {
          const insert2 = bookingsDb.prepare('INSERT INTO bookings (id,status,payment_intent_id,event_id,user_name,user_email,trip_id,seats,price_cents,currency,metadata,created_at,updated_at,date,grouped,payment_type,partner_id,partner_share_cents,commission_cents,payout_status,payout_date,"__test_seed",seed_source,pickup_location,pickup_lat,pickup_lng,suitcases_json,special_requests) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
          insert2.run(id, 'pending', null, null, user_name, user_email, trip_id, seats || 1, price_cents || 0, currency || 'eur', metadata ? JSON.stringify(metadata) : null, now, now, date, 0, null, null, null, null, null, null, 0, null, pickup_location, pickup_lat, pickup_lng, suitcases_json, special_requests);
        } catch(_e) {
          const insertLegacy = bookingsDb.prepare('INSERT INTO bookings (id,status,date,payment_intent_id,event_id,user_name,user_email,trip_id,seats,price_cents,currency,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
          insertLegacy.run(id, 'pending', date, null, null, user_name, user_email, trip_id, seats || 1, price_cents || 0, currency || 'eur', metadata ? JSON.stringify(metadata) : null, now, now);
        }
      }
      try { bookingsDb.prepare('UPDATE bookings SET pickup_location = ?, pickup_lat = ?, pickup_lng = ?, suitcases_json = ?, special_requests = ? WHERE id = ?').run(pickup_location || '', pickup_lat, pickup_lng, suitcases_json || '[]', special_requests || '', id); } catch(_){ }
      try { const setDemo = bookingsDb.prepare('UPDATE bookings SET is_demo = COALESCE(is_demo, ?), source = COALESCE(?, source) WHERE id = ?'); setDemo.run(looksDemo ? 1 : 0, finalSource, id); } catch(_){ }
      return res.json({ bookingId: id, status: 'pending' });
    } catch (e) {
      console.error('Create booking error', e && e.stack ? e.stack : e);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // Availability endpoint
  app.get('/api/availability', (req, res) => {
    try {
      const trip_id = req.query.trip_id;
      const date = req.query.date || new Date().toISOString().slice(0,10);
      if (!trip_id) return res.status(400).json({ error: 'Missing trip_id' });
      if (!bookingsDb) return res.status(500).json({ error: 'Bookings DB not available' });
      const capRow = bookingsDb.prepare('SELECT capacity FROM capacities WHERE trip_id = ? AND date = ?').get(trip_id, date) || {};
      const capacity = (typeof capRow.capacity === 'number' && capRow.capacity > 0) ? capRow.capacity : 7;
      const takenRow = bookingsDb.prepare('SELECT COALESCE(SUM(seats),0) as s FROM bookings WHERE trip_id = ? AND date = ? AND status = ?').get(trip_id, date, 'confirmed') || { s: 0 };
      return res.json({ trip_id, date, capacity, taken: takenRow.s || 0 });
    } catch (e) { console.error('Availability error', e); return res.status(500).json({ error: 'Server error' }); }
  });

  // Get booking by id
  app.get('/api/bookings/:id', (req, res) => {
    try {
      if (!bookingsDb) return res.status(500).json({ error: 'Bookings DB not available' });
      const row = bookingsDb.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      if (row.metadata) { try { row.metadata = JSON.parse(row.metadata); } catch(_){} }
      if (row && typeof row.suitcases_json === 'string') { try { row.suitcases = JSON.parse(row.suitcases_json); } catch(_) { row.suitcases = []; } }
      return res.json(row);
    } catch (e) { console.error('Get booking error', e && e.stack ? e.stack : e); return res.status(500).json({ error: 'Server error' }); }
  });
}

module.exports = { registerBookings };
