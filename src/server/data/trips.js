'use strict';
/**
 * Trips Data Layer
 * Abstracts storage between PostgreSQL and JSON files
 * Uses PostgreSQL when DATABASE_URL is set, falls back to JSON files otherwise
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.join(__dirname, '..', '..', '..');
const TRIPS_DIR = path.join(ROOT_DIR, 'data', 'trips');
const TRIP_TEMPLATE_FILE = path.join(TRIPS_DIR, '_template.json');

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
      console.log('[trips] Using PostgreSQL database');
    } else {
      console.log('[trips] Using JSON file storage (DATABASE_URL not set)');
    }
  } catch (err) {
    console.log('[trips] Database not available, using JSON files:', err.message);
    dbAvailable = false;
  }
  return dbAvailable;
}

// =========================================================
// JSON FILE OPERATIONS (fallback)
// =========================================================

function ensureTripsDir() {
  try { fs.mkdirSync(TRIPS_DIR, { recursive: true }); } catch (_) { }
}

function sanitizeSlug(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function readTripFromFile(slug) {
  ensureTripsDir();
  try {
    const safeSlug = sanitizeSlug(slug || '');
    if (!safeSlug || safeSlug === '_template') return null;
    const file = path.join(TRIPS_DIR, safeSlug + '.json');
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw || 'null');
  } catch (e) {
    console.error('trips: read failed', slug, e.message);
    return null;
  }
}

function writeTripToFile(data) {
  ensureTripsDir();
  try {
    const safeSlug = sanitizeSlug(data && data.slug);
    if (!safeSlug || safeSlug === '_template') return false;
    const file = path.join(TRIPS_DIR, safeSlug + '.json');
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('trips: write failed', data && data.slug, e.message);
    return false;
  }
}

function deleteTripFile(slug) {
  ensureTripsDir();
  try {
    const safeSlug = sanitizeSlug(slug || '');
    if (!safeSlug || safeSlug === '_template') return false;
    const file = path.join(TRIPS_DIR, safeSlug + '.json');
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return true;
  } catch (e) {
    console.error('trips: delete failed', slug, e.message);
    return false;
  }
}

function listAllTripsFromFiles() {
  ensureTripsDir();
  const trips = [];
  try {
    const files = fs.readdirSync(TRIPS_DIR).filter(f => f.endsWith('.json') && f !== '_template.json');
    for (const fn of files) {
      try {
        const raw = fs.readFileSync(path.join(TRIPS_DIR, fn), 'utf8');
        const obj = JSON.parse(raw);
        if (obj && obj.slug) trips.push(obj);
      } catch (_) { }
    }
  } catch (e) {
    console.error('trips: list failed', e.message);
  }
  return trips;
}

// =========================================================
// DB <-> JSON CONVERSION
// =========================================================

function dbRowToTrip(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle || '',
    teaser: row.teaser || '',
    category: row.category || '',
    active: row.active,
    defaultMode: row.default_mode || 'van',
    iconPath: row.icon_path || '',
    coverImage: row.cover_image || '',
    featuredImage: row.featured_image || '',
    heroVideoURL: row.hero_video_url || '',
    heroThumbnail: row.hero_thumbnail || '',
    currency: row.currency || 'EUR',
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || []),
    gallery: typeof row.gallery === 'string' ? JSON.parse(row.gallery) : (row.gallery || []),
    videos: typeof row.videos === 'string' ? JSON.parse(row.videos) : (row.videos || []),
    modes: typeof row.modes === 'string' ? JSON.parse(row.modes) : (row.modes || {})
  };
}

function tripToDbRow(data) {
  return {
    id: data.id || null,
    slug: sanitizeSlug(data.slug),
    title: data.title || '',
    subtitle: data.subtitle || null,
    teaser: data.teaser || null,
    category: data.category || null,
    active: data.active !== false,
    default_mode: data.defaultMode || 'van',
    icon_path: data.iconPath || null,
    cover_image: data.coverImage || null,
    featured_image: data.featuredImage || null,
    hero_video_url: data.heroVideoURL || null,
    hero_thumbnail: data.heroThumbnail || null,
    currency: data.currency || 'EUR',
    tags: data.tags || [],
    gallery: data.gallery || [],
    videos: data.videos || [],
    modes: data.modes || {}
  };
}

// =========================================================
// UNIFIED API
// =========================================================

/**
 * Get all trips
 * @param {boolean} activeOnly - Filter to only active trips
 * @returns {Promise<Array>}
 */
