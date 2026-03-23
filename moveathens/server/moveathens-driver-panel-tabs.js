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
        if (!r.vehicle_type_id) return true;
        // Match against vehicle_types array (not just current)
        return vehicleTypes.includes(r.vehicle_type_id);
      });

      const cards = scheduled.map(r => driverBroadcast.buildCardData(r, 'scheduled'));
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

      // Optional date filter
      const from = req.query.from; // YYYY-MM-DD
      const to = req.query.to;     // YYYY-MM-DD
      let filtered = mine;
      if (from) filtered = filtered.filter(r => (r.accepted_at || r.created_at) >= from);
      if (to) filtered = filtered.filter(r => (r.accepted_at || r.created_at) <= to + 'T23:59:59');

      const items = filtered.map(r => ({
        id: r.id,
        date: r.accepted_at || r.created_at,
        origin: r.is_arrival ? r.destination_name : (r.hotel_name || r.origin_zone_name),
        destination: r.is_arrival ? (r.hotel_name || r.origin_zone_name) : r.destination_name,
        price: r.price,
        is_arrival: r.is_arrival
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
      const weekAgo = new Date(now - 7 * 86400000).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const weekTrips = mine.filter(r => (r.accepted_at || r.created_at) >= weekAgo);
      const monthTrips = mine.filter(r => (r.accepted_at || r.created_at) >= monthStart);

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
};
