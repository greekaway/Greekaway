'use strict';
/**
 * PostgreSQL Database Module
 * Centralized database connection and query helpers for Greekaway + MoveAthens
 * 
 * Usage:
 *   const db = require('./db');
 *   await db.init(); // Call once at startup
 *   const rows = await db.query('SELECT * FROM gk_categories WHERE published = $1', [true]);
 *   const category = await db.queryOne('SELECT * FROM gk_categories WHERE slug = $1', ['test']);
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let pool = null;
let isConnected = false;

/**
 * Get DATABASE_URL from environment
 */
function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn('[db] DATABASE_URL not set - database features disabled');
    return null;
  }
  return url;
}

/**
 * Initialize database connection pool
 */
async function init() {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) {
    isConnected = false;
    return false;
  }

  try {
    pool = new Pool({
      connectionString: dbUrl,
      ssl: dbUrl.includes('render.com') || dbUrl.includes('neon.tech') || dbUrl.includes('supabase')
        ? { rejectUnauthorized: false }
        : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });

    // Test connection
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    
    isConnected = true;
    console.log('[db] PostgreSQL connected successfully');
    return true;
  } catch (err) {
    console.error('[db] PostgreSQL connection failed:', err.message);
    isConnected = false;
    pool = null;
    return false;
  }
}

/**
 * Check if database is available
 */
function isAvailable() {
  return isConnected && pool !== null;
}

/**
 * Execute a query and return all rows
 */
async function query(sql, params = []) {
  if (!isAvailable()) {
    throw new Error('Database not available');
  }
  const result = await pool.query(sql, params);
  return result.rows;
}

/**
 * Execute a query and return first row or null
 */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Execute a query that modifies data (INSERT, UPDATE, DELETE)
 * Returns { rowCount, rows }
 */
async function execute(sql, params = []) {
  if (!isAvailable()) {
    throw new Error('Database not available');
  }
  const result = await pool.query(sql, params);
  return {
    rowCount: result.rowCount,
    rows: result.rows
  };
}

/**
 * Execute multiple queries in a transaction
 */
async function transaction(callback) {
  if (!isAvailable()) {
    throw new Error('Database not available');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback({
      query: (sql, params) => client.query(sql, params).then(r => r.rows),
      queryOne: async (sql, params) => {
        const res = await client.query(sql, params);
        return res.rows.length > 0 ? res.rows[0] : null;
      },
      execute: (sql, params) => client.query(sql, params).then(r => ({ rowCount: r.rowCount, rows: r.rows }))
    });
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run schema migrations
 */
async function runMigrations() {
  if (!isAvailable()) {
    console.warn('[db] Cannot run migrations - database not available');
    return false;
  }

  try {
    // Run base schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      console.warn('[db] schema.sql not found');
      return false;
    }
    
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
    console.log('[db] Base schema applied');
    
    // Run migration files (sorted alphabetically = chronologically by date prefix)
    const migrationsDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();
      
      for (const file of migrationFiles) {
        try {
          const migrationPath = path.join(migrationsDir, file);
          const migration = fs.readFileSync(migrationPath, 'utf8');
          await pool.query(migration);
          console.log(`[db] Migration applied: ${file}`);
        } catch (migrationErr) {
          // Ignore "already exists" errors for idempotent migrations
          if (!migrationErr.message.includes('already exists') && 
              !migrationErr.message.includes('duplicate_column')) {
            console.warn(`[db] Migration warning (${file}):`, migrationErr.message);
          }
        }
      }
    }
    
    console.log('[db] All migrations completed');
    return true;
  } catch (err) {
    console.error('[db] Migration failed:', err.message);
    return false;
  }
}

/**
 * Close database connection pool
 */
async function close() {
  if (pool) {
    await pool.end();
    pool = null;
    isConnected = false;
    console.log('[db] PostgreSQL connection closed');
  }
}

// =========================================================
// GREEKAWAY SPECIFIC HELPERS
// =========================================================

