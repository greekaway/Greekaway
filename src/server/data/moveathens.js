'use strict';
/**
 * MoveAthens Data Layer
 * Abstracts storage between PostgreSQL and JSON files
 * Uses PostgreSQL when DATABASE_URL is set, falls back to JSON files otherwise
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE_DIR = path.join(__dirname, '..', '..', '..', 'moveathens');
const DATA_DIR = path.join(BASE_DIR, 'data');
const UI_CONFIG_PATH = path.join(DATA_DIR, 'moveathens_ui.json');

let db = null;
let dbAvailable = false;

/**
 * Initialize database connection if available
 */
async function initDb() {
  if (db !== null) return dbAvailable;
  
  try {
    db = require('../../../db');
    if (!db.isAvailable()) {
      await db.init();
    }
    dbAvailable = db.isAvailable();
    if (dbAvailable) {
      console.log('[moveathens] Using PostgreSQL database');
    } else {
      console.log('[moveathens] Using JSON file storage (DATABASE_URL not set)');
    }
  } catch (err) {
    console.log('[moveathens] Database not available, using JSON files:', err.message);
    dbAvailable = false;
  }
  return dbAvailable;
}

// =========================================================
// JSON FILE OPERATIONS (fallback)
// =========================================================

function readConfigFromFile() {
  try {
    if (!fs.existsSync(UI_CONFIG_PATH)) {
      return getDefaultConfig();
    }
    const raw = fs.readFileSync(UI_CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[moveathens] read failed:', err.message);
    return getDefaultConfig();
  }
}

function writeConfigToFile(data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmpPath = `${UI_CONFIG_PATH}.tmp`;
    const backupPath = `${UI_CONFIG_PATH}.bak`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    if (fs.existsSync(UI_CONFIG_PATH)) {
      try { fs.copyFileSync(UI_CONFIG_PATH, backupPath); } catch (_) { }
    }
    fs.renameSync(tmpPath, UI_CONFIG_PATH);
    return true;
  } catch (err) {
    console.error('[moveathens] write failed:', err.message);
    return false;
  }
}

function getDefaultConfig() {
  return {
    heroVideoUrl: '/moveathens/videos/hero.mp4',
    heroLogoUrl: '/moveathens/videos/hero-logo.png',
    heroHeadline: 'MoveAthens Transfer',
    heroSubtext: '',
    footerLabels: {},
    footerIcons: {},
    phoneNumber: '',
    whatsappNumber: '',
    companyEmail: '',
    ctaLabels: {},
    contactLabels: {},
    hotelContextLabels: {},
    hotelEmailSubjectPrefix: '',
    infoPageTitle: '',
    infoPageContent: '',
    // Structured info sections
    infoCancellationTitle: '',
    infoCancellationContent: '',
    infoComplianceTitle: '',
    infoComplianceContent: '',
    irisPhone: '',
    infoFaqTitle: '',
    infoFaqContent: '',
    welcomeTextBlock: '',
    aboutUsCompanyName: '',
    aboutUsAfm: '',
    aboutUsDoy: '',
    aboutUsActivity: '',
    aboutUsAddress: '',
    aboutUsManager: '',
    aboutUsPhone: '',
    aboutUsEmail: '',
    aboutUsWebsite: '',
    transferZones: [],
    vehicleTypes: [],
    destinationCategories: [],
    destinations: [],
    transferPrices: [],
    vehicleCategoryAvailability: [],
    vehicleDestinationOverrides: []
  };
}

