const express = require("express");
let compression = null;
try { compression = require('compression'); } catch(e) { /* compression optional in dev */ }
const path = require("path");
const fs = require("fs");
const crypto = require('crypto');
const { TextDecoder } = require('util');

// Load local .env (if present). Safe to leave out in production where env vars are set
try { require('dotenv').config(); } catch (e) { /* noop if dotenv isn't installed */ }

// Admin credentials (Basic auth) consumed by admin APIs and /admin-login
let ADMIN_USER = process.env.ADMIN_USER || null;
let ADMIN_PASS = process.env.ADMIN_PASS || null;
if (typeof ADMIN_USER === 'string') ADMIN_USER = ADMIN_USER.trim().replace(/^['"]|['"]$/g, '');
if (typeof ADMIN_PASS === 'string') ADMIN_PASS = ADMIN_PASS.trim().replace(/^['"]|['"]$/g, '');

// Central admin auth check used by server and modules
function checkAdminAuth(req){
  return hasAdminSession(req);
}

function getCookies(req){
  try {
    const h = req.headers.cookie || '';
    if (!h) return {};
    return h.split(';').reduce((acc, part) => {
      const i = part.indexOf('=');
      if (i === -1) return acc;
      const k = part.slice(0,i).trim();
      const v = decodeURIComponent(part.slice(i+1).trim());
      acc[k] = v; return acc;
    }, {});
  } catch(_) { return {}; }
}
function hasAdminSession(req){
  try { if (req && req.session && req.session.admin === true) return true; } catch(_){ }
  const c = getCookies(req);
  return c.adminSession === 'true' || c.adminSession === '1' || c.adminSession === 'yes';
}

// (Phase 1 refactor note) Removed transient createApp() indirection; restore direct Express init for stability
const app = express();

// ========================================
// CANONICAL DOMAIN REDIRECTS - DISABLED FOR DEBUGGING
// ========================================
// TEMPORARILY DISABLED: Causing redirect loops with Render proxy
// Will re-enable with proper x-forwarded-proto checks after testing
/*
app.use((req, res, next) => {
  const host = (req.headers.host || '').toLowerCase();
  
  // Skip in development/test
  if (host.includes('localhost') || host.includes('127.0.0.1') || host.endsWith('.local')) {
    return next();
  }
  
  // Redirect *.onrender.com to moveathens.com (for MoveAthens traffic)
  if (host.includes('onrender.com')) {
    const url = req.url || '/';
    const referer = req.headers.referer || '';
    const isMoveAthensTraffic = url.startsWith('/moveathens') || 
                                 url.startsWith('/api/moveathens') ||
                                 referer.includes('moveathens');
    if (isMoveAthensTraffic) {
      const cleanUrl = url.startsWith('/moveathens') ? url.replace('/moveathens', '') || '/' : url;
      return res.redirect(301, `https://moveathens.com${cleanUrl}`);
    }
  }
  
  // Redirect www.moveathens.com to moveathens.com (canonical non-www)
  if (host === 'www.moveathens.com') {
    return res.redirect(301, `https://moveathens.com${req.url}`);
  }
  
  next();
});
*/

// ========================================
// HEALTH CHECK ENDPOINT (for load balancers, uptime monitors)
// ========================================
app.get('/healthz', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.status(200).send('ok');
});

// Parse URL-encoded bodies for simple form logins
app.use(express.urlencoded({ extended: true }));
// Custom lightweight JSON body parser (replaces express.json())
// - Limits body to 1MB
// - Returns 400 JSON { error: 'Invalid JSON' } on parse failure
// - Returns 413 JSON { error: 'Payload too large' } if limit exceeded
// - Does NOT log raw body or include it in responses
app.use((req, res, next) => {
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (!ct.startsWith('application/json')) return next();
  let size = 0;
  const LIMIT = 1 * 1024 * 1024; // 1MB
  let chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > LIMIT) {
      chunks = null;
      // Destroy stream and respond 413 once end fires
      req.destroy();
    } else {
      chunks.push(chunk);
    }
  });
  req.on('end', () => {
    if (size > LIMIT) {
      return res.status(413).json({ error: 'Payload too large' });
    }
    if (!chunks) return res.status(413).json({ error: 'Payload too large' });
    const buf = Buffer.concat(chunks);
    const raw = buf.toString('utf8').trim();
    if (raw.length === 0) { req.body = {}; return next(); }
    try {
      req.body = JSON.parse(raw);
      return next();
    } catch (_) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  });
  req.on('error', () => {
    return res.status(400).json({ error: 'Invalid JSON' });
  });
});
// Early global error handler to normalize JSON errors for API requests (including body-parser parse failures)
app.use((err, req, res, next) => {
  if (!err) return next();
  const p = String(req.originalUrl || req.url || '');
  const acc = String(req.headers['accept'] || '').toLowerCase();
  const wantsJson = p.startsWith('/api/') || acc.includes('application/json');
  if (wantsJson && !res.headersSent) {
    const isParse = err.type === 'entity.parse.failed';
    const status = isParse ? 400 : (err.status && Number.isFinite(err.status) ? err.status : 500);
    return res.status(status).json({ error: isParse ? 'Invalid JSON' : (err.message || 'Server error') });
  }
  return next(err);
});
// Ensure JSON parse errors return JSON (not default HTML) for API endpoints
// (Removed early JSON parse error handler; replaced with unified final handler below)
// App version from package.json
let APP_VERSION = '0.0.0';
try { APP_VERSION = require('./package.json').version || APP_VERSION; } catch (_) {}
// Capture server process start time (ISO). Used as a stable fallback when build info is missing
const PROCESS_STARTED_AT = new Date().toISOString();
// Optional version.json path for build metadata (moved helpers to lib/version.js)
const VERSION_FILE_PATH = path.join(__dirname, 'version.json');
const { readVersionFile, formatBuild } = require('./src/server/lib/version');
const { buildLiveRulesPrompt } = require('./src/server/lib/prompts');
let tripsModule = null;
try {
  tripsModule = require('./src/server/routes/trips');
} catch (e) {
  console.warn('trips: module preload failed', e && e.message ? e.message : e);
}

// PostgreSQL Database initialization (if DATABASE_URL is set)
let db = null;
(async function initDatabase() {
  try {
    db = require('./db');
    const connected = await db.init();
    if (connected) {
      console.log('server: PostgreSQL database connected');
      // Run schema migrations on startup
      await db.runMigrations();
    } else {
      console.log('server: Running without PostgreSQL (using JSON file storage)');
    }
  } catch (err) {
    console.warn('server: Database initialization skipped:', err.message);
  }
})();

// Environment detection: treat non-production and non-Render as local dev
const IS_RENDER = !!process.env.RENDER;
const IS_DEV = (process.env.NODE_ENV !== 'production') && !IS_RENDER;
// Enable gzip compression if available to reduce payload size
if (compression) {
  try { app.use(compression()); console.log('server: compression enabled'); } catch(e) { /* ignore */ }
}
// Bind explicitly to 0.0.0.0:3000 for LAN access and test stability
const HOST = '0.0.0.0';
// In test runs (Jest), force port 3000 so tests connect regardless of .env PORT
const IS_JEST = !!process.env.JEST_WORKER_ID;
const TEST_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const PORT = ((process.env.NODE_ENV === 'test') || IS_JEST) ? TEST_PORT : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);
// Sessions for admin auth (cookie-based, no Basic popups)
let session = null;
try { session = require('express-session'); } catch(_) { session = null; }
const SESSION_SECRET = (process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET || crypto.randomBytes(24).toString('hex')).trim();
// Moved asset/version scanners to lib/assets.js
const { computeLocalesVersion, computeDataVersion, computeAssetsVersion } = require('./src/server/lib/assets');
const { getUploadsRoot, ensureDir } = require('./src/server/lib/uploads');
const { computeCacheBust } = require('./src/server/lib/cacheBust');

