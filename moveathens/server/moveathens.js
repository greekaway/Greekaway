/**
 * MoveAthens — Main Entry Point & Public API
 *
 * This file handles:
 * - Express Router setup (static files, page routes)
 * - Public API endpoints (ui-config, zones, categories, destinations, vehicles, ai-context, quote, hotel-by-phone)
 *
 * Admin routes are split into dedicated modules:
 *   moveathens-general.js      — General config (GET/POST/PUT ui-config)
 *   moveathens-hotels.js       — Hotels / Zones CRUD + Hotel Phones
 *   moveathens-categories.js   — Destination Categories CRUD
 *   moveathens-destinations.js — Destinations CRUD
 *   moveathens-vehicles.js     — Vehicle Types + Availability + Overrides
 *   moveathens-pricing.js      — Transfer Prices CRUD
 *   moveathens-uploads.js      — File uploads (hero, vehicle, category, footer)
 *
 * Shared helpers live in moveathens-helpers.js
 * Already-split modules: moveathens-requests.js, moveathens-drivers.js,
 *   moveathens-driver-timeline.js, moveathens-hotel-revenue.js, assistant.js
 */
const express = require('express');
const path = require('path');

// Shared helpers & data layer
const {
  normalizeString,
  toInt,
  ensureTransferConfig,
  migrateHotelZones,
  getAvailableVehiclesForDestination,
  VALID_TARIFFS,
  calculateTariff
} = require('./moveathens-helpers');
const dataLayer = require('../../src/server/data/moveathens');
const requestsLayer = require('../../src/server/data/moveathens-requests');
const driversLayer = require('../../src/server/data/moveathens-drivers');

