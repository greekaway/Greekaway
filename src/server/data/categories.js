'use strict';
/**
 * Categories Data Layer
 * Abstracts storage between PostgreSQL and JSON files
 * Uses PostgreSQL when DATABASE_URL is set, falls back to JSON files otherwise
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.join(__dirname, '..', '..', '..');
const CATEGORIES_PATH = path.join(ROOT_DIR, 'data', 'categories.json');
const PUBLIC_CATEGORIES_DIR = path.join(ROOT_DIR, 'public', 'categories');
const DEFAULT_ICON_PATH = 'uploads/icons/default.svg';

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
      console.log('[categories] Using PostgreSQL database');
    } else {
      console.log('[categories] Using JSON file storage (DATABASE_URL not set)');
    }
  } catch (err) {
    console.log('[categories] Database not available, using JSON files:', err.message);
    dbAvailable = false;
  }
  return dbAvailable;
}

// =========================================================
// JSON FILE OPERATIONS (fallback)
// =========================================================

function ensureCategoriesFile() {
  try { fs.mkdirSync(path.dirname(CATEGORIES_PATH), { recursive: true }); } catch (_) { }
  try { fs.mkdirSync(PUBLIC_CATEGORIES_DIR, { recursive: true }); } catch (_) { }
  if (!fs.existsSync(CATEGORIES_PATH)) {
    try { fs.writeFileSync(CATEGORIES_PATH, '[]', 'utf8'); } catch (_) { }
  }
}

function readCategoriesFromFile() {
  ensureCategoriesFile();
  try {
    const raw = fs.readFileSync(CATEGORIES_PATH, 'utf8');
    const data = JSON.parse(raw || '[]');
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('categories: read failed', err.message);
    return [];
  }
}

function writeCategoriesToFile(arr) {
  try {
    fs.writeFileSync(CATEGORIES_PATH, JSON.stringify(arr, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('categories: write failed', err.message);
    return false;
  }
}

function sanitizeSlug(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// =========================================================
// UNIFIED API
// =========================================================

/**
 * Get all categories
 * @param {boolean} publishedOnly - Filter to only published categories
 * @returns {Promise<Array>}
 */
async function getCategories(publishedOnly = false) {
  await initDb();
  
  if (dbAvailable) {
    try {
      const rows = await db.gk.getCategories(publishedOnly);
      return rows.map(row => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        iconPath: row.icon_path || '',
        order: row.display_order || 0,
        published: row.published
      }));
    } catch (err) {
      console.error('[categories] DB read failed, falling back to JSON:', err.message);
    }
  }
  
  // Fallback to JSON
  let list = readCategoriesFromFile();
  if (publishedOnly) {
    list = list.filter(c => !!c.published);
  }
  list.sort((a, b) => (a.order - b.order) || String(a.title || '').localeCompare(String(b.title || '')));
  return list;
}

/**
 * Get category by slug
 * @param {string} slug
 * @returns {Promise<Object|null>}
 */
async function getCategoryBySlug(slug) {
  await initDb();
  const safeSlug = sanitizeSlug(slug);
  
  if (dbAvailable) {
    try {
      const row = await db.gk.getCategoryBySlug(safeSlug);
      if (!row) return null;
      return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        iconPath: row.icon_path || '',
        order: row.display_order || 0,
        published: row.published
      };
    } catch (err) {
      console.error('[categories] DB lookup failed, falling back to JSON:', err.message);
    }
  }
  
  // Fallback to JSON
  const list = readCategoriesFromFile();
  return list.find(c => c.slug === safeSlug) || null;
}

/**
 * Create or update a category
 * @param {Object} data - Category data
 * @returns {Promise<Object>}
 */
async function upsertCategory(data) {
  await initDb();
  
  const slug = sanitizeSlug(data.slug || data.title || '');
  if (!slug) throw new Error('missing_slug');
  
  if (dbAvailable) {
    try {
      const row = await db.gk.upsertCategory({
        id: data.id || null,
        title: data.title || '',
        slug: slug,
        icon_path: data.iconPath || '',
        display_order: Number.isFinite(data.order) ? data.order : parseInt(data.order, 10) || 0,
        published: !!data.published
      });
      console.log('[categories] Saved to DB:', slug);
      return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        iconPath: row.icon_path || '',
        order: row.display_order || 0,
        published: row.published
      };
    } catch (err) {
      console.error('[categories] DB write failed, falling back to JSON:', err.message);
    }
  }
  
  // Fallback to JSON
  const list = readCategoriesFromFile();
  let existing = list.find(c => c.slug === slug || c.id === data.id);
  
  if (!existing) {
    existing = {
      id: data.id || crypto.randomUUID(),
      title: '',
      slug,
      iconPath: '',
      order: 0,
      published: false
    };
    list.push(existing);
  }
  
  if (typeof data.title === 'string') existing.title = data.title.trim();
  existing.slug = slug;
  existing.order = Number.isFinite(data.order) ? data.order : parseInt(data.order, 10) || 0;
  existing.published = !!data.published;
  if (typeof data.iconPath === 'string') existing.iconPath = data.iconPath;
  
  list.sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title));
  
  if (!writeCategoriesToFile(list)) {
    throw new Error('write_failed');
  }
  
  console.log('[categories] Saved to JSON:', slug);
  return existing;
}

/**
 * Delete a category by slug
 * @param {string} slug
 * @returns {Promise<boolean>}
 */
async function deleteCategory(slug) {
  await initDb();
  const safeSlug = sanitizeSlug(slug);
  
  if (dbAvailable) {
    try {
      const deleted = await db.gk.deleteCategory(safeSlug);
      if (deleted) {
        console.log('[categories] Deleted from DB:', safeSlug);
        return true;
      }
    } catch (err) {
      console.error('[categories] DB delete failed, falling back to JSON:', err.message);
    }
  }
  
  // Fallback to JSON
  const list = readCategoriesFromFile();
  const before = list.length;
  const filtered = list.filter(c => String(c.slug || '').toLowerCase() !== safeSlug);
  
  if (filtered.length === before) return false;
  
  if (!writeCategoriesToFile(filtered)) {
    throw new Error('write_failed');
  }
  
  console.log('[categories] Deleted from JSON:', safeSlug);
  return true;
}

/**
 * Check if using database
 * @returns {boolean}
 */
function isUsingDatabase() {
  return dbAvailable;
}

module.exports = {
  getCategories,
  getCategoryBySlug,
  upsertCategory,
  deleteCategory,
  isUsingDatabase,
  initDb,
  // Export paths for compatibility
  CATEGORIES_PATH,
  PUBLIC_CATEGORIES_DIR,
  DEFAULT_ICON_PATH
};