function makeId(prefix = 'id') {
  if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// =========================================================
// CONFIG (UI Settings)
// =========================================================

// Track if config migration has been done this session
let configMigrated = false;

/**
 * Get UI config
 */
async function getConfig() {
  await initDb();
  
  if (dbAvailable) {
    try {
      const row = await db.ma.getConfig();
      
      // Check if DB config is empty (never been set) - migrate from JSON
      const dbHasData = row.hero_headline || row.hero_video_url || row.phone_number;
      
      if (!dbHasData && !configMigrated) {
        // DB config is empty, migrate from JSON file
        const jsonConfig = readConfigFromFile();
        if (jsonConfig.heroHeadline || jsonConfig.heroVideoUrl || jsonConfig.phoneNumber) {
          console.log('[moveathens] DB config empty, auto-migrating from JSON');
          configMigrated = true;
          
          await db.ma.updateConfig({
            heroVideoUrl: jsonConfig.heroVideoUrl,
            heroLogoUrl: jsonConfig.heroLogoUrl,
            heroHeadline: jsonConfig.heroHeadline,
            heroSubtext: jsonConfig.heroSubtext,
            footerLabels: jsonConfig.footerLabels,
            footerIcons: jsonConfig.footerIcons,
            phoneNumber: jsonConfig.phoneNumber,
            whatsappNumber: jsonConfig.whatsappNumber,
            companyEmail: jsonConfig.companyEmail,
            ctaLabels: jsonConfig.ctaLabels,
            contactLabels: jsonConfig.contactLabels,
            hotelContextLabels: jsonConfig.hotelContextLabels,
            hotelEmailSubjectPrefix: jsonConfig.hotelEmailSubjectPrefix,
            infoPageTitle: jsonConfig.infoPageTitle,
            infoPageContent: jsonConfig.infoPageContent,
            infoCancellationTitle: jsonConfig.infoCancellationTitle,
            infoCancellationContent: jsonConfig.infoCancellationContent,
            infoComplianceTitle: jsonConfig.infoComplianceTitle,
            infoComplianceContent: jsonConfig.infoComplianceContent,
            infoFaqTitle: jsonConfig.infoFaqTitle,
            infoFaqContent: jsonConfig.infoFaqContent
          });
          
          // Return migrated config
          const migrated = await db.ma.getConfig();
          return {
            heroVideoUrl: migrated.hero_video_url || '',
            heroLogoUrl: migrated.hero_logo_url || '',
            heroHeadline: migrated.hero_headline || '',
            heroSubtext: migrated.hero_subtext || '',
            footerLabels: migrated.footer_labels || {},
            footerIcons: migrated.footer_icons || {},
            phoneNumber: migrated.phone_number || '',
            whatsappNumber: migrated.whatsapp_number || '',
            companyEmail: migrated.company_email || '',
            ctaLabels: migrated.cta_labels || {},
            contactLabels: migrated.contact_labels || {},
            hotelContextLabels: migrated.hotel_context_labels || {},
            hotelEmailSubjectPrefix: migrated.hotel_email_subject_prefix || '',
            infoPageTitle: migrated.info_page_title || '',
            infoPageContent: migrated.info_page_content || '',
            infoCancellationTitle: migrated.info_cancellation_title || '',
            infoCancellationContent: migrated.info_cancellation_content || '',
            infoComplianceTitle: migrated.info_compliance_title || '',
            infoComplianceContent: migrated.info_compliance_content || '',
            infoFaqTitle: migrated.info_faq_title || '',
            infoFaqContent: migrated.info_faq_content || '',
            showPriceInMessage: migrated.show_price_in_message !== false,
            irisPhone: migrated.iris_phone || '',
            heroVideoEnabled: migrated.hero_video_enabled !== false,
            flightTrackingEnabled: migrated.flight_tracking_enabled !== false,
            flightCheckMinsBefore: migrated.flight_check_mins_before || 25,
            welcomeTextBlock: migrated.welcome_text_block || '',
            aboutUsCompanyName: migrated.about_us_company_name || '',
            aboutUsAfm: migrated.about_us_afm || '',
            aboutUsDoy: migrated.about_us_doy || '',
            aboutUsActivity: migrated.about_us_activity || '',
            aboutUsAddress: migrated.about_us_address || '',
            aboutUsManager: migrated.about_us_manager || '',
            aboutUsPhone: migrated.about_us_phone || '',
            aboutUsEmail: migrated.about_us_email || '',
            aboutUsWebsite: migrated.about_us_website || '',
            categoryStyle: migrated.category_style || null,
            filterAreas: migrated.filter_areas || [],
            filterPriceRanges: migrated.filter_price_ranges || [],
            filterVibes: migrated.filter_vibes || []
          };
        }
      }
      
      // DB has data, return it
      return {
        heroVideoUrl: row.hero_video_url || '',
        heroLogoUrl: row.hero_logo_url || '',
        heroHeadline: row.hero_headline || '',
        heroSubtext: row.hero_subtext || '',
        footerLabels: row.footer_labels || {},
        footerIcons: row.footer_icons || {},
        phoneNumber: row.phone_number || '',
        whatsappNumber: row.whatsapp_number || '',
        companyEmail: row.company_email || '',
        ctaLabels: row.cta_labels || {},
        contactLabels: row.contact_labels || {},
        hotelContextLabels: row.hotel_context_labels || {},
        hotelEmailSubjectPrefix: row.hotel_email_subject_prefix || '',
        infoPageTitle: row.info_page_title || '',
        infoPageContent: row.info_page_content || '',
        infoCancellationTitle: row.info_cancellation_title || '',
        infoCancellationContent: row.info_cancellation_content || '',
        infoComplianceTitle: row.info_compliance_title || '',
        infoComplianceContent: row.info_compliance_content || '',
        infoFaqTitle: row.info_faq_title || '',
        infoFaqContent: row.info_faq_content || '',
        showPriceInMessage: row.show_price_in_message !== false,
        irisPhone: row.iris_phone || '',
        heroVideoEnabled: row.hero_video_enabled !== false,
        flightTrackingEnabled: row.flight_tracking_enabled !== false,
        flightCheckMinsBefore: row.flight_check_mins_before || 25,
        welcomeTextBlock: row.welcome_text_block || '',
        aboutUsCompanyName: row.about_us_company_name || '',
        aboutUsAfm: row.about_us_afm || '',
        aboutUsDoy: row.about_us_doy || '',
        aboutUsActivity: row.about_us_activity || '',
        aboutUsAddress: row.about_us_address || '',
        aboutUsManager: row.about_us_manager || '',
        aboutUsPhone: row.about_us_phone || '',
        aboutUsEmail: row.about_us_email || '',
        aboutUsWebsite: row.about_us_website || '',
        categoryStyle: row.category_style || null,
        filterAreas: row.filter_areas || [],
        filterPriceRanges: row.filter_price_ranges || [],
        filterVibes: row.filter_vibes || []
      };
    } catch (err) {
      console.error('[moveathens] DB config read failed:', err.message);
    }
  }
  
  const full = readConfigFromFile();
  return {
    heroVideoUrl: full.heroVideoUrl || '',
    heroLogoUrl: full.heroLogoUrl || '',
    heroHeadline: full.heroHeadline || '',
    heroSubtext: full.heroSubtext || '',
    footerLabels: full.footerLabels || {},
    footerIcons: full.footerIcons || {},
    phoneNumber: full.phoneNumber || '',
    whatsappNumber: full.whatsappNumber || '',
    companyEmail: full.companyEmail || '',
    ctaLabels: full.ctaLabels || {},
    contactLabels: full.contactLabels || {},
    hotelContextLabels: full.hotelContextLabels || {},
    hotelEmailSubjectPrefix: full.hotelEmailSubjectPrefix || '',
    infoPageTitle: full.infoPageTitle || '',
    infoPageContent: full.infoPageContent || '',
    infoCancellationTitle: full.infoCancellationTitle || '',
    infoCancellationContent: full.infoCancellationContent || '',
    infoComplianceTitle: full.infoComplianceTitle || '',
    infoComplianceContent: full.infoComplianceContent || '',
    infoFaqTitle: full.infoFaqTitle || '',
    infoFaqContent: full.infoFaqContent || '',
    showPriceInMessage: full.showPriceInMessage !== false,
    irisPhone: full.irisPhone || '',
    heroVideoEnabled: full.heroVideoEnabled !== false,
    flightTrackingEnabled: full.flightTrackingEnabled !== false,
    flightCheckMinsBefore: full.flightCheckMinsBefore || 25,
    welcomeTextBlock: full.welcomeTextBlock || '',
    aboutUsCompanyName: full.aboutUsCompanyName || '',
    aboutUsAfm: full.aboutUsAfm || '',
    aboutUsDoy: full.aboutUsDoy || '',
    aboutUsActivity: full.aboutUsActivity || '',
    aboutUsAddress: full.aboutUsAddress || '',
    aboutUsManager: full.aboutUsManager || '',
    aboutUsPhone: full.aboutUsPhone || '',
    aboutUsEmail: full.aboutUsEmail || '',
    aboutUsWebsite: full.aboutUsWebsite || '',
    categoryStyle: full.categoryStyle || null,
    filterAreas: full.filterAreas || [],
    filterPriceRanges: full.filterPriceRanges || [],
    filterVibes: full.filterVibes || []
  };
}

/**
 * Update UI config
 */
async function updateConfig(data) {
  await initDb();
  
  if (dbAvailable) {
    try {
      await db.ma.updateConfig(data);
      console.log('[moveathens] Config saved to DB');
      return getConfig();
    } catch (err) {
      console.error('[moveathens] DB config write failed:', err.message);
      // Throw error instead of falling back to JSON (ephemeral on Render)
      throw new Error(`Database config write failed: ${err.message}`);
    }
  }
  
  const current = readConfigFromFile();
  const updated = { ...current, ...data };
  if (!writeConfigToFile(updated)) {
    throw new Error('write_failed');
  }
  console.log('[moveathens] Config saved to JSON');
  return getConfig();
}

// =========================================================
// TRANSFER ZONES
// =========================================================

// Track if initial migration has been done this session
let zonesMigrated = false;

// Helper: map a price row to the unified shape
function mapPriceRow(row) {
  return {
    id: row.id,
    origin_zone_id: row.origin_zone_id,
    destination_id: row.destination_id,
    vehicle_type_id: row.vehicle_type_id,
    tariff: row.tariff,
    price: parseFloat(row.price),
    commission_driver: parseFloat(row.commission_driver || 0),
    commission_hotel: parseFloat(row.commission_hotel || 0),
    commission_service: parseFloat(row.commission_service || 0)
  };
}

// Helper: map a DB row or JSON zone to the unified shape
function mapZoneRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    type: row.zone_type || row.type || 'suburb',
    municipality: row.municipality || '',
    address: row.address || '',
    phone: row.phone || '',
    email: row.email || '',
    accommodation_type: row.accommodation_type || 'hotel',
    lat: row.lat != null ? parseFloat(row.lat) : null,
    lng: row.lng != null ? parseFloat(row.lng) : null,
    is_active: row.is_active,
    created_at: row.created_at
  };
}