// Read Maps API key from environment. If not provided, the placeholder remains.
// Trim and strip surrounding quotes if the value was pasted with quotes.
let MAP_KEY = process.env.GOOGLE_MAPS_API_KEY || 'YOUR_GOOGLE_MAPS_API_KEY';
if (typeof MAP_KEY === 'string') {
  MAP_KEY = MAP_KEY.trim().replace(/^['"]|['"]$/g, '');
}
// Stripe secret key from environment (do not commit real keys)
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || null;
let stripe = null;
if (STRIPE_SECRET) {
  try { stripe = require('stripe')(STRIPE_SECRET); } catch(e) { console.warn('Stripe not initialized (install package?)'); }
}

// ---------------- Assistant env + helper extraction (Phase 4) ----------------
// Environment key for OpenAI (optional). Empty string becomes null for simpler checks.
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim() || null;
// Force always include live data (weather/news) even if user didn't ask explicitly
const ASSISTANT_LIVE_ALWAYS = ['1','true','yes','on'].includes(String(process.env.ASSISTANT_LIVE_ALWAYS || '').toLowerCase());

// News RSS sources: support NEWS_RSS_URL (single) and NEWS_RSS_URLS (comma/space-separated list)
const NEWS_RSS_URLS = (() => {
  const single = process.env.NEWS_RSS_URL;
  const multi = process.env.NEWS_RSS_URLS;
  const arr = [];
  if (single && single.trim()) arr.push(single.trim());
  if (multi && multi.trim()) multi.split(/[\s,]+/).forEach(u => { if (u.trim()) arr.push(u.trim()); });
  return Array.from(new Set(arr));
})();
const NEWS_CACHE = { headlines: [], updatedAt: null };
const NEWS_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3h
function isNewsCacheFresh(){ return !!(NEWS_CACHE.updatedAt && (Date.now() - NEWS_CACHE.updatedAt < NEWS_CACHE_TTL_MS)); }
async function refreshNewsFeed(reason='manual') {
  if (!NEWS_RSS_URLS.length) return [];
  let all = [];
  let fetch = null;
  try { fetch = require('node-fetch'); } catch(_) { fetch = null; }
  if (!fetch) { return []; }
  for (const url of NEWS_RSS_URLS) {
    try {
      const resp = await fetch(url, { timeout: 8000 });
      if (!resp.ok) continue;
      const text = await resp.text();
      // Naive RSS <title> extraction (skip feed title)
      const titles = Array.from(text.matchAll(/<title>([^<]{4,120})<\/title>/gi)).map(m => m[1].trim());
      if (titles.length > 1) all = all.concat(titles.slice(1, 16));
    } catch (e) { /* ignore per-source */ }
  }
  all = all.slice(0, 30);
  if (all.length) { NEWS_CACHE.headlines = all; NEWS_CACHE.updatedAt = Date.now(); }
  return NEWS_CACHE.headlines;
}
async function getCachedHeadlinesOrRefresh(){ return isNewsCacheFresh() ? NEWS_CACHE.headlines : await refreshNewsFeed('auto'); }

// Assistant intent helpers (these were inline previously; now explicit for module injection)
function wantsResetTopic(message, lang) {
  const m = String(message||'').toLowerCase();
  const isEl = String(lang||'').toLowerCase().startsWith('el');
  return isEl ? /(αλλαγή\s+θέματος|νέο\s+θέμα|καθαρή\s+συζήτηση|reset|restart)/i.test(m) : /(change\s+topic|new\s+topic|reset|restart|clear\s+context)/i.test(m);
}
function wantsWeather(message){ return /weather|forecast|καιρός|βροχή|θερμοκρασία/i.test(String(message||'')); }
function wantsNews(message){ return /news|headline|ειδήσεις|τοπικές\s+ειδήσεις/i.test(String(message||'')); }
function wantsStrikesOrTraffic(message){ return /strike|traffic|μποτιλιάρισμα|απεργία|δρόμοι|συγκοινωνίες/i.test(String(message||'')); }

// Heuristic place resolver for weather context
function resolvePlaceForMessage(message, lang){
  const text = String(message||'');
  const lower = text.toLowerCase();
  const known = ['athens','santorini','mykonos','crete','paros','naxos','thessaloniki','lefkas','lefkada','rhodes','corfu','kefalonia','delphi','meteora'];
  for (const k of known) {
    if (lower.includes(k)) {
      if (k === 'lefkas') return 'Lefkada';
      return k.charAt(0).toUpperCase() + k.slice(1);
    }
  }
  const m = text.match(/\b([A-Z][a-z]{3,})\b/);
  return m ? m[1] : null;
}

function buildAssistantSystemPrompt(){
  return 'You are the Greekaway travel assistant. Provide precise, concise answers about trips (title, duration, price per person, departure time/place, stops, inclusions, availability). Use user language (Greek if Greek). Incorporate provided live weather/news context succinctly. Avoid unsupported speculation.';
}

function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'').trim(); }
const TRIPINDEX_PATH = path.join(__dirname, 'public', 'data', 'tripindex.json');
const TRIPS_DATA_DIR = path.join(__dirname, 'data', 'trips');
const TRIPS_PUBLIC_DIR = path.join(__dirname, 'public', 'data', 'trips');

function readTripConfig(tripId){
  try {
    const id = String(tripId || '').trim();
    if (!id) return null;
    const candidates = [
      path.join(TRIPS_DATA_DIR, `${id}.json`),
      path.join(TRIPS_PUBLIC_DIR, `${id}.json`)
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        return JSON.parse(raw);
      }
    }
  } catch(_) {}
  return null;
}

function normVehicleType(v){
  const x = String(v || '').toLowerCase();
  if (x === 'private' || x === 'mercedes/private') return 'mercedes';
  if (x === 'multi' || x === 'shared' || x === 'minivan') return 'van';
  if (x === 'van' || x === 'bus' || x === 'mercedes') return x;
  return '';
}

function getTripPricing(trip, mode){
  if (!trip || !mode) return null;
  const modeSet = trip.mode_set && trip.mode_set[mode] ? trip.mode_set[mode] : null;
  if (modeSet && Number.isFinite(parseInt(modeSet.price_cents, 10))) {
    return { price_cents: parseInt(modeSet.price_cents, 10), charge_type: (modeSet.charge_type || 'per_person') };
  }
  const modeBlock = trip.modes && trip.modes[mode] ? trip.modes[mode] : null;
  if (!modeBlock) return null;
  const chargeType = (modeBlock.charge_type || 'per_person').toLowerCase();
  if (chargeType === 'per_vehicle') {
    const priceTotal = Number(modeBlock.price_total);
    if (Number.isFinite(priceTotal) && priceTotal > 0) {
      return { price_cents: Math.round(priceTotal * 100), charge_type: chargeType };
    }
  } else {
    const pricePer = Number(modeBlock.price_per_person);
    if (Number.isFinite(pricePer) && pricePer > 0) {
      return { price_cents: Math.round(pricePer * 100), charge_type: chargeType };
    }
  }
  return null;
}

function computeTripPriceCents(trip, mode, seatsCount){
  const pricing = getTripPricing(trip, mode);
  if (!pricing || !Number.isFinite(pricing.price_cents) || pricing.price_cents <= 0) return 0;
  const seats = Math.max(1, parseInt(seatsCount, 10) || 1);
  if (String(pricing.charge_type || '').toLowerCase() === 'per_vehicle') return pricing.price_cents;
  return pricing.price_cents * seats;
}
// -----------------------------------------------------------------------------

