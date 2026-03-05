/**
 * MoveAthens — Shared Helpers & Normalization
 *
 * Centralised utility functions used across all MoveAthens server modules.
 * Includes:  string helpers, ID generation, normalizers for every entity,
 *            config migration, and price-calculation logic.
 */
'use strict';

const crypto = require('crypto');

// ========================================
// STRING / ID UTILITIES
// ========================================
const normalizeString = (value) => String(value || '').trim();
const normalizeTypeName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const toInt = (v, def = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; };

const makeId = (prefix = 'id') => {
  if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
};

// ========================================
// GENERAL CONFIG VALIDATION
// ========================================
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
  const irisPhone = normalizeString(incoming.irisPhone || '');
  const phoneRe = /^[+0-9][0-9 ()\-]{5,24}$/;
  if (phone && !phoneRe.test(phone)) return { ok: false, error: 'Invalid phoneNumber' };
  if (whatsapp && !phoneRe.test(whatsapp)) return { ok: false, error: 'Invalid whatsappNumber' };
  if (irisPhone && !phoneRe.test(irisPhone)) return { ok: false, error: 'Invalid irisPhone' };

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
    companyEmail: normalizeString(incoming.companyEmail),
    irisPhone: irisPhone
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

  // Price visibility toggle (boolean, default true)
  if (typeof incoming.showPriceInMessage === 'boolean') {
    merged.showPriceInMessage = incoming.showPriceInMessage;
  }

  // Hero video visibility toggle (boolean, default true)
  if (typeof incoming.heroVideoEnabled === 'boolean') {
    merged.heroVideoEnabled = incoming.heroVideoEnabled;
  }

  // Flight tracking toggles
  if (typeof incoming.flightTrackingEnabled === 'boolean') {
    merged.flightTrackingEnabled = incoming.flightTrackingEnabled;
  }
  if (typeof incoming.flightCheckMinsBefore === 'number' && incoming.flightCheckMinsBefore >= 5 && incoming.flightCheckMinsBefore <= 120) {
    merged.flightCheckMinsBefore = incoming.flightCheckMinsBefore;
  }

  // Welcome page metric labels (admin-editable)
  if (incoming.welcomeMetrics && typeof incoming.welcomeMetrics === 'object') {
    const wm = incoming.welcomeMetrics;
    merged.welcomeMetrics = {
      hotels:      normalizeString(wm.hotels      || '').slice(0, 100) || (current.welcomeMetrics && current.welcomeMetrics.hotels)      || '',
      routes:      normalizeString(wm.routes      || '').slice(0, 100) || (current.welcomeMetrics && current.welcomeMetrics.routes)      || '',
      destinations:normalizeString(wm.destinations || '').slice(0, 100) || (current.welcomeMetrics && current.welcomeMetrics.destinations) || '',
      categories:  normalizeString(wm.categories  || '').slice(0, 100) || (current.welcomeMetrics && current.welcomeMetrics.categories)  || ''
    };
  }

  // Welcome text block (admin-editable, max 500 chars)
  if (typeof incoming.welcomeTextBlock === 'string') {
    merged.welcomeTextBlock = normalizeString(incoming.welcomeTextBlock).slice(0, 500);
  }

  return { ok: true, data: merged };
};

// ========================================
// HOTEL (formerly ZONE) NORMALIZATION
// ========================================
const allowedZoneTypes = new Set(['city_area', 'suburb', 'port', 'airport']);
const allowedAccommodationTypes = new Set(['hotel', 'rental_rooms']);