async function getZones(activeOnly = false) {
  await initDb();
  
  if (dbAvailable) {
    try {
      const rows = await db.ma.getZones(activeOnly);
      // If DB has data, use it (no migration needed)
      if (rows && rows.length > 0) {
        return rows.map(mapZoneRow);
      }
      // DB is empty AND we haven't migrated yet - migrate from JSON
      if (!zonesMigrated) {
        const config = readConfigFromFile();
        const jsonZones = config.transferZones || [];
        if (jsonZones.length > 0) {
          console.log('[moveathens] DB empty, auto-migrating', jsonZones.length, 'zones from JSON');
          zonesMigrated = true;
          for (const zone of jsonZones) {
            try {
              await db.ma.upsertZone({
                id: zone.id,
                name: zone.name,
                description: zone.description || '',
                zone_type: zone.type || 'suburb',
                municipality: zone.municipality || '',
                address: zone.address || '',
                phone: zone.phone || '',
                email: zone.email || '',
                accommodation_type: zone.accommodation_type || 'hotel',
                is_active: zone.is_active !== false
              });
            } catch (e) {
              console.error('[moveathens] Failed to migrate zone:', zone.id, e.message);
            }
          }
          const migrated = await db.ma.getZones(activeOnly);
          return migrated.map(mapZoneRow);
        }
      }
      return [];
    } catch (err) {
      console.error('[moveathens] DB zones read failed:', err.message);
    }
  }
  
  const config = readConfigFromFile();
  let zones = config.transferZones || [];
  if (activeOnly) zones = zones.filter(z => z.is_active !== false);
  return zones;
}

async function upsertZone(data) {
  await initDb();
  
  const id = data.id || makeId('tz');
  
  if (dbAvailable) {
    try {
      const row = await db.ma.upsertZone({
        id,
        name: data.name,
        description: data.description || '',
        zone_type: data.type || 'suburb',
        municipality: data.municipality || '',
        address: data.address || '',
        phone: data.phone || '',
        email: data.email || '',
        accommodation_type: data.accommodation_type || 'hotel',
        lat: data.lat != null ? parseFloat(data.lat) : null,
        lng: data.lng != null ? parseFloat(data.lng) : null,
        is_active: data.is_active !== false
      });
      console.log('[moveathens] Hotel saved to DB:', row.id);
      return mapZoneRow(row);
    } catch (err) {
      console.error('[moveathens] DB hotel write failed:', err.message);
    }
  }
  
  const config = readConfigFromFile();
  const zones = config.transferZones || [];
  const idx = zones.findIndex(z => z.id === id);
  
  const zone = {
    id,
    name: data.name,
    description: data.description || '',
    type: data.type || 'suburb',
    municipality: data.municipality || '',
    address: data.address || '',
    phone: data.phone || '',
    email: data.email || '',
    accommodation_type: data.accommodation_type || 'hotel',
    lat: data.lat != null ? parseFloat(data.lat) : null,
    lng: data.lng != null ? parseFloat(data.lng) : null,
    is_active: data.is_active !== false,
    created_at: idx >= 0 ? zones[idx].created_at : new Date().toISOString()
  };
  
  if (idx >= 0) {
    zones[idx] = zone;
  } else {
    zones.push(zone);
  }
  
  config.transferZones = zones;
  if (!writeConfigToFile(config)) throw new Error('write_failed');
  console.log('[moveathens] Hotel saved to JSON:', id);
  return zone;
}

