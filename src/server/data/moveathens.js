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
            infoPageContent: jsonConfig.infoPageContent
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
            infoPageContent: migrated.info_page_content || ''
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
        infoPageContent: row.info_page_content || ''
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
    infoPageContent: full.infoPageContent || ''
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

async function getZones(activeOnly = false) {
  await initDb();
  
  if (dbAvailable) {
    try {
      const rows = await db.ma.getZones(activeOnly);
      // If DB has data, use it (no migration needed)
      if (rows && rows.length > 0) {
        return rows.map(row => ({
          id: row.id,
          name: row.name,
          description: row.description || '',
          type: row.zone_type,
          is_active: row.is_active,
          created_at: row.created_at
        }));
      }
      // DB is empty AND we haven't migrated yet - migrate from JSON
      if (!zonesMigrated) {
        const config = readConfigFromFile();
        const jsonZones = config.transferZones || [];
        if (jsonZones.length > 0) {
          console.log('[moveathens] DB empty, auto-migrating', jsonZones.length, 'zones from JSON');
          zonesMigrated = true; // Mark as migrated to prevent repeated migrations
          for (const zone of jsonZones) {
            try {
              await db.ma.upsertZone({
                id: zone.id,
                name: zone.name,
                description: zone.description || '',
                zone_type: zone.type || 'suburb',
                is_active: zone.is_active !== false
              });
            } catch (e) {
              console.error('[moveathens] Failed to migrate zone:', zone.id, e.message);
            }
          }
          // Return the migrated data
          const migrated = await db.ma.getZones(activeOnly);
          return migrated.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description || '',
            type: row.zone_type,
            is_active: row.is_active,
            created_at: row.created_at
          }));
        }
      }
      return []; // DB and JSON both empty
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
        is_active: data.is_active !== false
      });
      console.log('[moveathens] Zone saved to DB:', row.id);
      return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        type: row.zone_type,
        is_active: row.is_active,
        created_at: row.created_at
      };
    } catch (err) {
      console.error('[moveathens] DB zone write failed:', err.message);
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
  console.log('[moveathens] Zone saved to JSON:', id);
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
              is_active: v.is_active !== false
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
        is_active: data.is_active !== false
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
        created_at: row.created_at
      };
    } catch (err) {
      console.error('[moveathens] DB vehicle write failed:', err.message);
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
              is_active: c.is_active !== false
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
        is_active: data.is_active !== false
      });
      console.log('[moveathens] Dest category saved to DB:', row.id);
      return {
        id: row.id,
        name: row.name,
        icon: row.icon || '',
        display_order: row.display_order,
        is_active: row.is_active,
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
  if (!writeConfigToFile(config)) throw new Error('write_failed');
  console.log('[moveathens] Dest category deleted from JSON:', id);
  return true;
}

// =========================================================
// DESTINATIONS
// =========================================================

async function getDestinations(filters = {}) {
  await initDb();
  
  if (dbAvailable) {
    try {
      const rows = await db.ma.getDestinations(filters);
      if (rows && rows.length > 0) {
        return rows.map(row => ({
          id: row.id,
          name: row.name,
          description: row.description || '',
          category_id: row.category_id,
          zone_id: row.zone_id,
          display_order: row.display_order,
          is_active: row.is_active,
          created_at: row.created_at
        }));
      }
      // DB empty - auto-migrate from JSON
      const config = readConfigFromFile();
      const jsonDests = config.destinations || [];
      if (jsonDests.length > 0) {
        console.log('[moveathens] DB empty, auto-migrating', jsonDests.length, 'destinations from JSON');
        for (const d of jsonDests) {
          try {
            await db.ma.upsertDestination({
              id: d.id,
              name: d.name,
              description: d.description || '',
              category_id: d.category_id || null,
              zone_id: d.zone_id || null,
              display_order: d.display_order || 0,
              is_active: d.is_active !== false
            });
          } catch (e) {
            console.error('[moveathens] Failed to migrate destination:', d.id, e.message);
          }
        }
        const migrated = await db.ma.getDestinations(filters);
        return migrated.map(row => ({
          id: row.id,
          name: row.name,
          description: row.description || '',
          category_id: row.category_id,
          zone_id: row.zone_id,
          display_order: row.display_order,
          is_active: row.is_active,
          created_at: row.created_at
        }));
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

async function upsertDestination(data) {
  await initDb();
  
  const id = data.id || makeId('dest');
  
  if (dbAvailable) {
    try {
      const row = await db.ma.upsertDestination({
        id,
        name: data.name,
        description: data.description || '',
        category_id: data.category_id || null,
        zone_id: data.zone_id || null,
        display_order: data.display_order || 0,
        is_active: data.is_active !== false
      });
      console.log('[moveathens] Destination saved to DB:', row.id);
      return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        category_id: row.category_id,
        zone_id: row.zone_id,
        display_order: row.display_order,
        is_active: row.is_active,
        created_at: row.created_at
      };
    } catch (err) {
      console.error('[moveathens] DB destination write failed:', err.message);
    }
  }
  
  const config = readConfigFromFile();
  const dests = config.destinations || [];
  const idx = dests.findIndex(d => d.id === id);
  
  const dest = {
    id,
    name: data.name,
    description: data.description || '',
    category_id: data.category_id || null,
    zone_id: data.zone_id || null,
    display_order: data.display_order || 0,
    is_active: data.is_active !== false,
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
        return rows.map(row => ({
          id: row.id,
          origin_zone_id: row.origin_zone_id,
          destination_id: row.destination_id,
          vehicle_type_id: row.vehicle_type_id,
          tariff: row.tariff,
          price: parseFloat(row.price)
        }));
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
              price: p.price
            });
          } catch (e) {
            console.error('[moveathens] Failed to migrate price:', p.id, e.message);
          }
        }
        const migrated = await db.ma.getPrices(filters);
        return migrated.map(row => ({
          id: row.id,
          origin_zone_id: row.origin_zone_id,
          destination_id: row.destination_id,
          vehicle_type_id: row.vehicle_type_id,
          tariff: row.tariff,
          price: parseFloat(row.price)
        }));
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
        price: data.price
      });
      console.log('[moveathens] Price saved to DB:', row.id);
      return {
        id: row.id,
        origin_zone_id: row.origin_zone_id,
        destination_id: row.destination_id,
        vehicle_type_id: row.vehicle_type_id,
        tariff: row.tariff,
        price: parseFloat(row.price)
      };
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
    price: data.price
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
  const destinations = await getDestinations();
  const prices = await getPrices();
  
  return {
    ...config,
    transferZones: zones,
    vehicleTypes: vehicles,
    destinationCategories: categories,
    destinations,
    transferPrices: prices
  };
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
  // Vehicles
  getVehicleTypes,
  upsertVehicleType,
  deleteVehicleType,
  // Destination Categories
  getDestinationCategories,
  upsertDestinationCategory,
  deleteDestinationCategory,
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