// SQLite bookings database initialization (restored from backup for tests)
let bookingsDb = null;
try {
  const Database = require('better-sqlite3');
  const DB_PATH = path.join(__dirname, 'data', 'db.sqlite3');
  try { fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true }); } catch(_){ }
  bookingsDb = new Database(DB_PATH);
  bookingsDb.exec(`CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    status TEXT,
    payment_intent_id TEXT UNIQUE,
    event_id TEXT,
    user_name TEXT,
    user_email TEXT,
    trip_id TEXT,
    seats INTEGER,
    price_cents INTEGER,
    currency TEXT,
    metadata TEXT,
    created_at TEXT,
    updated_at TEXT
  )`);
  // Migrations / additional columns
  try {
    const info = bookingsDb.prepare("PRAGMA table_info('bookings')").all();
    const have = new Set(info.map(i => i.name));
    const ensureCol = (sql, name) => { if (!have.has(name)) { try { bookingsDb.prepare(sql).run(); console.log('server: added column', name); } catch(_){} } };
    ensureCol('ALTER TABLE bookings ADD COLUMN date TEXT','date');
    ensureCol('ALTER TABLE bookings ADD COLUMN grouped INTEGER DEFAULT 0','grouped');
    ensureCol("ALTER TABLE bookings ADD COLUMN pickup_location TEXT DEFAULT ''",'pickup_location');
    ensureCol('ALTER TABLE bookings ADD COLUMN pickup_lat REAL','pickup_lat');
    ensureCol('ALTER TABLE bookings ADD COLUMN pickup_lng REAL','pickup_lng');
    ensureCol('ALTER TABLE bookings ADD COLUMN pickup_order INTEGER','pickup_order');
    ensureCol('ALTER TABLE bookings ADD COLUMN route_id TEXT','route_id');
    ensureCol('ALTER TABLE bookings ADD COLUMN pickup_time_estimated TEXT','pickup_time_estimated');
    ensureCol('ALTER TABLE bookings ADD COLUMN pickup_window_start TEXT','pickup_window_start');
    ensureCol('ALTER TABLE bookings ADD COLUMN pickup_window_end TEXT','pickup_window_end');
    ensureCol('ALTER TABLE bookings ADD COLUMN pickup_address TEXT','pickup_address');
    ensureCol("ALTER TABLE bookings ADD COLUMN suitcases_json TEXT DEFAULT '[]'",'suitcases_json');
    ensureCol("ALTER TABLE bookings ADD COLUMN special_requests TEXT DEFAULT ''",'special_requests');
    ensureCol('ALTER TABLE bookings ADD COLUMN is_demo INTEGER DEFAULT 0','is_demo');
    ensureCol('ALTER TABLE bookings ADD COLUMN source TEXT','source');
    // New columns for multi-pickup support and driver assignment
    ensureCol('ALTER TABLE bookings ADD COLUMN pickup_points_json TEXT','pickup_points_json');
    ensureCol('ALTER TABLE bookings ADD COLUMN assigned_driver_id TEXT','assigned_driver_id');
    // Vehicle type (mode normalization) for Acropolis checkout diagnostics
    ensureCol('ALTER TABLE bookings ADD COLUMN vehicle_type TEXT','vehicle_type');
  } catch(e) { /* ignore */ }
  bookingsDb.exec(`CREATE TABLE IF NOT EXISTS capacities (
    trip_id TEXT,
    date TEXT,
    capacity INTEGER,
    PRIMARY KEY(trip_id, date)
  )`);
  bookingsDb.exec(`CREATE TABLE IF NOT EXISTS travelers (
    email TEXT PRIMARY KEY,
    name TEXT,
    language TEXT,
    age_group TEXT,
    traveler_type TEXT,
    interest TEXT,
    sociality TEXT,
    children_ages TEXT,
    updated_at TEXT,
    average_rating REAL
  )`);
  bookingsDb.exec(`CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    trip_id TEXT,
    traveler_email TEXT,
    rating INTEGER,
    comment TEXT,
    created_at TEXT
  )`);
  bookingsDb.exec(`CREATE TABLE IF NOT EXISTS mercedes_availability (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL,
    date TEXT NOT NULL,
    total_fleet INTEGER NOT NULL,
    remaining_fleet INTEGER NOT NULL,
    updatedAt TEXT NOT NULL
  )`);
  bookingsDb.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_mercedes_availability_trip_date ON mercedes_availability (trip_id, date)`);
  bookingsDb.exec(`CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    trip_id TEXT,
    date TEXT,
    travelers TEXT,
    locked INTEGER DEFAULT 0,
    created_at TEXT
  )`);
  bookingsDb.exec(`CREATE TABLE IF NOT EXISTS co_travel (
    email_a TEXT,
    email_b TEXT,
    trip_id TEXT,
    date TEXT,
    times INTEGER,
    PRIMARY KEY(email_a, email_b, trip_id, date)
  )`);
  console.log('server: bookings DB ready');
} catch (e) {
  console.warn('server: bookings DB init failed', e && e.message ? e.message : e);
  bookingsDb = null;
}

// Admin HTML guard: rely on session/cookie state and route everything through admin home for login
app.use((req, res, next) => {
  try {
    const p = req.path || '';
    if (p === '/admin-login' || p === '/admin-logout') return next();
    const isAdminHtml = (
      p === '/admin' ||
      /\/admin\/.+\.html$/i.test(p) ||
      /^\/admin-[^\/]+\.html$/i.test(p)
    );
    if (!isAdminHtml) return next();
    if (checkAdminAuth(req)) {
      if (p === '/admin' || p === '/admin/') {
        return res.redirect('/admin-home.html');
      }
      return next();
    }
    if (p === '/admin-home.html') return next();
    const nextUrl = encodeURIComponent(req.originalUrl || p || '/admin-home.html');
    return res.redirect(`/admin-home.html?next=${nextUrl}`);
  } catch(_) { return next(); }
});

// Precompute a stable cache-busting version (used in HTML to version CSS/JS/manifest)
const CACHE_BUST_VERSION = computeCacheBust(__dirname);
const TRIP_PAGE_FILE = path.join(__dirname, 'public', 'trip.html');
const STEP1_PAGE_FILE = path.join(__dirname, 'public', 'booking', 'step1.html');
const STEP2_PAGE_FILE = path.join(__dirname, 'public', 'step2.html');
const STEP3_PAGE_FILE = path.join(__dirname, 'public', 'step3.html');
const ADMIN_HOME_FILE = path.join(__dirname, 'public', 'admin-home.html');
const ADMIN_MOVEATHENS_UI_FILE = path.join(__dirname, 'public', 'admin', 'pages', 'admin-moveathens-ui.html');
const ADMIN_MA_DRIVERS_FILE = path.join(__dirname, 'public', 'admin', 'pages', 'admin-ma-drivers.html');
const LOCAL_UPLOADS_DIR = path.join(__dirname, 'uploads');
const UPLOADS_DIR = process.env.RENDER ? getUploadsRoot() : (ensureDir(LOCAL_UPLOADS_DIR) || LOCAL_UPLOADS_DIR);

const serveTripView = (req, res) => {
  try {
    return res.sendFile(TRIP_PAGE_FILE);
  } catch (err) {
    return res.status(500).send('Trip page unavailable');
  }
};

app.get('/trip.html', serveTripView);
app.get('/trip', serveTripView);
app.get(['/trips/trip.html', '/trips/trip'], (req, res) => {
  try {
    const base = `${req.protocol || 'http'}://${req.get('host') || 'localhost'}`;
    const parsed = new URL(req.originalUrl || req.url || '/trips/trip.html', base);
    const slug = (parsed.searchParams.get('trip') || parsed.searchParams.get('id') || '').trim();
    parsed.searchParams.delete('id');
    parsed.searchParams.delete('mode');
    if (slug) parsed.searchParams.set('trip', slug);
    else parsed.searchParams.delete('trip');
    const search = parsed.searchParams.toString();
    const dest = `/trip.html${search ? `?${search}` : ''}`;
    return res.redirect(301, dest);
  } catch (err) {
    return res.redirect(301, '/trip.html');
  }
});

app.get('/booking/step1', (req, res) => {
  try { return res.sendFile(STEP1_PAGE_FILE); }
  catch (err) { return res.status(500).send('Step 1 unavailable'); }
});
app.get('/booking/step2', (req, res) => {
  try { return res.sendFile(STEP2_PAGE_FILE); }
  catch (err) { return res.status(500).send('Step 2 unavailable'); }
});
app.get('/booking/step3', (req, res) => {
  try { return res.sendFile(STEP3_PAGE_FILE); }
  catch (err) { return res.status(500).send('Step 3 unavailable'); }
});

function sanitizeTripSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '');
}