const normalizeZone = (zone) => {
  if (!zone || typeof zone !== 'object') return null;
  const name = normalizeString(zone.name);
  if (!name) return null;
  const type = normalizeString(zone.type) || 'suburb';
  const zoneType = allowedZoneTypes.has(type) ? type : 'suburb';
  const description = normalizeString(zone.description || '');
  const municipality = normalizeString(zone.municipality || '');
  const address = normalizeString(zone.address || '');
  const phone = normalizeString(zone.phone || '');
  const email = normalizeString(zone.email || '');
  let accommodationType = normalizeString(zone.accommodation_type || 'hotel');
  if (!allowedAccommodationTypes.has(accommodationType)) accommodationType = 'hotel';
  const lat = zone.lat != null && zone.lat !== '' ? parseFloat(zone.lat) : null;
  const lng = zone.lng != null && zone.lng !== '' ? parseFloat(zone.lng) : null;
  const isActive = typeof zone.is_active === 'boolean' ? zone.is_active : true;
  const id = normalizeString(zone.id) || makeId('tz');
  const createdAt = normalizeString(zone.created_at) || new Date().toISOString();
  return {
    id,
    name,
    description,
    type: zoneType,
    municipality,
    address,
    phone,
    email,
    accommodation_type: accommodationType,
    lat: (lat !== null && !isNaN(lat)) ? lat : null,
    lng: (lng !== null && !isNaN(lng)) ? lng : null,
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
  const isArrival = typeof entry.is_arrival === 'boolean' ? entry.is_arrival : false;
  const color = normalizeString(entry.color || '') || '#1a73e8';
  const createdAt = normalizeString(entry.created_at) || new Date().toISOString();
  return {
    id,
    name,
    icon,
    display_order: displayOrder,
    is_active: isActive,
    is_arrival: isArrival,
    color,
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
  const allowInstant = typeof entry.allow_instant === 'boolean' ? entry.allow_instant : true;
  const minAdvanceMinutes = toInt(entry.min_advance_minutes, 0);
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
    allow_instant: allowInstant,
    min_advance_minutes: minAdvanceMinutes,
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
  const routeType = normalizeString(entry.route_type || '');
  const lat = entry.lat != null ? parseFloat(entry.lat) : null;
  const lng = entry.lng != null ? parseFloat(entry.lng) : null;
  const displayOrder = toInt(entry.display_order, 0);
  const isActive = typeof entry.is_active === 'boolean' ? entry.is_active : true;
  const createdAt = normalizeString(entry.created_at) || new Date().toISOString();
  return {
    id,
    name,
    description,
    category_id: categoryId,
    zone_id: zoneId,
    route_type: routeType || null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
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
// TRANSFER PRICE NORMALIZATION
// Tariff types: 'day' (05:00-00:00), 'night' (00:00-05:00)
// ========================================
const VALID_TARIFFS = ['day', 'night'];

const normalizeTransferPrice = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const originZoneId = normalizeString(entry.origin_zone_id);
  const destinationId = normalizeString(entry.destination_id);
  const vehicleTypeId = normalizeString(entry.vehicle_type_id);
  if (!originZoneId || !destinationId || !vehicleTypeId) return null;
  const price = Number(entry.price);
  if (!Number.isFinite(price) || price < 0) return null;
  const id = normalizeString(entry.id) || makeId('tp');
  let tariff = normalizeString(entry.tariff) || 'day';
  if (!VALID_TARIFFS.includes(tariff)) tariff = 'day';
  const commissionDriver = Math.max(0, Number(entry.commission_driver) || 0);
  const commissionHotel = Math.max(0, Number(entry.commission_hotel) || 0);
  const commissionService = Math.max(0, Number(entry.commission_service) || 0);
  return {
    id,
    origin_zone_id: originZoneId,
    destination_id: destinationId,
    vehicle_type_id: vehicleTypeId,
    tariff,
    price,
    commission_driver: commissionDriver,
    commission_hotel: commissionHotel,
    commission_service: commissionService
  };
};

const normalizeTransferPrices = (list) => {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  list.forEach((entry) => {
    const normalized = normalizeTransferPrice(entry);
    if (!normalized) return;
    const key = `${normalized.origin_zone_id}__${normalized.destination_id}__${normalized.vehicle_type_id}__${normalized.tariff}`;
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
 * Get price for a specific route and tariff
 */
const getPrice = (originZoneId, destinationId, vehicleTypeId, tariff, transferPrices) => {
  const price = transferPrices.find(p =>
    p.origin_zone_id === originZoneId &&
    p.destination_id === destinationId &&
    p.vehicle_type_id === vehicleTypeId &&
    p.tariff === tariff
  );
  return price ? price.price : null;
};

/**
 * Get prices for both tariffs
 */
const getPricesBothTariffs = (originZoneId, destinationId, vehicleTypeId, transferPrices) => {
  return {
    day: getPrice(originZoneId, destinationId, vehicleTypeId, 'day', transferPrices),
    night: getPrice(originZoneId, destinationId, vehicleTypeId, 'night', transferPrices)
  };
};

/**
 * Check if vehicle is available for a destination
 * Logic: Override > Category > Default (true)
 */
const isVehicleAvailableForDestination = (vehicleTypeId, destination, categoryAvail, destOverrides) => {
  const override = destOverrides.find(o =>
    o.vehicle_type_id === vehicleTypeId &&
    o.destination_id === destination.id
  );
  if (override) return override.is_available;

  if (destination.category_id) {
    const catAvail = categoryAvail.find(c =>
      c.vehicle_type_id === vehicleTypeId &&
      c.category_id === destination.category_id
    );
    if (catAvail) return catAvail.is_available;
  }

  return true;
};

/**
 * Get available vehicles with prices for a destination and tariff
 */
const getAvailableVehiclesForDestination = (originZoneId, destinationId, tariff, config) => {
  const destination = config.destinations.find(d => d.id === destinationId);
  if (!destination || !destination.is_active) return [];

  const validTariff = VALID_TARIFFS.includes(tariff) ? tariff : 'day';
  const results = [];

  config.vehicleTypes.forEach(vehicle => {
    if (!vehicle.is_active) return;

    const isAvailable = isVehicleAvailableForDestination(
      vehicle.id,
      destination,
      config.vehicleCategoryAvailability,
      config.vehicleDestinationOverrides
    );
    if (!isAvailable) return;

    const price = getPrice(originZoneId, destinationId, vehicle.id, validTariff, config.transferPrices);
    if (price === null) return;

    results.push({
      id: vehicle.id,
      name: vehicle.name,
      description: vehicle.description,
      imageUrl: vehicle.imageUrl,
      max_passengers: vehicle.max_passengers,
      luggage_large: vehicle.luggage_large,
      luggage_medium: vehicle.luggage_medium,
      luggage_cabin: vehicle.luggage_cabin,
      allow_instant: vehicle.allow_instant !== false,
      min_advance_minutes: vehicle.min_advance_minutes || 0,
      price,
      tariff: validTariff
    });
  });

  return results.sort((a, b) => a.price - b.price);
};

// ========================================
// EXPORTS
// ========================================
module.exports = {
  // String / ID utilities
  normalizeString,
  normalizeTypeName,
  toInt,
  makeId,
  // General config
  validateAndMerge,
  // Zone / Hotel normalization
  normalizeZone,
  normalizeZonesList,
  // Category normalization
  normalizeDestinationCategory,
  normalizeDestinationCategories,
  // Vehicle normalization
  normalizeVehicleType,
  normalizeVehicleTypes,
  // Destination normalization
  normalizeDestination,
  normalizeDestinations,
  // Price normalization
  VALID_TARIFFS,
  normalizeTransferPrice,
  normalizeTransferPrices,
  // Vehicle availability normalization
  normalizeVehicleCategoryAvailability,
  normalizeVehicleCategoryAvailabilityList,
  normalizeVehicleDestinationOverride,
  normalizeVehicleDestinationOverrides,
  // Config migration
  migrateHotelZones,
  ensureTransferConfig,
  // Price calculation
  getPrice,
  getPricesBothTariffs,
  isVehicleAvailableForDestination,
  getAvailableVehiclesForDestination
};