const gk = {
  // Categories
  async getCategories(publishedOnly = false) {
    let sql = 'SELECT * FROM gk_categories';
    if (publishedOnly) sql += ' WHERE published = true';
    sql += ' ORDER BY display_order, title';
    return query(sql);
  },

  async getCategoryBySlug(slug) {
    return queryOne('SELECT * FROM gk_categories WHERE slug = $1', [slug]);
  },

  async getCategoryById(id) {
    return queryOne('SELECT * FROM gk_categories WHERE id = $1', [id]);
  },

  async upsertCategory(data) {
    const { id, title, slug, icon_path, display_order, published } = data;
    const sql = `
      INSERT INTO gk_categories (id, title, slug, icon_path, display_order, published)
      VALUES (COALESCE($1, uuid_generate_v4()), $2, $3, $4, $5, $6)
      ON CONFLICT (slug) DO UPDATE SET
        title = EXCLUDED.title,
        icon_path = EXCLUDED.icon_path,
        display_order = EXCLUDED.display_order,
        published = EXCLUDED.published,
        updated_at = NOW()
      RETURNING *
    `;
    const rows = await query(sql, [id || null, title, slug, icon_path || null, display_order || 0, published ?? false]);
    return rows[0];
  },

  async deleteCategory(slug) {
    const result = await execute('DELETE FROM gk_categories WHERE slug = $1', [slug]);
    return result.rowCount > 0;
  },

  // Trips
  async getTrips(activeOnly = false) {
    let sql = 'SELECT * FROM gk_trips';
    if (activeOnly) sql += ' WHERE active = true';
    sql += ' ORDER BY title';
    return query(sql);
  },

  async getTripBySlug(slug) {
    return queryOne('SELECT * FROM gk_trips WHERE slug = $1', [slug]);
  },

  async getTripById(id) {
    return queryOne('SELECT * FROM gk_trips WHERE id = $1', [id]);
  },

  async upsertTrip(data) {
    const {
      id, slug, title, subtitle, teaser, category, active, default_mode,
      icon_path, cover_image, featured_image, hero_video_url, hero_thumbnail,
      currency, tags, gallery, videos, modes
    } = data;
    
    const sql = `
      INSERT INTO gk_trips (
        id, slug, title, subtitle, teaser, category, active, default_mode,
        icon_path, cover_image, featured_image, hero_video_url, hero_thumbnail,
        currency, tags, gallery, videos, modes
      ) VALUES (
        COALESCE($1, uuid_generate_v4()), $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      )
      ON CONFLICT (slug) DO UPDATE SET
        title = EXCLUDED.title,
        subtitle = EXCLUDED.subtitle,
        teaser = EXCLUDED.teaser,
        category = EXCLUDED.category,
        active = EXCLUDED.active,
        default_mode = EXCLUDED.default_mode,
        icon_path = EXCLUDED.icon_path,
        cover_image = EXCLUDED.cover_image,
        featured_image = EXCLUDED.featured_image,
        hero_video_url = EXCLUDED.hero_video_url,
        hero_thumbnail = EXCLUDED.hero_thumbnail,
        currency = EXCLUDED.currency,
        tags = EXCLUDED.tags,
        gallery = EXCLUDED.gallery,
        videos = EXCLUDED.videos,
        modes = EXCLUDED.modes,
        updated_at = NOW()
      RETURNING *
    `;
    
    const rows = await query(sql, [
      id || null, slug, title, subtitle || null, teaser || null, category || null,
      active ?? true, default_mode || 'van', icon_path || null, cover_image || null,
      featured_image || null, hero_video_url || null, hero_thumbnail || null,
      currency || 'EUR',
      JSON.stringify(tags || []),
      JSON.stringify(gallery || []),
      JSON.stringify(videos || []),
      JSON.stringify(modes || {})
    ]);
    return rows[0];
  },

  async deleteTrip(slug) {
    const result = await execute('DELETE FROM gk_trips WHERE slug = $1', [slug]);
    return result.rowCount > 0;
  }
};

// =========================================================
// MOVEATHENS SPECIFIC HELPERS
// =========================================================