async function deleteZone(id) {
  await initDb();
  
  if (dbAvailable) {
    try {
      const deleted = await db.ma.deleteZone(id);
      if (deleted) {
        console.log('[moveathens] Zone deleted from DB:', id);
        return true;
      }
    } catch (err) {
      console.error('[moveathens] DB zone delete failed:', err.message);
    }
  }
  
  const config = readConfigFromFile();
  const before = (config.transferZones || []).length;
  config.transferZones = (config.transferZones || []).filter(z => z.id !== id);
  if (config.transferZones.length === before) return false;
  if (!writeConfigToFile(config)) throw new Error('write_failed');
  console.log('[moveathens] Zone deleted from JSON:', id);
  return true;
}

// =========================================================
// VEHICLE TYPES
// =========================================================

async function getVehicleTypes(activeOnly = false) {
  await initDb();
  
  if (dbAvailable) {
    try {
      const rows = await db.ma.getVehicleTypes(activeOnly);
      // If DB has data, use it
      if (rows && rows.length > 0) {
        return rows.map(row => ({
          id: row.id,
          name: row.name,
          description: row.description || '',
          imageUrl: row.image_url || '',
          max_passengers: row.max_passengers,
          luggage_large: row.luggage_large,
          luggage_medium: row.luggage_medium,
          luggage_cabin: row.luggage_cabin,
          display_order: row.display_order,
          is_active: row.is_active,
          allow_instant: row.allow_instant ?? true,
          min_advance_minutes: row.min_advance_minutes || 0,
          created_at: row.created_at
        }));
      }
      // DB is empty - check if JSON has data to migrate
      const config = readConfigFromFile();
      const jsonVehicles = config.vehicleTypes || [];
      if (jsonVehicles.length > 0) {
        console.log('[moveathens] DB empty, auto-migrating', jsonVehicles.length, 'vehicles from JSON');
        for (const v of jsonVehicles) {
          try {
            await db.ma.upsertVehicleType({
              id: v.id,
              name: v.name,
              description: v.description || '',
              image_url: v.imageUrl || '',
              max_passengers: v.max_passengers || 4,
              luggage_large: v.luggage_large || 2,
              luggage_medium: v.luggage_medium || 2,
              luggage_cabin: v.luggage_cabin || 4,
              display_order: v.display_order || 0,
              is_active: v.is_active !== false,
              allow_instant: v.allow_instant ?? true,
              min_advance_minutes: v.min_advance_minutes || 0
            });
          } catch (e) {
            console.error('[moveathens] Failed to migrate vehicle:', v.id, e.message);
          }
        }
        const migrated = await db.ma.getVehicleTypes(activeOnly);
        return migrated.map(row => ({
          id: row.id,
          name: row.name,
          description: row.description || '',
          imageUrl: row.image_url || '',
          max_passengers: row.max_passengers,
          luggage_large: row.luggage_large,
          luggage_medium: row.luggage_medium,
          luggage_cabin: row.luggage_cabin,
          display_order: row.display_order,
          is_active: row.is_active,
          allow_instant: row.allow_instant ?? true,
          min_advance_minutes: row.min_advance_minutes || 0,
          created_at: row.created_at
        }));
      }
      return [];
    } catch (err) {
      console.error('[moveathens] DB vehicles read failed:', err.message);
    }
  }
  
  const config = readConfigFromFile();
  let vehicles = config.vehicleTypes || [];
  if (activeOnly) vehicles = vehicles.filter(v => v.is_active !== false);
  return vehicles;
}

async function upsertVehicleType(data) {
  await initDb();
  
  const id = data.id || makeId('vt');
  
  if (dbAvailable) {
    try {
      const row = await db.ma.upsertVehicleType({
        id,
        name: data.name,
        description: data.description || '',
        image_url: data.imageUrl || '',
        max_passengers: data.max_passengers || 4,
        luggage_large: data.luggage_large || 2,
        luggage_medium: data.luggage_medium || 2,
        luggage_cabin: data.luggage_cabin || 4,
        display_order: data.display_order || 0,
        is_active: data.is_active !== false,
        allow_instant: data.allow_instant ?? true,
        min_advance_minutes: data.min_advance_minutes || 0
      });
      console.log('[moveathens] Vehicle saved to DB:', row.id);
      return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        imageUrl: row.image_url || '',
        max_passengers: row.max_passengers,
        luggage_large: row.luggage_large,
        luggage_medium: row.luggage_medium,
        luggage_cabin: row.luggage_cabin,
        display_order: row.display_order,
        is_active: row.is_active,
        allow_instant: row.allow_instant ?? true,
        min_advance_minutes: row.min_advance_minutes || 0,
        created_at: row.created_at
      };
    } catch (err) {
      console.error('[moveathens] DB vehicle write failed:', err.message);
      // CRITICAL: If DB is available but write fails, throw error instead of falling back to JSON
      // JSON files are ephemeral on Render and will be lost after restart
      throw new Error(`Database write failed: ${err.message}`);
    }
  }
  
  const config = readConfigFromFile();
  const vehicles = config.vehicleTypes || [];
  const idx = vehicles.findIndex(v => v.id === id);
  
  const vehicle = {
    id,
    name: data.name,
    description: data.description || '',
    imageUrl: data.imageUrl || '',
    max_passengers: data.max_passengers || 4,
    luggage_large: data.luggage_large || 2,
    luggage_medium: data.luggage_medium || 2,
    luggage_cabin: data.luggage_cabin || 4,
    display_order: data.display_order || 0,
    is_active: data.is_active !== false,
    allow_instant: data.allow_instant ?? true,
    min_advance_minutes: data.min_advance_minutes || 0,
    created_at: idx >= 0 ? vehicles[idx].created_at : new Date().toISOString()
  };
  
  if (idx >= 0) {
    vehicles[idx] = vehicle;
  } else {
    vehicles.push(vehicle);
  }
  
  config.vehicleTypes = vehicles;
  if (!writeConfigToFile(config)) throw new Error('write_failed');
  console.log('[moveathens] Vehicle saved to JSON:', id);
  return vehicle;
}

