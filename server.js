const express = require("express");
let compression = null;
try { compression = require('compression'); } catch(e) { /* compression optional in dev */ }
const path = require("path");
const fs = require("fs");
const crypto = require('crypto');
const { TextDecoder } = require('util');

// Load local .env (if present). Safe to leave out in production where env vars are set
try { require('dotenv').config(); } catch (e) { /* noop if dotenv isn't installed */ }

// (Phase 1 refactor note) Removed transient createApp() indirection; restore direct Express init for stability
const app = express();
// Parse URL-encoded bodies for simple form logins
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// App version from package.json
let APP_VERSION = '0.0.0';
try { APP_VERSION = require('./package.json').version || APP_VERSION; } catch (_) {}
// Capture server process start time (ISO). Used as a stable fallback when build info is missing
const PROCESS_STARTED_AT = new Date().toISOString();
// Optional version.json path for build metadata (moved helpers to lib/version.js)
const VERSION_FILE_PATH = path.join(__dirname, 'version.json');
const { readVersionFile, formatBuild } = require('./src/server/lib/version');
const { buildLiveRulesPrompt } = require('./src/server/lib/prompts');
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
const PORT = ((process.env.NODE_ENV === 'test') || IS_JEST) ? 3000 : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);
// Sessions for admin auth (cookie-based, no Basic popups)
let session = null;
try { session = require('express-session'); } catch(_) { session = null; }
const SESSION_SECRET = (process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET || crypto.randomBytes(24).toString('hex')).trim();
// Moved asset/version scanners to lib/assets.js
const { computeLocalesVersion, computeDataVersion, computeAssetsVersion } = require('./src/server/lib/assets');

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
  const fetch = require('node-fetch');
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

// Admin HTML guard: redirect to /admin-login if no session cookie
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
    if (hasAdminSession(req)) return next();
    // Allow Admin Home to load even without session (embedded login is on-page)
    if (p === '/admin-home.html') return next();
    const nextUrl = encodeURIComponent(req.originalUrl || p);
    // Redirect unauthenticated admin pages to Admin Home (embedded login)
    return res.redirect(`/admin-home.html?next=${nextUrl}`);
  } catch(_) { return next(); }
});

// 1️⃣ Σε DEV: Σερβίρουμε ΠΑΝΤΑ φρέσκα HTML/JS/CSS για να αποφεύγουμε stale cache σε άλλες συσκευές
if (IS_DEV) {
  app.get(/^\/(?:.*)\.html$/, (req, res, next) => {
    const filePath = path.join(__dirname, 'public', req.path);
    fs.readFile(filePath, 'utf8', (err, html) => {
      if (err) return next();
      try {
        const t = Date.now();
        // 1) Ανανεώνουμε οποιοδήποτε υπάρχον v=NNN query param
        let out = html.replace(/(\?v=)\d+/g, `$1${t}`);
        // 2) Για /js/*.js χωρίς query, προσθέτουμε ?dev=timestamp
        out = out.replace(/(src=\"\/(?:js)\/[^\"?#]+)(\")/g, (m, p1, p2) => {
          return p1.includes('?') ? m : `${p1}?dev=${t}${p2}`;
        });
        // 3) Για /css/*.css χωρίς query, προσθέτουμε ?dev=timestamp
        out = out.replace(/(href=\"\/(?:css)\/[^\"?#]+)(\")/g, (m, p1, p2) => {
          return p1.includes('?') ? m : `${p1}?dev=${t}${p2}`;
        });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.send(out);
      } catch (e) { return next(); }
    });
  });
}

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

