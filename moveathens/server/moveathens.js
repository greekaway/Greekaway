const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
let multer = null;
try { multer = require('multer'); } catch (_) { multer = null; }

module.exports = function registerMoveAthens(app, opts = {}) {
  const isDev = !!opts.isDev;
  const checkAdminAuth = typeof opts.checkAdminAuth === 'function' ? opts.checkAdminAuth : null;
  const baseDir = path.join(__dirname, '..');
  const pagesDir = path.join(baseDir, 'pages');
  const dataDir = path.join(baseDir, 'data');
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

  const uiConfigPath = path.join(dataDir, 'moveathens_ui.json');

  const readUiConfig = () => {
    const raw = fs.readFileSync(uiConfigPath, 'utf8');
    return JSON.parse(raw);
  };

  const normalizeString = (value) => String(value || '').trim();
  const normalizeTypeName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const toInt = (v, def = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; };

  const validateAndMerge = (incoming, current) => {
    if (!incoming || typeof incoming !== 'object') {
      return { ok: false, error: 'Invalid payload' };
    }
    const required = [
      'heroHeadline',
      'heroSubtext',
      'phoneNumber',
      'whatsappNumber',
      'companyEmail'
    ];
    for (const key of required) {
      if (!(key in incoming)) return { ok: false, error: `Missing ${key}` };
    }
    if (!incoming.footerLabels || typeof incoming.footerLabels !== 'object') {
      return { ok: false, error: 'Missing footerLabels' };
    }
    const footerKeys = ['home', 'prices', 'cta', 'info', 'context'];
    for (const key of footerKeys) {
      if (!(key in incoming.footerLabels)) return { ok: false, error: `Missing footerLabels.${key}` };
    }

    const heroHeadline = normalizeString(incoming.heroHeadline);
    const heroSubtext = normalizeString(incoming.heroSubtext);
    if (heroHeadline.length > 120) return { ok: false, error: 'heroHeadline too long' };
    if (heroSubtext.length > 220) return { ok: false, error: 'heroSubtext too long' };

    const phone = normalizeString(incoming.phoneNumber);
    const whatsapp = normalizeString(incoming.whatsappNumber);
    const phoneRe = /^[+0-9][0-9 ()\-]{5,24}$/;
    if (phone && !phoneRe.test(phone)) return { ok: false, error: 'Invalid phoneNumber' };
    if (whatsapp && !phoneRe.test(whatsapp)) return { ok: false, error: 'Invalid whatsappNumber' };

    const merged = {
      ...(current || {}),
      heroHeadline,
      heroSubtext,
      footerLabels: {
        ...(current && current.footerLabels ? current.footerLabels : {}),
        home: normalizeString(incoming.footerLabels.home),
        prices: normalizeString(incoming.footerLabels.prices),
        cta: normalizeString(incoming.footerLabels.cta),
        info: normalizeString(incoming.footerLabels.info),
        context: normalizeString(incoming.footerLabels.context)
      },
      phoneNumber: phone,
      whatsappNumber: whatsapp,
      companyEmail: normalizeString(incoming.companyEmail)
    };

    if (typeof incoming.heroLogoUrl === 'string') {
      merged.heroLogoUrl = normalizeString(incoming.heroLogoUrl);
    }

    if (incoming.footerIcons && typeof incoming.footerIcons === 'object') {
      merged.footerIcons = {
        ...(current && current.footerIcons ? current.footerIcons : {}),
        home: normalizeString(incoming.footerIcons.home),
        prices: normalizeString(incoming.footerIcons.prices),
        cta: normalizeString(incoming.footerIcons.cta),
        info: normalizeString(incoming.footerIcons.info),
        context: normalizeString(incoming.footerIcons.context)
      };
    }

    return { ok: true, data: merged };
  };

  const writeAtomic = (data) => {
    const tmpPath = `${uiConfigPath}.tmp`;
    const backupPath = `${uiConfigPath}.bak`;
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    if (fs.existsSync(uiConfigPath)) {
      try { fs.copyFileSync(uiConfigPath, backupPath); } catch (_) {}
    }
    fs.renameSync(tmpPath, uiConfigPath);
  };

  const makeId = (prefix = 'id') => {
    if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  };

  // ========================================
  // ZONE NORMALIZATION
  // ========================================
  const allowedZoneTypes = new Set(['city_area', 'suburb', 'port', 'airport']);

  const normalizeZone = (zone) => {
    if (!zone || typeof zone !== 'object') return null;
    const name = normalizeString(zone.name);
    if (!name) return null;
    const type = normalizeString(zone.type);
    if (!allowedZoneTypes.has(type)) return null;
    const description = normalizeString(zone.description || '');
    const isActive = typeof zone.is_active === 'boolean' ? zone.is_active : true;
    const id = normalizeString(zone.id) || makeId('tz');
    const createdAt = normalizeString(zone.created_at) || new Date().toISOString();
    return {
      id,
      name,
      description,
      type,
      is_active: isActive,
      created_at: createdAt
    };
  };

  const normalizeZonesList = (zones) => {
    if (!Array.isArray(zones)) return [];
    const out = [];
    const seen = new Set();
    zones.forEach((zone) => {
      const normalized = normalizeZone(zone);
      if (!normalized) return;
      if (seen.has(normalized.id)) return;
      seen.add(normalized.id);
      out.push(normalized);
    });
    return out;
  };

  // ========================================
  // DESTINATION CATEGORY NORMALIZATION
  // ========================================
  const normalizeDestinationCategory = (entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const name = normalizeString(entry.name);
    if (!name) return null;
    const id = normalizeString(entry.id) || makeId('dc');
    const icon = normalizeString(entry.icon || '');
    const displayOrder = toInt(entry.display_order, 0);
    const isActive = typeof entry.is_active === 'boolean' ? entry.is_active : true;
    const createdAt = normalizeString(entry.created_at) || new Date().toISOString();
    return {
      id,
      name,
      icon,
      display_order: displayOrder,
      is_active: isActive,
      created_at: createdAt
    };
  };

  const normalizeDestinationCategories = (list) => {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    list.forEach((entry) => {
      const normalized = normalizeDestinationCategory(entry);
      if (!normalized) return;
      if (seen.has(normalized.id)) return;
      seen.add(normalized.id);
      out.push(normalized);
    });
    return out.sort((a, b) => a.display_order - b.display_order);
  };

  // ========================================
  // VEHICLE TYPE NORMALIZATION (EXTENDED)
  // ========================================
  const normalizeVehicleType = (entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const name = normalizeString(entry.name);
    if (!name) return null;
    const id = normalizeString(entry.id) || makeId('vt');
    const description = normalizeString(entry.description || '');
    const imageUrl = normalizeString(entry.imageUrl || '');
    const maxPassengers = toInt(entry.max_passengers, 4);
    const luggageLarge = toInt(entry.luggage_large, 0);
    const luggageMedium = toInt(entry.luggage_medium, 0);
    const luggageCabin = toInt(entry.luggage_cabin, 0);
    const displayOrder = toInt(entry.display_order, 0);
    const isActive = typeof entry.is_active === 'boolean' ? entry.is_active : true;
    const createdAt = normalizeString(entry.created_at) || new Date().toISOString();
    return {
      id,
      name,
      description,
      imageUrl,
      max_passengers: maxPassengers,
      luggage_large: luggageLarge,
      luggage_medium: luggageMedium,
      luggage_cabin: luggageCabin,
      display_order: displayOrder,
      is_active: isActive,
      created_at: createdAt
    };
  };

  const normalizeVehicleTypes = (list) => {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    list.forEach((entry) => {
      const normalized = normalizeVehicleType(entry);
      if (!normalized) return;
      if (seen.has(normalized.id)) return;
      seen.add(normalized.id);
      out.push(normalized);
    });
    return out.sort((a, b) => a.display_order - b.display_order);
  };

  // ========================================
  // DESTINATION NORMALIZATION (EXTENDED)
  // ========================================
  const normalizeDestination = (entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const name = normalizeString(entry.name);
    if (!name) return null;
    const id = normalizeString(entry.id) || makeId('dest');
    const description = normalizeString(entry.description || '');
    const categoryId = normalizeString(entry.category_id || '');
    const zoneId = normalizeString(entry.zone_id || '');
    const displayOrder = toInt(entry.display_order, 0);
    const isActive = typeof entry.is_active === 'boolean' ? entry.is_active : true;
    const createdAt = normalizeString(entry.created_at) || new Date().toISOString();
    return {
      id,
      name,
      description,
      category_id: categoryId,
      zone_id: zoneId,
      display_order: displayOrder,
      is_active: isActive,
      created_at: createdAt
    };
  };

  const normalizeDestinations = (list) => {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    list.forEach((entry) => {
      const normalized = normalizeDestination(entry);
      if (!normalized) return;
      if (seen.has(normalized.id)) return;
      seen.add(normalized.id);
      out.push(normalized);
    });
    return out.sort((a, b) => a.display_order - b.display_order);
  };

  // ========================================
  // TRANSFER PRICE NORMALIZATION (ZONE → DESTINATION → VEHICLE)
  // ========================================
  const normalizeTransferPrice = (entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const originZoneId = normalizeString(entry.origin_zone_id);
    const destinationId = normalizeString(entry.destination_id);
    const vehicleTypeId = normalizeString(entry.vehicle_type_id);
    if (!originZoneId || !destinationId || !vehicleTypeId) return null;
    const price = Number(entry.price);
    if (!Number.isFinite(price) || price < 0) return null;
    const id = normalizeString(entry.id) || makeId('tp');
    return {
      id,
      origin_zone_id: originZoneId,
      destination_id: destinationId,
      vehicle_type_id: vehicleTypeId,
      price
    };
  };

  const normalizeTransferPrices = (list) => {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    list.forEach((entry) => {
      const normalized = normalizeTransferPrice(entry);
      if (!normalized) return;
      // Unique: (origin_zone, destination, vehicle_type)
      const key = `${normalized.origin_zone_id}__${normalized.destination_id}__${normalized.vehicle_type_id}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(normalized);
    });
    return out;
  };

  // ========================================
  // VEHICLE CATEGORY AVAILABILITY
  // ========================================
  const normalizeVehicleCategoryAvailability = (entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const vehicleTypeId = normalizeString(entry.vehicle_type_id);
    const categoryId = normalizeString(entry.category_id);
    if (!vehicleTypeId || !categoryId) return null;
    const isAvailable = typeof entry.is_available === 'boolean' ? entry.is_available : true;
    return {
      vehicle_type_id: vehicleTypeId,
      category_id: categoryId,
      is_available: isAvailable
    };
  };

  const normalizeVehicleCategoryAvailabilityList = (list) => {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    list.forEach((entry) => {
      const normalized = normalizeVehicleCategoryAvailability(entry);
      if (!normalized) return;
      const key = `${normalized.vehicle_type_id}__${normalized.category_id}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(normalized);
    });
    return out;
  };

  // ========================================
  // VEHICLE DESTINATION OVERRIDE
  // ========================================
  const normalizeVehicleDestinationOverride = (entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const vehicleTypeId = normalizeString(entry.vehicle_type_id);
    const destinationId = normalizeString(entry.destination_id);
    if (!vehicleTypeId || !destinationId) return null;
    const isAvailable = typeof entry.is_available === 'boolean' ? entry.is_available : true;
    return {
      vehicle_type_id: vehicleTypeId,
      destination_id: destinationId,
      is_available: isAvailable
    };
  };

  const normalizeVehicleDestinationOverrides = (list) => {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    list.forEach((entry) => {
      const normalized = normalizeVehicleDestinationOverride(entry);
      if (!normalized) return;
      const key = `${normalized.vehicle_type_id}__${normalized.destination_id}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(normalized);
    });
    return out;
  };

  // ========================================
  // CONFIG MIGRATION & ENSURE
  // ========================================
  const migrateHotelZones = (config) => {
    if (!config || typeof config !== 'object') return config;
    if (Array.isArray(config.transferZones) && config.transferZones.length) return config;
    if (!Array.isArray(config.hotelZones) || !config.hotelZones.length) return config;
    const now = new Date().toISOString();
    const transferZones = config.hotelZones
      .map((name) => normalizeZone({ name, type: 'city_area', is_active: true, created_at: now }))
      .filter(Boolean);
    const updated = { ...(config || {}), transferZones };
    delete updated.hotelZones;
    try { writeAtomic(updated); } catch (_) {}
    return updated;
  };

  const ensureTransferConfig = (config) => {
    if (!config || typeof config !== 'object') return config;
    return {
      ...(config || {}),
      transferZones: normalizeZonesList(config.transferZones || []),
      destinationCategories: normalizeDestinationCategories(config.destinationCategories || []),
      vehicleTypes: normalizeVehicleTypes(config.vehicleTypes || []),
      destinations: normalizeDestinations(config.destinations || []),
      transferPrices: normalizeTransferPrices(config.transferPrices || []),
      vehicleCategoryAvailability: normalizeVehicleCategoryAvailabilityList(config.vehicleCategoryAvailability || []),
      vehicleDestinationOverrides: normalizeVehicleDestinationOverrides(config.vehicleDestinationOverrides || [])
    };
  };

  // ========================================
  // PRICE CALCULATION LOGIC (SOURCE OF TRUTH)
  // ========================================
  /**
   * Get price for a specific route
   * @param {string} originZoneId - Hotel's zone
   * @param {string} destinationId - Destination ID
   * @param {string} vehicleTypeId - Vehicle type
   * @param {Array} transferPrices - All transfer prices
   * @returns {number|null} - Price or null if not defined
   */
  const getPrice = (originZoneId, destinationId, vehicleTypeId, transferPrices) => {
    const price = transferPrices.find(p =>
      p.origin_zone_id === originZoneId &&
      p.destination_id === destinationId &&
      p.vehicle_type_id === vehicleTypeId
    );
    return price ? price.price : null;
  };

  /**
   * Check if vehicle is available for a destination
   * Logic: Override > Category > Default (true)
   */
  const isVehicleAvailableForDestination = (vehicleTypeId, destination, categoryAvail, destOverrides) => {
    // 1. Check destination override first
    const override = destOverrides.find(o =>
      o.vehicle_type_id === vehicleTypeId &&
      o.destination_id === destination.id
    );
    if (override) return override.is_available;

    // 2. Check category availability
    if (destination.category_id) {
      const catAvail = categoryAvail.find(c =>
        c.vehicle_type_id === vehicleTypeId &&
        c.category_id === destination.category_id
      );
      if (catAvail) return catAvail.is_available;
    }

    // 3. Default: available
    return true;
  };

  /**
   * Get available vehicles with prices for a destination
   * Called from frontend with origin_zone_id (hotel zone) and destination_id
   * Price lookup: origin_zone_id + destination_id + vehicle_type_id
   */
  const getAvailableVehiclesForDestination = (originZoneId, destinationId, config) => {
    const destination = config.destinations.find(d => d.id === destinationId);
    if (!destination || !destination.is_active) return [];

    const results = [];

    config.vehicleTypes.forEach(vehicle => {
      if (!vehicle.is_active) return;

      // Check availability
      const isAvailable = isVehicleAvailableForDestination(
        vehicle.id,
        destination,
        config.vehicleCategoryAvailability,
        config.vehicleDestinationOverrides
      );
      if (!isAvailable) return;

      // Get price: origin_zone + destination + vehicle
      const price = getPrice(originZoneId, destinationId, vehicle.id, config.transferPrices);
      if (price === null) return; // No price = not shown

      results.push({
        id: vehicle.id,
        name: vehicle.name,
        description: vehicle.description,
        imageUrl: vehicle.imageUrl,
        max_passengers: vehicle.max_passengers,
        luggage_large: vehicle.luggage_large,
        luggage_medium: vehicle.luggage_medium,
        luggage_cabin: vehicle.luggage_cabin,
        price
      });
    });

    return results.sort((a, b) => a.price - b.price);
  };

  // ========================================
  // PUBLIC API ENDPOINTS
  // ========================================

  // AI-ready endpoint: Returns structured data for AI assistants
  // This endpoint provides all transfer information in a format optimized for LLMs
  app.get('/api/moveathens/ai-context', (req, res) => {
    if (isDev) res.set('Cache-Control', 'no-store');
    try {
      const originZoneId = normalizeString(req.query.zone_id);
      const data = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      
      // Get active zones
      const zones = data.transferZones
        .filter(z => z.is_active)
        .map(z => ({ id: z.id, name: z.name, type: z.type }));
      
      // Get active categories with their destinations
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
              
              // If origin zone provided, include available vehicles with prices
              if (originZoneId) {
                const vehicles = getAvailableVehiclesForDestination(originZoneId, dest.id, data);
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
      
      // Build response
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
      
      // Add pricing context if zone provided
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

  // Quote endpoint for AI: Get price for specific transfer
  app.get('/api/moveathens/quote', (req, res) => {
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
      
      const data = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      const vehicles = getAvailableVehiclesForDestination(originZoneId, destinationId, data);
      
      // Find zone and destination names
      const zone = data.transferZones.find(z => z.id === originZoneId);
      const dest = data.destinations.find(d => d.id === destinationId);
      
      if (!zone || !dest) {
        return res.status(404).json({ error: 'Zone or destination not found' });
      }
      
      // Filter vehicles that can accommodate passengers
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

  app.get('/api/moveathens/ui-config', (req, res) => {
    if (isDev) res.set('Cache-Control', 'no-store');
    try {
      const data = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      return res.json(data);
    } catch (err) {
      return res.status(500).json({ error: 'MoveAthens config unavailable' });
    }
  });

  // Get active zones (for hotel context dropdown)
  app.get('/api/moveathens/zones', (req, res) => {
    if (isDev) res.set('Cache-Control', 'no-store');
    try {
      const data = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      const zones = data.transferZones
        .filter(z => z.is_active)
        .map(z => ({ id: z.id, name: z.name, type: z.type }));
      return res.json({ zones });
    } catch (err) {
      return res.status(500).json({ error: 'Zones unavailable' });
    }
  });

  // Get active categories
  app.get('/api/moveathens/categories', (req, res) => {
    if (isDev) res.set('Cache-Control', 'no-store');
    try {
      const data = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      const categories = data.destinationCategories
        .filter(c => c.is_active)
        .map(c => ({ id: c.id, name: c.name, icon: c.icon, display_order: c.display_order }));
      return res.json({ categories });
    } catch (err) {
      return res.status(500).json({ error: 'Categories unavailable' });
    }
  });

  // Get destinations by category (only active)
  app.get('/api/moveathens/destinations', (req, res) => {
    if (isDev) res.set('Cache-Control', 'no-store');
    try {
      const categoryId = normalizeString(req.query.category_id);
      const data = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      let destinations = data.destinations.filter(d => d.is_active);
      if (categoryId) {
        destinations = destinations.filter(d => d.category_id === categoryId);
      }
      return res.json({
        destinations: destinations.map(d => ({
          id: d.id,
          name: d.name,
          description: d.description,
          category_id: d.category_id,
          display_order: d.display_order
        }))
      });
    } catch (err) {
      return res.status(500).json({ error: 'Destinations unavailable' });
    }
  });

  // Get vehicles with prices for a destination (requires origin_zone_id)
  app.get('/api/moveathens/vehicles', (req, res) => {
    if (isDev) res.set('Cache-Control', 'no-store');
    try {
      const originZoneId = normalizeString(req.query.origin_zone_id);
      const destinationId = normalizeString(req.query.destination_id);
      if (!originZoneId || !destinationId) {
        return res.status(400).json({ error: 'origin_zone_id and destination_id required' });
      }
      const data = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      const vehicles = getAvailableVehiclesForDestination(originZoneId, destinationId, data);
      return res.json({ vehicles });
    } catch (err) {
      return res.status(500).json({ error: 'Vehicles unavailable' });
    }
  });

  // ========================================
  // ADMIN API ENDPOINTS
  // ========================================
  app.get('/api/admin/moveathens/ui-config', (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const data = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      return res.json(data);
    } catch (err) {
      return res.status(500).json({ error: 'MoveAthens config unavailable' });
    }
  });

  // --- ZONES ---
  app.get('/api/admin/moveathens/transfer-zones', (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const data = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      return res.json({ zones: data.transferZones });
    } catch (err) {
      return res.status(500).json({ error: 'MoveAthens zones unavailable' });
    }
  });

  app.put('/api/admin/moveathens/transfer-zones', (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const incoming = req.body || {};
      const zones = normalizeZonesList(incoming.zones || []);
      const current = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      const updated = { ...current, transferZones: zones };
      writeAtomic(updated);
      return res.json({ zones });
    } catch (err) {
      console.error('moveathens: save zones failed', err && err.stack ? err.stack : err);
      return res.status(500).json({ error: 'Failed to save zones' });
    }
  });

  // --- DESTINATION CATEGORIES ---
  app.get('/api/admin/moveathens/destination-categories', (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const data = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      return res.json({ categories: data.destinationCategories });
    } catch (err) {
      return res.status(500).json({ error: 'Categories unavailable' });
    }
  });

  app.put('/api/admin/moveathens/destination-categories', (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const incoming = req.body || {};
      const categories = normalizeDestinationCategories(incoming.categories || []);
      const current = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      const updated = { ...current, destinationCategories: categories };
      writeAtomic(updated);
      return res.json({ categories });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save categories' });
    }
  });

  // --- VEHICLE TYPES ---
  app.get('/api/admin/moveathens/vehicle-types', (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const data = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      return res.json({ vehicleTypes: data.vehicleTypes });
    } catch (err) {
      return res.status(500).json({ error: 'Vehicle types unavailable' });
    }
  });

  app.put('/api/admin/moveathens/vehicle-types', (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const incoming = req.body || {};
      const incomingList = Array.isArray(incoming.vehicleTypes) ? incoming.vehicleTypes : [];
      const seenNames = new Map();
      incomingList.forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        const norm = normalizeTypeName(entry.name);
        if (!norm) return;
        const id = normalizeString(entry.id) || '';
        if (seenNames.has(norm) && seenNames.get(norm) !== id) {
          throw Object.assign(new Error('DUPLICATE_NAME'), { code: 409 });
        }
        seenNames.set(norm, id);
      });
      const vehicleTypes = normalizeVehicleTypes(incomingList);
      const current = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      const updated = { ...current, vehicleTypes };
      writeAtomic(updated);
      return res.json({ vehicleTypes });
    } catch (err) {
      if (err && err.code === 409) {
        return res.status(409).json({ error: 'DUPLICATE_NAME', message: 'Type name already exists' });
      }
      return res.status(500).json({ error: 'Failed to save vehicle types' });
    }
  });

  // --- DESTINATIONS ---
  app.get('/api/admin/moveathens/destinations', (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const data = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      return res.json({ destinations: data.destinations });
    } catch (err) {
      return res.status(500).json({ error: 'Destinations unavailable' });
    }
  });

  app.put('/api/admin/moveathens/destinations', (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const incoming = req.body || {};
      const destinations = normalizeDestinations(incoming.destinations || []);
      const current = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      const updated = { ...current, destinations };
      writeAtomic(updated);
      return res.json({ destinations });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save destinations' });
    }
  });

  // --- TRANSFER PRICES (ZONE MATRIX) ---
  app.get('/api/admin/moveathens/transfer-prices', (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const data = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      return res.json({ transferPrices: data.transferPrices });
    } catch (err) {
      return res.status(500).json({ error: 'Transfer prices unavailable' });
    }
  });

  app.put('/api/admin/moveathens/transfer-prices', (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const incoming = req.body || {};
      const transferPrices = normalizeTransferPrices(incoming.transferPrices || []);
      const current = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      const updated = { ...current, transferPrices };
      writeAtomic(updated);
      return res.json({ transferPrices });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save transfer prices' });
    }
  });

  // --- VEHICLE CATEGORY AVAILABILITY ---
  app.get('/api/admin/moveathens/vehicle-category-availability', (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const data = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      return res.json({ availability: data.vehicleCategoryAvailability });
    } catch (err) {
      return res.status(500).json({ error: 'Availability unavailable' });
    }
  });

  app.put('/api/admin/moveathens/vehicle-category-availability', (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const incoming = req.body || {};
      const availability = normalizeVehicleCategoryAvailabilityList(incoming.availability || []);
      const current = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      const updated = { ...current, vehicleCategoryAvailability: availability };
      writeAtomic(updated);
      return res.json({ availability });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save availability' });
    }
  });

  // --- VEHICLE DESTINATION OVERRIDES ---
  app.get('/api/admin/moveathens/vehicle-destination-overrides', (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const data = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      return res.json({ overrides: data.vehicleDestinationOverrides });
    } catch (err) {
      return res.status(500).json({ error: 'Overrides unavailable' });
    }
  });

  app.put('/api/admin/moveathens/vehicle-destination-overrides', (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const incoming = req.body || {};
      const overrides = normalizeVehicleDestinationOverrides(incoming.overrides || []);
      const current = ensureTransferConfig(migrateHotelZones(readUiConfig()));
      const updated = { ...current, vehicleDestinationOverrides: overrides };
      writeAtomic(updated);
      return res.json({ overrides });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save overrides' });
    }
  });

  // ========================================
  // FILE UPLOADS
  // ========================================
  if (multer) {
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 }
    });

    app.post('/api/admin/moveathens/upload-hero-video', upload.single('video'), (req, res) => {
      if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
      try {
        if (!req.file) return res.status(400).json({ error: 'Missing file' });
        if (req.file.mimetype !== 'video/mp4') return res.status(400).json({ error: 'Invalid file type' });
        const videosDir = path.join(baseDir, 'videos');
        fs.mkdirSync(videosDir, { recursive: true });
        const outPath = path.join(videosDir, 'hero.mp4');
        fs.writeFileSync(outPath, req.file.buffer);
        const url = '/moveathens/videos/hero.mp4';
        try {
          const current = readUiConfig();
          const updated = { ...current, heroVideoUrl: url };
          writeAtomic(updated);
        } catch (_) {}
        return res.json({ url });
      } catch (err) {
        return res.status(500).json({ error: 'Upload failed' });
      }
    });

    app.post('/api/admin/moveathens/upload-hero-logo', upload.single('logo'), (req, res) => {
      if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
      try {
        if (!req.file) return res.status(400).json({ error: 'Missing file' });
        const allowed = new Set(['image/png', 'image/webp', 'image/svg+xml']);
        if (!allowed.has(req.file.mimetype)) return res.status(400).json({ error: 'Invalid file type' });
        const ext = req.file.mimetype === 'image/svg+xml' ? 'svg' : (req.file.mimetype === 'image/webp' ? 'webp' : 'png');
        const videosDir = path.join(baseDir, 'videos');
        fs.mkdirSync(videosDir, { recursive: true });
        const outPath = path.join(videosDir, `hero-logo.${ext}`);
        fs.writeFileSync(outPath, req.file.buffer);
        const url = `/moveathens/videos/hero-logo.${ext}`;
        try {
          const current = readUiConfig();
          const updated = { ...current, heroLogoUrl: url };
          writeAtomic(updated);
        } catch (_) {}
        return res.json({ url });
      } catch (err) {
        return res.status(500).json({ error: 'Upload failed' });
      }
    });

    app.post('/api/admin/moveathens/upload-vehicle-image', upload.single('image'), (req, res) => {
      if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
      try {
        if (!req.file) return res.status(400).json({ error: 'Missing file' });
        const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);
        if (!allowed.has(req.file.mimetype)) return res.status(400).json({ error: 'Invalid file type' });
        const ext = req.file.mimetype === 'image/webp' ? 'webp' : (req.file.mimetype === 'image/jpeg' ? 'jpg' : 'png');
        const imagesDir = path.join(baseDir, 'images');
        fs.mkdirSync(imagesDir, { recursive: true });
        const name = crypto.randomUUID ? crypto.randomUUID() : `veh_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const outPath = path.join(imagesDir, `vehicle-${name}.${ext}`);
        fs.writeFileSync(outPath, req.file.buffer);
        const url = `/moveathens/images/vehicle-${name}.${ext}`;
        return res.json({ url });
      } catch (err) {
        return res.status(500).json({ error: 'Upload failed' });
      }
    });

    // Category icon upload
    app.post('/api/admin/moveathens/upload-category-icon', upload.single('icon'), (req, res) => {
      if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
      try {
        if (!req.file) return res.status(400).json({ error: 'Missing file' });
        const allowed = new Set(['image/svg+xml', 'image/png', 'image/jpeg']);
        if (!allowed.has(req.file.mimetype)) return res.status(400).json({ error: 'Invalid file type. Use SVG, PNG or JPEG' });
        const ext = req.file.mimetype === 'image/svg+xml' ? 'svg' : (req.file.mimetype === 'image/jpeg' ? 'jpg' : 'png');
        const iconsDir = path.join(baseDir, 'icons', 'categories');
        fs.mkdirSync(iconsDir, { recursive: true });
        const name = crypto.randomUUID ? crypto.randomUUID() : `cat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const outPath = path.join(iconsDir, `category-${name}.${ext}`);
        fs.writeFileSync(outPath, req.file.buffer);
        const url = `/moveathens/icons/categories/category-${name}.${ext}`;
        return res.json({ url });
      } catch (err) {
        return res.status(500).json({ error: 'Upload failed' });
      }
    });

    app.post('/api/admin/moveathens/upload-footer-icon', upload.single('icon'), (req, res) => {
      if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
      try {
        const key = String(req.query.key || '').trim();
        const allowedKeys = new Set(['home', 'prices', 'cta', 'info', 'context']);
        if (!allowedKeys.has(key)) return res.status(400).json({ error: 'Invalid key' });
        if (!req.file) return res.status(400).json({ error: 'Missing file' });
        if (req.file.mimetype !== 'image/svg+xml') return res.status(400).json({ error: 'Invalid file type' });
        const iconsDir = path.join(baseDir, 'icons');
        fs.mkdirSync(iconsDir, { recursive: true });
        const outPath = path.join(iconsDir, `footer-${key}.svg`);
        fs.writeFileSync(outPath, req.file.buffer);
        const url = `/moveathens/icons/footer-${key}.svg`;
        try {
          const current = readUiConfig();
          const updated = {
            ...current,
            footerIcons: { ...(current && current.footerIcons ? current.footerIcons : {}), [key]: url }
          };
          writeAtomic(updated);
        } catch (_) {}
        return res.json({ url });
      } catch (err) {
        return res.status(500).json({ error: 'Upload failed' });
      }
    });
  }

  app.post('/api/admin/moveathens/ui-config', (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const current = readUiConfig();
      const validated = validateAndMerge(req.body || {}, current);
      if (!validated.ok) return res.status(400).json({ error: validated.error });
      writeAtomic(validated.data);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save config' });
    }
  });

  // PUT endpoint for partial updates (info page content, etc.)
  app.put('/api/admin/moveathens/ui-config', (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const current = readUiConfig();
      const body = req.body || {};
      
      // Allowed partial update fields
      if (typeof body.infoPageTitle === 'string') {
        current.infoPageTitle = normalizeString(body.infoPageTitle).slice(0, 200);
      }
      if (typeof body.infoPageContent === 'string') {
        current.infoPageContent = body.infoPageContent.slice(0, 10000); // Allow up to 10k chars
      }
      
      writeAtomic(current);
      return res.json(current);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save config' });
    }
  });
};