async function deleteVehicleType(id) {
  await initDb();
  
  if (dbAvailable) {
    try {
      const deleted = await db.ma.deleteVehicleType(id);
      if (deleted) {
        console.log('[moveathens] Vehicle deleted from DB:', id);
        return true;
      }
    } catch (err) {
      console.error('[moveathens] DB vehicle delete failed:', err.message);
    }
  }
  
  const config = readConfigFromFile();
  const before = (config.vehicleTypes || []).length;
  config.vehicleTypes = (config.vehicleTypes || []).filter(v => v.id !== id);
  if (config.vehicleTypes.length === before) return false;
  if (!writeConfigToFile(config)) throw new Error('write_failed');
  console.log('[moveathens] Vehicle deleted from JSON:', id);
  return true;
}

// =========================================================
// DESTINATION CATEGORIES
// =========================================================

async function getDestinationCategories(activeOnly = false) {
  await initDb();
  
  if (dbAvailable) {
    try {
      const rows = await db.ma.getDestinationCategories(activeOnly);
      if (rows && rows.length > 0) {
        return rows.map(row => ({
          id: row.id,
          name: row.name,
          icon: row.icon || '',
          display_order: row.display_order,
          is_active: row.is_active,
          is_arrival: row.is_arrival ?? false,
          color: row.color || '#1a73e8',
          icon_color: row.icon_color || 'white',
          created_at: row.created_at
        }));
      }
      // DB empty - auto-migrate from JSON
      const config = readConfigFromFile();
      const jsonCats = config.destinationCategories || [];
      if (jsonCats.length > 0) {
        console.log('[moveathens] DB empty, auto-migrating', jsonCats.length, 'dest categories from JSON');
        for (const c of jsonCats) {
          try {
            await db.ma.upsertDestinationCategory({
              id: c.id,
              name: c.name,
              icon: c.icon || '',
              display_order: c.display_order || 0,
              is_active: c.is_active !== false,
              is_arrival: c.is_arrival ?? false,
              color: c.color || '#1a73e8',
              icon_color: c.icon_color || 'white'
            });
          } catch (e) {
            console.error('[moveathens] Failed to migrate dest category:', c.id, e.message);
          }
        }
        const migrated = await db.ma.getDestinationCategories(activeOnly);
        return migrated.map(row => ({
          id: row.id,
          name: row.name,
          icon: row.icon || '',
          display_order: row.display_order,
          is_active: row.is_active,
          is_arrival: row.is_arrival ?? false,
          color: row.color || '#1a73e8',
          icon_color: row.icon_color || 'white',
          created_at: row.created_at
        }));
      }
      return [];
    } catch (err) {
      console.error('[moveathens] DB dest categories read failed:', err.message);
    }
  }
  
  const config = readConfigFromFile();
  let cats = config.destinationCategories || [];
  if (activeOnly) cats = cats.filter(c => c.is_active !== false);
  return cats;
}

async function upsertDestinationCategory(data) {
  await initDb();
  
  const id = data.id || makeId('dc');
  
  if (dbAvailable) {
    try {
      const row = await db.ma.upsertDestinationCategory({
        id,
        name: data.name,
        icon: data.icon || '',
        display_order: data.display_order || 0,
        is_active: data.is_active !== false,
        is_arrival: data.is_arrival ?? false,
        color: data.color || '#1a73e8',
        icon_color: data.icon_color || 'white'
      });
      console.log('[moveathens] Dest category saved to DB:', row.id);
      return {
        id: row.id,
        name: row.name,
        icon: row.icon || '',
        display_order: row.display_order,
        is_active: row.is_active,
        is_arrival: row.is_arrival ?? false,
        color: row.color || '#1a73e8',
        icon_color: row.icon_color || 'white',
        created_at: row.created_at
      };
    } catch (err) {
      console.error('[moveathens] DB dest category write failed:', err.message);
    }
  }
  
  const config = readConfigFromFile();
  const cats = config.destinationCategories || [];
  const idx = cats.findIndex(c => c.id === id);
  
  const cat = {
    id,
    name: data.name,
    icon: data.icon || '',
    display_order: data.display_order || 0,
    is_active: data.is_active !== false,
    is_arrival: data.is_arrival ?? false,
    color: data.color || '#1a73e8',
    icon_color: data.icon_color || 'white',
    created_at: idx >= 0 ? cats[idx].created_at : new Date().toISOString()
  };
  
  if (idx >= 0) {
    cats[idx] = cat;
  } else {
    cats.push(cat);
  }
  
  config.destinationCategories = cats;
  if (!writeConfigToFile(config)) throw new Error('write_failed');
  console.log('[moveathens] Dest category saved to JSON:', id);
  return cat;
}

async function deleteDestinationCategory(id) {
  await initDb();
  
  if (dbAvailable) {
    try {
      const deleted = await db.ma.deleteDestinationCategory(id);
      if (deleted) {
        console.log('[moveathens] Dest category deleted from DB:', id);
        return true;
      }
    } catch (err) {
      console.error('[moveathens] DB dest category delete failed:', err.message);
    }
  }
  
  const config = readConfigFromFile();
  const before = (config.destinationCategories || []).length;
  config.destinationCategories = (config.destinationCategories || []).filter(c => c.id !== id);
  if (config.destinationCategories.length === before) return false;
  // Cascade: remove orphaned subcategories
  config.destinationSubcategories = (config.destinationSubcategories || []).filter(s => s.category_id !== id);
  // Cascade: clear category_id on orphaned destinations
  config.destinations = (config.destinations || []).map(d => {
    if (d.category_id === id) return { ...d, category_id: null, subcategory_id: null };
    return d;
  });
  if (!writeConfigToFile(config)) throw new Error('write_failed');
  console.log('[moveathens] Dest category deleted from JSON (with cascade):', id);
  return true;
}

// =========================================================
// DESTINATION SUBCATEGORIES
// =========================================================

function mapSubcategoryRow(row) {
  return {
    id: row.id,
    category_id: row.category_id,
    name: row.name,
    description: row.description || '',
    display_order: row.display_order,
    is_active: row.is_active,
    is_arrival: row.is_arrival ?? false,
    created_at: row.created_at
  };
}

