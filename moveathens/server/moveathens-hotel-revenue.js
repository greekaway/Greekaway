/**
 * MoveAthens Hotel Revenue — API Routes
 * Admin: GET /api/admin/moveathens/hotel-revenue
 *        GET /api/admin/moveathens/driver-stats   (date-filtered driver stats)
 *
 * Aggregates transfer-request data to produce per-hotel revenue breakdown
 * and date-filtered driver financial stats.
 */
'use strict';

const requestsData = require('../../src/server/data/moveathens-requests');
const driversData  = require('../../src/server/data/moveathens-drivers');

module.exports = function registerHotelRevenueRoutes(app, opts = {}) {
  const checkAdminAuth = typeof opts.checkAdminAuth === 'function' ? opts.checkAdminAuth : null;

  /**
   * Helper: build a destination-id → route_type map.
   * Uses the moveathens config data layer (destinations have route_type field).
   */
  let _destMapCache = null;
  let _destMapTime  = 0;
  const DEST_CACHE_TTL = 60000; // 60s

  async function getDestRouteTypeMap() {
    if (_destMapCache && (Date.now() - _destMapTime < DEST_CACHE_TTL)) return _destMapCache;
    try {
      const dataLayer = require('../../src/server/data/moveathens');
      const dests = await dataLayer.getDestinations();
      const map = {};
      (dests || []).forEach(d => {
        if (d.route_type) {
          map[d.id] = d.route_type;
          // Also map by name (fallback for older requests without destination_id)
          if (d.name) map[d.name.toLowerCase().trim()] = d.route_type;
        }
      });
      _destMapCache = map;
      _destMapTime = Date.now();
      return map;
    } catch (e) {
      console.error('[ma-hotel-revenue] getDestRouteTypeMap error:', e.message);
      return _destMapCache || {};
    }
  }

  function resolveRouteType(req, destMap) {
    if (req.destination_id && destMap[req.destination_id]) return destMap[req.destination_id];
    if (req.destination_name) {
      const key = req.destination_name.toLowerCase().trim();
      if (destMap[key]) return destMap[key];
    }
    return 'unknown';
  }

  function filterByDateRange(requests, from, to) {
    return requests.filter(r => {
      const d = new Date(r.created_at);
      if (isNaN(d.getTime())) return false;
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    });
  }

  // ========================================
  // Hotel Revenue: per-hotel aggregation
  // ========================================
  app.get('/api/admin/moveathens/hotel-revenue', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });

    try {
      const allReqs = await requestsData.getRequests({});
      const destMap = await getDestRouteTypeMap();

      // Only count accepted / completed requests (actual revenue)
      let relevant = allReqs.filter(r => r.status === 'accepted' || r.status === 'completed');

      // Optional date range
      const from = req.query.from ? new Date(req.query.from + 'T00:00:00') : null;
      const to   = req.query.to   ? new Date(req.query.to   + 'T23:59:59') : null;
      if (from || to) relevant = filterByDateRange(relevant, from, to);

      // Aggregate by hotel name
      const hotelMap = {};
      relevant.forEach(r => {
        const name = (r.hotel_name || 'Άγνωστο').trim();
        if (!hotelMap[name]) {
          hotelMap[name] = {
            hotel_name: name,
            total_routes: 0,
            total_revenue: 0,
            total_commission: 0,
            route_types: { airport: 0, port: 0, city: 0, travel: 0, unknown: 0 }
          };
        }
        const h = hotelMap[name];
        h.total_routes += 1;
        h.total_revenue += parseFloat(r.price) || 0;
        h.total_commission += parseFloat(r.commission_hotel) || 0;
        const rt = resolveRouteType(r, destMap);
        h.route_types[rt] = (h.route_types[rt] || 0) + 1;
      });

      const hotels = Object.values(hotelMap).sort((a, b) => b.total_revenue - a.total_revenue);
      return res.json({ hotels });
    } catch (err) {
      console.error('[ma-hotel-revenue] GET hotel-revenue failed:', err.message);
      return res.status(500).json({ error: 'Failed to load hotel revenue' });
    }
  });

  // ========================================
  // Driver Stats: date-filtered per-driver aggregation
  // (computed from requests, not stored totals)
  // ========================================
  app.get('/api/admin/moveathens/driver-stats', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });

    try {
      const allDrivers = await driversData.getDrivers(false);
      const allReqs    = await requestsData.getRequests({});

      const from = req.query.from ? new Date(req.query.from + 'T00:00:00') : null;
      const to   = req.query.to   ? new Date(req.query.to   + 'T23:59:59') : null;

      // If no date filter → return stored totals (fast path)
      if (!from && !to) {
        const drivers = (allDrivers || []).map(d => ({
          ...d,
          balance: parseFloat(d.total_owed || 0) - parseFloat(d.total_paid || 0)
        }));
        return res.json({ drivers, filtered: false });
      }

      // Date-filtered: compute per-driver stats from requests
      let relevant = allReqs.filter(r => r.status === 'accepted' || r.status === 'completed');
      relevant = filterByDateRange(relevant, from, to);

      // Get payments within date range
      const driverStatsMap = {};
      for (const d of (allDrivers || [])) {
        driverStatsMap[d.id] = {
          id: d.id,
          name: d.name,
          phone: d.phone,
          total_trips: 0,
          total_revenue: 0,
          total_owed: 0,
          total_paid: 0,
          is_active: d.is_active
        };
      }

      // Sum per-driver revenue from requests in range
      relevant.forEach(r => {
        if (!r.driver_id) return;
        if (!driverStatsMap[r.driver_id]) {
          driverStatsMap[r.driver_id] = {
            id: r.driver_id,
            name: r.driver_name || '—',
            phone: r.driver_phone || '',
            total_trips: 0,
            total_revenue: 0,
            total_owed: 0,
            total_paid: 0,
            is_active: true
          };
        }
        const ds = driverStatsMap[r.driver_id];
        ds.total_trips += 1;
        ds.total_revenue += parseFloat(r.price) || 0;
        ds.total_owed += parseFloat(r.commission_service) || 0;
      });

      // Sum payments within date range
      for (const d of (allDrivers || [])) {
        try {
          const payments = await driversData.getDriverPayments(d.id);
          (payments || []).forEach(p => {
            const pd = new Date(p.created_at);
            if (from && pd < from) return;
            if (to && pd > to) return;
            if (driverStatsMap[d.id]) {
              driverStatsMap[d.id].total_paid += parseFloat(p.amount) || 0;
            }
          });
        } catch (e) { /* skip payment errors */ }
      }

      const drivers = Object.values(driverStatsMap)
        .filter(d => d.total_trips > 0 || d.total_paid > 0)
        .map(d => ({
          ...d,
          balance: d.total_owed - d.total_paid
        }));

      return res.json({ drivers, filtered: true });
    } catch (err) {
      console.error('[ma-hotel-revenue] GET driver-stats failed:', err.message);
      return res.status(500).json({ error: 'Failed to load driver stats' });
    }
  });

  console.log('[ma-hotel-revenue] Routes mounted');
};
