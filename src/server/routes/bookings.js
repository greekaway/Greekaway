'use strict';
// Phase 5: Extract public booking endpoints preserving original logic.
// registerBookings(app, { express, bookingsDb, crypto })

function registerBookings(app, deps) {
  const { express, bookingsDb, crypto, checkAdminAuth } = deps;
  if (!app) throw new Error('registerBookings: missing app');
  // Lazy-load policy utilities to avoid heavy requires on startup
  const policyService = (()=>{ try { return require('../../../services/policyService'); } catch(_) { return null; } })();
  const adminSse = (()=>{ try { return require('../../../services/adminSse'); } catch(_) { return null; } })();
  const distanceSvc = (()=>{ try { return require('../../../services/distance'); } catch(_) { return null; } })();
  const fs = require('fs');
  const path = require('path');
  const ROOT_DIR = path.join(__dirname, '..', '..', '..');
  const TRIPS_DIR = path.join(ROOT_DIR, 'data', 'trips');
  function readTrip(slug){
    try {
      const s = String(slug||'').trim();
      if (!s || s === '_template') return null;
      const file = path.join(TRIPS_DIR, s + '.json');
      if (!fs.existsSync(file)) return null;
      const raw = fs.readFileSync(file,'utf8');
      const obj = JSON.parse(raw||'null');
      return obj || null;
    } catch(_) { return null; }
  }
  function normMode(m){
    const x = String(m || '').toLowerCase();
    if (x === 'private' || x === 'mercedes/private') return 'mercedes';
    if (x === 'multi' || x === 'shared') return 'van';
    if (x === 'mercedes' || x === 'van' || x === 'bus') return x;
    return '';
  }
  function getDefaultCapacityForMode(trip, mode){
    try {
      const ms = trip && trip.mode_set ? trip.mode_set : null; if (!ms) return 0; const m = ms[mode]; if (!m) return 0;
      let n = parseInt(m.default_capacity,10);
      if (!Number.isFinite(n) || n <= 0) n = 0;
      if (mode === 'mercedes') return getMercedesFleetSize(trip);
      return n > 0 ? n : 0;
    } catch(_){ return 0; }
  }
  function isModeActive(trip, mode){ try { return !!(trip && trip.mode_set && trip.mode_set[mode] && trip.mode_set[mode].active); } catch(_){ return false; } }

  function getMercedesFleetSize(trip){
    const direct = parseInt(trip && trip.modeSettings && trip.modeSettings.mercedes && trip.modeSettings.mercedes.fleetSize, 10);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const modeSetVal = parseInt(trip && trip.mode_set && trip.mode_set.mercedes && trip.mode_set.mercedes.default_capacity, 10);
    if (Number.isFinite(modeSetVal) && modeSetVal > 0) return modeSetVal;
    const modeBlock = trip && trip.modes && trip.modes.mercedes;
    const capacityFromMode = parseInt(modeBlock && modeBlock.capacity, 10);
    if (Number.isFinite(capacityFromMode) && capacityFromMode > 0) return capacityFromMode;
    return 1;
  }

  function readMercedesAvailabilityRow(tripId, dateStr){
    if (!bookingsDb || !tripId || !dateStr) return null;
    try {
      const row = bookingsDb.prepare('SELECT id, trip_id, date, total_fleet, remaining_fleet, updatedAt FROM mercedes_availability WHERE trip_id = ? AND date = ?').get(tripId, dateStr);
      return row || null;
    } catch(_){ return null; }
  }

  function ensureMercedesAvailabilityRow(tripId, dateStr, trip){
    if (!bookingsDb || !tripId || !dateStr) return null;
    const targetTotal = Math.max(0, parseInt(getMercedesFleetSize(trip), 10) || 0);
    let row = readMercedesAvailabilityRow(tripId, dateStr);
    if (!row) {
      const now = new Date().toISOString();
      const id = (crypto && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : `${tripId}-${dateStr}-${Date.now()}`;
      try {
        bookingsDb.prepare('INSERT OR IGNORE INTO mercedes_availability (id, trip_id, date, total_fleet, remaining_fleet, updatedAt) VALUES (?,?,?,?,?,?)').run(id, tripId, dateStr, targetTotal, targetTotal, now);
      } catch(_){ }
      row = readMercedesAvailabilityRow(tripId, dateStr);
      if (row) return row;
      return { id, trip_id: tripId, date: dateStr, total_fleet: targetTotal, remaining_fleet: targetTotal, updatedAt: now };
    }
    const storedTotal = Number.isFinite(parseInt(row.total_fleet, 10)) ? parseInt(row.total_fleet, 10) : 0;
    if (storedTotal !== targetTotal) {
      const now = new Date().toISOString();
      const remaining = Number.isFinite(parseInt(row.remaining_fleet, 10)) ? parseInt(row.remaining_fleet, 10) : 0;
      const delta = targetTotal - storedTotal;
      const adjustedRemaining = Math.max(0, remaining + delta);
      try {
        bookingsDb.prepare('UPDATE mercedes_availability SET total_fleet = ?, remaining_fleet = ?, updatedAt = ? WHERE trip_id = ? AND date = ?').run(targetTotal, adjustedRemaining, now, tripId, dateStr);
        row.total_fleet = targetTotal;
        row.remaining_fleet = adjustedRemaining;
        row.updatedAt = now;
      } catch(_){ }
    }
    return row;
  }

  function computeModeAvailability(tripId, dateStr, mode, tripData, options = {}) {
    if (!tripId || !dateStr) return { capacity: 0, taken: 0, available: 0 };
    const normalizedMode = normMode(mode || '');
    if (!normalizedMode) return { capacity: 0, taken: 0, available: 0 };
    const trip = tripData || readTrip(tripId) || {};
    if (normalizedMode === 'mercedes') {
      const ensureRow = options.ensureMercedesRow === true;
      const row = ensureRow
        ? ensureMercedesAvailabilityRow(tripId, dateStr, trip)
        : readMercedesAvailabilityRow(tripId, dateStr);
      const fallbackFleet = Math.max(0, getMercedesFleetSize(trip));
      const totalFleet = row && Number.isFinite(parseInt(row.total_fleet, 10))
        ? Math.max(0, parseInt(row.total_fleet, 10))
        : fallbackFleet;
      const remainingFleet = row && Number.isFinite(parseInt(row.remaining_fleet, 10))
        ? Math.max(0, parseInt(row.remaining_fleet, 10))
        : totalFleet;
      const takenFleet = Math.max(0, totalFleet - remainingFleet);
      return { capacity: totalFleet, taken: takenFleet, available: remainingFleet, total_fleet: totalFleet, remaining_fleet: remainingFleet };
    }
    let capacity = 0;
    let takenOverride = null;
    try {
      const row = bookingsDb.prepare('SELECT capacity, taken_custom FROM mode_availability WHERE trip_id = ? AND date = ? AND mode = ?').get(tripId, dateStr, normalizedMode) || {};
      if (typeof row.capacity === 'number' && row.capacity > 0) capacity = row.capacity;
      if (typeof row.taken_custom === 'number' && row.taken_custom >= 0) takenOverride = row.taken_custom;
    } catch(_){ }
    if (!capacity) capacity = getDefaultCapacityForMode(trip, normalizedMode) || 0;
    let taken = 0;
    if (takenOverride != null) {
      taken = takenOverride;
    } else {
      try {
        const rows = bookingsDb.prepare("SELECT seats, metadata, status FROM bookings WHERE trip_id = ? AND date = ? AND status != 'canceled'").all(tripId, dateStr) || [];
        rows.forEach(r => {
          let m = '';
          try {
            const meta = r && r.metadata ? JSON.parse(r.metadata) : null;
            const mm = (meta && (meta.trip_mode || meta.mode || meta.vehicle_type)) || '';
            m = normMode(mm);
          } catch(_){ m = ''; }
          if (m !== normalizedMode) return;
          if (normalizedMode === 'mercedes') taken += 1;
          else taken += (parseInt(r.seats, 10) || 0);
        });
      } catch(_){ }
    }
    const available = Math.max(0, (capacity || 0) - (taken || 0));
    return { capacity: capacity || 0, taken: taken || 0, available };
  }

  // Ensure per-mode availability table exists
  try {
    if (bookingsDb) {
      bookingsDb.exec(`CREATE TABLE IF NOT EXISTS mode_availability (
        trip_id TEXT NOT NULL,
        date TEXT NOT NULL,
        mode TEXT NOT NULL,
        capacity INTEGER NOT NULL,
        taken_custom INTEGER,
        updated_at TEXT,
        PRIMARY KEY (trip_id, date, mode)
      )`);
      // Ensure taken_custom column exists (for legacy deployments)
      try { bookingsDb.exec('ALTER TABLE mode_availability ADD COLUMN taken_custom INTEGER'); } catch(_){ /* ignore if exists */ }
    }
  } catch(_){ }
  function readTripStops(tripId){
    try {
      if (!tripId) return [];
      const root = path.join(__dirname, '../../..');
      const tryNames = [ `${tripId}.json` ];
      if (/_demo$/.test(tripId)) tryNames.push(`${tripId.replace(/_demo$/, '')}.json`);
      if (/_test$/.test(tripId)) tryNames.push(`${tripId.replace(/_test$/, '')}.json`);
      let filePath = null;
      for (const name of tryNames){ const cand = path.join(root, 'public', 'data', 'trips', name); if (fs.existsSync(cand)) { filePath = cand; break; } }
      if (!filePath) return [];
      const raw = fs.readFileSync(filePath, 'utf8');
      const json = JSON.parse(raw);
      const arr = Array.isArray(json.stops) ? json.stops : [];
      return arr.map((s, i) => ({
        type: 'tour_stop',
        label: s.label || s.title || (typeof s.name === 'string' ? s.name : (s.name && (s.name.el || s.name.en))) || `Στάση ${i+1}`,
        address: s.address || s.location || '',
        arrival_time: s.arrival_time || s.time || null,
        departure_time: s.departure_time || null,
        lat: s.lat ?? s.latitude ?? null,
        lng: s.lng ?? s.longitude ?? null,
      }));
    } catch(_) { return []; }
  }
  function addMinutes(hhmm, minutes){
    try { const [h,m]=(String(hhmm||'00:00')).split(':').map(x=>parseInt(x,10)||0); const d=new Date(); d.setHours(h,m,0,0); d.setMinutes(d.getMinutes()+minutes); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); } catch(_){ return hhmm; }
  }

  const SUITCASE_LABELS = { small: 'Small', medium: 'Medium', large: 'Large' };
  function formatSuitcaseLabel(type){
    const key = String(type || '').toLowerCase();
    if (SUITCASE_LABELS[key]) return SUITCASE_LABELS[key];
    if (!key) return 'Bag';
    return key.charAt(0).toUpperCase() + key.slice(1);
  }
  function normalizeSuitcasesArray(value){
    const tokens = [];
    const pushToken = (text) => {
      const cleaned = (text == null) ? '' : String(text).trim();
      if (cleaned) tokens.push(cleaned);
    };
    const pushCount = (type, count) => {
      const qty = Number(count);
      if (!Number.isFinite(qty) || qty <= 0) return;
      const label = formatSuitcaseLabel(type);
      tokens.push(`${qty}×${label}`);
    };
    const coerce = (input) => {
      if (Array.isArray(input)) {
        input.forEach((item) => {
          if (typeof item === 'string' || typeof item === 'number') pushToken(item);
          else if (item && typeof item === 'object') {
            if ('type' in item && 'count' in item) pushCount(item.type, item.count);
            else Object.entries(item).forEach(([k, v]) => pushCount(k, v));
          }
        });
        return;
      }
      if (!input) return;
      if (typeof input === 'string') {
        const trimmed = input.trim();
        if (!trimmed) return;
        if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
          try { coerce(JSON.parse(trimmed)); return; } catch(_){ }
        }
        pushToken(trimmed);
        return;
      }
      if (typeof input === 'number') { pushToken(input); return; }
      if (typeof input === 'object') {
        Object.entries(input).forEach(([k, v]) => pushCount(k, v));
      }
    };
    coerce(value);
    return tokens;
  }

  // Create booking (verbatim port of original complex logic)
  // Ensure JSON error responses even if body parsing fails
  app.post('/api/bookings', async (req, res) => {
    try {
      const { user_name, user_email, trip_id, seats, price_cents, currency, vehicleType, vehicle_type, mode: rawMode } = req.body || {};
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

      // Read policies.json and apply basic checks for multi-pickup and capacity
      const policies = policyService && policyService.loadPolicies ? (policyService.loadPolicies() || {}) : {};
      const tripExec = policies.trip_execution || {};
      const pickupPolicy = policies.pickup_policy || {};

      // Normalize pickup_points from body or metadata
      let pickup_points = null;
      try {
        if (Array.isArray(req.body.pickup_points)) pickup_points = req.body.pickup_points;
        else if (typeof req.body.pickup_points === 'string') pickup_points = JSON.parse(req.body.pickup_points);
        else if (metadata && typeof metadata === 'object' && Array.isArray(metadata.pickup_points)) pickup_points = metadata.pickup_points;
      } catch(_) {}

      // If pickup_points provided, compute total pax + validate distance/time
      let effectiveSeats = (typeof seats === 'number' ? seats : Number(seats)) || null;
      let policyFlags = [];
      if (Array.isArray(pickup_points) && pickup_points.length) {
        const totalPax = pickup_points.reduce((acc, p) => acc + (Number(p.pax||1) || 1), 0);
        if (!effectiveSeats || !Number.isFinite(effectiveSeats)) effectiveSeats = totalPax;

        // Distance validation (only if we have lat/lng on points)
        try {
          const coords = pickup_points.filter(p => p && p.lat != null && p.lng != null);
          const maxKm = Number(tripExec.max_pickup_distance_km || 0) || 0;
          if (maxKm && coords.length >= 2) {
            let violation = false;
            for (let i=0;i<coords.length;i++){
              for (let j=i+1;j<coords.length;j++){
                const d = policyService && policyService.haversineKm ? policyService.haversineKm(coords[i], coords[j]) : null;
                if (d != null && d > maxKm) { violation = true; break; }
              }
              if (violation) break;
            }
            if (violation) policyFlags.push({ code: 'pickup_distance_exceeded', message: `Υπέρβαση απόστασης pickups (> ${maxKm} km)` });
          }
        } catch(_) {}

        // Time difference validation (sequential heuristic)
        try {
          const maxMin = Number(tripExec.max_pickup_time_difference_minutes || 0) || 0;
          if (maxMin && distanceSvc && distanceSvc.getTravelSeconds && pickup_points.length >= 2) {
            let maxSec = 0;
            for (let i=0;i<pickup_points.length-1;i++){
              const a = pickup_points[i], b = pickup_points[i+1];
              // getTravelSeconds tolerates missing coords via haversine fallback or default 10min
              const sec = await distanceSvc.getTravelSeconds({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
              if (sec > maxSec) maxSec = sec;
            }
            if (maxSec > (maxMin*60)) policyFlags.push({ code:'pickup_time_exceeded', message:`Χρονική απόκλιση pickups > ${maxMin} λεπτά (≈ ${Math.round(maxSec/60)}')` });
          }
        } catch(_) {}
      }

      // Capacity policy (min/max participants) based on effectiveSeats
      const minP = Number(tripExec.min_participants || 0) || 0;
      const maxP = Number(tripExec.max_participants || 0) || 0;
      let statusPolicy = null;
      if (minP && (effectiveSeats||0) < minP) statusPolicy = 'pending_fill';
      if (maxP && (effectiveSeats||0) > maxP) statusPolicy = 'over_capacity';
      // Capacity checks (mode-based + provider + legacy trip capacity)
      try {
        // Mode-based check: enforce per-mode availability
        const modeIn = normMode(rawMode || req.body.mode || req.body.trip_mode || '');
        if (modeIn) {
          const trip = readTrip(trip_id);
          if (!isModeActive(trip, modeIn)) {
            return res.status(409).json({ error: 'Mode not available' });
          }
          let capacityUnits = 0;
          try {
            const row = bookingsDb.prepare('SELECT capacity FROM mode_availability WHERE trip_id = ? AND date = ? AND mode = ?').get(trip_id, date, modeIn) || {};
            if (typeof row.capacity === 'number' && row.capacity > 0) capacityUnits = row.capacity;
          } catch(_){ }
          if (!capacityUnits) capacityUnits = getDefaultCapacityForMode(trip, modeIn) || 0;
          // taken units for this mode/date
          let takenUnits = 0;
          try {
            const rows = bookingsDb.prepare("SELECT seats, metadata FROM bookings WHERE trip_id = ? AND date = ? AND status != 'canceled'").all(trip_id, date) || [];
            rows.forEach(r => {
              let m = '';
              try { const meta = r && r.metadata ? JSON.parse(r.metadata) : null; const mm = (meta && (meta.trip_mode || meta.mode || meta.vehicle_type)) || ''; m = normMode(mm); } catch(_){ m=''; }
              if (m !== modeIn) return;
              if (modeIn === 'mercedes') takenUnits += 1; else takenUnits += (parseInt(r.seats,10) || 0);
            });
          } catch(_){ }
          const chargeType = (trip && trip.mode_set && trip.mode_set[modeIn] && trip.mode_set[modeIn].charge_type) || 'per_person';
          const seatsReq = Number(seats || 1) || 1;
          const requestedUnits = (chargeType === 'per_vehicle') ? 1 : seatsReq;
          if (capacityUnits <= 0 || (takenUnits + requestedUnits) > capacityUnits) {
            const code = modeIn==='bus' ? 'bus_full' : (modeIn==='van' ? 'van_full' : 'mercedes_full');
            return res.status(409).json({ error: code });
          }
        }
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
  // Attach trip_mode if provided (front-end stores in localStorage and posts with booking)
  try {
    const tripMode = normMode(body.mode || body.trip_mode || body.tripMode || null);
    if (tripMode && !metaObj.trip_mode) metaObj.trip_mode = String(tripMode).toLowerCase();
  } catch(_) { /* non-fatal */ }
  // Attach policy flags and pickup_points to metadata for UI visibility
  if (Array.isArray(policyFlags) && policyFlags.length) metaObj.policy_flags = policyFlags;
  if (Array.isArray(pickup_points) && pickup_points.length) metaObj.pickup_points = pickup_points;
  metaObj.policy_checked_at = now;
      // Permanent rule: store a unified full route (pickups + tour stops + times) in metadata.route.full_path
      try {
        // If client provided structured stops, prefer them; else synthesize from pickup_points and basic timing
        const stopsIn = Array.isArray(metaObj.stops) ? metaObj.stops : null;
        const pickupTimeStr = String(metaObj.pickup_time || body.pickup_time || '').slice(0,5) || null;
        let full = [];
        if (stopsIn && stopsIn.length){
          full = stopsIn.map((s, i) => ({
            label: s.label || s.name || s.customer || `Στάση ${i+1}`,
            address: s.address || s.pickup || s.location || '',
            lat: s.lat ?? s.latitude ?? null,
            lng: s.lng ?? s.longitude ?? null,
            arrival_time: s.arrival_time || s.time || s.scheduled_time || null,
            departure_time: s.departure_time || null,
            type: (String(s.type||'').toLowerCase()==='pickup' || /παραλαβή/i.test(String(s.name||''))) ? 'pickup' : 'tour_stop',
          }));
        } else if (Array.isArray(pickup_points) && pickup_points.length) {
          const inc = 20; // 20' per pickup as default heuristic
          let t0 = pickupTimeStr || '09:00';
          full = pickup_points.map((p, i) => ({
            label: `Παραλαβή: ${p.address || ''}`.trim(),
            address: p.address || '',
            lat: p.lat ?? null,
            lng: p.lng ?? null,
            arrival_time: i===0 ? t0 : addMinutes(t0, i*inc),
            departure_time: null,
            type: 'pickup'
          }));
          // Append trip-defined tour stops (from public/data/trips/*.json) after pickups
          const tripStops = readTripStops(trip_id);
          if (tripStops.length){
            let prevTime = (full[full.length-1] && full[full.length-1].arrival_time) || t0;
            const fallbackInc = 45;
            tripStops.forEach((ts, idx) => {
              const at = ts.arrival_time || addMinutes(prevTime, fallbackInc);
              full.push({ type:'tour_stop', label: ts.label || `Στάση ${idx+1}`, address: ts.address || '', arrival_time: at, departure_time: ts.departure_time || null, lat: ts.lat ?? null, lng: ts.lng ?? null });
              prevTime = at || prevTime;
            });
          } else {
            // Fallback: append a synthetic first tour stop
            const last = full[full.length-1];
            const arrival = last ? addMinutes(last.arrival_time || t0, inc) : addMinutes(t0, inc);
            const tourLabel = metaObj.tour_title || trip_id || 'Έναρξη εκδρομής';
            const tourAddr = metaObj.dropoff_point || metaObj.to || metaObj.end_location || metaObj.pickup_location || '';
            full.push({ label: `Στάση: ${tourLabel}`, address: tourAddr, lat: null, lng: null, arrival_time: arrival, departure_time: null, type: 'tour_stop' });
          }
        }
        if (!metaObj.route) metaObj.route = {};
        metaObj.route.full_path = full;
        // For backward-compatibility with existing Driver Panel, also expose as metadata.stops when not present
        if (!Array.isArray(metaObj.stops) || !metaObj.stops.length) {
          metaObj.stops = full.map((r) => ({ name: r.label, address: r.address, time: r.arrival_time, type: r.type, lat: r.lat, lng: r.lng }));
        }
      } catch(_){ /* non-fatal */ }
      const pickStr = (...arr) => { const v = arr.find(x => x != null && String(x).trim() !== ''); return v == null ? '' : String(v); };
      const toNum = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
      const pickup_location = pickStr(body.pickup_location, body.pickup_point, body.pickup_address, body.pickup, body.from, body.start_location, metaObj.pickup_location, metaObj.pickup_point, metaObj.pickup_address, metaObj.pickup, metaObj.from, metaObj.start_location);
      const pickup_lat = toNum(body.pickup_lat ?? metaObj.pickup_lat);
      const pickup_lng = toNum(body.pickup_lng ?? metaObj.pickup_lng);
      const suitcases_raw = (body.suitcases ?? metaObj.suitcases ?? metaObj.luggage);
      const suitcases_list = normalizeSuitcasesArray(suitcases_raw);
      const suitcases_json = JSON.stringify(suitcases_list);
      const special_requests = pickStr(body.special_requests, body.notes, metaObj.special_requests, metaObj.notes);
      const sourceVal = (typeof body.source === 'string' && body.source.trim()) ? String(body.source).trim() : (metaObj.source && String(metaObj.source).trim()) || null;
      const looksDemo = (() => { const m = (s) => (s||'').toString().toLowerCase(); const hasDemo = (s) => /demo|test|example\.com/.test(m(s)); return !!(hasDemo(user_email) || hasDemo(user_name) || hasDemo(sourceVal) || (metaObj && (metaObj.is_demo === true || metaObj.demo === true))); })();
      const finalSource = sourceVal || (looksDemo ? 'demo' : null);
      let inserted = false;
      // Normalize vehicle_type only for Acropolis checkout
      let normalizedVehicleType = vehicleType || vehicle_type || rawMode || null;
      try {
        if (trip_id === 'acropolis') {
          const raw = String(normalizedVehicleType || '').toLowerCase();
          if (raw === 'private' || raw === 'mercedes/private') normalizedVehicleType = 'mercedes';
          else if (raw === 'van') normalizedVehicleType = 'van';
          else if (raw === 'bus') normalizedVehicleType = 'bus';
        }
      } catch(_){}
      if (providerId) {
        try {
          const insertWithPartner = bookingsDb.prepare('INSERT INTO bookings (id,status,payment_intent_id,event_id,user_name,user_email,trip_id,seats,vehicle_type,price_cents,currency,metadata,created_at,updated_at,date,grouped,payment_type,partner_id,partner_share_cents,commission_cents,payout_status,payout_date,"__test_seed",seed_source,pickup_location,pickup_lat,pickup_lng,suitcases_json,special_requests) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
          insertWithPartner.run(id, (statusPolicy || 'pending'), null, null, user_name, user_email, trip_id, (effectiveSeats || seats || 1), normalizedVehicleType || null, price_cents || 0, currency || 'eur', JSON.stringify(metaObj), now, now, date, 0, null, providerId, null, null, null, null, 0, null, pickup_location, pickup_lat, pickup_lng, suitcases_json, special_requests);
          inserted = true;
        } catch(_) { /* fallback below */ }
      }
      if (!inserted) {
        try {
          const insert2 = bookingsDb.prepare('INSERT INTO bookings (id,status,payment_intent_id,event_id,user_name,user_email,trip_id,seats,vehicle_type,price_cents,currency,metadata,created_at,updated_at,date,grouped,payment_type,partner_id,partner_share_cents,commission_cents,payout_status,payout_date,"__test_seed",seed_source,pickup_location,pickup_lat,pickup_lng,suitcases_json,special_requests) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
          insert2.run(id, (statusPolicy || 'pending'), null, null, user_name, user_email, trip_id, (effectiveSeats || seats || 1), normalizedVehicleType || null, price_cents || 0, currency || 'eur', JSON.stringify(metaObj), now, now, date, 0, null, null, null, null, null, null, 0, null, pickup_location, pickup_lat, pickup_lng, suitcases_json, special_requests);
        } catch(_e) {
          const insertLegacy = bookingsDb.prepare('INSERT INTO bookings (id,status,date,payment_intent_id,event_id,user_name,user_email,trip_id,seats,price_cents,currency,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
          insertLegacy.run(id, (statusPolicy || 'pending'), date, null, null, user_name, user_email, trip_id, (effectiveSeats || seats || 1), price_cents || 0, currency || 'eur', JSON.stringify(metaObj), now, now);
        }
      }
      try { bookingsDb.prepare('UPDATE bookings SET pickup_location = ?, pickup_lat = ?, pickup_lng = ?, suitcases_json = ?, special_requests = ? WHERE id = ?').run(pickup_location || '', pickup_lat, pickup_lng, suitcases_json || '[]', special_requests || '', id); } catch(_){ }
      try {
        if (Array.isArray(pickup_points)) {
          bookingsDb.prepare('UPDATE bookings SET pickup_points_json = ? WHERE id = ?').run(JSON.stringify(pickup_points), id);
        }
      } catch(_){ }
      try { const setDemo = bookingsDb.prepare('UPDATE bookings SET is_demo = COALESCE(is_demo, ?), source = COALESCE(?, source) WHERE id = ?'); setDemo.run(looksDemo ? 1 : 0, finalSource, id); } catch(_){ }
      // Notify Admin stream about policy outcome (PASS when no flags)
      try {
        if (adminSse && adminSse.broadcast) {
          const ok = !(policyFlags && policyFlags.length);
          const payload = ok ? { type: 'policy_status', status: 'pass', booking_id: id, trip_id, timestamp: now }
                             : { type: 'policy_violation', booking_id: id, trip_id, violation_reason: (policyFlags[0] && policyFlags[0].code) || 'policy_violation', reasons: policyFlags, timestamp: now };
          adminSse.broadcast(payload);
        }
      } catch(_) { }
      return res.json({ bookingId: id, status: (statusPolicy || 'pending'), policy_flags: policyFlags || [], seats: (effectiveSeats || seats || 1) });
    } catch (e) {
      console.error('Create booking error', e && e.stack ? e.stack : e);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // Unified booking flow: lightweight temporary booking creation from bookingState
  // Expects body as bookingState { trip_id, mode, date, seats, pickup, suitcases, special_requests, traveler_profile, price_cents, currency }
  app.post('/api/bookings/create', (req, res) => {
    try {
      try { console.log('[api] /api/bookings/create payload', req.body); } catch(_){ }
      const b = req.body || {};
      const trip_id = (b.trip_id || '').toString().trim();
      const mode = (b.mode || '').toString().trim().toLowerCase();
      let vehType = (b.vehicleType || b.vehicle_type || mode || null);
      if (trip_id === 'acropolis') {
        const raw = String(vehType || '').toLowerCase();
        if (raw === 'private' || raw === 'mercedes/private') vehType = 'mercedes';
        else if (raw === 'van') vehType = 'van';
        else if (raw === 'bus') vehType = 'bus';
      }
      const date = (b.date || '').toString().trim() || new Date().toISOString().slice(0,10);
      const seats = Number(b.seats || 1) || 1;
      const price_cents = Number(b.price_cents || 0) || 0;
      const currency = (b.currency || 'eur').toString().toLowerCase();
      const pickup = b.pickup || {};
      const suitcases = b.suitcases || {};
      const suitcases_list = normalizeSuitcasesArray(suitcases);
      const special_requests = (b.special_requests || '').toString();
      const traveler_profile = b.traveler_profile || {};
      if (!trip_id || !seats || !price_cents) return res.status(400).json({ error: 'Missing required fields' });
      if (!bookingsDb) return res.status(500).json({ error: 'Bookings DB not available' });
      const trip = readTrip(trip_id) || {};
      let normalizedMode = normMode(mode || vehType || (trip && trip.defaultMode) || '');
      if (!normalizedMode) normalizedMode = normMode(trip.defaultMode || '') || 'van';
      if (!vehType && normalizedMode) vehType = normalizedMode;
      const availabilitySnapshot = computeModeAvailability(trip_id, date, normalizedMode, trip, { ensureMercedesRow: normalizedMode === 'mercedes' });
      if (normalizedMode === 'mercedes') {
        if (!availabilitySnapshot || availabilitySnapshot.available <= 0) {
          return res.status(409).json({ error: 'No fleet available' });
        }
      } else if (availabilitySnapshot && typeof availabilitySnapshot.available === 'number' && availabilitySnapshot.available >= 0) {
        if (seats > availabilitySnapshot.available) {
          return res.status(409).json({ error: 'Not enough seats', available: availabilitySnapshot.available });
        }
      }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const metadata = {
        trip_mode: normalizedMode || mode || null,
        traveler_profile,
        pickup_address: pickup.address || null,
        pickup_place_id: pickup.place_id || null,
        pickup_lat: pickup.lat || null,
        pickup_lng: pickup.lng || null,
        suitcases,
        special_requests,
        source: 'unified_flow'
      };
      try {
        const stmt = bookingsDb.prepare('INSERT INTO bookings (id,status,payment_intent_id,event_id,user_name,user_email,trip_id,seats,vehicle_type,price_cents,currency,metadata,created_at,updated_at,date,grouped,payment_type,partner_id,partner_share_cents,commission_cents,payout_status,payout_date,"__test_seed",seed_source,pickup_location,pickup_lat,pickup_lng,suitcases_json,special_requests) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        stmt.run(id, 'pending', null, null, null, null, trip_id, seats, vehType || null, price_cents, currency, JSON.stringify(metadata), now, now, date, 0, null, null, null, null, null, null, 0, 'unified_flow', (pickup.address||''), (pickup.lat||null), (pickup.lng||null), JSON.stringify(suitcases_list), special_requests || '');
      } catch(e) {
        // Minimal legacy insert fallback
        const stmt = bookingsDb.prepare('INSERT INTO bookings (id,status,date,payment_intent_id,event_id,user_name,user_email,trip_id,seats,price_cents,currency,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        stmt.run(id, 'pending', date, null, null, null, null, trip_id, seats, price_cents, currency, JSON.stringify(metadata), now, now);
      }
      try { console.log('[api] /api/bookings/create stored', { bookingId: id, amount_cents: price_cents, currency }); } catch(_){ }
      return res.json({ bookingId: id, amount_cents: price_cents, currency });
    } catch (e) {
      console.error('Unified create booking error', e && e.stack ? e.stack : e);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // Confirm booking after successful Stripe payment
  // Body: { bookingId, payment_intent_id }
  app.post('/api/bookings/confirm', (req, res) => {
    try {
      const { bookingId, payment_intent_id } = req.body || {};
      if (!bookingId) return res.status(400).json({ error: 'Missing bookingId' });
      if (!bookingsDb) return res.status(500).json({ error: 'Bookings DB not available' });
      const bookingRow = (() => {
        try {
          const row = bookingsDb.prepare('SELECT id, status, trip_id, date, metadata, vehicle_type FROM bookings WHERE id = ?').get(bookingId);
          if (row && row.metadata && typeof row.metadata === 'string') {
            try { row.metadata = JSON.parse(row.metadata); } catch(_){ row.metadata = null; }
          }
          return row || null;
        } catch(_){ return null; }
      })();
      if (!bookingRow) return res.status(404).json({ error: 'Booking not found' });
      const metaMode = (() => {
        try {
          const meta = bookingRow.metadata || {};
          return meta.trip_mode || meta.mode || meta.vehicle_type || bookingRow.vehicle_type || '';
        } catch(_){ return bookingRow.vehicle_type || ''; }
      })();
      const normalizedMode = normMode(metaMode);
      const alreadyConfirmed = String(bookingRow.status || '').toLowerCase() === 'confirmed';
      if (normalizedMode === 'mercedes' && !alreadyConfirmed) {
        const tripId = bookingRow.trip_id;
        const date = bookingRow.date ? String(bookingRow.date) : null;
        if (!tripId || !date) return res.status(409).json({ error: 'No fleet available' });
        const tripData = readTrip(tripId) || {};
        const ensureRow = ensureMercedesAvailabilityRow(tripId, date, tripData);
        const totalFleet = ensureRow && Number.isFinite(parseInt(ensureRow.total_fleet, 10)) ? parseInt(ensureRow.total_fleet, 10) : getMercedesFleetSize(tripData);
        if (!totalFleet) return res.status(409).json({ error: 'No fleet available' });
        const nowFleet = new Date().toISOString();
        let updateResult = null;
        try {
          updateResult = bookingsDb.prepare('UPDATE mercedes_availability SET remaining_fleet = remaining_fleet - 1, updatedAt = ? WHERE trip_id = ? AND date = ? AND remaining_fleet > 0').run(nowFleet, tripId, date);
        } catch(_){ updateResult = null; }
        if (!updateResult || !updateResult.changes) {
          return res.status(409).json({ error: 'No fleet available' });
        }
      }
      const now = new Date().toISOString();
      try {
        const stmt = bookingsDb.prepare('UPDATE bookings SET status = ?, payment_intent_id = COALESCE(?, payment_intent_id), updated_at = ? WHERE id = ?');
        stmt.run('confirmed', payment_intent_id || null, now, bookingId);
      } catch(e) {
        // fallback: minimal update
        bookingsDb.prepare('UPDATE bookings SET status = ? WHERE id = ?').run('confirmed', bookingId);
      }
      return res.json({ ok: true, bookingId });
    } catch (e) {
      console.error('Confirm booking error', e && e.stack ? e.stack : e);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // Availability endpoints (mode-aware)
  app.get('/api/availability', (req, res) => {
    try {
      const trip_id = req.query.trip_id;
      const dateParam = req.query.date || new Date().toISOString().slice(0,10);
      const modeParam = normMode(req.query.mode || '');
      const monthParam = String(req.query.month||'').trim(); // format YYYY-MM for month prefetch
      if (!trip_id) return res.status(400).json({ error: 'Missing trip_id' });
      if (!bookingsDb) return res.status(500).json({ error: 'Bookings DB not available' });
      const trip = readTrip(trip_id) || {};
      const computeForMode = (mode, dateStr, options = {}) => computeModeAvailability(trip_id, dateStr, mode, trip, options);
      // Month prefetch path: require mode & month (YYYY-MM) -> array of days
      if (monthParam && modeParam) {
        const ym = monthParam.match(/^([0-9]{4})-([0-9]{2})$/);
        if (!ym) return res.status(400).json({ error: 'Invalid month format' });
        const year = parseInt(ym[1],10);
        const monthIndex = parseInt(ym[2],10) - 1; // 0-based
        if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) return res.status(400).json({ error: 'Invalid month range' });
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
        const days = [];
        if (modeParam === 'mercedes') {
          for (let d=1; d<=daysInMonth; d++) {
            const dayStr = String(d).padStart(2,'0');
            const dateStr = `${monthParam}-${dayStr}`;
            const stats = computeForMode('mercedes', dateStr, { ensureMercedesRow: false });
            days.push({
              date: dateStr,
              capacity: stats.capacity || 0,
              taken: stats.taken || 0,
              available: stats.available || 0,
              total_fleet: stats.total_fleet || stats.capacity || 0,
              remaining_fleet: stats.remaining_fleet || stats.available || 0
            });
          }
        } else {
          // Bulk read any stored overrides to minimize queries
          let stored = [];
          try {
            stored = bookingsDb.prepare('SELECT date, capacity, taken_custom FROM mode_availability WHERE trip_id = ? AND mode = ? AND date LIKE ?').all(trip_id, modeParam, monthParam + '%');
          } catch(_){ stored = []; }
          const byDate = {};
          stored.forEach(r => { if (r && r.date) byDate[r.date] = r; });
          for (let d=1; d<=daysInMonth; d++) {
            const dayStr = String(d).padStart(2,'0');
            const dateStr = `${monthParam}-${dayStr}`;
            const row = byDate[dateStr];
            let cap = 0; let takenOver = null;
            if (row && typeof row.capacity === 'number' && row.capacity > 0) cap = row.capacity;
            if (!cap) cap = getDefaultCapacityForMode(trip, modeParam) || 0;
            if (row && typeof row.taken_custom === 'number' && row.taken_custom >= 0) takenOver = row.taken_custom;
            // Compute taken from bookings unless override present
            let taken = 0;
            try {
              if (takenOver == null) {
                const rows = bookingsDb.prepare("SELECT seats, metadata, status FROM bookings WHERE trip_id = ? AND date = ? AND status != 'canceled'").all(trip_id, dateStr) || [];
                rows.forEach(r => {
                  let m = '';
                  try { const meta = r && r.metadata ? JSON.parse(r.metadata) : null; const mm = (meta && (meta.trip_mode || meta.mode || meta.vehicle_type)) || ''; m = normMode(mm); } catch(_){ m=''; }
                  if (m !== modeParam) return;
                  if (modeParam === 'mercedes') taken += 1; else taken += (parseInt(r.seats,10) || 0);
                });
              } else {
                taken = takenOver;
              }
            } catch(_){ }
            const available = Math.max(0, (cap || 0) - (taken || 0));
            days.push({ date: dateStr, capacity: cap || 0, taken: taken || 0, available });
          }
        }
        return res.json({ trip_id, mode: modeParam, month: monthParam, days });
      }
      if (modeParam) {
        const ensureRow = (modeParam === 'mercedes') && !monthParam;
        const out = computeForMode(modeParam, dateParam, { ensureMercedesRow: ensureRow });
        const payload = { trip_id, date: dateParam, mode: modeParam, capacity: out.capacity, taken: out.taken, available: out.available };
        if (modeParam === 'mercedes') {
          payload.total_fleet = out.total_fleet || out.capacity || 0;
          payload.remaining_fleet = out.remaining_fleet || out.available || 0;
        }
        return res.json(payload);
      }
      const modes = {};
      ['bus','van','mercedes'].forEach(m => {
        const stats = computeForMode(m, dateParam, { ensureMercedesRow: false });
        modes[m] = stats;
      });
      return res.json({ trip_id, date: dateParam, modes });
    } catch (e) { console.error('Availability error', e); return res.status(500).json({ error: 'Server error' }); }
  });

  // Upsert per-mode capacity (admin only)
  app.post('/api/availability', (req, res) => {
    try {
      const body = req.body || {};
      const trip_id = String(body.trip_id||'').trim();
      const date = String(body.date||'').trim();
      const mode = normMode(body.mode||'');
      const capacity = parseInt(body.capacity,10);
      const takenCustom = (body.taken!=null) ? parseInt(body.taken,10) : null;
      if (!trip_id || !date || !mode) return res.status(400).json({ error: 'Missing trip_id/date/mode' });
      if (!Number.isFinite(capacity) || capacity < 0) return res.status(400).json({ error: 'Invalid capacity' });
      if (takenCustom!=null && (!Number.isFinite(takenCustom) || takenCustom < 0)) return res.status(400).json({ error: 'Invalid taken' });
      if (typeof checkAdminAuth === 'function' && !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
      if (!bookingsDb) return res.status(500).json({ error: 'Bookings DB not available' });
      if (mode === 'mercedes') {
        const tripData = readTrip(trip_id) || {};
        const fallbackFleet = getMercedesFleetSize(tripData);
        const totalFleet = Number.isFinite(capacity) && capacity > 0 ? capacity : fallbackFleet;
        const normalizedTaken = (takenCustom != null && Number.isFinite(takenCustom) && takenCustom >= 0)
          ? Math.min(totalFleet, takenCustom)
          : null;
        const remainingFleet = normalizedTaken != null
          ? Math.max(0, totalFleet - normalizedTaken)
          : totalFleet;
        const now = new Date().toISOString();
        const existingRow = readMercedesAvailabilityRow(trip_id, date);
        const rowId = existingRow && existingRow.id
          ? existingRow.id
          : (crypto && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${trip_id}-${date}-${Date.now()}`);
        const stmt = bookingsDb.prepare(`
          INSERT INTO mercedes_availability (id, trip_id, date, total_fleet, remaining_fleet, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(trip_id, date) DO UPDATE SET
            total_fleet = excluded.total_fleet,
            remaining_fleet = excluded.remaining_fleet,
            updatedAt = excluded.updatedAt
        `);
        stmt.run(rowId, trip_id, date, totalFleet, remainingFleet, now);
        try { console.log('[availability-upsert:mercedes]', { trip_id, date, totalFleet, remainingFleet }); } catch(_){ }
        return res.json({ ok: true, total_fleet: totalFleet, remaining_fleet: remainingFleet });
      }
      const now = new Date().toISOString();
      const stmt = bookingsDb.prepare('INSERT INTO mode_availability (trip_id,date,mode,capacity,taken_custom,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(trip_id,date,mode) DO UPDATE SET capacity=excluded.capacity, taken_custom=excluded.taken_custom, updated_at=excluded.updated_at');
      stmt.run(trip_id, date, mode, capacity, takenCustom!=null?takenCustom:null, now);
      try { console.log('[availability-upsert]', { trip_id, date, mode, capacity }); } catch(_){ }
      return res.json({ ok: true });
    } catch (e) { console.error('availability upsert error', e && e.message ? e.message : e); return res.status(500).json({ error: 'Server error' }); }
  });

  // Get booking by id
  app.get('/api/bookings/:id', (req, res) => {
    try {
      if (!bookingsDb) return res.status(500).json({ error: 'Bookings DB not available' });
      const row = bookingsDb.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      if (row.metadata) { try { row.metadata = JSON.parse(row.metadata); } catch(_){} }
      if (row && typeof row.pickup_points_json === 'string') { try { row.pickup_points = JSON.parse(row.pickup_points_json); } catch(_) { row.pickup_points = []; } }
      if (row && typeof row.suitcases_json === 'string') { try { row.suitcases = JSON.parse(row.suitcases_json); } catch(_) { row.suitcases = []; } }
      // Compute a unified route.full_path if not already present
      try {
        const meta = row.metadata || {};
        let full = meta && meta.route && Array.isArray(meta.route.full_path) ? meta.route.full_path.slice() : null;
        if (!full || !full.length){
          const stops = Array.isArray(meta.stops) ? meta.stops : [];
          if (stops.length){
            full = stops.map((s,i)=>({
              label: s.label || s.name || s.customer || `Στάση ${i+1}`,
              address: s.address || s.pickup || s.location || '',
              lat: s.lat ?? s.latitude ?? null,
              lng: s.lng ?? s.longitude ?? null,
              arrival_time: s.arrival_time || s.time || s.scheduled_time || null,
              departure_time: s.departure_time || null,
              type: (String(s.type||'').toLowerCase()==='pickup' || /παραλαβή/i.test(String(s.name||''))) ? 'pickup' : 'tour_stop',
            }));
            // Append trip JSON tour stops after pickups
            const pickupTimeStr = String(meta.pickup_time || '').slice(0,5) || '09:00';
            const tripStops = readTripStops(row.trip_id);
            if (tripStops.length){
              const seen = new Set(full.filter(x=> (x.type||'tour_stop')==='tour_stop').map(x=> (x.address||'').trim().toLowerCase()));
              let prevTime = (full.length ? full[full.length-1].arrival_time : null) || pickupTimeStr;
              const fallbackInc = 45;
              tripStops.forEach((ts, idx) => {
                const key = String(ts.address||'').trim().toLowerCase();
                if (key && seen.has(key)) return;
                const at = ts.arrival_time || addMinutes(prevTime, fallbackInc);
                full.push({ type:'tour_stop', label: ts.label || `Στάση ${idx+1}`, address: ts.address || '', arrival_time: at, departure_time: ts.departure_time || null, lat: ts.lat ?? null, lng: ts.lng ?? null });
                prevTime = at || prevTime;
              });
            }
          } else if (row.pickup_points && Array.isArray(row.pickup_points) && row.pickup_points.length){
            const pickupTimeStr = String(meta.pickup_time || '').slice(0,5) || '09:00';
            const inc = 20;
            full = row.pickup_points.map((p,i)=>({
              label: `Παραλαβή: ${p.address||''}`.trim(),
              address: p.address || '',
              lat: p.lat ?? null,
              lng: p.lng ?? null,
              arrival_time: i===0 ? pickupTimeStr : addMinutes(pickupTimeStr, i*inc),
              departure_time: null,
              type: 'pickup'
            }));
            const tripStops = readTripStops(row.trip_id);
            if (tripStops.length){
              let prevTime = (full[full.length-1] && full[full.length-1].arrival_time) || pickupTimeStr;
              const fallbackInc = 45;
              tripStops.forEach((ts, idx) => {
                const at = ts.arrival_time || addMinutes(prevTime, fallbackInc);
                full.push({ type:'tour_stop', label: ts.label || `Στάση ${idx+1}`, address: ts.address || '', arrival_time: at, departure_time: ts.departure_time || null, lat: ts.lat ?? null, lng: ts.lng ?? null });
                prevTime = at || prevTime;
              });
            } else {
              const last = full[full.length-1];
              const arrival = last ? addMinutes(last.arrival_time || pickupTimeStr, inc) : addMinutes(pickupTimeStr, inc);
              const tourLabel = meta.tour_title || row.trip_id || 'Έναρξη εκδρομής';
              const tourAddr = meta.dropoff_point || meta.to || meta.end_location || row.pickup_location || '';
              full.push({ label: `Στάση: ${tourLabel}`, address: tourAddr, lat: null, lng: null, arrival_time: arrival, departure_time: null, type: 'tour_stop' });
            }
          } else {
            full = [];
          }
          if (!row.metadata) row.metadata = {};
          if (!row.metadata.route) row.metadata.route = {};
          row.metadata.route.full_path = full;
        } else {
          // Augment existing full_path with any missing JSON tour stops
          const seen = new Set(full.filter(x => (x.type||'tour_stop')==='tour_stop').map(x => (x.address||'').trim().toLowerCase()));
          const tripStops = readTripStops(row.trip_id);
          if (tripStops.length){
            let prevTime = (full.length ? full[full.length-1].arrival_time : null) || (String(meta.pickup_time||'09:00').slice(0,5));
            const fallbackInc = 45;
            for (let i=0;i<tripStops.length;i++){
              const ts = tripStops[i];
              const key = String(ts.address||'').trim().toLowerCase();
              if (!key || seen.has(key)) continue;
              const at = ts.arrival_time || addMinutes(prevTime, fallbackInc);
              full.push({ type:'tour_stop', label: ts.label || `Στάση ${i+1}`, address: ts.address || '', arrival_time: at, departure_time: ts.departure_time || null, lat: ts.lat ?? null, lng: ts.lng ?? null });
              prevTime = at || prevTime;
            }
            row.route = { full_path: full };
          }
  }
        // Expose as stops for Driver UI compatibility when needed
        if (!Array.isArray(row.stops) || !row.stops){
          const src = (row.route && Array.isArray(row.route.full_path)) ? row.route.full_path
                      : (row.metadata && row.metadata.route && Array.isArray(row.metadata.route.full_path)) ? row.metadata.route.full_path
                      : [];
          row.stops = src.map((r)=>({ name: r.label, address: r.address, time: r.arrival_time, type: r.type, lat: r.lat, lng: r.lng }));
        }
      } catch(_){ }
      return res.json(row);
    } catch (e) { console.error('Get booking error', e && e.stack ? e.stack : e); return res.status(500).json({ error: 'Server error' }); }
  });
}

module.exports = { registerBookings };