const ma = {
  // Config (singleton)
  async getConfig() {
    let row = await queryOne('SELECT * FROM ma_config WHERE id = 1');
    if (!row) {
      // Insert default config
      await execute(`
        INSERT INTO ma_config (id) VALUES (1)
        ON CONFLICT (id) DO NOTHING
      `);
      row = await queryOne('SELECT * FROM ma_config WHERE id = 1');
    }
    return row;
  },

  async updateConfig(data) {
    const fields = [
      'hero_video_url', 'hero_logo_url', 'hero_headline', 'hero_subtext',
      'footer_labels', 'footer_icons', 'phone_number', 'whatsapp_number',
      'company_email', 'cta_labels', 'contact_labels', 'hotel_context_labels',
      'hotel_email_subject_prefix', 'info_page_title', 'info_page_content',
      // New structured info sections (2026-01-30)
      'info_cancellation_title', 'info_cancellation_content',
      'info_compliance_title', 'info_compliance_content',
      'info_faq_title', 'info_faq_content'
    ];
    
    const updates = [];
    const values = [];
    let paramCount = 0;
    
    for (const field of fields) {
      const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (data[camelField] !== undefined || data[field] !== undefined) {
        paramCount++;
        updates.push(`${field} = $${paramCount}`);
        let val = data[camelField] !== undefined ? data[camelField] : data[field];
        if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
        values.push(val);
      }
    }
    
    if (updates.length === 0) return this.getConfig();
    
    await execute(`
      UPDATE ma_config SET ${updates.join(', ')}, updated_at = NOW() WHERE id = 1
    `, values);
    
    return this.getConfig();
  },

  // Transfer Zones
  async getZones(activeOnly = false) {
    let sql = 'SELECT * FROM ma_transfer_zones';
    if (activeOnly) sql += ' WHERE is_active = true';
    sql += ' ORDER BY name';
    return query(sql);
  },

  async getZoneById(id) {
    return queryOne('SELECT * FROM ma_transfer_zones WHERE id = $1', [id]);
  },

  async upsertZone(data) {
    const { id, name, description, zone_type, is_active,
            municipality, address, phone, email, accommodation_type } = data;
    const zoneId = id || `tz_${Date.now()}`;
    const sql = `
      INSERT INTO ma_transfer_zones
        (id, name, description, zone_type, is_active,
         municipality, address, phone, email, accommodation_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        zone_type = EXCLUDED.zone_type,
        is_active = EXCLUDED.is_active,
        municipality = EXCLUDED.municipality,
        address = EXCLUDED.address,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        accommodation_type = EXCLUDED.accommodation_type,
        updated_at = NOW()
      RETURNING *
    `;
    const rows = await query(sql, [
      zoneId, name, description || '', zone_type || 'suburb', is_active ?? true,
      municipality || '', address || '', phone || '', email || '',
      accommodation_type || 'hotel'
    ]);
    return rows[0];
  },

  async deleteZone(id) {
    const result = await execute('DELETE FROM ma_transfer_zones WHERE id = $1', [id]);
    return result.rowCount > 0;
  },

  // Vehicle Types
  async getVehicleTypes(activeOnly = false) {
    let sql = 'SELECT * FROM ma_vehicle_types';
    if (activeOnly) sql += ' WHERE is_active = true';
    sql += ' ORDER BY display_order, name';
    return query(sql);
  },

  async getVehicleTypeById(id) {
    return queryOne('SELECT * FROM ma_vehicle_types WHERE id = $1', [id]);
  },

  async upsertVehicleType(data) {
    const {
      id, name, description, image_url, max_passengers,
      luggage_large, luggage_medium, luggage_cabin, display_order, is_active,
      allow_instant, min_advance_minutes
    } = data;
    const vehicleId = id || `vt_${Date.now()}`;
    const sql = `
      INSERT INTO ma_vehicle_types (
        id, name, description, image_url, max_passengers,
        luggage_large, luggage_medium, luggage_cabin, display_order, is_active,
        allow_instant, min_advance_minutes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        image_url = EXCLUDED.image_url,
        max_passengers = EXCLUDED.max_passengers,
        luggage_large = EXCLUDED.luggage_large,
        luggage_medium = EXCLUDED.luggage_medium,
        luggage_cabin = EXCLUDED.luggage_cabin,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active,
        allow_instant = EXCLUDED.allow_instant,
        min_advance_minutes = EXCLUDED.min_advance_minutes,
        updated_at = NOW()
      RETURNING *
    `;
    const rows = await query(sql, [
      vehicleId, name, description || '', image_url || null,
      max_passengers || 4, luggage_large || 2, luggage_medium || 2,
      luggage_cabin || 4, display_order || 0, is_active ?? true,
      allow_instant ?? true, min_advance_minutes || 0
    ]);
    return rows[0];
  },

  async deleteVehicleType(id) {
    const result = await execute('DELETE FROM ma_vehicle_types WHERE id = $1', [id]);
    return result.rowCount > 0;
  },

  // Destination Categories
  async getDestinationCategories(activeOnly = false) {
    let sql = 'SELECT * FROM ma_destination_categories';
    if (activeOnly) sql += ' WHERE is_active = true';
    sql += ' ORDER BY display_order, name';
    return query(sql);
  },

  async getDestinationCategoryById(id) {
    return queryOne('SELECT * FROM ma_destination_categories WHERE id = $1', [id]);
  },

  async upsertDestinationCategory(data) {
    const { id, name, icon, display_order, is_active } = data;
    const catId = id || `dc_${Date.now()}`;
    const sql = `
      INSERT INTO ma_destination_categories (id, name, icon, display_order, is_active)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        icon = EXCLUDED.icon,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING *
    `;
    const rows = await query(sql, [catId, name, icon || '', display_order || 0, is_active ?? true]);
    return rows[0];
  },

  async deleteDestinationCategory(id) {
    const result = await execute('DELETE FROM ma_destination_categories WHERE id = $1', [id]);
    return result.rowCount > 0;
  },

  // Destinations
  async getDestinations(filters = {}) {
    let sql = 'SELECT * FROM ma_destinations WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (filters.category_id) {
      paramCount++;
      sql += ` AND category_id = $${paramCount}`;
      params.push(filters.category_id);
    }
    if (filters.zone_id) {
      paramCount++;
      sql += ` AND zone_id = $${paramCount}`;
      params.push(filters.zone_id);
    }
    if (filters.activeOnly) {
      sql += ' AND is_active = true';
    }

    sql += ' ORDER BY display_order, name';
    return query(sql, params);
  },

  async getDestinationById(id) {
    return queryOne('SELECT * FROM ma_destinations WHERE id = $1', [id]);
  },

  async upsertDestination(data) {
    const { id, name, description, category_id, zone_id, route_type, display_order, is_active } = data;
    const destId = id || `dest_${Date.now()}`;
    const sql = `
      INSERT INTO ma_destinations (id, name, description, category_id, zone_id, route_type, display_order, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        category_id = EXCLUDED.category_id,
        zone_id = EXCLUDED.zone_id,
        route_type = EXCLUDED.route_type,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING *
    `;
    const rows = await query(sql, [
      destId, name, description || '', category_id || null,
      zone_id || null, route_type || null, display_order || 0, is_active ?? true
    ]);
    return rows[0];
  },

  async deleteDestination(id) {
    const result = await execute('DELETE FROM ma_destinations WHERE id = $1', [id]);
    return result.rowCount > 0;
  },

  // Transfer Prices
  async getPrices(filters = {}) {
    let sql = 'SELECT * FROM ma_transfer_prices WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (filters.origin_zone_id) {
      paramCount++;
      sql += ` AND origin_zone_id = $${paramCount}`;
      params.push(filters.origin_zone_id);
    }
    if (filters.destination_id) {
      paramCount++;
      sql += ` AND destination_id = $${paramCount}`;
      params.push(filters.destination_id);
    }
    if (filters.vehicle_type_id) {
      paramCount++;
      sql += ` AND vehicle_type_id = $${paramCount}`;
      params.push(filters.vehicle_type_id);
    }
    if (filters.tariff) {
      paramCount++;
      sql += ` AND tariff = $${paramCount}`;
      params.push(filters.tariff);
    }

    return query(sql, params);
  },

  async upsertPrice(data) {
    const { id, origin_zone_id, destination_id, vehicle_type_id, tariff, price,
            commission_driver, commission_hotel, commission_service } = data;
    const priceId = id || `tp_${Date.now()}_${vehicle_type_id}_${tariff}`;
    const sql = `
      INSERT INTO ma_transfer_prices
        (id, origin_zone_id, destination_id, vehicle_type_id, tariff, price,
         commission_driver, commission_hotel, commission_service)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (origin_zone_id, destination_id, vehicle_type_id, tariff) DO UPDATE SET
        price = EXCLUDED.price,
        commission_driver = EXCLUDED.commission_driver,
        commission_hotel = EXCLUDED.commission_hotel,
        commission_service = EXCLUDED.commission_service,
        updated_at = NOW()
      RETURNING *
    `;
    const rows = await query(sql, [
      priceId, origin_zone_id, destination_id, vehicle_type_id, tariff || 'day', price,
      commission_driver || 0, commission_hotel || 0, commission_service || 0
    ]);
    return rows[0];
  },

  async deletePrice(id) {
    const result = await execute('DELETE FROM ma_transfer_prices WHERE id = $1', [id]);
    return result.rowCount > 0;
  },

  // Vehicle Category Availability
  async getVehicleCategoryAvailability() {
    return query('SELECT * FROM ma_vehicle_category_availability');
  },

  async setVehicleCategoryAvailability(category_id, vehicle_type_id, is_available) {
    const sql = `
      INSERT INTO ma_vehicle_category_availability (category_id, vehicle_type_id, is_available)
      VALUES ($1, $2, $3)
      ON CONFLICT (category_id, vehicle_type_id) DO UPDATE SET is_available = EXCLUDED.is_available
      RETURNING *
    `;
    const rows = await query(sql, [category_id, vehicle_type_id, is_available]);
    return rows[0];
  },

  // Vehicle Destination Overrides
  async getVehicleDestinationOverrides() {
    return query('SELECT * FROM ma_vehicle_destination_overrides');
  },

  async setVehicleDestinationOverride(destination_id, vehicle_type_id, is_available, price_override = null) {
    const sql = `
      INSERT INTO ma_vehicle_destination_overrides (destination_id, vehicle_type_id, is_available, price_override)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (destination_id, vehicle_type_id) DO UPDATE SET
        is_available = EXCLUDED.is_available,
        price_override = EXCLUDED.price_override
      RETURNING *
    `;
    const rows = await query(sql, [destination_id, vehicle_type_id, is_available, price_override]);
    return rows[0];
  },

  // Full pricing view
  async getFullPricing() {
    return query('SELECT * FROM ma_transfer_pricing_full');
  },

  // ---- TRANSFER REQUESTS ----
  async getRequests(filters = {}) {
    let sql = 'SELECT * FROM ma_transfer_requests';
    const params = [];
    const clauses = [];
    if (filters.status) { params.push(filters.status); clauses.push(`status = $${params.length}`); }
    if (filters.driver_id) { params.push(filters.driver_id); clauses.push(`driver_id = $${params.length}`); }
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    if (filters.limit) { params.push(filters.limit); sql += ` LIMIT $${params.length}`; }
    return query(sql, params);
  },

  async getRequestById(id) {
    return queryOne('SELECT * FROM ma_transfer_requests WHERE id = $1', [id]);
  },

  async getRequestByToken(token) {
    return queryOne('SELECT * FROM ma_transfer_requests WHERE accept_token = $1', [token]);
  },

  async createRequest(data) {
    const sql = `
      INSERT INTO ma_transfer_requests (
        id, origin_zone_id, origin_zone_name, hotel_name, hotel_address,
        destination_id, destination_name, vehicle_type_id, vehicle_name,
        tariff, booking_type, scheduled_date, scheduled_time,
        passenger_name, passengers, luggage_large, luggage_medium, luggage_cabin,
        payment_method, price, commission_driver, commission_hotel, commission_service,
        status, accept_token
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
      ) RETURNING *
    `;
    const rows = await query(sql, [
      data.id, data.origin_zone_id, data.origin_zone_name || '', data.hotel_name || '', data.hotel_address || '',
      data.destination_id || '', data.destination_name || '', data.vehicle_type_id || '', data.vehicle_name || '',
      data.tariff || 'day', data.booking_type || 'instant', data.scheduled_date || '', data.scheduled_time || '',
      data.passenger_name || '', data.passengers || 0, data.luggage_large || 0, data.luggage_medium || 0, data.luggage_cabin || 0,
      data.payment_method || 'cash', data.price || 0, data.commission_driver || 0, data.commission_hotel || 0, data.commission_service || 0,
      data.status || 'pending', data.accept_token || null
    ]);
    return rows[0];
  },

  async updateRequest(id, data) {
    const fields = [];
    const params = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      fields.push(`${key} = $${idx}`);
      params.push(val);
      idx++;
    }
    params.push(id);
    const sql = `UPDATE ma_transfer_requests SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const rows = await query(sql, params);
    return rows[0];
  },

  async deleteRequest(id) {
    const r = await execute('DELETE FROM ma_transfer_requests WHERE id = $1', [id]);
    return r.rowCount > 0;
  },

  async expireOldRequests(cutoffMs = 3600000) {
    const cutoff = new Date(Date.now() - cutoffMs).toISOString();
    const sql = `
      UPDATE ma_transfer_requests
      SET status = 'expired', expired_at = NOW()
      WHERE status = 'pending' AND created_at < $1
      RETURNING id
    `;
    return query(sql, [cutoff]);
  },

  // ---- DRIVERS ----
  async getDrivers(activeOnly = false) {
    let sql = 'SELECT * FROM ma_drivers';
    if (activeOnly) sql += ' WHERE is_active = true';
    sql += ' ORDER BY name ASC';
    return query(sql);
  },

  async getDriverById(id) {
    return queryOne('SELECT * FROM ma_drivers WHERE id = $1', [id]);
  },

  async getDriverByPhone(phone) {
    return queryOne('SELECT * FROM ma_drivers WHERE phone = $1', [phone]);
  },

  async upsertDriver(data) {
    const sql = `
      INSERT INTO ma_drivers (id, name, phone, notes, is_active)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        notes = EXCLUDED.notes,
        is_active = EXCLUDED.is_active
      RETURNING *
    `;
    const rows = await query(sql, [
      data.id, data.name || '', data.phone, data.notes || '', data.is_active !== false
    ]);
    return rows[0];
  },

  async updateDriverTotals(driverId, tripRevenue, serviceCommission) {
    const sql = `
      UPDATE ma_drivers SET
        total_trips = total_trips + 1,
        total_revenue = total_revenue + $2,
        total_owed = total_owed + $3
      WHERE id = $1
      RETURNING *
    `;
    const rows = await query(sql, [driverId, tripRevenue, serviceCommission]);
    return rows[0];
  },

  async deleteDriver(id) {
    const r = await execute('DELETE FROM ma_drivers WHERE id = $1', [id]);
    return r.rowCount > 0;
  },

  // ---- DRIVER PAYMENTS ----
  async getDriverPayments(driverId) {
    return query('SELECT * FROM ma_driver_payments WHERE driver_id = $1 ORDER BY created_at DESC', [driverId]);
  },

  async addDriverPayment(data) {
    const sql = `
      INSERT INTO ma_driver_payments (id, driver_id, amount, note)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const rows = await query(sql, [data.id, data.driver_id, data.amount, data.note || '']);
    return rows[0];
  },

  async recordDriverPayment(driverId, paymentId, amount, note) {
    // Insert payment + update driver total_paid atomically
    const paymentSql = `INSERT INTO ma_driver_payments (id, driver_id, amount, note) VALUES ($1, $2, $3, $4) RETURNING *`;
    const payment = await query(paymentSql, [paymentId, driverId, amount, note || '']);
    const driverSql = `UPDATE ma_drivers SET total_paid = total_paid + $2 WHERE id = $1 RETURNING *`;
    const driver = await query(driverSql, [driverId, amount]);
    return { payment: payment[0], driver: driver[0] };
  }
};

module.exports = {
  init,
  isAvailable,
  query,
  queryOne,
  execute,
  transaction,
  runMigrations,
  close,
  gk,
  ma
};