app.get('/api/trips/:slug', async (req, res) => {
  try {
    const slug = sanitizeTripSlug(req.params.slug);
    if (!slug) return res.status(400).json({ error: 'invalid_slug' });
    const readTripFn = tripsModule && typeof tripsModule.readTrip === 'function' ? tripsModule.readTrip : null;
    const formatTripFn = tripsModule && typeof tripsModule.formatTripForResponse === 'function'
      ? tripsModule.formatTripForResponse
      : null;
    if (readTripFn) {
      const trip = readTripFn(slug);
      if (!trip) return res.status(404).json({ error: 'not_found' });
      res.setHeader('Cache-Control', 'no-store');
      const projected = formatTripFn ? formatTripFn(trip, req) : trip;
      return res.json({ trip: projected });
    }
    const filePath = path.join(TRIPS_DATA_DIR, `${slug}.json`);
    const data = await fs.promises.readFile(filePath, 'utf8');
    const trip = JSON.parse(data);
    const projected = formatTripFn ? formatTripFn(trip, req) : trip;
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ trip: projected });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'not_found' });
    }
    console.error('api/trips error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ========================================
// HOST-BASED ROUTING: MoveAthens vs Greekaway
// ========================================
// GLOBAL DOMAIN GATE: Complete isolation between brands
const MOVEATHENS_HOSTS = ['moveathens.com', 'www.moveathens.com'];
const MOVEATHENS_BASE_DIR = path.join(__dirname, 'moveathens');
const MOVEATHENS_PAGES_DIR = path.join(MOVEATHENS_BASE_DIR, 'pages');
const MOVEATHENS_ENTRY = path.join(MOVEATHENS_PAGES_DIR, 'welcome.html');
const GREEKAWAY_ENTRY = path.join(__dirname, 'public', 'index.html');

// Helper: check if request is from MoveAthens domain
const isMoveAthensHost = (req) => {
  const host = (req.headers.host || '').toLowerCase().split(':')[0];
  return MOVEATHENS_HOSTS.includes(host);
};

// MoveAthens page map
const MOVEATHENS_PAGE_MAP = {
  '/': 'welcome.html',
  '/prices': 'prices.html',
  '/transfer': 'transfer.html',
  '/info': 'info.html',
  '/contact': 'contact.html',
  '/hotel': 'hotel-context.html',
  '/assistant': 'ai-assistant.html',
  '/driver-accept': 'driver-accept.html'
};

// ─────────────────────────────────────────────────────────
// 1) GLOBAL DOMAIN GATE MIDDLEWARE
// All MoveAthens requests are handled here and NEVER fall through to Greekaway
// ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (!isMoveAthensHost(req)) {
    // Not MoveAthens domain - continue to Greekaway routes
    return next();
  }

  // === MOVEATHENS DOMAIN HANDLING ===
  const url = req.url.split('?')[0]; // strip query string

  // A) MoveAthens API routes - let them pass through to registered handlers
  if (url.startsWith('/api/moveathens/') || url.startsWith('/api/admin/moveathens/')) {
    return next();
  }

  // B) Uploads folder (shared between brands)
  if (url.startsWith('/uploads/')) {
    return next();
  }

  // B.5) Favicon for MoveAthens domain
  if (url === '/favicon.ico') {
    return res.sendFile(path.join(MOVEATHENS_BASE_DIR, 'icons', 'favicon-32x32.png'));
  }

  // C) MoveAthens static assets (css, js, images, videos)
  if (url.startsWith('/moveathens/')) {
    // Serve from moveathens folder directly
    const assetPath = url.replace('/moveathens/', '');
    const fullPath = path.join(MOVEATHENS_BASE_DIR, assetPath);
    
    // Security: prevent directory traversal
    if (!fullPath.startsWith(MOVEATHENS_BASE_DIR)) {
      return res.status(403).send('Forbidden');
    }
    
    return res.sendFile(fullPath, (err) => {
      if (err) {
        // Asset not found - return 404
        return res.status(404).send('Not found');
      }
    });
  }

  // C) MoveAthens pages
  if (MOVEATHENS_PAGE_MAP[url]) {
    return res.sendFile(path.join(MOVEATHENS_PAGES_DIR, MOVEATHENS_PAGE_MAP[url]));
  }

  // D) FALLBACK: Any unknown route on MoveAthens domain → welcome.html (SPA-style)
  // This ensures moveathens.com/anything returns MoveAthens, NOT Greekaway
  return res.sendFile(MOVEATHENS_ENTRY);
});

// Serve Apple Pay domain association and other well-known files (explicitly allow dotfiles)
app.use('/.well-known', express.static(path.join(__dirname, 'public', '.well-known'), {
  dotfiles: 'allow',
  etag: !IS_DEV,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // Do not cache aggressively to allow quick updates
    res.setHeader('Cache-Control', 'public, max-age=300');
  }
}));

// 1️⃣ Σερβίρουμε στατικά αρχεία από το /public με caching για non-HTML assets
app.use(express.static(path.join(__dirname, "public"), {
  etag: !IS_DEV,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (IS_DEV) {
      // In dev, force freshest assets across devices
      res.setHeader('Cache-Control', 'no-store');
      return;
    }
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      // JSON under /public/data should stay fairly fresh (translations, catalogs)
      const isDataJson = filePath.includes(path.join('public', 'data') + path.sep) && filePath.endsWith('.json');
      if (isDataJson) {
        res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
      } else {
        // 7 days + immutable for other static assets
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      }
    }
  }
}));

// Serve uploaded media from persistent disk so CMS assets survive deployments
const uploadsStaticDir = process.env.RENDER ? UPLOADS_DIR : path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsStaticDir, {
  etag: !IS_DEV,
  lastModified: true,
  setHeaders: (res) => {
    if (IS_DEV) {
      res.setHeader('Cache-Control', 'no-store');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  }
}));

// Serve locales statically and provide an index for auto-discovery
const LOCALES_DIR = path.join(__dirname, 'locales');
const { registerLocales } = require('./src/server/routes/locales');
registerLocales(app, { LOCALES_DIR, IS_DEV, computeLocalesVersion });
// Serve legal/marketing PDF documents under /docs (tabbed About & Legal page)
const DOCS_DIR = path.join(__dirname, 'docs');
try { fs.mkdirSync(DOCS_DIR, { recursive: true }); } catch(e){}
const { registerDocs } = require('./src/server/routes/docs');
registerDocs(app, { DOCS_DIR, IS_DEV, express });
// (Phase 2 refactor) inline asset version helpers removed; now imported above.