async function getDestinationSubcategories(filters = {}) {
  await initDb();

  if (dbAvailable) {
    try {
      const rows = await db.ma.getDestinationSubcategories(filters);
      if (rows && rows.length > 0) {
        return rows.map(mapSubcategoryRow);
      }
      // DB empty — try JSON migration
      const config = readConfigFromFile();
      const jsonSubs = config.destinationSubcategories || [];
      if (jsonSubs.length > 0) {
        console.log('[moveathens] DB empty, auto-migrating', jsonSubs.length, 'subcategories from JSON');
        for (const s of jsonSubs) {
          try {
            await db.ma.upsertDestinationSubcategory({
              id: s.id,
              category_id: s.category_id || null,
              name: s.name,
              description: s.description || '',
              display_order: s.display_order || 0,
              is_active: s.is_active !== false,
              is_arrival: s.is_arrival === true
            });
          } catch (e) {
            console.error('[moveathens] Failed to migrate subcategory:', s.id, e.message);
          }
        }
        const migrated = await db.ma.getDestinationSubcategories(filters);
        return migrated.map(mapSubcategoryRow);
      }
      return [];
    } catch (err) {
      console.error('[moveathens] DB subcategories read failed:', err.message);
    }
  }

  const config = readConfigFromFile();
  let subs = config.destinationSubcategories || [];
  if (filters.category_id) subs = subs.filter(s => s.category_id === filters.category_id);
  if (filters.activeOnly) subs = subs.filter(s => s.is_active !== false);
  return subs;
}

async function upsertDestinationSubcategory(data) {
  await initDb();

  const id = data.id || makeId('dsc');

  if (dbAvailable) {
    try {
      const row = await db.ma.upsertDestinationSubcategory({
        id,
        category_id: data.category_id || null,
        name: data.name,
        description: data.description || '',
        display_order: data.display_order || 0,
        is_active: data.is_active !== false,
        is_arrival: data.is_arrival === true
      });
      console.log('[moveathens] Subcategory saved to DB:', row.id);
      return mapSubcategoryRow(row);
    } catch (err) {
      console.error('[moveathens] DB subcategory write failed:', err.message);
    }
  }

  const config = readConfigFromFile();
  const subs = config.destinationSubcategories || [];
  const idx = subs.findIndex(s => s.id === id);

  const sub = {
    id,
    category_id: data.category_id || null,
    name: data.name,
    description: data.description || '',
    display_order: data.display_order || 0,
    is_active: data.is_active !== false,
    is_arrival: data.is_arrival === true,
    created_at: idx >= 0 ? subs[idx].created_at : new Date().toISOString()
  };

  if (idx >= 0) { subs[idx] = sub; } else { subs.push(sub); }
  config.destinationSubcategories = subs;
  if (!writeConfigToFile(config)) throw new Error('write_failed');
  console.log('[moveathens] Subcategory saved to JSON:', id);
  return sub;
}

async function deleteDestinationSubcategory(id) {
  await initDb();

  if (dbAvailable) {
    try {
      const deleted = await db.ma.deleteDestinationSubcategory(id);
      if (deleted) {
        console.log('[moveathens] Subcategory deleted from DB:', id);
        return true;
      }
    } catch (err) {
      console.error('[moveathens] DB subcategory delete failed:', err.message);
    }
  }

  const config = readConfigFromFile();
  const before = (config.destinationSubcategories || []).length;
  config.destinationSubcategories = (config.destinationSubcategories || []).filter(s => s.id !== id);
  if (config.destinationSubcategories.length === before) return false;
  // Cascade: clear subcategory_id on affected destinations
  config.destinations = (config.destinations || []).map(d => {
    if (d.subcategory_id === id) return { ...d, subcategory_id: null };
    return d;
  });
  if (!writeConfigToFile(config)) throw new Error('write_failed');
  console.log('[moveathens] Subcategory deleted from JSON (with cascade):', id);
  return true;
}

// =========================================================
// DESTINATIONS
// =========================================================

function mapDestinationRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    category_id: row.category_id,
    subcategory_id: row.subcategory_id || null,
    zone_id: row.zone_id,
    route_type: row.route_type || null,
    lat: row.lat != null ? parseFloat(row.lat) : null,
    lng: row.lng != null ? parseFloat(row.lng) : null,
    display_order: row.display_order,
    is_active: row.is_active,
    venue_type: row.venue_type || '',
    vibe: row.vibe || '',
    area: row.area || '',
    indicative_price: row.indicative_price || '',
    suitable_for: row.suitable_for || '',
    rating: row.rating || '',
    michelin: row.michelin || '',
    details: row.details || '',
    main_artist: row.main_artist || '',
    participating_artists: row.participating_artists || '',
    program_info: row.program_info || '',
    operating_days: row.operating_days || '',
    opening_time: row.opening_time || '',
    closing_time: row.closing_time || '',
    operating_schedule: row.operating_schedule || '',
    phone: row.phone || '',
    seasonal_open: row.seasonal_open || '',
    seasonal_close: row.seasonal_close || '',
    created_at: row.created_at
  };
}

async function getDestinations(filters = {}) {
  await initDb();
  
  if (dbAvailable) {
    try {
      const rows = await db.ma.getDestinations(filters);
      if (rows && rows.length > 0) {
        const mapped = rows.map(mapDestinationRow);
        // Sync JSON fallback with latest DB data so if DB fails later, JSON has fresh data
        if (!getDestinations._jsonSynced) {
          try {
            const config = readConfigFromFile();
            config.destinations = mapped;
            writeConfigToFile(config);
            getDestinations._jsonSynced = true;
            console.log('[moveathens] JSON fallback synced from DB:', mapped.length, 'destinations');
          } catch (_) { /* non-critical */ }
        }
        return mapped;
      }
      // DB empty - auto-migrate from JSON
      const config = readConfigFromFile();
      const jsonDests = config.destinations || [];
      if (jsonDests.length > 0) {
        console.log('[moveathens] DB empty, auto-migrating', jsonDests.length, 'destinations from JSON');
        for (const d of jsonDests) {
          try {
            await db.ma.upsertDestination({ id: d.id, ...buildDestinationPayload(d) });
          } catch (e) {
            console.error('[moveathens] Failed to migrate destination:', d.id, e.message);
          }
        }
        const migrated = await db.ma.getDestinations(filters);
        return migrated.map(mapDestinationRow);
      }
      return [];
    } catch (err) {
      console.error('[moveathens] DB destinations read failed:', err.message);
    }
  }
  
  const config = readConfigFromFile();
  let dests = config.destinations || [];
  
  if (filters.category_id) {
    dests = dests.filter(d => d.category_id === filters.category_id);
  }
  if (filters.zone_id) {
    dests = dests.filter(d => d.zone_id === filters.zone_id);
  }
  if (filters.activeOnly) {
    dests = dests.filter(d => d.is_active !== false);
  }
  
  return dests;
}