async function getTrips(activeOnly = false) {
  await initDb();
  
  if (dbAvailable) {
    try {
      const rows = await db.gk.getTrips(activeOnly);
      return rows.map(dbRowToTrip);
    } catch (err) {
      console.error('[trips] DB read failed, falling back to JSON:', err.message);
    }
  }
  
  // Fallback to JSON
  let list = listAllTripsFromFiles();
  if (activeOnly) {
    list = list.filter(t => t.active !== false);
  }
  return list;
}

/**
 * Get trip by slug
 * @param {string} slug
 * @returns {Promise<Object|null>}
 */
async function getTripBySlug(slug) {
  await initDb();
  const safeSlug = sanitizeSlug(slug);
  if (!safeSlug || safeSlug === '_template') return null;
  
  if (dbAvailable) {
    try {
      const row = await db.gk.getTripBySlug(safeSlug);
      return dbRowToTrip(row);
    } catch (err) {
      console.error('[trips] DB lookup failed, falling back to JSON:', err.message);
    }
  }
  
  // Fallback to JSON
  return readTripFromFile(safeSlug);
}

/**
 * Get trip by ID
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function getTripById(id) {
  await initDb();
  if (!id) return null;
  
  if (dbAvailable) {
    try {
      const row = await db.gk.getTripById(id);
      return dbRowToTrip(row);
    } catch (err) {
      console.error('[trips] DB lookup failed, falling back to JSON:', err.message);
    }
  }
  
  // Fallback to JSON - scan all files
  const all = listAllTripsFromFiles();
  return all.find(t => t.id === id) || null;
}

/**
 * Create or update a trip
 * @param {Object} data - Trip data
 * @returns {Promise<Object>}
 */
async function upsertTrip(data) {
  await initDb();
  
  const slug = sanitizeSlug(data.slug);
  if (!slug || slug === '_template') throw new Error('invalid_slug');
  
  // Ensure ID exists
  if (!data.id) {
    data.id = crypto.randomUUID();
  }
  
  if (dbAvailable) {
    try {
      const dbData = tripToDbRow(data);
      const row = await db.gk.upsertTrip(dbData);
      console.log('[trips] Saved to DB:', slug);
      return dbRowToTrip(row);
    } catch (err) {
      console.error('[trips] DB write failed, falling back to JSON:', err.message);
    }
  }
  
  // Fallback to JSON
  const prepared = { ...data, slug };
  if (!writeTripToFile(prepared)) {
    throw new Error('write_failed');
  }
  
  console.log('[trips] Saved to JSON:', slug);
  return prepared;
}

/**
 * Delete a trip by slug
 * @param {string} slug
 * @returns {Promise<boolean>}
 */
async function deleteTrip(slug) {
  await initDb();
  const safeSlug = sanitizeSlug(slug);
  if (!safeSlug || safeSlug === '_template') return false;
  
  if (dbAvailable) {
    try {
      const deleted = await db.gk.deleteTrip(safeSlug);
      if (deleted) {
        console.log('[trips] Deleted from DB:', safeSlug);
        return true;
      }
    } catch (err) {
      console.error('[trips] DB delete failed, falling back to JSON:', err.message);
    }
  }
  
  // Fallback to JSON
  const success = deleteTripFile(safeSlug);
  if (success) {
    console.log('[trips] Deleted from JSON:', safeSlug);
  }
  return success;
}

/**
 * Get trip template
 * @returns {Object}
 */
function getTripTemplate() {
  try {
    if (fs.existsSync(TRIP_TEMPLATE_FILE)) {
      const raw = fs.readFileSync(TRIP_TEMPLATE_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (_) { }
  
  // Return default template
  return {
    id: '',
    slug: '',
    title: '',
    subtitle: '',
    teaser: '',
    category: '',
    active: true,
    defaultMode: 'van',
    iconPath: '',
    coverImage: '',
    featuredImage: '',
    heroVideoURL: '',
    heroThumbnail: '',
    currency: 'EUR',
    tags: [],
    gallery: [],
    videos: [],
    modes: {}
  };
}

/**
 * Check if using database
 * @returns {boolean}
 */
function isUsingDatabase() {
  return dbAvailable;
}

module.exports = {
  getTrips,
  getTripBySlug,
  getTripById,
  upsertTrip,
  deleteTrip,
  getTripTemplate,
  isUsingDatabase,
  initDb,
  // Export paths for compatibility
  TRIPS_DIR,
  TRIP_TEMPLATE_FILE
};
