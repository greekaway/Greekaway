/**
 * MoveAthens Driver Panel — Tabs API (Appointments, History, Financials)
 * Separated from main driver-panel routes to stay under 300 lines.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const driversData = require('../../src/server/data/moveathens-drivers');
const requestsData = require('../../src/server/data/moveathens-requests');
const driverBroadcast = require('../../services/driverBroadcast');
const db = require('../../db');

const CONFIG_FILE = path.join(__dirname, '..', 'data', 'driver_panel_ui.json');
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}

module.exports = function registerDriverPanelTabs(app) {

  // ══════════════════════════════════════════
  // APPOINTMENTS — Scheduled requests for driver
  // ══════════════════════════════════════════

  // List scheduled requests matching driver's vehicle_types array
  // Tier-aware: Gold drivers see requests immediately; Silver drivers see them
  // after a percentage of time has passed (configured in admin panel).
  app.get('/api/driver-panel/scheduled', async (req, res) => {
    try {
      const phone = (req.query.phone || '').trim();
      const tab = req.query.tab || 'all'; // 'all' or 'accepted'
      if (!phone) return res.status(400).json({ error: 'Missing phone' });

      const driver = await driversData.getDriverByPhone(phone);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      let vehicleTypes = [];
      try { vehicleTypes = JSON.parse(driver.vehicle_types || '[]'); } catch { vehicleTypes = []; }

      if (tab === 'accepted') {
        // Show only requests accepted by this driver
        const accepted = await requestsData.getRequests({ status: 'accepted' });
        const mine = accepted.filter(r =>
          r.driver_phone === phone && r.booking_type === 'scheduled'
        );
        const cards = mine.map(r => driverBroadcast.buildCardData(r, 'scheduled'));
        return res.json({ ok: true, requests: cards });
      }

      // "All" tab: pending/sent scheduled requests matching vehicle_types array
      const pending = await requestsData.getRequests({ status: 'pending' });
      const sent = await requestsData.getRequests({ status: 'sent' });
      const combined = [...pending, ...sent];

      const scheduled = combined.filter(r => {
        if (r.booking_type !== 'scheduled') return false;
        // If request has no vehicle requirement → show to all
        if (!r.vehicle_type_id) return true;
        // If driver has no vehicle types set → hide (no suitable vehicle)
        if (vehicleTypes.length === 0) return false;
        // Match against vehicle_types array (not just current)
        return vehicleTypes.includes(r.vehicle_type_id);
      });

      // ── Tier-based visibility filtering ──
      const driverTier = driver.tier || 'silver';
      const config = loadConfig();
      const acceptance = config.acceptance || {};
      const goldPercent = acceptance.tierGoldPercent ?? 50;
      const minMinutes = acceptance.tierMinMinutes ?? 15;

      let visible = scheduled;
      if (driverTier !== 'gold' && goldPercent > 0) {
        const now = Date.now();
        visible = scheduled.filter(r => {
          // Admin explicitly dispatched → skip tier window
          if (r.status === 'sent') return true;
          // released_to_all overrides tier logic (admin manual release)
          if (r.released_to_all) return true;

          const createdAt = new Date(r.created_at).getTime();
          // Calculate pickup time
          const pickupStr = r.scheduled_date
            ? r.scheduled_date + 'T' + (r.scheduled_time || '23:59')
            : null;
          const pickupMs = pickupStr ? new Date(pickupStr).getTime() : 0;
          if (!pickupMs || isNaN(pickupMs)) return true; // no pickup time → show to all

          const totalTimeMs = pickupMs - createdAt;
          const totalMinutes = totalTimeMs / 60000;

          // If total time < minimum threshold → show to everyone immediately
          if (totalMinutes < minMinutes) return true;

          // Gold-exclusive window = goldPercent% of total time
          const goldWindowMs = totalTimeMs * (goldPercent / 100);
          const silverVisibleAt = createdAt + goldWindowMs;

          return now >= silverVisibleAt;
        });
      }

      const cards = visible.map(r => driverBroadcast.buildCardData(r, 'scheduled'));
      res.json({ ok: true, requests: cards });
    } catch (err) {
      console.error('[driver-panel] scheduled:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Get detail card for a specific request
  app.get('/api/driver-panel/request/:requestId/detail', async (req, res) => {
    try {
      const request = await requestsData.getRequestById(req.params.requestId);
      if (!request) return res.status(404).json({ error: 'Not found' });
      const card = driverBroadcast.buildCardData(request, 'detail');
      res.json({ ok: true, card });
    } catch (err) {
      console.error('[driver-panel] detail:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ══════════════════════════════════════════
  // HISTORY — Completed requests for driver
  // ══════════════════════════════════════════

  app.get('/api/driver-panel/history', async (req, res) => {
    try {
      const phone = (req.query.phone || '').trim();
      if (!phone) return res.status(400).json({ error: 'Missing phone' });

      const driver = await driversData.getDriverByPhone(phone);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      const completed = await requestsData.getRequests({ status: 'completed' });
      const mine = completed.filter(r => r.driver_phone === phone);

      // Optional date filter (compare date portion only: YYYY-MM-DD)
      const from = req.query.from; // YYYY-MM-DD
      const to = req.query.to;     // YYYY-MM-DD
      const toDateStr = (v) => {
        if (!v) return '';
        if (typeof v === 'string') return v.slice(0, 10);
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        return '';
      };
      let filtered = mine;
      if (from) filtered = filtered.filter(r => toDateStr(r.accepted_at || r.created_at) >= from);
      if (to) filtered = filtered.filter(r => toDateStr(r.accepted_at || r.created_at) <= to);

      const items = filtered.map(r => ({
        id: r.id,
        date: r.accepted_at || r.created_at,
        origin: r.is_arrival ? r.destination_name : (r.hotel_name || r.origin_zone_name),
        destination: r.is_arrival ? (r.hotel_name || r.origin_zone_name) : r.destination_name,
        price: r.price,
        is_arrival: r.is_arrival,
        // Extra details for accordion expand
        hotel_name: r.hotel_name || '',
        hotel_address: r.hotel_address || '',
        vehicle_name: r.vehicle_name || '',
        passenger_name: r.passenger_name || '',
        passengers: r.passengers || 0,
        luggage_large: r.luggage_large || 0,
        luggage_medium: r.luggage_medium || 0,
        luggage_cabin: r.luggage_cabin || 0,
        room_number: r.room_number || '',
        notes: r.notes || '',
        scheduled_date: r.scheduled_date || '',
        scheduled_time: r.scheduled_time || '',
        payment_method: r.payment_method || '',
        flight_number: r.flight_number || '',
        commission_driver: r.commission_driver || 0,
        completed_at: r.completed_at || ''
      }));

      res.json({ ok: true, history: items });
    } catch (err) {
      console.error('[driver-panel] history:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ══════════════════════════════════════════
  // FINANCIALS — Balance, payments, summary
  // ══════════════════════════════════════════

  app.get('/api/driver-panel/financials', async (req, res) => {
    try {
      const phone = (req.query.phone || '').trim();
      if (!phone) return res.status(400).json({ error: 'Missing phone' });

      const driver = await driversData.getDriverByPhone(phone);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      const config = loadConfig();
      const financeConfig = config.finance || {};

      const payments = financeConfig.showHistory
        ? await driversData.getDriverPayments(driver.id)
        : [];

      // Compute weekly/monthly from completed requests
      const completed = await requestsData.getRequests({ status: 'completed' });
      const mine = completed.filter(r => r.driver_phone === phone);

      const now = new Date();
      const weekAgo = new Date(now - 7 * 86400000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const getTime = (v) => v instanceof Date ? v.getTime() : new Date(v || 0).getTime();
      const weekTrips = mine.filter(r => getTime(r.accepted_at || r.created_at) >= weekAgo.getTime());
      const monthTrips = mine.filter(r => getTime(r.accepted_at || r.created_at) >= monthStart.getTime());

      res.json({
        ok: true,
        balance: parseFloat(driver.total_owed) - parseFloat(driver.total_paid || 0),
        total_revenue: parseFloat(driver.total_revenue) || 0,
        total_owed: parseFloat(driver.total_owed) || 0,
        total_paid: parseFloat(driver.total_paid) || 0,
        total_trips: driver.total_trips || 0,
        week: {
          trips: weekTrips.length,
          revenue: weekTrips.reduce((s, r) => s + (parseFloat(r.price) || 0), 0)
        },
        month: {
          trips: monthTrips.length,
          revenue: monthTrips.reduce((s, r) => s + (parseFloat(r.price) || 0), 0)
        },
        payments: payments.map(p => ({
          id: p.id,
          amount: p.amount,
          note: p.note,
          date: p.created_at
        })),
        showBalance: financeConfig.showBalance !== false,
        showHistory: financeConfig.showHistory !== false,
        showCommission: financeConfig.showCommissionBreakdown === true
      });
    } catch (err) {
      console.error('[driver-panel] financials:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ══════════════════════════════════════════
  // HISTORY SUMMARY — totals for today/week/month/all
  // ══════════════════════════════════════════

  app.get('/api/driver-panel/history-summary', async (req, res) => {
    try {
      const phone = (req.query.phone || '').trim();
      if (!phone) return res.status(400).json({ error: 'Missing phone' });

      const driver = await driversData.getDriverByPhone(phone);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      const completed = await requestsData.getRequests({ status: 'completed' });
      const mine = completed.filter(r => r.driver_phone === phone);

      // Eligible requests: completed requests matching driver's vehicle types
      let vehicleTypes = [];
      try { vehicleTypes = JSON.parse(driver.vehicle_types || '[]'); } catch { vehicleTypes = []; }

      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 6);
      const weekStart = weekAgo.toISOString().slice(0, 10);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

      const dateOf = (r) => {
        const v = r.accepted_at || r.created_at || '';
        const d = new Date(v);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().slice(0, 10);
      };
      const priceOf = (r) => parseFloat(r.price) || 0;

      let allTotal = 0, todayTotal = 0, weekTotal = 0, monthTotal = 0;
      let allCount = 0, todayCount = 0, weekCount = 0, monthCount = 0;
      let minDate = '', maxDate = '';

      mine.forEach(r => {
        const d = dateOf(r);
        const p = priceOf(r);
        allTotal += p; allCount++;
        if (!minDate || d < minDate) minDate = d;
        if (!maxDate || d > maxDate) maxDate = d;
        if (d === todayStr) { todayTotal += p; todayCount++; }
        if (d >= weekStart) { weekTotal += p; weekCount++; }
        if (d >= monthStart) { monthTotal += p; monthCount++; }
      });

      // Count eligible requests per period (all completed matching vehicle types)
      let eligAll = 0, eligToday = 0, eligWeek = 0, eligMonth = 0;
      completed.forEach(r => {
        const matchesVehicle = !r.vehicle_type_id || vehicleTypes.length === 0
          || vehicleTypes.includes(r.vehicle_type_id);
        if (!matchesVehicle) return;
        const d = dateOf(r);
        eligAll++;
        if (d === todayStr) eligToday++;
        if (d >= weekStart) eligWeek++;
        if (d >= monthStart) eligMonth++;
      });

      // Get real broadcast stats if available
      let broadcastSent = eligAll;
      if (db.isAvailable()) {
        try {
          const bStats = await db.ma.getBroadcastStats(phone);
          if (bStats && bStats.total_sent > 0) broadcastSent = parseInt(bStats.total_sent) || eligAll;
        } catch { /* fallback to eligible count */ }
      }

      const monthNames = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος',
        'Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];
      const fmtLabel = (iso) => { const p = (iso || '').split('-'); return p.length >= 3 ? p[2] + '/' + p[1] : iso; };

      res.json({
        ok: true,
        summary: {
          all:   { total: allTotal, count: allCount, eligible: broadcastSent, label: minDate && maxDate ? fmtLabel(minDate) + ' – ' + fmtLabel(maxDate) : '—' },
          today: { total: todayTotal, count: todayCount, eligible: eligToday, label: fmtLabel(todayStr) },
          week:  { total: weekTotal, count: weekCount, eligible: eligWeek, label: fmtLabel(weekStart) + ' – ' + fmtLabel(todayStr) },
          month: { total: monthTotal, count: monthCount, eligible: eligMonth, label: monthNames[now.getMonth()] || '' }
        }
      });
    } catch (err) {
      console.error('[driver-panel] history-summary:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });
};