// Dynamic manifest for Driver Panel (uses same SW scope and icons)
app.get('/manifest-driver.json', (req, res) => {
  try {
    const theme = '#1B2A3A'; // matches Driver Panel background
    const manifest = {
      name: 'Greekaway Driver Panel',
      short_name: 'Driver Panel',
      theme_color: theme,
      background_color: theme,
      display: 'standalone',
      display_override: ['fullscreen','standalone'],
      start_url: '/driver/driver-dashboard.html',
      description: 'Driver Panel for Greekaway routes and pickups.',
      icons: [
        { src: '/images/logo.png', sizes: '48x48', type: 'image/png', purpose: 'any maskable' },
        { src: '/images/logo.png', sizes: '72x72', type: 'image/png', purpose: 'any maskable' },
        { src: '/images/logo.png', sizes: '96x96', type: 'image/png', purpose: 'any maskable' },
        { src: '/images/logo.png', sizes: '144x144', type: 'image/png', purpose: 'any maskable' },
        { src: '/images/logo.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/images/logo.png', sizes: '256x256', type: 'image/png', purpose: 'any maskable' },
        { src: '/images/logo.png', sizes: '384x384', type: 'image/png', purpose: 'any maskable' },
        { src: '/images/logo.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        { src: '/images/icons/culture.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/images/icons/sea.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/images/icons/mountain.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
      ]
    };
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    // Keep short cache to allow updates but avoid flicker
    res.setHeader('Cache-Control', IS_DEV ? 'no-store' : 'public, max-age=300');
    return res.send(JSON.stringify(manifest));
  } catch (e) {
    return res.status(500).json({ error: 'manifest-error' });
  }
});

// Locales index route moved to registerLocales

// Lightweight endpoint to expose Google Maps key to frontend (used by booking-addons.js fallback)
// Returns { key: '...' } only if a non-placeholder key is configured.
app.get('/api/maps-key', (req, res) => {
  try {
    const key = (MAP_KEY || '').trim();
    if (!key || key === 'YOUR_GOOGLE_MAPS_API_KEY') {
      return res.status(404).json({ error: 'no-key' });
    }
    // Optional: restrict referrer/origin check for extra safety (best effort; not security boundary)
    // const origin = String(req.headers.origin || '');
    // if (origin && !/greekaway\.(?:com|gr|net)$/i.test(origin)) { return res.status(403).json({ error: 'forbidden' }); }
    res.json({ key });
  } catch (e) {
    res.status(500).json({ error: 'server-error' });
  }
});

// Minimal server-side i18n accessor for assistant replies
const LOCALE_CACHE = new Map();
function loadLocale(lang) {
  const key = (lang || 'en').toLowerCase();
  const cached = LOCALE_CACHE.get(key);
  if (cached && (Date.now() - cached.loadedAt < 5*60*1000)) return cached.data;
  try {
    const p = path.join(LOCALES_DIR, `${key}.json`);
    const raw = fs.readFileSync(p, 'utf8');
    const data = JSON.parse(raw);
    LOCALE_CACHE.set(key, { data, loadedAt: Date.now() });
    return data;
  } catch (_) {
    if (key !== 'en') return loadLocale('en');
    return {};
  }
}
function deepGet(obj, keyPath) {
  try {
    return keyPath.split('.').reduce((o,k)=> (o && typeof o === 'object') ? o[k] : undefined, obj);
  } catch (_) { return undefined; }
}
function t(lang, key, vars){
  const loc = loadLocale(lang);
  let s = deepGet(loc, key) || key;
  if (vars && typeof vars === 'object') {
    for (const [k,v] of Object.entries(vars)) {
      s = String(s).replace(new RegExp(`\\{${k}\\}`,'g'), String(v));
    }
  }
  return String(s);
}

// Intent detectors for focused Q&A (duration, stops, price, includes, availability)
function parseTripIntent(message, lang) {
  const m = String(message || '').toLowerCase();
    const el = (lang || '').toLowerCase().startsWith('el'); // Check if the language is Greek
  const askDuration = el
    ? /(πόσες\s+μέρες|πόση\s+διάρκεια|διάρκεια|διαρκεί|μέρες|ημέρες)/i.test(m)
    : /(how\s+many\s+days|duration|how\s+long|lasts?)/i.test(m);
  const hasStopsGr = /(στάση|στάσεις|ποια\s+στάση|ποιες\s+στάσεις)/i.test(m);
  const askStops = el
    ? (hasStopsGr || /stops?/i.test(m))
    : /(stop|stops|which\s+stop|what\s+stops|itinerary)/i.test(m);
  const askIncludes = el
    ? (/(περιλαμβάνει|συμπεριλαμβάνεται|τι\s+περιλαμβάνει|includes?)/i.test(m) && !hasStopsGr)
    : /(include|includes|what\s+is\s+included)/i.test(m);
  const askPrice = el
    ? /(τιμή|κοστίζει|κόστος|πόσο)/i.test(m)
    : /(price|cost|how\s+much)/i.test(m);
  const askAvailability = el
    ? /(διαθεσιμότητα|διαθέσιμες|διαθέσιμο|ημερομηνίες)/i.test(m)
    : /(availability|available|dates?)/i.test(m);
  // New intent: departure time/place
  const askDepartureTime = el
    ? /(τι\s+ώρα\s+ξεκινά|ώρα\s+ξεκινά|αναχώρηση\s+ώρα|τι\s+ώρα)/i.test(m)
    : /(what\s+time\s+does\s+it\s+start|what\s+time\s+start|start\s+time|departure\s+time|what\s+time)/i.test(m);
  const askDeparturePlace = el
    ? /(από\s+πού\s+φεύγει|πού\s+φεύγει|σημείο\s+αναχώρησης|από\s+πού\s+είναι\s+η\s+αναχώρηση|από\s+πού\s+ξεκινά)/i.test(m)
    : /(where\s+does\s+it\s+leave|departure\s+point|where\s+is\s+departure|where\s+does\s+it\s+start|from\s+where\s+does\s+it\s+start)/i.test(m);
  return { askDuration, askStops, askIncludes, askPrice, askAvailability, askDepartureTime, askDeparturePlace };
}

function priceAvailabilityNote(lang) {
  const L = String(lang || 'en').toLowerCase();
  if (L.startsWith('el')) return 'Σημείωση: Η τιμή είναι ανά άτομο. Ελέγξτε διαθεσιμότητα για την ημερομηνία που προτιμάτε.';
  if (L.startsWith('de')) return 'Hinweis: Der Preis gilt pro Person. Prüfen Sie die Verfügbarkeit für Ihr Wunschdatum.';
  if (L.startsWith('fr')) return "Note : Le prix est par personne. Vérifiez la disponibilité à la date souhaitée.";
  if (L.startsWith('es')) return 'Nota: El precio es por persona. Verifique la disponibilidad para su fecha preferida.';
  if (L.startsWith('it')) return 'Nota: Il prezzo è per persona. Verificare la disponibilità per la data preferita.';
  if (L.startsWith('pt')) return 'Nota: O preço é por pessoa. Verifique a disponibilidade para a sua data preferida.';
  if (L.startsWith('nl')) return 'Opmerking: De prijs is per persoon. Controleer de beschikbaarheid voor uw voorkeursdatum.';
  if (L.startsWith('sv')) return 'Observera: Priset är per person. Kontrollera tillgänglighet för önskat datum.';
  if (L.startsWith('ru')) return 'Примечание: цена указана за человека. Проверьте доступность на желаемую дату.';
  if (L.startsWith('he')) return 'לתשומת לבך: המחיר הוא לאדם. בדקו זמינות לתאריך המועדף עליכם.';
  if (L.startsWith('ko')) return '참고: 가격은 1인 기준입니다. 원하시는 날짜의 이용 가능 여부를 확인해 주세요.';
  if (L.startsWith('zh')) return '说明：价格为每人价格。请查看您偏好日期的可用性。';
  return 'Note: Price is per person. Please check availability for your preferred date.';
}

// Lightweight version info for quick sanity checks across devices/environments
// Version routes moved to module
const { registerVersionRoutes } = require('./src/server/routes/version');
registerVersionRoutes(app, {
  IS_DEV,
  IS_RENDER,
  PROCESS_STARTED_AT,
  APP_VERSION,
  VERSION_FILE_PATH,
  LOCALES_DIR,
  ROOT_DIR: __dirname
});

// Pretty route for About page -> serve static HTML
app.get('/about', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'public', 'about.html'));
  } catch (e) {
    res.status(404).send('Not found');
  }
});

app.get('/profile', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'public', 'profile.html'));
  } catch (e) {
    res.status(404).send('Not found');
  }
});

// Mock checkout endpoint (POST) — simulates a payment processor response
app.post('/mock-checkout', express.urlencoded({ extended: true }), (req, res) => {
  try {
    const { name, email, card } = req.body || {};
    // Simple mock: if card contains '4242' succeed, otherwise fail
    if (card && card.indexOf('4242') !== -1) {
      return res.json({ success: true, message: `Mock payment successful for ${name || 'customer'}` });
    }
    return res.json({ success: false, message: 'Mock payment failed — invalid card.' });
  } catch (err) {
    console.error('Error in /mock-checkout:', err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, message: 'Server error during mock checkout.' });
  }
});