function buildDestinationPayload(data) {
  return {
    name: data.name,
    description: data.description || '',
    category_id: data.category_id || null,
    subcategory_id: data.subcategory_id || null,
    zone_id: data.zone_id || null,
    route_type: data.route_type || null,
    lat: data.lat != null ? parseFloat(data.lat) : null,
    lng: data.lng != null ? parseFloat(data.lng) : null,
    display_order: data.display_order || 0,
    is_active: data.is_active !== false,
    venue_type: data.venue_type || '',
    vibe: data.vibe || '',
    area: data.area || '',
    indicative_price: data.indicative_price || '',
    suitable_for: data.suitable_for || '',
    rating: data.rating || '',
    michelin: data.michelin || '',
    details: data.details || '',
    main_artist: data.main_artist || '',
    participating_artists: data.participating_artists || '',
    program_info: data.program_info || '',
    operating_days: data.operating_days || '',
    opening_time: data.opening_time || '',
    closing_time: data.closing_time || '',
    operating_schedule: data.operating_schedule || '',
    phone: data.phone || '',
    seasonal_open: data.seasonal_open || '',
    seasonal_close: data.seasonal_close || ''
  };
}

async function upsertDestination(data) {
  await initDb();
  
  const id = data.id || makeId('dest');
  
  if (dbAvailable) {
    try {
      const payload = { id, ...buildDestinationPayload(data) };
      const row = await db.ma.upsertDestination(payload);
      console.log('[moveathens] Destination saved to DB:', row.id);
      const mapped = mapDestinationRow(row);
      // Also sync to JSON fallback so data is consistent if DB becomes unavailable
      try {
        const config = readConfigFromFile();
        const dests = config.destinations || [];
        const idx = dests.findIndex(d => d.id === id);
        if (idx >= 0) {
          dests[idx] = { ...dests[idx], ...mapped };
        } else {
          dests.push(mapped);
        }
        config.destinations = dests;
        writeConfigToFile(config);
      } catch (_) { /* non-critical */ }
      return mapped;
    } catch (err) {
      console.error('[moveathens] DB destination write failed:', err.message);
    }
  }
  
  const config = readConfigFromFile();
  const dests = config.destinations || [];
  const idx = dests.findIndex(d => d.id === id);
  
  const dest = {
    id,
    ...buildDestinationPayload(data),
    created_at: idx >= 0 ? dests[idx].created_at : new Date().toISOString()
  };
  
  if (idx >= 0) {
    dests[idx] = dest;
  } else {
    dests.push(dest);
  }
  
  config.destinations = dests;
  if (!writeConfigToFile(config)) throw new Error('write_failed');
  console.log('[moveathens] Destination saved to JSON:', id);
  return dest;
}

async function deleteDestination(id) {
  await initDb();
  
  if (dbAvailable) {
    try {
      const deleted = await db.ma.deleteDestination(id);
      if (deleted) {
        console.log('[moveathens] Destination deleted from DB:', id);
        // Also sync JSON fallback
        try {
          const config = readConfigFromFile();
          config.destinations = (config.destinations || []).filter(d => d.id !== id);
          writeConfigToFile(config);
        } catch (_) { /* non-critical */ }
        return true;
      }
    } catch (err) {
      console.error('[moveathens] DB destination delete failed:', err.message);
    }
  }
  
  const config = readConfigFromFile();
  const before = (config.destinations || []).length;
  config.destinations = (config.destinations || []).filter(d => d.id !== id);
  if (config.destinations.length === before) return false;
  if (!writeConfigToFile(config)) throw new Error('write_failed');
  console.log('[moveathens] Destination deleted from JSON:', id);
  return true;
}

// =========================================================
// TRANSFER PRICES
// =========================================================

async function getPrices(filters = {}) {
  await initDb();
  
  if (dbAvailable) {
    try {
      const rows = await db.ma.getPrices(filters);
      if (rows && rows.length > 0) {
        return rows.map(mapPriceRow);
      }
      // DB empty - auto-migrate from JSON
      const config = readConfigFromFile();
      const jsonPrices = config.transferPrices || [];
      if (jsonPrices.length > 0) {
        console.log('[moveathens] DB empty, auto-migrating', jsonPrices.length, 'prices from JSON');
        for (const p of jsonPrices) {
          try {
            await db.ma.upsertPrice({
              id: p.id,
              origin_zone_id: p.origin_zone_id,
              destination_id: p.destination_id,
              vehicle_type_id: p.vehicle_type_id,
              tariff: p.tariff || 'day',
              price: p.price,
              commission_driver: p.commission_driver || 0,
              commission_hotel: p.commission_hotel || 0,
              commission_service: p.commission_service || 0
            });
          } catch (e) {
            console.error('[moveathens] Failed to migrate price:', p.id, e.message);
          }
        }
        const migrated = await db.ma.getPrices(filters);
        return migrated.map(mapPriceRow);
      }
      return [];
    } catch (err) {
      console.error('[moveathens] DB prices read failed:', err.message);
    }
  }
  
  const config = readConfigFromFile();
  let prices = config.transferPrices || [];
  
  if (filters.origin_zone_id) {
    prices = prices.filter(p => p.origin_zone_id === filters.origin_zone_id);
  }
  if (filters.destination_id) {
    prices = prices.filter(p => p.destination_id === filters.destination_id);
  }
  if (filters.vehicle_type_id) {
    prices = prices.filter(p => p.vehicle_type_id === filters.vehicle_type_id);
  }
  if (filters.tariff) {
    prices = prices.filter(p => p.tariff === filters.tariff);
  }
  
  return prices;
}

