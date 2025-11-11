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
  registerAdminBookings(app, { bookingsDb, checkAdminAuth: (req) => checkAdminAuth(req) });
  console.log('bookings: admin routes registered');
} catch (e) { console.warn('bookings: failed to register admin routes', e && e.message ? e.message : e); }

// Re-attach webhook routes (payment intents succeeded/failed + test endpoint)
try {
  require('./webhook')(app, stripe);
  console.log('webhook: routes attached');
} catch (e) {
  console.warn('webhook: failed to attach', e && e.message ? e.message : e);
}

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

app.get('/partner-stripe-onboarding/callback', async (req, res) => {
  try {
    if (!stripe) {
      res.status(500).send('<!doctype html><html><body><h2>Stripe onboarding failed, please retry</h2><p>Stripe is not configured on the server.</p></body></html>');
      return;
    }
    const accountId = String((req.query && req.query.account) || '').trim();
    if (!accountId) {
      res.status(400).send('<!doctype html><html><body><h2>Stripe onboarding failed, please retry</h2><p>Missing account id.</p></body></html>');
      return;
    }
    // Best-effort verification of account to determine success
    try { await stripe.accounts.retrieve(accountId); } catch (e) {
      const msg = (e && e.message) ? e.message : 'Failed to verify account';
      res.status(500).send(`<!doctype html><html><body><h2>Stripe onboarding failed, please retry</h2><p>${msg}</p></body></html>`);
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send('<!doctype html><html><body><h2>Stripe connection successful</h2><p>You can close this tab and return to the admin.</p></body></html>');
  } catch (e) {
    const msg = (e && e.message) ? e.message : 'Unexpected error';
    res.status(500).send(`<!doctype html><html><body><h2>Stripe onboarding failed, please retry</h2><p>${msg}</p></body></html>`);
  }
});

// If the browser hits the JSON callback, redirect to the friendly HTML callback
app.get('/api/partners/connect-callback', (req, res, next) => {
  try {
    const accept = String(req.headers && req.headers.accept || '');
    if (/text\/html/i.test(accept)) {
      const qsIndex = req.url.indexOf('?');
      const qs = qsIndex >= 0 ? req.url.slice(qsIndex) : '';
      return res.redirect('/partner-stripe-onboarding/callback' + qs);
    }
  } catch (_) {}
  next();
});

// Partners module (Stripe Connect + manual onboarding + legal pages)
// Keep server.js light: just mount the router
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

// Manual payments (demo) — lists manual partner deposits and allows marking as paid
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

// Admin payments endpoint (protected by basic auth)
// Normalize admin creds: trim and strip surrounding quotes to avoid dotenv/quoting pitfalls
let ADMIN_USER = process.env.ADMIN_USER || null;
let ADMIN_PASS = process.env.ADMIN_PASS || null;
if (typeof ADMIN_USER === 'string') ADMIN_USER = ADMIN_USER.trim().replace(/^['"]|['"]$/g, '');
if (typeof ADMIN_PASS === 'string') ADMIN_PASS = ADMIN_PASS.trim().replace(/^['"]|['"]$/g, '');
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
function checkAdminAuth(req) {
  if (hasAdminSession(req)) return true;
  if (!ADMIN_USER || !ADMIN_PASS) return false;
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Basic ')) return false;
  const creds = Buffer.from(auth.split(' ')[1] || '', 'base64').toString('utf8');
  const [user, pass] = creds.split(':');
  return user === ADMIN_USER && pass === ADMIN_PASS;
}

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

app.get('/admin/payments', async (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).send('Forbidden');
  }
  // Try Postgres/SQLite/JSON via the same logic as webhook.js
  try {
    // support pagination via query params
    const limit = Math.min(10000, Math.abs(parseInt(req.query.limit || '200', 10) || 200));
    const offset = Math.max(0, Math.abs(parseInt(req.query.offset || '0', 10) || 0));
    // prefer Postgres if configured
    const DATABASE_URL = process.env.DATABASE_URL || null;
    if (DATABASE_URL) {
      const { Client } = require('pg');
      const client = new Client({ connectionString: DATABASE_URL });
      await client.connect();
      const { rows } = await client.query('SELECT id,status,event_id AS "eventId",amount,currency,timestamp FROM payments ORDER BY timestamp DESC LIMIT $1 OFFSET $2', [limit, offset]);
      await client.end();
      return res.json(rows);
    }

    // Check SQLite
    try {
      const Database = require('better-sqlite3');
      const db = new Database(path.join(__dirname, 'data', 'db.sqlite3'));
      const rows = db.prepare('SELECT id,status,event_id AS eventId,amount,currency,timestamp FROM payments ORDER BY timestamp DESC LIMIT ? OFFSET ?').all(limit, offset);
      return res.json(rows);
    } catch (e) {
      // fallthrough to JSON
    }

    // JSON fallback
    const paymentsPath = path.join(__dirname, 'payments.json');
    if (!fs.existsSync(paymentsPath)) return res.json([]);
    const raw = fs.readFileSync(paymentsPath, 'utf8');
    const all = raw ? JSON.parse(raw) : {};
    // return as array sorted by timestamp desc and apply pagination
    const arr = Object.keys(all).map(k => ({ id: k, ...all[k] }));
    arr.sort((a,b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    return res.json(arr.slice(offset, offset + limit));
  } catch (err) {
    console.error('Admin payments error:', err && err.stack ? err.stack : err);
    return res.status(500).send('Server error');
  }
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

// Admin: list travelers (for stats/exports)
app.get('/admin/travelers', (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).send('Forbidden'); }
  try {
    if (!bookingsDb) return res.status(500).json({ error: 'DB not available' });
    const rows = bookingsDb.prepare('SELECT email,name,language,age_group,traveler_type,interest,sociality,children_ages,average_rating,updated_at FROM travelers ORDER BY updated_at DESC').all();
    // parse children_ages JSON if stored as JSON text
    rows.forEach(r => { try { if (r.children_ages && typeof r.children_ages === 'string' && r.children_ages.trim().startsWith('[')) r.children_ages = JSON.parse(r.children_ages); } catch (e) {} });
    return res.json(rows);
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

// Suggest pairs for a trip/date using simple similarity + co_travel boost
app.get('/admin/suggest-pairs', (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).send('Forbidden'); }
  try {
    if (!bookingsDb) return res.status(500).json({ error: 'DB not available' });
    const trip_id = req.query.trip_id || null;
    const date = req.query.date || null;
    // Load confirmed bookings for that trip/date
    const bookings = bookingsDb.prepare('SELECT user_email, metadata FROM bookings WHERE status = ? AND (? IS NULL OR trip_id = ?) AND (? IS NULL OR date = ?)').all('confirmed', trip_id, trip_id, date, date);
    const emails = Array.from(new Set(bookings.map(b => (b.user_email || '').toLowerCase()).filter(Boolean)));
    if (emails.length < 2) return res.json([]);
    // Load traveler profiles
    const profByEmail = {};
    const profs = bookingsDb.prepare('SELECT * FROM travelers WHERE email IN (' + emails.map(()=>'?').join(',') + ')').all(...emails);
    profs.forEach(p => { profByEmail[(p.email||'').toLowerCase()] = p; });
    // Simple score: +1 same language, +1 same age_group bucket (exact), +1 same traveler_type, +1 same interest, +0.5 same sociality, +min(2, co_travel times)
    const pairs = [];
    for (let i=0;i<emails.length;i++){
      for(let j=i+1;j<emails.length;j++){
        const a = emails[i], b = emails[j];
        const pa = profByEmail[a]||{}, pb = profByEmail[b]||{};
        let score = 0;
        if (pa.language && pb.language && pa.language === pb.language) score += 1;
        if (pa.age_group && pb.age_group && pa.age_group === pb.age_group) score += 1;
        if (pa.traveler_type && pb.traveler_type && pa.traveler_type === pb.traveler_type) score += 1;
        if (pa.interest && pb.interest && pa.interest === pb.interest) score += 1;
        if (pa.sociality && pb.sociality && pa.sociality === pb.sociality) score += 0.5;
        const row = bookingsDb.prepare('SELECT times FROM co_travel WHERE email_a = ? AND email_b = ? AND (? IS NULL OR trip_id = ?) AND (? IS NULL OR date = ?)').get(a,b,trip_id,trip_id,date,date) || { times: 0 };
        score += Math.min(2, row.times || 0);
        // Ratings influence: encourage pairs where αμφότεροι έχουν καλή μέση βαθμολογία
        const ra = typeof pa.average_rating === 'number' ? pa.average_rating : null;
        const rb = typeof pb.average_rating === 'number' ? pb.average_rating : null;
        if (ra != null && rb != null) {
          const avg = (ra + rb) / 2;
          // scale: >4.5 +0.8, >4 +0.5, 3-4 +0.2, <2.5 -0.5, <2 -1
          if (avg >= 4.5) score += 0.8; else if (avg >= 4.0) score += 0.5; else if (avg >= 3.0) score += 0.2; else if (avg < 2.0) score -= 1; else if (avg < 2.5) score -= 0.5;
        }
        pairs.push({ a, b, score });
      }
    }
    pairs.sort((x,y)=>y.score - x.score);
    res.json(pairs);
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

// Submit feedback (post-trip)
app.post('/api/feedback', express.json(), (req, res) => {
  try {
    if (!bookingsDb) return res.status(500).json({ error: 'DB not available' });
    const { trip_id, traveler_email, rating, comment } = req.body || {};
    if (!trip_id || !traveler_email) return res.status(400).json({ error: 'Missing trip_id or traveler_email' });
    // rating can be 1..5 or strings: positive/neutral/negative
    let r = rating;
    if (typeof r === 'string') {
      const x = r.toLowerCase();
      if (x === 'positive') r = 5; else if (x === 'neutral') r = 3; else if (x === 'negative') r = 1;
    }
    r = parseInt(r,10);
    if (!isFinite(r) || r < 1 || r > 5) r = 3; // default neutral
    const id = require('crypto').randomUUID();
    const now = new Date().toISOString();
    bookingsDb.prepare('INSERT INTO feedback (id,trip_id,traveler_email,rating,comment,created_at) VALUES (?,?,?,?,?,?)').run(id, trip_id, traveler_email, r, comment || null, now);
    // update traveler average_rating
    try {
      const agg = bookingsDb.prepare('SELECT AVG(rating) as avg FROM feedback WHERE traveler_email = ?').get(traveler_email);
      const avg = agg && typeof agg.avg === 'number' ? agg.avg : null;
      if (avg != null) {
        bookingsDb.prepare('UPDATE travelers SET average_rating = ? WHERE email = ?').run(avg, traveler_email);
      }
    } catch (e) { /* ignore */ }
    return res.json({ ok: true, id });
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

// Admin: list feedback
app.get('/admin/feedback', (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).send('Forbidden'); }
  try {
    if (!bookingsDb) return res.status(500).json({ error: 'DB not available' });
    const rows = bookingsDb.prepare('SELECT id,trip_id,traveler_email,rating,comment,created_at FROM feedback ORDER BY created_at DESC').all();
    return res.json(rows);
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

// Admin: groups page data
app.get('/admin/groups', (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).send('Forbidden'); }
  try {
    if (!bookingsDb) return res.status(500).json({ error: 'DB not available' });
    const trip_id = req.query.trip_id || null;
    const date = req.query.date || null;
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      // serve static admin/groups HTML (built client-side)
      return res.sendFile(path.join(__dirname, 'public', 'admin-groups.html'));
    }
    // JSON response: groups + confirmed travelers for given trip/date
    const groups = bookingsDb.prepare('SELECT id,trip_id,date,travelers,locked,created_at FROM groups WHERE (? IS NULL OR trip_id = ?) AND (? IS NULL OR date = ?) ORDER BY created_at DESC').all(trip_id, trip_id, date, date).map(g => ({...g, travelers: (()=>{ try { return JSON.parse(g.travelers||'[]'); } catch(_){ return []; } })()}));
    let travelers = [];
    if (trip_id && date) {
      const rows = bookingsDb.prepare('SELECT user_name AS name, user_email AS email FROM bookings WHERE status = ? AND trip_id = ? AND date = ? AND grouped = 0').all('confirmed', trip_id, date);
      // join traveler profiles for enriched view
      travelers = rows.map(r => {
        const p = bookingsDb.prepare('SELECT language, traveler_type, sociality, average_rating FROM travelers WHERE email = ?').get(r.email) || {};
        return { name: r.name || r.email, email: r.email, ...p };
      });
    }
    return res.json({ groups, travelers });
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

// Admin: create/update groups
app.post('/admin/groups', express.json(), (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).send('Forbidden'); }
  try {
    if (!bookingsDb) return res.status(500).json({ error: 'DB not available' });
    const { op, id, trip_id, date, travelers, lock } = req.body || {};
    if (!trip_id || !date) return res.status(400).json({ error: 'Missing trip_id/date' });
    const now = new Date().toISOString();
    if (op === 'create') {
      const gid = crypto.randomUUID();
      const arr = Array.isArray(travelers) ? travelers : [];
      bookingsDb.prepare('INSERT INTO groups (id,trip_id,date,travelers,locked,created_at) VALUES (?,?,?,?,?,?)').run(gid, trip_id, date, JSON.stringify(arr), 0, now);
      return res.json({ ok: true, id: gid });
    }
    if (op === 'update' && id) {
      const arr = Array.isArray(travelers) ? travelers : null;
      if (arr) bookingsDb.prepare('UPDATE groups SET travelers = ? WHERE id = ?').run(JSON.stringify(arr), id);
      if (lock === true) {
        bookingsDb.prepare('UPDATE groups SET locked = 1 WHERE id = ?').run(id);
        // mark bookings grouped to avoid duplicates
        try {
          const g = bookingsDb.prepare('SELECT travelers FROM groups WHERE id = ?').get(id);
          const emails = g && g.travelers ? JSON.parse(g.travelers) : [];
          if (Array.isArray(emails) && emails.length) {
            const mark = bookingsDb.prepare('UPDATE bookings SET grouped = 1 WHERE user_email = ? AND trip_id = ? AND date = ?');
            emails.forEach(em => { try { mark.run(em, trip_id, date); } catch(_){ } });
          }
        } catch (e) { /* non-fatal */ }
      }
      return res.json({ ok: true });
    }
    return res.status(400).json({ error: 'Invalid op' });
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

// Admin bookings CSV export
// (original /admin/bookings.csv handler removed - now in module)

// Admin backup status endpoint
app.get('/admin/backup-status', async (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).send('Forbidden');
  }
  try {
    const os = require('os');
    const candidates = [];
    if (process.env.BACKUP_DIR) candidates.push(process.env.BACKUP_DIR);
    candidates.push(path.join(os.homedir(), 'greekaway_backups'));
    // Common persistent locations on PaaS
    candidates.push('/var/data/greekaway_backups');
    candidates.push('/data/greekaway_backups');
    candidates.push('/opt/render/project/.data/greekaway_backups');
    const backupDir = candidates.find(p => { try { return p && fs.existsSync(p); } catch(_) { return false; } }) || (process.env.BACKUP_DIR || path.join(os.homedir(), 'greekaway_backups'));
    if (!fs.existsSync(backupDir)) return res.json({ backupsDir: backupDir, count: 0, latestDb: null, latestLog: null });
    const files = fs.readdirSync(backupDir).map(f => ({ name: f, path: path.join(backupDir, f) }));
    const dbFiles = files.filter(f => f.name.startsWith('db.sqlite3') && f.name.endsWith('.gz'));
    const logFiles = files.filter(f => f.name.startsWith('webhook.log') && f.name.endsWith('.gz'));
    const stat = (f) => {
      try { const s = fs.statSync(f.path); return { file: f.name, size: s.size, mtime: s.mtime }; } catch (e) { return null; }
    };
    const latest = (arr) => {
      const stats = arr.map(stat).filter(Boolean);
      stats.sort((a,b) => new Date(b.mtime) - new Date(a.mtime));
      return stats[0] || null;
    };
    const latestDb = latest(dbFiles);
    const latestLog = latest(logFiles);
    return res.json({ backupsDir: backupDir, count: files.length, latestDb, latestLog });
  } catch (err) {
    console.error('Admin backup-status error', err && err.stack ? err.stack : err);
    return res.status(500).send('Server error');
  }
});

// POST /api/backup/export — on-demand DB backup (gzipped copy)
app.post('/api/backup/export', async (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).json({ error: 'Forbidden' }); }
  try {
    const zlib = require('zlib');
    const os = require('os');
    const backupDirCandidates = [
      process.env.BACKUP_DIR,
      path.join(os.homedir(), 'greekaway_backups'),
      path.join(__dirname, 'data', 'db-backups')
    ].filter(Boolean);
    const backupDir = backupDirCandidates.find(p => { try { fs.mkdirSync(p, { recursive: true }); return true; } catch(_) { return false; } }) || path.join(__dirname, 'data', 'db-backups');
    try { fs.mkdirSync(backupDir, { recursive: true }); } catch(_){ }
    const ts = new Date().toISOString().replace(/[:.]/g,'').replace(/T/,'_').replace(/Z/,'Z');
    const src = path.join(__dirname, 'data', 'db.sqlite3');
    const dst = path.join(backupDir, `db.sqlite3.${ts}.gz`);
    if (!fs.existsSync(src)) return res.status(404).json({ error: 'DB not found' });
    const gzip = zlib.createGzip();
    const inp = fs.createReadStream(src);
    const out = fs.createWriteStream(dst);
    await new Promise((resolve, reject) => { inp.pipe(gzip).pipe(out).on('finish', resolve).on('error', reject); });
    return res.json({ ok: true, file: dst, note: 'Use /admin/backup-status to locate backups' });
  } catch (e) {
    console.error('backup/export error', e && e.stack ? e.stack : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Helpers for seeding and cleanup
function ensureSeedColumns(db) {
  try { db.exec('ALTER TABLE bookings ADD COLUMN "__test_seed" INTEGER DEFAULT 0'); } catch(_){}
  try { db.exec('ALTER TABLE bookings ADD COLUMN seed_source TEXT'); } catch(_){}
  try { db.exec('ALTER TABLE payments ADD COLUMN "__test_seed" INTEGER DEFAULT 0'); } catch(_){}
  try { db.exec('ALTER TABLE payments ADD COLUMN seed_source TEXT'); } catch(_){}
  try { db.exec('ALTER TABLE manual_payments ADD COLUMN "__test_seed" INTEGER DEFAULT 0'); } catch(_){}
  try { db.exec('ALTER TABLE manual_payments ADD COLUMN seed_source TEXT'); } catch(_){}
  try { db.exec('ALTER TABLE partner_agreements ADD COLUMN "__test_seed" INTEGER DEFAULT 0'); } catch(_){}
  try { db.exec('ALTER TABLE partner_agreements ADD COLUMN seed_source TEXT'); } catch(_){}
}

// POST /api/admin/seed — bulk insert seed data in a transaction
app.post('/api/admin/seed', express.json({ limit: '5mb' }), async (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).json({ error: 'Forbidden' }); }
  try {
    const payload = req.body && Object.keys(req.body).length ? req.body : null;
    // If no body posted, try to load default seed file from repo
    let seed = payload;
    if (!seed) {
      try {
        const p = path.join(__dirname, 'data', 'test-seeds', 'seed-admin-2025-11-04.json');
        seed = JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch(_) { /* ignore */ }
    }
    if (!seed || typeof seed !== 'object') return res.status(400).json({ error: 'Missing seed JSON' });

    const Database = require('better-sqlite3');
    const db = bookingsDb || new Database(path.join(__dirname, 'data', 'db.sqlite3'));
    ensureSeedColumns(db);
    // basic schema ensures for tables possibly missing
    try { db.exec(`CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, status TEXT, event_id TEXT, amount INTEGER, currency TEXT, timestamp TEXT)`); } catch(_){}
    try { db.exec(`CREATE TABLE IF NOT EXISTS manual_payments (id TEXT PRIMARY KEY, booking_id TEXT, partner_id TEXT, partner_name TEXT, trip_id TEXT, trip_title TEXT, date TEXT, amount_cents INTEGER, currency TEXT, iban TEXT, status TEXT, partner_balance_cents INTEGER, created_at TEXT, updated_at TEXT)`); } catch(_){}
    try { db.exec(`CREATE TABLE IF NOT EXISTS partner_agreements (id TEXT PRIMARY KEY, partner_name TEXT, partner_email TEXT, stripe_account_id TEXT, onboarding_url TEXT, iban TEXT, vat_number TEXT, agreed INTEGER, ip TEXT, timestamp TEXT, source TEXT, agreement_hash TEXT, agreement_version TEXT)`); } catch(_){}

    // snapshot before inserts
    try {
      const os = require('os');
      const backupDir = path.join(os.homedir(), 'greekaway_backups');
      try { fs.mkdirSync(backupDir, { recursive: true }); } catch(_){}
      const ts = new Date().toISOString().replace(/[:.]/g,'');
      const src = path.join(__dirname, 'data', 'db.sqlite3');
      const dst = path.join(backupDir, `db.sqlite3.${ts}`);
      if (fs.existsSync(src)) { fs.copyFileSync(src, dst); }
    } catch(_){}

    const nowIso = new Date().toISOString();
    const tx = db.transaction((s) => {
      const seedSource = s.seed_source || 'admin_rewire_20251104';
      // partners (partner_agreements)
      if (Array.isArray(s.partners)) {
        const ins = db.prepare(`INSERT OR REPLACE INTO partner_agreements (id,partner_name,partner_email,stripe_account_id,onboarding_url,iban,vat_number,agreed,ip,timestamp,source,agreement_hash,agreement_version, "__test_seed", seed_source) VALUES (@id,@partner_name,@partner_email,@stripe_account_id,@onboarding_url,@iban,@vat_number,@agreed,@ip,@timestamp,@source,@agreement_hash,@agreement_version,@__test_seed,@seed_source)`);
        for (const p of s.partners) {
          const row = {
            id: p.id || crypto.randomUUID(),
            partner_name: p.partner_name || p.name || null,
            partner_email: p.partner_email || p.email || null,
            stripe_account_id: p.stripe_account_id || null,
            onboarding_url: p.onboarding_url || null,
            iban: p.iban || null,
            vat_number: p.vat_number || null,
            agreed: p.agreed ? 1 : 0,
            ip: p.ip || null,
            timestamp: p.timestamp || nowIso,
            source: p.source || 'seed',
            agreement_hash: p.agreement_hash || null,
            agreement_version: p.agreement_version || null,
            __test_seed: 1,
            seed_source: p.seed_source || seedSource
          };
          ins.run(row);
        }
      }
      // bookings
      if (Array.isArray(s.bookings)) {
        const ins = db.prepare(`INSERT OR REPLACE INTO bookings (id,status,date,payment_intent_id,event_id,user_name,user_email,trip_id,seats,price_cents,currency,metadata,created_at,updated_at,partner_id, "__test_seed", seed_source) VALUES (@id,@status,@date,@payment_intent_id,@event_id,@user_name,@user_email,@trip_id,@seats,@price_cents,@currency,@metadata,@created_at,@updated_at,@partner_id,@__test_seed,@seed_source)`);
        for (const b of s.bookings) {
          const meta = b.metadata && typeof b.metadata === 'object' ? { ...b.metadata, __test_seed: true, seed_source: b.seed_source || seedSource } : { __test_seed: true, seed_source: b.seed_source || seedSource };
          const row = {
            id: b.id || crypto.randomUUID(),
            status: b.status || 'confirmed',
            date: b.date || null,
            payment_intent_id: b.payment_intent_id || null,
            event_id: b.event_id || null,
            user_name: b.user_name || null,
            user_email: b.user_email || null,
            trip_id: b.trip_id || null,
            seats: typeof b.pax === 'number' ? b.pax : (b.seats || 1),
            price_cents: (typeof b.total_cents === 'number') ? b.total_cents : (b.price_cents || 0),
            currency: b.currency || 'eur',
            metadata: JSON.stringify(meta),
            created_at: b.created_at || nowIso,
            updated_at: b.updated_at || nowIso,
            partner_id: b.partner_id || null,
            __test_seed: 1,
            seed_source: b.seed_source || seedSource
          };
          ins.run(row);
        }
      }
      // payments
      if (Array.isArray(s.payments)) {
        const ins = db.prepare(`INSERT OR REPLACE INTO payments (id,status,event_id,amount,currency,timestamp, "__test_seed", seed_source) VALUES (@id,@status,@event_id,@amount,@currency,@timestamp,@__test_seed,@seed_source)`);
        for (const p of s.payments) {
          ins.run({
            id: p.id || crypto.randomUUID(),
            status: p.status || 'succeeded',
            event_id: p.event_id || null,
            amount: (typeof p.amount === 'number') ? p.amount : (typeof p.amount_cents === 'number' ? p.amount_cents : null),
            currency: p.currency || 'eur',
            timestamp: p.timestamp || nowIso,
            __test_seed: 1,
            seed_source: p.seed_source || seedSource
          });
        }
      }
      // manual_payments
      if (Array.isArray(s.manual_payments)) {
        const ins = db.prepare(`INSERT OR REPLACE INTO manual_payments (id,booking_id,partner_id,partner_name,trip_id,trip_title,date,amount_cents,currency,iban,status,partner_balance_cents,created_at,updated_at, "__test_seed", seed_source) VALUES (@id,@booking_id,@partner_id,@partner_name,@trip_id,@trip_title,@date,@amount_cents,@currency,@iban,@status,@partner_balance_cents,@created_at,@updated_at,@__test_seed,@seed_source)`);
        for (const m of s.manual_payments) {
          ins.run({
            id: m.id || crypto.randomUUID(),
            booking_id: m.booking_id || null,
            partner_id: m.partner_id || null,
            partner_name: m.partner_name || null,
            trip_id: m.trip_id || null,
            trip_title: m.trip_title || null,
            date: m.date || nowIso.slice(0,10),
            amount_cents: (typeof m.amount_cents === 'number') ? m.amount_cents : (typeof m.amount === 'number' ? m.amount : 0),
            currency: m.currency || 'eur',
            iban: m.iban || null,
            status: m.status || 'pending',
            partner_balance_cents: (typeof m.partner_balance_cents === 'number') ? m.partner_balance_cents : (typeof m.partner_balance === 'number' ? m.partner_balance : 0),
            created_at: m.created_at || nowIso,
            updated_at: m.updated_at || nowIso,
            __test_seed: 1,
            seed_source: m.seed_source || seedSource
          });
        }
      }
    });
    tx(seed);
    if (!bookingsDb) db.close();
    return res.json({ ok: true });
  } catch (e) {
    console.error('admin/seed error', e && e.stack ? e.stack : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/cleanup-demo?dry_run=1 or ?confirm=1
app.delete('/api/admin/cleanup-demo', (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).json({ error: 'Forbidden' }); }
  try {
    const dry = String(req.query.dry_run || '').trim() !== '' || String(req.query.confirm || '') === '';
    const Database = require('better-sqlite3');
    const db = bookingsDb || new Database(path.join(__dirname, 'data', 'db.sqlite3'));
    const where = `COALESCE("__test_seed",0)=1 OR LOWER(COALESCE(user_email,'')) LIKE '%@example.com%' OR LOWER(COALESCE(user_email,'')) LIKE '%demo%' OR LOWER(COALESCE(user_name,'')) LIKE '%demo%' OR LOWER(COALESCE(seed_source,'')) LIKE '%demo%' OR COALESCE(is_demo,0)=1`;
    const cntB = db.prepare(`SELECT COUNT(1) AS c FROM bookings WHERE ${where}`).get().c || 0;
    const cntD = db.prepare(`SELECT COUNT(1) AS c FROM dispatch_log WHERE booking_id IN (SELECT id FROM bookings WHERE ${where})`).get().c || 0;
    if (dry) {
      if (!bookingsDb) db.close();
      return res.json({ ok: true, dry_run: true, bookings: cntB, dispatch_log: cntD });
    }
    const delDisp = db.prepare(`DELETE FROM dispatch_log WHERE booking_id IN (SELECT id FROM bookings WHERE ${where})`);
    const delBk = db.prepare(`DELETE FROM bookings WHERE ${where}`);
    const tx = db.transaction(() => { delDisp.run(); delBk.run(); });
    tx();
    if (!bookingsDb) db.close();
    return res.json({ ok: true, deleted: { bookings: cntB, dispatch_log: cntD } });
  } catch (e) {
    console.error('cleanup-demo error', e && e.stack ? e.stack : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/cleanup-test-seeds?source=admin_rewire_20251104
app.delete('/api/admin/cleanup-test-seeds', (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).json({ error: 'Forbidden' }); }
  try {
    const source = (req.query.source || 'admin_rewire_20251104').toString();
    const Database = require('better-sqlite3');
    const db = bookingsDb || new Database(path.join(__dirname, 'data', 'db.sqlite3'));
    ensureSeedColumns(db);
    const delTables = ['bookings','payments','manual_payments','partner_agreements'];
    for (const t of delTables) {
      try { db.prepare(`DELETE FROM ${t} WHERE "__test_seed" = 1 OR seed_source = ?`).run(source); } catch (e) { /* ignore */ }
    }
    if (!bookingsDb) db.close();
    return res.json({ ok: true, source });
  } catch (e) {
    console.error('cleanup-test-seeds error', e && e.stack ? e.stack : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Admin action: cancel booking (sets status to 'canceled')
app.post('/admin/bookings/:id/cancel', express.json(), (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).send('Forbidden'); }
  try {
    const id = req.params.id;
    if (!bookingsDb) return res.status(500).json({ error: 'Bookings DB not available' });
    const now = new Date().toISOString();
    const stmt = bookingsDb.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?');
    stmt.run('canceled', now, id);
    return res.json({ ok: true });
  } catch (e) { console.error('Cancel booking error', e); return res.status(500).json({ error: 'Server error' }); }
});

// Admin action: refund booking (attempt Stripe refund then mark refunded)
app.post('/admin/bookings/:id/refund', express.json(), async (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).send('Forbidden'); }
  try {
    const id = req.params.id;
    if (!bookingsDb) return res.status(500).json({ error: 'Bookings DB not available' });
    const row = bookingsDb.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const pi = row.payment_intent_id;
    if (pi && stripe) {
      try {
        // fetch PaymentIntent to find latest charge
        const paymentIntent = await stripe.paymentIntents.retrieve(pi);
        const latestCharge = paymentIntent && paymentIntent.latest_charge ? paymentIntent.latest_charge : (paymentIntent.charges && paymentIntent.charges.data && paymentIntent.charges.data[0] && paymentIntent.charges.data[0].id);
        if (latestCharge) {
          await stripe.refunds.create({ charge: latestCharge });
        }
      } catch (e) {
        console.warn('Stripe refund failed (continuing):', e && e.message ? e.message : e);
      }
    }
    const now = new Date().toISOString();
    bookingsDb.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?').run('refunded', now, id);
    return res.json({ ok: true });
  } catch (e) { console.error('Refund booking error', e); return res.status(500).json({ error: 'Server error' }); }
});

// Serve the Admin single-page at /admin (so users can visit /admin)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Server-side CSV export of payments with optional filters via query params.
app.get('/admin/payments.csv', async (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).send('Forbidden');
  }
  try {
    const { status, from, to, min, max, limit } = req.query || {};

    // Gather rows (Postgres -> SQLite -> JSON fallback)
    let rows = [];
    const DATABASE_URL = process.env.DATABASE_URL || null;
    if (DATABASE_URL) {
      try {
        const { Client } = require('pg');
        const client = new Client({ connectionString: DATABASE_URL });
        await client.connect();
        // Fetch with a reasonable limit to avoid accidental huge downloads
        const lim = parseInt(limit, 10) || 10000;
        const { rows: pgrows } = await client.query('SELECT id,status,event_id AS "eventId",amount,currency,timestamp,metadata FROM payments ORDER BY timestamp DESC LIMIT $1', [lim]);
        rows = pgrows;
        await client.end();
      } catch (e) {
        console.warn('Postgres read failed, falling back:', e && e.message ? e.message : e);
      }
    }

    if (rows.length === 0) {
      try {
        const Database = require('better-sqlite3');
        const db = new Database(path.join(__dirname, 'data', 'db.sqlite3'));
        rows = db.prepare('SELECT id,status,event_id AS eventId,amount,currency,timestamp,metadata FROM payments ORDER BY timestamp DESC').all();
      } catch (e) {
        // ignore and fallthrough to JSON
      }
    }

    if (rows.length === 0) {
      const paymentsPath = path.join(__dirname, 'payments.json');
      if (fs.existsSync(paymentsPath)) {
        const raw = fs.readFileSync(paymentsPath, 'utf8');
        const all = raw ? JSON.parse(raw) : {};
        rows = Object.keys(all).map(k => ({ id: k, ...all[k] }));
      }
    }

    // Apply filters server-side (same logic as client)
    const filtered = (rows || []).filter(p => {
      try {
        if (status && String(p.status) !== status) return false;
        if (min) {
          const m = parseInt(min,10);
          if (Number(p.amount) < m) return false;
        }
        if (max) {
          const M = parseInt(max,10);
          if (Number(p.amount) > M) return false;
        }
        if (from) {
          const fromTs = new Date(from + 'T00:00:00Z').getTime();
          const pt = p.timestamp ? new Date(p.timestamp).getTime() : NaN;
          if (isFinite(pt) && pt < fromTs) return false;
        }
        if (to) {
          const toTs = new Date(to + 'T23:59:59Z').getTime();
          const pt = p.timestamp ? new Date(p.timestamp).getTime() : NaN;
          if (isFinite(pt) && pt > toTs) return false;
        }
        return true;
      } catch (e) { return false; }
    });

    // Build CSV headers as union of keys
    const keys = Array.from(new Set(filtered.flatMap(obj => Object.keys(obj || {}))));
    const escape = (val) => {
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') val = JSON.stringify(val);
      return '"' + String(val).replace(/"/g, '""') + '"';
    };

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    const ts = new Date().toISOString().replace(/[:.]/g,'').replace(/T/,'_').replace(/Z/,'');
    res.setHeader('Content-Disposition', `attachment; filename="payments_${ts}.csv"`);

    // Stream CSV
    res.write(keys.join(',') + '\n');
    for (const row of filtered) {
      const vals = keys.map(k => escape(row[k]));
      res.write(vals.join(',') + '\n');
    }
    res.end();
  } catch (err) {
    console.error('CSV export error', err && err.stack ? err.stack : err);
    return res.status(500).send('Server error');
  }
});

// 3️⃣ Όταν ο χρήστης πάει στο "/", να του δείχνει το index.html
app.get("/", (req, res) => {
  const filePath = path.join(__dirname, 'public', 'index.html');
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return res.status(500).send('Error reading index.html');
    if (IS_DEV) {
      try {
        const t = Date.now();
        let out = html.replace(/(\?v=)\d+/g, `$1${t}`);
        out = out.replace(/(src=\"\/(?:js)\/[^\"?#]+)(\")/g, (m, p1, p2) => p1.includes('?') ? m : `${p1}?dev=${t}${p2}`);
        out = out.replace(/(href=\"\/(?:css)\/[^\"?#]+)(\")/g, (m, p1, p2) => p1.includes('?') ? m : `${p1}?dev=${t}${p2}`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.send(out);
      } catch (e) {
        // fallback just disable cache
        res.setHeader('Cache-Control', 'no-store');
        return res.send(html);
      }
    }
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(html);
  });
});

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