// Create a PaymentIntent via Stripe (expects JSON body {amount, currency})
app.post('/create-payment-intent', async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured on server.' });
  try {
    const { amount, price_cents, currency, tripId: clientTripId, trip_id: clientTripIdAlt, duration, vehicleType, customerEmail, seats } = req.body || {};
    const { booking_id } = req.body || {};
    const clientMeta = req.body && req.body.metadata ? req.body.metadata : null;

    const clientSubmittedCents = parseInt(price_cents || amount || 0, 10) || 0;
    let serverAmountCents = 0;
    // Prefer booking price if booking_id is provided
    if (booking_id && bookingsDb) {
      try {
        const row = bookingsDb.prepare('SELECT price_cents, trip_id, vehicle_type, seats FROM bookings WHERE id = ?').get(booking_id);
        if (row && Number.isFinite(parseInt(row.price_cents, 10)) && parseInt(row.price_cents, 10) > 0) {
          serverAmountCents = parseInt(row.price_cents, 10);
        }
        if (row && !clientTripId && !clientTripIdAlt) {
          req.body.trip_id = row.trip_id || req.body.trip_id;
        }
        if (row && !vehicleType) {
          req.body.vehicleType = row.vehicle_type || req.body.vehicleType;
        }
        if (row && !seats) {
          req.body.seats = row.seats || req.body.seats;
        }
      } catch(_) {}
    }
    if (!serverAmountCents) {
      const tripIdForPrice = clientTripId || clientTripIdAlt || null;
      const trip = tripIdForPrice ? readTripConfig(tripIdForPrice) : null;
      const mode = normVehicleType(vehicleType || req.body.vehicleType || req.body.vehicle_type || '');
      serverAmountCents = computeTripPriceCents(trip, mode, seats || 1);
    }
    if (!serverAmountCents || serverAmountCents <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (clientSubmittedCents && clientSubmittedCents !== serverAmountCents) return res.status(400).json({ error: 'Invalid amount' });
    const finalAmountCents = serverAmountCents;

    // Keep trip id for metadata traceability
    let tripId = clientTripId || clientTripIdAlt || null;
    if (booking_id && tripId === null && bookingsDb) {
      try { const row = bookingsDb.prepare('SELECT trip_id FROM bookings WHERE id = ?').get(booking_id); if (row) tripId = row.trip_id || tripId; } catch(_) {}
    }

    // Support idempotency
    const idempotencyKey = (req.headers['idempotency-key'] || req.headers['Idempotency-Key'] || req.headers['Idempotency-key']) || `gw_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
    const opts = { idempotencyKey };
    const rawEmail = ((customerEmail || req.body.email || '') + '').trim();
    const piParams = {
      amount: finalAmountCents,
      currency: currency || 'eur',
      automatic_payment_methods: { enabled: true },
      metadata: Object.assign({}, (booking_id ? { booking_id } : {}), clientMeta || {}, { trip_id: tripId, requested_price_cents: finalAmountCents, duration: (duration||null), vehicle_type: (vehicleType||null) })
    };
    if (rawEmail) piParams.receipt_email = rawEmail; else try { console.log('[root-pi:info] no email provided; skipping receipt_email'); } catch(_) {}
    console.log('FINAL_AMOUNT_CENTS:', finalAmountCents);
    const paymentIntent = await stripe.paymentIntents.create(piParams, opts);

    // If booking exists in SQLite, save the payment_intent id for later matching in webhook
    try {
      if (booking_id && bookingsDb) {
        const now = new Date().toISOString();
        const stmt = bookingsDb.prepare('UPDATE bookings SET payment_intent_id = ?, price_cents = COALESCE(?, price_cents), currency = COALESCE(?, currency), updated_at = ? WHERE id = ?');
        stmt.run(paymentIntent.id, finalAmountCents, (currency || 'eur'), now, booking_id);
      }
    } catch (e) { console.warn('Failed to update booking with payment_intent_id', e && e.message ? e.message : e); }

    res.json({ clientSecret: paymentIntent.client_secret, idempotencyKey, paymentIntentId: paymentIntent.id, bookingId: booking_id || null });
  } catch (err) {
    console.error('Stripe create payment intent error:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// Helper: minimal mock reply when OPENAI key is not configured
function mockAssistantReply(message) {
  const m = String(message || '').trim();
  if (!m) return 'Γεια σου! Πώς μπορώ να βοηθήσω με τα ταξίδια σου;';
  // Simple, friendly echo-style mock with a helpful note
  return `(δοκιμαστική απάντηση) Σε κατάλαβα: "${m}". Πες μου λίγες περισσότερες λεπτομέρειες για να βοηθήσω καλύτερα.`;
}

const FALLBACK_SUITCASE_LABELS = { small: 'Small', medium: 'Medium', large: 'Large' };
function normalizeSuitcasesTokens(value){
  const tokens = [];
  const pushToken = (text) => {
    const cleaned = (text == null) ? '' : String(text).trim();
    if (cleaned) tokens.push(cleaned);
  };
  const pushCount = (type, count) => {
    const qty = Number(count);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const key = String(type || '').toLowerCase();
    const label = FALLBACK_SUITCASE_LABELS[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Bag');
    tokens.push(`${qty}×${label}`);
  };
  const parseValue = (input) => {
    if (Array.isArray(input)) {
      input.forEach((item) => {
        if (typeof item === 'string' || typeof item === 'number') pushToken(item);
        else if (item && typeof item === 'object') {
          if ('type' in item && 'count' in item) pushCount(item.type, item.count);
          else Object.entries(item).forEach(([k, v]) => pushCount(k, v));
        }
      });
      return;
    }
    if (input && typeof input === 'object') {
      Object.entries(input).forEach(([k, v]) => pushCount(k, v));
      return;
    }
    if (typeof input === 'number') { pushToken(input); return; }
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (!trimmed) return;
      if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
        try { parseValue(JSON.parse(trimmed)); return; } catch(_){ }
      }
      pushToken(trimmed);
    }
  };
  if (value === null || value === undefined) return [];
  parseValue(value);
  return tokens;
}

// Assistant routes moved to module (Phase 4)
try {
  const { registerAssistantRoutes } = require('./src/server/assistant/routes');
  const {
    buildPoliciesKnowledgePrompt,
    maybeAnswerPolicyQuestion,
    fallbackMissingMessage,
    rulesLoaded,
  } = require('./src/server/assistant/knowledge');
  registerAssistantRoutes(app, {
    express,
    OPENAI_API_KEY,
    tripData: (() => { try { return require('./live/tripData'); } catch(_) { return null; } })(),
    liveData: (() => { try { return require('./live/liveData'); } catch(_) { return null; } })(),
    wantsResetTopic,
    parseTripIntent,
    priceAvailabilityNote,
    wantsWeather,
    wantsNews,
    wantsStrikesOrTraffic,
    resolvePlaceForMessage,
    buildAssistantSystemPrompt,
    buildLiveRulesPrompt,
    buildPoliciesKnowledgePrompt,
    mockAssistantReply,
    getCachedHeadlinesOrRefresh,
    NEWS_RSS_URLS,
    ASSISTANT_LIVE_ALWAYS,
    t,
    // lightweight policy helpers exposed to the assistant module (mock mode and fallback)
    policyQA: { maybeAnswerPolicyQuestion, fallbackMissingMessage, rulesLoaded }
  });
  console.log('assistant: routes registered');
} catch (e) {
  console.warn('assistant: failed to register routes', e && e.message ? e.message : e);
}

// Phase 5: Bookings routes moved to modules
try {
  const { registerBookings } = require('./src/server/routes/bookings');
  registerBookings(app, { express, bookingsDb, crypto, checkAdminAuth: (r)=>checkAdminAuth(r) });
  console.log('bookings: public routes registered');
} catch (e) { console.warn('bookings: failed to register public routes', e && e.message ? e.message : e); }

// Guard: lightweight unified booking endpoints if not provided by module
try {
  const testCreate = app._router && app._router.stack && app._router.stack.some(l => l && l.route && l.route.path === '/api/bookings/create');
  if (!testCreate) {
    app.post('/api/bookings/create', (req, res) => {
      try {
        const b = req.body || {};
        const trip_id = (b.trip_id || '').toString().trim();
        const mode = (b.mode || '').toString().trim().toLowerCase();
        const date = (b.date || '').toString().trim() || new Date().toISOString().slice(0,10);
        const seats = Number(b.seats || 1) || 1;
        const price_cents = Number(b.price_cents || 0) || 0;
        const currency = (b.currency || 'eur').toString().toLowerCase();
        const pickup = b.pickup || {};
        const suitcases = b.suitcases || {};
        const suitcases_list = normalizeSuitcasesTokens(suitcases);
        const special_requests = (b.special_requests || '').toString();
        const traveler_profile = b.traveler_profile || {};
        if (!trip_id || !seats || !price_cents) return res.status(400).json({ error: 'Missing required fields' });
        if (!bookingsDb) return res.status(500).json({ error: 'Bookings DB not available' });
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const metadata = {
          trip_mode: mode || null,
          traveler_profile,
          pickup_address: pickup.address || null,
          pickup_place_id: pickup.place_id || null,
          pickup_lat: pickup.lat || null,
          pickup_lng: pickup.lng || null,
          suitcases,
          special_requests,
          source: 'unified_flow'
        };
        try {
          const stmt = bookingsDb.prepare('INSERT INTO bookings (id,status,payment_intent_id,event_id,user_name,user_email,trip_id,seats,price_cents,currency,metadata,created_at,updated_at,date,grouped,payment_type,partner_id,partner_share_cents,commission_cents,payout_status,payout_date,"__test_seed",seed_source,pickup_location,pickup_lat,pickup_lng,suitcases_json,special_requests) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
          stmt.run(id, 'pending', null, null, null, null, trip_id, seats, price_cents, currency, JSON.stringify(metadata), now, now, date, 0, null, null, null, null, null, null, 0, 'unified_flow', (pickup.address||''), (pickup.lat||null), (pickup.lng||null), JSON.stringify(suitcases_list), special_requests || '');
        } catch(e2) {
          const stmt2 = bookingsDb.prepare('INSERT INTO bookings (id,status,date,payment_intent_id,event_id,user_name,user_email,trip_id,seats,price_cents,currency,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
          stmt2.run(id, 'pending', date, null, null, null, null, trip_id, seats, price_cents, currency, JSON.stringify(metadata), now, now);
        }
        return res.json({ bookingId: id, amount_cents: price_cents, currency });
      } catch (e3) { console.error('fallback /api/bookings/create error', e3 && e3.stack ? e3.stack : e3); return res.status(500).json({ error: 'Server error' }); }
    });
  }
  const testConfirm = app._router && app._router.stack && app._router.stack.some(l => l && l.route && l.route.path === '/api/bookings/confirm');
  if (!testConfirm) {
    app.post('/api/bookings/confirm', (req, res) => {
      try {
        const { bookingId, payment_intent_id } = req.body || {};
        if (!bookingId) return res.status(400).json({ error: 'Missing bookingId' });
        if (!bookingsDb) return res.status(500).json({ error: 'Bookings DB not available' });
        const now = new Date().toISOString();
        try {
          const stmt = bookingsDb.prepare('UPDATE bookings SET status = ?, payment_intent_id = COALESCE(?, payment_intent_id), updated_at = ? WHERE id = ?');
          stmt.run('confirmed', payment_intent_id || null, now, bookingId);
        } catch(_) { bookingsDb.prepare('UPDATE bookings SET status = ? WHERE id = ?').run('confirmed', bookingId); }
        return res.json({ ok: true, bookingId });
      } catch (e4) { console.error('fallback /api/bookings/confirm error', e4 && e4.stack ? e4.stack : e4); return res.status(500).json({ error: 'Server error' }); }
    });
  }
} catch(_){ }
try {
  const { registerAdminBookings } = require('./src/server/routes/adminBookings');
  registerAdminBookings(app, { express, bookingsDb, checkAdminAuth: (req) => checkAdminAuth(req), stripe });
  console.log('bookings: admin routes registered');
} catch (e) { console.warn('bookings: failed to register admin routes', e && e.message ? e.message : e); }

// Phase 7: Admin payments routes
try {
  const { registerAdminPayments } = require('./src/server/routes/adminPayments');
  registerAdminPayments(app, { checkAdminAuth: (r)=>checkAdminAuth(r), stripe });
  console.log('payments: admin routes registered');
} catch (e) { console.warn('payments: failed to register admin routes', e && e.message ? e.message : e); }

// Re-attach webhook routes (payment intents succeeded/failed + test endpoint)
try {
  require('./webhook')(app, stripe);
  console.log('webhook: routes attached');
} catch (e) {
  console.warn('webhook: failed to attach', e && e.message ? e.message : e);
}

// Phase 6: Register admin maintenance + travelers/groups routes
try {
  const { registerAdminMaintenance } = require('./src/server/routes/adminMaintenance');
  registerAdminMaintenance(app, { express, bookingsDb, checkAdminAuth: (r)=>checkAdminAuth(r) });
  console.log('admin-maintenance: routes registered');
} catch (e) { console.warn('admin-maintenance: failed', e && e.message ? e.message : e); }
try {
  const { registerAdminTravelersGroups } = require('./src/server/routes/adminTravelersGroups');
  registerAdminTravelersGroups(app, { express, bookingsDb, checkAdminAuth: (r)=>checkAdminAuth(r) });
  console.log('admin-travelers-groups: routes registered');
} catch (e) { console.warn('admin-travelers-groups: failed', e && e.message ? e.message : e); }

// Upload routes (admin protected, shared by CMS UIs)
try {
  const { registerUploadRoutes } = require('./src/server/routes/upload');
  registerUploadRoutes(app, { checkAdminAuth: (r)=>checkAdminAuth(r) });
} catch (e) { console.warn('upload: failed to register', e && e.message ? e.message : e); }

// Category CMS MVP routes (admin protected)
try {
  const { registerCategoriesRoutes } = require('./src/server/routes/categories');
  registerCategoriesRoutes(app, { checkAdminAuth: (r)=>checkAdminAuth(r) });
  console.log('categories: routes registered');
} catch (e) { console.warn('categories: failed to register', e && e.message ? e.message : e); }

// Trip CMS MVP routes (admin + public)
try {
  if (!tripsModule || typeof tripsModule.registerTripsRoutes !== 'function') {
    throw new Error('registerTripsRoutes unavailable');
  }
  tripsModule.registerTripsRoutes(app, { checkAdminAuth: (r)=>checkAdminAuth(r) });
  console.log('trips: routes registered');
} catch (e) { console.warn('trips: failed to register', e && e.message ? e.message : e); }

// Public live weather endpoint for quick UI/tests: /api/live/weather?place=Lefkada&lang=en
app.get('/api/live/weather', async (req, res) => {
  if (!liveData) return res.status(501).json({ error: 'live-data module unavailable' });
  try {
    const place = (req.query.place || '').toString();
    const lang = (req.query.lang || '').toString() || 'en';
    if (!place) return res.status(400).json({ error: 'Missing place' });
    const w = await liveData.getCurrentWeatherByPlace(place, lang);
    return res.json({ ok: true, place: w.place, country: w.country, temperature_c: w.temperature_c, conditions: w.conditions, windspeed_kmh: w.windspeed_kmh, time: w.time });
  } catch (e) {
    return res.status(500).json({ error: e && e.message ? e.message : 'Failed' });
  }
});

// Lightweight geocoding endpoint used by the trip page to enrich stops without lat/lng
// GET /api/geocode?q=ADDRESS&lang=el
app.get('/api/geocode', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const lang = (req.query.lang || '').toString() || 'en';
    if (!q) return res.status(400).json({ error: 'Missing q' });
    // Prefer liveData.geocodePlace (Open-Meteo) which requires no key and is already cached
    if (!liveData || !liveData.geocodePlace) return res.status(501).json({ error: 'geocoder unavailable' });
    const r = await liveData.geocodePlace(q, lang);
    return res.json({ ok: true, lat: r.latitude, lng: r.longitude, name: r.name, country: r.country || null });
  } catch (e) {
    return res.status(500).json({ error: e && e.message ? e.message : 'Failed' });
  }
});

// (original /api/bookings, /api/availability, /api/bookings/:id handlers removed - now provided by registerBookings module)

// Admin-protected bookings listing with pagination and filters used by admin-bookings.html
// GET /api/bookings?limit=50&page=1&status=&partner_id=&search=&date_from=&date_to=
app.get('/api/bookings', (req, res) => {
  // Admin-only; avoid Basic Auth popups → no 401/WWW-Authenticate
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    if (!bookingsDb) return res.status(500).json({ error: 'Bookings DB not available' });
    const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit || '50', 10) || 50));
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const offset = (page - 1) * limit;
    const status = (req.query.status || '').trim();
    const partner_id = (req.query.partner_id || '').trim();
    const search = (req.query.search || '').trim();
    // allow both date_range=YYYY-MM-DD..YYYY-MM-DD and explicit date_from/date_to
    let date_from = (req.query.date_from || '').trim();
    let date_to = (req.query.date_to || '').trim();
    const date_range = (req.query.date_range || '').trim();
    if (!date_from && !date_to && date_range && /\d{4}-\d{2}-\d{2}\.{2}\d{4}-\d{2}-\d{2}/.test(date_range)) {
      const [f, t] = date_range.split('..');
      date_from = f; date_to = t;
    }

    const where = [];
    const params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (partner_id) { where.push('partner_id = ?'); params.push(partner_id); }
    if (date_from) { where.push('(date >= ? OR created_at >= ?)'); params.push(date_from, date_from); }
    if (date_to) { where.push('(date <= ? OR created_at <= ?)'); params.push(date_to, date_to + ' 23:59:59'); }
    if (search) {
      where.push('(id LIKE ? OR user_name LIKE ? OR user_email LIKE ? OR trip_id LIKE ?)');
      const s = `%${search}%`;
      // (original /admin/bookings handler removed - now in module)
      url = link && link.url;
    }
    if (!url) throw new Error('No onboarding URL created');
    return res.redirect(url);
  } catch (e) {
    const msg = (e && e.message) ? e.message : 'Unexpected error';
    res.status(500).send(`<!doctype html><html><body><h2>Stripe onboarding failed, please retry</h2><p>${msg}</p></body></html>`);
  }
});


// Partner onboarding callbacks (Stripe connect) extracted
try {
  const { registerPartnerOnboarding } = require('./src/server/routes/partnerOnboarding');
  registerPartnerOnboarding(app, { stripe });
  console.log('partnerOnboarding: registered');
} catch (err) {
  console.warn('partnerOnboarding: failed', err && err.message ? err.message : err);
}
// Customer auth routes (email / SMS / Google)
try {
  app.use('/auth', require('./routes/auth'));
  console.log('auth: routes mounted at /auth');
} catch (err) {
  console.warn('auth: failed to mount', err && err.message ? err.message : err);
}

// Partners router (existing legacy routes)
try {
  app.use('/api/partners', require('./routes/partners'));
  console.log('partners: routes mounted at /api/partners');
} catch (err) {
  console.warn('partners: failed to mount', err && err.message ? err.message : err);
}

// Admin suppliers (aggregated suppliers list + details)
try {
  app.use('/api/admin/suppliers', require('./routes/admin-suppliers'));
  console.log('admin-suppliers: routes mounted at /api/admin/suppliers');
} catch (err) {
  console.warn('admin-suppliers: failed to mount', err && err.message ? err.message : err);
}

// Manual payments (demo) router
try {
  app.use('/api/manual-payments', require('./routes/manual-payments'));
  console.log('manual-payments: routes mounted at /api/manual-payments');
} catch (err) {
  console.warn('manual-payments: failed to mount', err && err.message ? err.message : err);
}

// Provider availability (admin CRUD for partners' available slots)
try {
  app.use('/api/provider-availability', require('./routes/provider-availability'));
  console.log('provider-availability: routes mounted at /api/provider-availability');
} catch (err) {
  console.warn('provider-availability: failed to mount', err && err.message ? err.message : err);
}

// Provider and partner-dispatch routes (required by #14)
app.use('/provider', require('./routes/provider'));
app.use('/partner-dispatch', require('./routes/partner-dispatch'));
// Driver panel & API routes (new lightweight driver workflow)
try {
  app.use('/driver', require('./routes/driver'));
  console.log('driver: routes mounted at /driver');
} catch (e) {
  console.warn('driver: failed to mount', e && e.message ? e.message : e);
}

// Semi-automatic pickup scheduling routes
try {
  app.use('/', require('./routes/pickup-route'));
  console.log('pickup-route: routes mounted at / (admin/route/* and driver/route/*)');
} catch (e) {
  console.warn('pickup-route: failed to mount', e && e.message ? e.message : e);
}

// MoveAthens (isolated subsystem)
require('./moveathens/server/moveathens')(app, { isDev: IS_DEV, checkAdminAuth });
console.log('MoveAthens admin routes loaded');

// MoveAthens Transfer Requests & Drivers
require('./moveathens/server/moveathens-requests')(app, { checkAdminAuth });
require('./moveathens/server/moveathens-drivers')(app, { checkAdminAuth });
require('./moveathens/server/moveathens-hotel-revenue')(app, { checkAdminAuth });
console.log('MoveAthens requests/drivers/hotel-revenue routes loaded');

// Auto-expire + driver-accept page now live inside moveathens-requests.js

// MoveAthens AI Assistant
try {
  const { registerMoveAthensAssistantRoutes } = require('./moveathens/server/assistant');
  registerMoveAthensAssistantRoutes(app, { OPENAI_API_KEY });
} catch (e) {
  console.warn('MoveAthens Assistant: failed to load', e?.message || e);
}

// Start pickup notifications (T-24h freeze + notify)
try {
  const pickup = require('./services/pickupNotifications');
  const ctrl = pickup.start();
  if (ctrl && ctrl.enabled) console.log('pickup-notify: enabled');
} catch(e){ console.warn('pickup-notify: failed to start', e && e.message ? e.message : e); }

// Global error handlers to prevent process exit on unexpected errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
});

process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason && reason.stack ? reason.stack : reason);
});

// 2️⃣ Επιστρέφει όλες τις εκδρομές από trip.json
app.get("/api/trips", (req, res) => {
  fs.readFile(path.join(__dirname, "trip.json"), "utf8", (err, data) => {
    if (err) {
      console.error("Σφάλμα ανάγνωσης trip.json:", err);
      res.status(500).json({ error: "Δεν μπορέσαμε να διαβάσουμε τα δεδομένα." });
    } else {
      res.json(JSON.parse(data));
    }
  });
});

// (admin auth helpers remain earlier in file; payments endpoints now extracted)

// Simple admin login/logout
app.get('/admin-login', (req, res) => {
  try {
    return res.sendFile(ADMIN_HOME_FILE);
  } catch (e) { return res.status(500).send('Server error'); }
});

app.get('/admin/moveathens-ui', (req, res) => {
  if (!checkAdminAuth(req)) {
    const nextUrl = encodeURIComponent(req.originalUrl || '/admin/moveathens-ui');
    return res.redirect(`/admin-home.html?next=${nextUrl}`);
  }
  try { return res.sendFile(ADMIN_MOVEATHENS_UI_FILE); }
  catch (_) { return res.status(404).send('Not found'); }
});

// Admin Drivers Panel
app.get('/admin/ma-drivers', (req, res) => {
  if (!checkAdminAuth(req)) {
    const nextUrl = encodeURIComponent(req.originalUrl || '/admin/ma-drivers');
    return res.redirect(`/admin-home.html?next=${nextUrl}`);
  }
  try { return res.sendFile(ADMIN_MA_DRIVERS_FILE); }
  catch (_) { return res.status(404).send('Not found'); }
});

// Driver accept page now served from moveathens-requests.js

app.post('/admin-login', (req, res) => {
  try {
    const u = (req.body && req.body.username) ? String(req.body.username) : '';
    const p = (req.body && req.body.password) ? String(req.body.password) : '';
    const nextUrl = (req.body && req.body.next) ? String(req.body.next) : '/admin';
    if (!ADMIN_USER || !ADMIN_PASS) return res.status(500).send('Admin credentials not configured');
  if (u === ADMIN_USER && p === ADMIN_PASS) {
      // establish server session
      try { if (req.session) { req.session.admin = true; req.session.user = u; } } catch(_){ }
      // legacy compatibility cookie (optional, non-authoritative)
      try { res.setHeader('Set-Cookie', `adminSession=yes; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV==='production' ? '; Secure' : ''}`); } catch(_){ }
      return res.redirect(nextUrl || '/admin');
    }
    return res.status(403).send('Invalid credentials');
  } catch (e) {
    try {
      console.error('admin-login error:', e && e.stack ? e.stack : e);
    } catch(_){ }
    return res.status(500).send('Server error');
  }
});

app.get('/api/admin/session', (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(401).json({ ok: false });
  }
  return res.json({ ok: true });
});

app.get('/admin-logout', (req, res) => {
  try {
    const sidName = app.get('session-cookie-name') || 'connect.sid';
    try { if (req.session) { req.session.destroy(()=>{}); } } catch(_){ }
    try { res.clearCookie(sidName, { path: '/' }); } catch(_){ }
    try { res.clearCookie('adminSession', { path: '/' }); } catch(_){ }
    return res.redirect('/admin-home.html');
  } catch (e) { return res.status(500).send('Server error'); }
});


// Admin bookings list (JSON) - protected by same basic auth
app.get('/admin/bookings', (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).send('Forbidden');
  }
  try {
    const limit = Math.min(10000, Math.abs(parseInt(req.query.limit || '200', 10) || 200));
    const offset = Math.max(0, Math.abs(parseInt(req.query.offset || '0', 10) || 0));
    const status = req.query.status || null;
    const user_email = req.query.user_email || null;
    const trip_id = req.query.trip_id || null;
    const payment_intent_id = req.query.payment_intent_id || null;
    const date_from = req.query.date_from || null;
    const date_to = req.query.date_to || null;
    const min_amount = req.query.min_amount ? parseInt(req.query.min_amount, 10) : null;
    const max_amount = req.query.max_amount ? parseInt(req.query.max_amount, 10) : null;
    const sort = req.query.sort || 'created_at';
    const dir = (req.query.dir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    let rows = [];
    try {
      const Database = require('better-sqlite3');
      const db = bookingsDb || new Database(path.join(__dirname, 'data', 'db.sqlite3'));
      const where = [];
      const params = [];
      if (status) { where.push('status = ?'); params.push(status); }
      if (user_email) { where.push('user_email = ?'); params.push(user_email); }
      if (trip_id) { where.push('trip_id = ?'); params.push(trip_id); }
      if (payment_intent_id) { where.push('payment_intent_id = ?'); params.push(payment_intent_id); }
      if (date_from) { where.push('created_at >= ?'); params.push(date_from); }
      if (date_to) { where.push('created_at <= ?'); params.push(date_to + ' 23:59:59'); }
      if (min_amount !== null && !isNaN(min_amount)) { where.push('price_cents >= ?'); params.push(min_amount); }
      if (max_amount !== null && !isNaN(max_amount)) { where.push('price_cents <= ?'); params.push(max_amount); }
      const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
      // sanitize sort field - allow only specific columns
      const allowedSort = ['created_at','price_cents','status','user_name'];
      const sortField = allowedSort.includes(sort) ? sort : 'created_at';
      const stmt = db.prepare(`SELECT * FROM bookings ${whereSql} ORDER BY ${sortField} ${dir} LIMIT ? OFFSET ?`);
      rows = stmt.all(...params, limit, offset);
      if (!bookingsDb) db.close();
    } catch (e) {
      return res.status(500).json({ error: 'Bookings DB not available' });
    }
    // parse metadata JSON where present
    rows = (rows || []).map(r => {
      if (r && r.metadata && typeof r.metadata === 'string') {
        try { r.metadata = JSON.parse(r.metadata); } catch (e) { /* leave as string */ }
      }
      return r;
    });
    return res.json(rows);
  } catch (err) {
    console.error('Admin bookings error:', err && err.stack ? err.stack : err);
    return res.status(500).send('Server error');
  }
});



// (admin bookings actions & CSV now provided by adminBookings module)

// Health/readiness endpoint for uptime checks
app.get('/health', (req, res) => {
  try {
    const dbModule = require('./db');
    const info = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development',
      database: {
        available: dbModule.isAvailable(),
        hasUrl: !!process.env.DATABASE_URL
      }
    };
    res.json(info);
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// 4️⃣ Εκκίνηση server
app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});

// Final catch-all JSON error handler (after all routes)
app.use((err, req, res, next) => {
  try {
    if (!err) return next();
    const p = String(req.originalUrl || req.url || '');
    const ct = String(req.headers['content-type'] || '').toLowerCase();
    const acc = String(req.headers['accept'] || '').toLowerCase();
    const wantsJson = p.startsWith('/api/') || ct.includes('application/json') || acc.includes('application/json');
    if (wantsJson) {
      const status = err.status && Number.isFinite(err.status) ? err.status : 500;
      const isParse = err.type === 'entity.parse.failed';
      const finalStatus = isParse ? 400 : (status === 200 ? 500 : status);
      return res.status(finalStatus).json({ error: isParse ? 'Invalid JSON' : (err.message || 'Server error') });
    }
  } catch(_) {}
  return next(err);
});