async function upsertPrice(data) {
  await initDb();
  
  const id = data.id || `tp_${Date.now()}_${data.vehicle_type_id}_${data.tariff || 'day'}`;
  
  if (dbAvailable) {
    try {
      const row = await db.ma.upsertPrice({
        id,
        origin_zone_id: data.origin_zone_id,
        destination_id: data.destination_id,
        vehicle_type_id: data.vehicle_type_id,
        tariff: data.tariff || 'day',
        price: data.price,
        commission_driver: data.commission_driver || 0,
        commission_hotel: data.commission_hotel || 0,
        commission_service: data.commission_service || 0
      });
      console.log('[moveathens] Price saved to DB:', row.id);
      return mapPriceRow(row);
    } catch (err) {
      console.error('[moveathens] DB price write failed:', err.message);
    }
  }
  
  const config = readConfigFromFile();
  const prices = config.transferPrices || [];
  
  // Find existing by composite key
  const idx = prices.findIndex(p =>
    p.origin_zone_id === data.origin_zone_id &&
    p.destination_id === data.destination_id &&
    p.vehicle_type_id === data.vehicle_type_id &&
    p.tariff === (data.tariff || 'day')
  );
  
  const price = {
    id: idx >= 0 ? prices[idx].id : id,
    origin_zone_id: data.origin_zone_id,
    destination_id: data.destination_id,
    vehicle_type_id: data.vehicle_type_id,
    tariff: data.tariff || 'day',
    price: data.price,
    commission_driver: data.commission_driver || 0,
    commission_hotel: data.commission_hotel || 0,
    commission_service: data.commission_service || 0
  };
  
  if (idx >= 0) {
    prices[idx] = price;
  } else {
    prices.push(price);
  }
  
  config.transferPrices = prices;
  if (!writeConfigToFile(config)) throw new Error('write_failed');
  console.log('[moveathens] Price saved to JSON:', price.id);
  return price;
}

async function deletePrice(id) {
  await initDb();
  
  if (dbAvailable) {
    try {
      const deleted = await db.ma.deletePrice(id);
      if (deleted) {
        console.log('[moveathens] Price deleted from DB:', id);
        return true;
      }
    } catch (err) {
      console.error('[moveathens] DB price delete failed:', err.message);
    }
  }
  
  const config = readConfigFromFile();
  const before = (config.transferPrices || []).length;
  config.transferPrices = (config.transferPrices || []).filter(p => p.id !== id);
  if (config.transferPrices.length === before) return false;
  if (!writeConfigToFile(config)) throw new Error('write_failed');
  console.log('[moveathens] Price deleted from JSON:', id);
  return true;
}

// =========================================================
// FULL CONFIG (for legacy compatibility)
// =========================================================

async function getFullConfig() {
  await initDb();
  
  const config = await getConfig();
  const zones = await getZones();
  const vehicles = await getVehicleTypes();
  const categories = await getDestinationCategories();
  const subcategories = await getDestinationSubcategories();
  const destinations = await getDestinations();
  const prices = await getPrices();
  
  return {
    ...config,
    transferZones: zones,
    vehicleTypes: vehicles,
    destinationCategories: categories,
    destinationSubcategories: subcategories,
    destinations,
    transferPrices: prices
  };
}

// =========================================================
// HOTEL PHONES (multi-phone per hotel)
// =========================================================

async function getHotelPhones(zoneId) {
  await initDb();
  if (dbAvailable) {
    try {
      return await db.ma.getHotelPhones(zoneId || null);
    } catch (err) {
      console.error('[moveathens] DB getHotelPhones failed:', err.message);
    }
  }
  return [];
}

async function getHotelByPhone(phone) {
  await initDb();
  if (!phone) return null;
  if (dbAvailable) {
    try {
      const result = await db.ma.getHotelByPhone(phone);
      if (!result) return null;
      return {
        zone: mapZoneRow(result.zone),
        phones: result.phones
      };
    } catch (err) {
      console.error('[moveathens] DB getHotelByPhone failed:', err.message);
    }
  }
  return null;
}

async function addHotelPhone(data) {
  await initDb();
  if (dbAvailable) {
    try {
      return await db.ma.addHotelPhone(data);
    } catch (err) {
      console.error('[moveathens] DB addHotelPhone failed:', err.message);
      throw err;
    }
  }
  throw new Error('Database required for hotel phones');
}

async function deleteHotelPhone(id) {
  await initDb();
  if (dbAvailable) {
    try {
      return await db.ma.deleteHotelPhone(id);
    } catch (err) {
      console.error('[moveathens] DB deleteHotelPhone failed:', err.message);
    }
  }
  return false;
}

/**
 * Check if using database
 */
function isUsingDatabase() {
  return dbAvailable;
}

module.exports = {
  initDb,
  isUsingDatabase,
  // Config
  getConfig,
  updateConfig,
  getFullConfig,
  // Zones
  getZones,
  upsertZone,
  deleteZone,
  // Hotel Phones
  getHotelPhones,
  getHotelByPhone,
  addHotelPhone,
  deleteHotelPhone,
  // Vehicles
  getVehicleTypes,
  upsertVehicleType,
  deleteVehicleType,
  // Destination Categories
  getDestinationCategories,
  upsertDestinationCategory,
  deleteDestinationCategory,
  // Destination Subcategories
  getDestinationSubcategories,
  upsertDestinationSubcategory,
  deleteDestinationSubcategory,
  // Destinations
  getDestinations,
  upsertDestination,
  deleteDestination,
  // Prices
  getPrices,
  upsertPrice,
  deletePrice,
  // Paths
  UI_CONFIG_PATH,
  DATA_DIR
};