module.exports = function registerMoveAthens(app, opts = {}) {
  const isDev = !!opts.isDev;
  const checkAdminAuth = typeof opts.checkAdminAuth === 'function' ? opts.checkAdminAuth : null;
  const baseDir = path.join(__dirname, '..');
  const pagesDir = path.join(baseDir, 'pages');
  const router = express.Router();

  if (isDev) {
    router.use((req, res, next) => {
      res.set('Cache-Control', 'no-store');
      next();
    });
  }

  router.use(express.static(baseDir, { index: false }));

  const pageMap = {
    '/': 'welcome.html',
    '/prices': 'prices.html',
    '/transfer': 'transfer.html',
    '/info': 'info.html',
    '/contact': 'contact.html',
    '/hotel': 'hotel-context.html',
    '/assistant': 'ai-assistant.html'
  };

  Object.keys(pageMap).forEach((routePath) => {
    router.get(routePath, (req, res) => {
      const fileName = pageMap[routePath];
      return res.sendFile(path.join(pagesDir, fileName));
    });
  });

  app.use('/moveathens', router);

  // ========================================
  // PUBLIC API ENDPOINTS
  // ========================================

  // AI-ready endpoint: structured data for AI assistants / LLMs
  app.get('/api/moveathens/ai-context', async (req, res) => {
    if (isDev) res.set('Cache-Control', 'no-store');
    try {
      const originZoneId = normalizeString(req.query.zone_id);
      const data = ensureTransferConfig(migrateHotelZones(await dataLayer.getFullConfig()));

      const zones = data.transferZones
        .filter(z => z.is_active)
        .map(z => ({ id: z.id, name: z.name, type: z.type }));

      const categories = data.destinationCategories
        .filter(c => c.is_active)
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
        .map(cat => {
          const destinations = data.destinations
            .filter(d => d.is_active && d.category_id === cat.id)
            .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
            .map(dest => {
              const destInfo = {
                id: dest.id,
                name: dest.name,
                description: dest.description || null
              };

              if (originZoneId) {
                const vehicles = getAvailableVehiclesForDestination(originZoneId, dest.id, 'day', data);
                if (vehicles.length > 0) {
                  destInfo.vehicles = vehicles.map(v => ({
                    name: v.name,
                    max_passengers: v.max_passengers,
                    luggage: {
                      large: v.luggage_large || 0,
                      medium: v.luggage_medium || 0,
                      cabin: v.luggage_cabin || 0
                    },
                    price_eur: v.price
                  }));
                }
              }

              return destInfo;
            });

          return {
            name: cat.name,
            icon: cat.icon || null,
            destinations
          };
        });

      const response = {
        schema_version: '1.0',
        service: 'MoveAthens Transfers',
        description: 'Private transfer service for hotels in Athens area',
        contact: {
          phone: data.phoneNumber || null,
          whatsapp: data.whatsappNumber || null,
          email: data.companyEmail || null
        },
        zones,
        categories
      };

      if (originZoneId) {
        const zone = zones.find(z => z.id === originZoneId);
        response.pricing_context = {
          origin_zone: zone ? zone.name : originZoneId,
          note: 'Prices shown are for transfers from this zone to each destination'
        };
      } else {
        response.usage_hint = 'Add ?zone_id=<zone_id> to get prices from a specific hotel zone';
      }

      return res.json(response);
    } catch (err) {
      console.error('moveathens: ai-context failed', err);
      return res.status(500).json({ error: 'AI context unavailable' });
    }
  });

  // Quote endpoint for AI
  app.get('/api/moveathens/quote', async (req, res) => {
    if (isDev) res.set('Cache-Control', 'no-store');
    try {
      const originZoneId = normalizeString(req.query.origin_zone_id);
      const destinationId = normalizeString(req.query.destination_id);
      const passengers = toInt(req.query.passengers, 1);

      if (!originZoneId || !destinationId) {
        return res.status(400).json({
          error: 'Missing required parameters',
          required: ['origin_zone_id', 'destination_id'],
          optional: ['passengers']
        });
      }

      const data = ensureTransferConfig(migrateHotelZones(await dataLayer.getFullConfig()));
      const vehicles = getAvailableVehiclesForDestination(originZoneId, destinationId, 'day', data);

      const zone = data.transferZones.find(z => z.id === originZoneId);
      const dest = data.destinations.find(d => d.id === destinationId);

      if (!zone || !dest) {
        return res.status(404).json({ error: 'Zone or destination not found' });
      }

      const suitableVehicles = vehicles
        .filter(v => v.max_passengers >= passengers)
        .map(v => ({
          name: v.name,
          max_passengers: v.max_passengers,
          price_eur: v.price,
          fits_passengers: passengers
        }));

      return res.json({
        quote: {
          from: zone.name,
          to: dest.name,
          passengers,
          options: suitableVehicles,
          cheapest: suitableVehicles[0] || null
        },
        contact: {
          phone: data.phoneNumber || null,
          whatsapp: data.whatsappNumber || null
        }
      });
    } catch (err) {
      console.error('moveathens: quote failed', err);
      return res.status(500).json({ error: 'Quote unavailable' });
    }
  });

  // Public: Full UI config
  app.get('/api/moveathens/ui-config', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const dbConfig = await dataLayer.getFullConfig();
      const data = ensureTransferConfig(migrateHotelZones(dbConfig));
      return res.json(data);
    } catch (err) {
      console.error('[moveathens] Config read error:', err);
      return res.status(500).json({ error: 'MoveAthens config unavailable' });
    }
  });

  // Public: Active zones (hotel dropdown)
  app.get('/api/moveathens/zones', async (req, res) => {
    if (isDev) res.set('Cache-Control', 'no-store');
    try {
      const data = ensureTransferConfig(migrateHotelZones(await dataLayer.getFullConfig()));
      const zones = data.transferZones
        .filter(z => z.is_active)
        .map(z => ({
          id: z.id,
          name: z.name,
          type: z.type,
          municipality: z.municipality || '',
          address: z.address || '',
          phone: z.phone || '',
          email: z.email || '',
          accommodation_type: z.accommodation_type || 'hotel'
        }));
      return res.json({ zones });
    } catch (err) {
      return res.status(500).json({ error: 'Hotels unavailable' });
    }
  });

  // Public: Hotel lookup by phone
  app.get('/api/moveathens/hotel-by-phone', async (req, res) => {
    if (isDev) res.set('Cache-Control', 'no-store');
    try {
      const phone = normalizeString(req.query.phone).replace(/[\s\-()]/g, '');
      if (!phone || phone.length < 5) {
        return res.status(400).json({ error: 'Invalid phone' });
      }
      const result = await dataLayer.getHotelByPhone(phone);
      if (!result) {
        return res.status(404).json({ error: 'Phone not found' });
      }
      const zone = result.zone;
      return res.json({
        zone: {
          id: zone.id,
          name: zone.name,
          type: zone.type,
          municipality: zone.municipality || '',
          address: zone.address || '',
          email: zone.email || '',
          accommodation_type: zone.accommodation_type || 'hotel',
          lat: zone.lat != null ? zone.lat : null,
          lng: zone.lng != null ? zone.lng : null
        },
        phones: (result.phones || []).map(p => ({
          id: p.id,
          phone: p.phone,
          label: p.label || ''
        }))
      });
    } catch (err) {
      console.error('[moveathens] hotel-by-phone error:', err.message);
      return res.status(500).json({ error: 'Lookup failed' });
    }
  });

  // Public: Active categories
  app.get('/api/moveathens/categories', async (req, res) => {
    if (isDev) res.set('Cache-Control', 'no-store');
    try {
      const data = ensureTransferConfig(migrateHotelZones(await dataLayer.getFullConfig()));
      const categories = data.destinationCategories
        .filter(c => c.is_active)
        .map(c => ({ id: c.id, name: c.name, icon: c.icon, display_order: c.display_order, is_arrival: c.is_arrival ?? false, color: c.color || '#1a73e8', icon_color: c.icon_color || 'white' }));
      return res.json({ categories });
    } catch (err) {
      return res.status(500).json({ error: 'Categories unavailable' });
    }
  });

  // Public: Active subcategories (optionally filtered by category)
  app.get('/api/moveathens/subcategories', async (req, res) => {
    if (isDev) res.set('Cache-Control', 'no-store');
    try {
      const categoryId = normalizeString(req.query.category_id);
      const data = ensureTransferConfig(migrateHotelZones(await dataLayer.getFullConfig()));
      let subs = (data.destinationSubcategories || []).filter(s => s.is_active);
      if (categoryId) subs = subs.filter(s => s.category_id === categoryId);
      // Only return subcategories that have at least 1 active destination
      const activeDests = (data.destinations || []).filter(d => d.is_active);
      subs = subs.filter(sub => activeDests.some(d => d.subcategory_id === sub.id));
      return res.json({
        subcategories: subs.map(s => ({
          id: s.id, category_id: s.category_id, name: s.name,
          description: s.description || '', display_order: s.display_order,
          is_arrival: s.is_arrival ?? false
        }))
      });
    } catch (err) {
      return res.status(500).json({ error: 'Subcategories unavailable' });
    }
  });

  // Public: Destinations (optionally filtered by category)
  app.get('/api/moveathens/destinations', async (req, res) => {
    if (isDev) res.set('Cache-Control', 'no-store');
    try {
      const categoryId = normalizeString(req.query.category_id);
      const subcategoryId = normalizeString(req.query.subcategory_id);
      const data = ensureTransferConfig(migrateHotelZones(await dataLayer.getFullConfig()));
      let destinations = data.destinations.filter(d => d.is_active);
      if (categoryId) {
        destinations = destinations.filter(d => d.category_id === categoryId);
      }
      if (subcategoryId) {
        destinations = destinations.filter(d => d.subcategory_id === subcategoryId);
      }
      return res.json({
        destinations: destinations.map(d => ({
          id: d.id,
          name: d.name,
          description: d.description,
          category_id: d.category_id,
          subcategory_id: d.subcategory_id || null,
          display_order: d.display_order,
          lat: d.lat || null,
          lng: d.lng || null,
          venue_type: d.venue_type || '',
          vibe: d.vibe || '',
          area: d.area || '',
          indicative_price: d.indicative_price || '',
          suitable_for: d.suitable_for || '',
          rating: d.rating || '',
          michelin: d.michelin || '',
          details: d.details || '',
          main_artist: d.main_artist || '',
          participating_artists: d.participating_artists || '',
          program_info: d.program_info || '',
          operating_days: d.operating_days || '',
          opening_time: d.opening_time || '',
          closing_time: d.closing_time || '',
          operating_schedule: d.operating_schedule || '',
          phone: d.phone || '',
          seasonal_open: d.seasonal_open || '',
          seasonal_close: d.seasonal_close || ''
        }))
      });
    } catch (err) {
      return res.status(500).json({ error: 'Destinations unavailable' });
    }
  });

  // Public: Vehicles with prices for specific route
  app.get('/api/moveathens/vehicles', async (req, res) => {
    if (isDev) res.set('Cache-Control', 'no-store');
    try {
      const originZoneId = normalizeString(req.query.origin_zone_id);
      const destinationId = normalizeString(req.query.destination_id);
      let tariff = normalizeString(req.query.tariff) || '';
      if (!originZoneId || !destinationId) {
        return res.status(400).json({ error: 'origin_zone_id and destination_id required' });
      }
      const data = ensureTransferConfig(migrateHotelZones(await dataLayer.getFullConfig()));
      // Auto-calculate tariff if not provided or 'auto'
      if (!tariff || tariff === 'auto' || !VALID_TARIFFS.includes(tariff)) {
        const refTime = normalizeString(req.query.ref_time);
        const refDate = refTime ? new Date(refTime) : new Date();
        tariff = calculateTariff(refDate, data);
      }
      const vehicles = getAvailableVehiclesForDestination(originZoneId, destinationId, tariff, data);
      return res.json({ vehicles, tariff });
    } catch (err) {
      return res.status(500).json({ error: 'Vehicles unavailable' });
    }
  });

  // ========================================
  // PUBLIC: Welcome page stats (dynamic metrics)
  // ========================================
  app.get('/api/moveathens/welcome-stats', async (req, res) => {
    if (isDev) res.set('Cache-Control', 'no-store');
    try {
      const data = ensureTransferConfig(migrateHotelZones(await dataLayer.getFullConfig()));

      // Count active hotels (transferZones)
      const hotels = (data.transferZones || []).filter(z => z.is_active).length;

      // Count active destinations
      const destinations = (data.destinations || []).filter(d => d.is_active).length;

      // Count active destination categories
      const categories = (data.destinationCategories || []).filter(c => c.is_active).length;

      // Count active drivers
      let activeDrivers = 0;
      try {
        const drivers = await driversLayer.getDrivers(true);
        activeDrivers = drivers.length;
      } catch (_) { /* fallback: 0 */ }

      // Flight tracking status
      const flightEnabled = !!process.env.FLIGHTAWARE_API_KEY && data.flightTrackingEnabled !== false;

      // Active vehicle types
      const vehicleTypes = (data.vehicleTypes || []).filter(v => v.is_active).length;

      // Welcome metric labels (admin-editable)
      const labels = data.welcomeMetrics || {};

      return res.json({
        metrics: {
          hotels:      { value: hotels,       label: labels.hotels       || 'Συνεργαζόμενα Ξενοδοχεία' },
          destinations:{ value: destinations,  label: labels.destinations || 'Προορισμοί' },
          categories:  { value: categories,    label: labels.categories   || 'Κατηγορίες Διαδρομών' }
        },
        status: {
          drivers:        { value: activeDrivers,  label: 'Ενεργοί Οδηγοί' },
          flightTracking: { value: flightEnabled,  label: 'Flight Tracking' },
          vehicles:       { value: vehicleTypes,   label: 'Τύποι Οχημάτων' }
        }
      });
    } catch (err) {
      console.error('[moveathens] welcome-stats error:', err);
      return res.status(500).json({ error: 'Stats unavailable' });
    }
  });

  // ========================================
  // PUBLIC: Personal hotel stats (per origin_zone_id)
  // ========================================
  app.get('/api/moveathens/my-stats', async (req, res) => {
    if (isDev) res.set('Cache-Control', 'no-store');
    try {
      const zoneId = String(req.query.zone_id || '').trim();
      if (!zoneId) return res.json({ myRoutes: 0, myRevenue: 0, myCommission: 0 });

      const allRequests = await requestsLayer.getRequests({});
      const mine = allRequests.filter(r => String(r.origin_zone_id) === zoneId);

      const active = mine.filter(r => r.status === 'accepted' || r.status === 'completed');
      const myRoutes = active.length;
      const myRevenue = active.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
      const myCommission = active.reduce((sum, r) => sum + (Number(r.commission_hotel) || 0), 0);

      return res.json({ myRoutes, myRevenue, myCommission });
    } catch (err) {
      console.error('[moveathens] my-stats error:', err);
      return res.status(500).json({ error: 'Stats unavailable' });
    }
  });

  // ========================================
  // ADMIN SECTION MODULES
  // ========================================
  require('./moveathens-general')(app, { checkAdminAuth });
  require('./moveathens-hotels')(app, { checkAdminAuth });
  require('./moveathens-categories')(app, { checkAdminAuth });
  require('./moveathens-subcategories')(app, { checkAdminAuth });
  require('./moveathens-destinations')(app, { checkAdminAuth });
  require('./moveathens-vehicles')(app, { checkAdminAuth });
  require('./moveathens-pricing')(app, { checkAdminAuth });
  require('./moveathens-uploads')(app, { checkAdminAuth });

  console.log('[MoveAthens] All routes registered (modular architecture)');
};