// Locales index route moved to registerLocales

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
app.post('/create-payment-intent', express.json(), async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured on server.' });
  try {
    const { amount, currency } = req.body;
    const { booking_id } = req.body || {};
    const clientMeta = req.body && req.body.metadata ? req.body.metadata : null;
    // basic validation
    const amt = parseInt(amount, 10) || 0;
    if (amt <= 0) return res.status(400).json({ error: 'Invalid amount' });

    // Support idempotency: prefer client-provided Idempotency-Key header, else generate one
    const idempotencyKey = (req.headers['idempotency-key'] || req.headers['Idempotency-Key'] || req.headers['Idempotency-key']) || `gw_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
    const opts = { idempotencyKey };
    // attach booking metadata if present
    const piParams = {
      amount: amt,
      currency: currency || 'eur',
      automatic_payment_methods: { enabled: true },
    };
    if (booking_id) piParams.metadata = { booking_id };
    if (clientMeta) {
      piParams.metadata = Object.assign({}, piParams.metadata || {}, clientMeta);
    }
    const paymentIntent = await stripe.paymentIntents.create(piParams, opts);

    // If booking exists in SQLite, save the payment_intent id for later matching in webhook
    try {
      if (booking_id && bookingsDb) {
        const now = new Date().toISOString();
        const stmt = bookingsDb.prepare('UPDATE bookings SET payment_intent_id = ?, updated_at = ? WHERE id = ?');
        stmt.run(paymentIntent.id, now, booking_id);
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

// Assistant routes moved to module (Phase 4)
try {
  const { registerAssistantRoutes } = require('./src/server/assistant/routes');
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
    mockAssistantReply,
    getCachedHeadlinesOrRefresh,
    NEWS_RSS_URLS,
    ASSISTANT_LIVE_ALWAYS,
    t
  });
  console.log('assistant: routes registered');
} catch (e) {
  console.warn('assistant: failed to register routes', e && e.message ? e.message : e);
}

// Phase 5: Bookings routes moved to modules
try {
  const { registerBookings } = require('./src/server/routes/bookings');
  registerBookings(app, { express, bookingsDb, crypto });
  console.log('bookings: public routes registered');
} catch (e) { console.warn('bookings: failed to register public routes', e && e.message ? e.message : e); }
try {
  const { registerAdminBookings } = require('./src/server/routes/adminBookings');
  registerAdminBookings(app, { bookingsDb, checkAdminAuth: (req) => checkAdminAuth(req), stripe });
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
  registerAdminMaintenance(app, { express, bookingsDb, checkAdminAuth: (r)=>checkAdminAuth(r), ensureSeedColumns });
  console.log('admin-maintenance: routes registered');
} catch (e) { console.warn('admin-maintenance: failed', e && e.message ? e.message : e); }
try {
  const { registerAdminTravelersGroups } = require('./src/server/routes/adminTravelersGroups');
  registerAdminTravelersGroups(app, { express, bookingsDb, checkAdminAuth: (r)=>checkAdminAuth(r) });
  console.log('admin-travelers-groups: routes registered');
} catch (e) { console.warn('admin-travelers-groups: failed', e && e.message ? e.message : e); }

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
    // Serve a minimal HTML login page
    const nextUrl = (req.query && req.query.next) ? String(req.query.next) : '/admin';
    const html = `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Admin Login</title>
      <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0b1b2b;color:#fff}
      .card{background:#11263a;padding:20px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:360px;width:90%}
      h1{font-size:18px;margin:0 0 10px}
      label{display:block;margin:10px 0 4px}
      input{width:100%;padding:8px;border-radius:8px;border:1px solid #223a51;background:#0e2032;color:#fff}
      button{margin-top:12px;width:100%;padding:10px;border-radius:8px;border:none;background:#2a7ade;color:#fff;font-weight:600}
      .hint{font-size:12px;color:#a8c0d8;margin-top:8px;text-align:center}
      </style></head><body>
      <form class="card" method="POST" action="/admin-login">
        <h1>Greekaway – Admin Login</h1>
        <input type="hidden" name="next" value="${nextUrl.replace(/"/g,'&quot;')}">
        <label for="user">Username</label>
        <input id="user" name="username" autocomplete="username" required />
        <label for="pass">Password</label>
        <input id="pass" type="password" name="password" autocomplete="current-password" required />
        <button type="submit">Login</button>
        <div class="hint">Credentials from server .env (ADMIN_USER / ADMIN_PASS)</div>
      </form></body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (e) { return res.status(500).send('Server error'); }
});

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
  } catch (e) { return res.status(500).send('Server error'); }
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
    const info = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development'
    };
    res.json(info);
  } catch (e) {
    res.status(500).json({ status: 'error' });
  }
});

// 4️⃣ Εκκίνηση server
app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});