const fs = require('fs');
const path = require('path');
let express = null; try { express = require('express'); } catch(_) { express = null; }

const PRICING_PATH = path.join(__dirname, '..', '..', '..', 'data', 'pricing.json');

function ensurePricingFile() {
  try { fs.mkdirSync(path.dirname(PRICING_PATH), { recursive: true }); } catch (_) {}
  if (!fs.existsSync(PRICING_PATH)) {
    try { fs.writeFileSync(PRICING_PATH, JSON.stringify({}, null, 2), 'utf8'); } catch (_) {}
  }
}

function safeReadPricing() {
  ensurePricingFile();
  try {
    console.log('Reading pricing.json', PRICING_PATH);
    const raw = fs.readFileSync(PRICING_PATH, 'utf8');
    const data = JSON.parse(raw || '{}');
    try {
      const keys = Object.keys(data || {});
      console.log('Loaded:', { count: keys.length, keys: keys.slice(0, 8) });
    } catch (_) {}
    return (data && typeof data === 'object') ? data : {};
  } catch (_) {
    try { console.warn('pricing: read failed, returning empty object'); } catch(_){}
    return {};
  }
}

function validatePricingShape(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'invalid_root' };
  for (const [trip, v] of Object.entries(obj)) {
    if (!v || typeof v !== 'object') return { ok: false, error: `invalid_trip:${trip}` };
    const keys = ['van', 'bus', 'private'];
    for (const k of keys) {
      if (!(k in v)) return { ok: false, error: `missing_key:${trip}:${k}` };
      const n = Number(v[k]);
      if (!Number.isFinite(n) || n < 0) return { ok: false, error: `invalid_value:${trip}:${k}` };
      // Normalize to integer cents
      obj[trip][k] = Math.round(n);
    }
  }
  return { ok: true };
}

function writePricing(obj) {
  ensurePricingFile();
  fs.writeFileSync(PRICING_PATH, JSON.stringify(obj, null, 2), 'utf8');
  return true;
}

function computePriceCents(tripId, vehicleType, seats) {
  try {
    const data = safeReadPricing();
    const trip = String(tripId || '').trim();
    const veh = String(vehicleType || '').toLowerCase();
    const s = Math.max(1, parseInt(seats || 1, 10) || 1);
    if (!trip || !data[trip]) return 0;
    const entry = data[trip];
    // private (Comfort/mercedes): fixed per-vehicle
    if (veh === 'private' || veh === 'mercedes' || veh === 'mercedes/private') {
      const v = Number(entry.private || 0);
      return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
    }
    // van/bus: per seat
    if (veh === 'van') {
      const v = Number(entry.van || 0);
      return Number.isFinite(v) ? Math.max(0, Math.round(v)) * s : 0;
    }
    if (veh === 'bus') {
      const v = Number(entry.bus || 0);
      return Number.isFinite(v) ? Math.max(0, Math.round(v)) * s : 0;
    }
    // Unknown vehicle: try van as default per-seat
    const fallback = Number(entry.van || 0);
    return Number.isFinite(fallback) ? Math.max(0, Math.round(fallback)) * s : 0;
  } catch (_) {
    return 0;
  }
}

function registerPricingRoutes(app, { checkAdminAuth }) {
  ensurePricingFile();
  // Public read (frontend and other services)
  app.get('/api/pricing', (req, res) => {
    try {
      console.log('PRICING ROUTE ACTIVE');
      const data = safeReadPricing();
      try { console.log('Loaded JSON:', data); } catch(_){}
      res.setHeader('Cache-Control', 'no-store');
      return res.json(data);
    } catch (e) {
      try { console.error('pricing: GET /api/pricing failed', e && e.message ? e.message : e); } catch(_){}
      return res.status(500).json({ error: 'pricing_read_failed' });
    }
  });

  // Admin write (update entire pricing object)
  app.post('/api/pricing', (req, res) => {
    try {
      if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
      const body = (req.body && typeof req.body === 'object') ? req.body : null;
      if (!body) return res.status(400).json({ error: 'invalid_body' });
      const copy = JSON.parse(JSON.stringify(body));
      const v = validatePricingShape(copy);
      if (!v.ok) return res.status(400).json({ error: v.error || 'invalid' });
      writePricing(copy);
      return res.json({ ok: true, updated: Object.keys(copy).length });
    } catch (e) {
      return res.status(500).json({ error: 'pricing_write_failed' });
    }
  });
}

module.exports = {
  registerPricingRoutes,
  computePriceCents,
  safeReadPricing,
};

// Optional: router factory for app.use('/api', router)
function createPricingRouter({ checkAdminAuth }){
  const router = (express && express.Router) ? express.Router() : { get(){}, post(){} };
  // GET /pricing
  router.get('/pricing', (req, res) => {
    try {
      console.log('PRICING ROUTE ACTIVE');
      const data = safeReadPricing();
      try { console.log('Loaded JSON:', data); } catch(_){}
      res.setHeader('Cache-Control', 'no-store');
      return res.json(data);
    } catch (e) {
      try { console.error('pricing: GET /api/pricing failed', e && e.message ? e.message : e); } catch(_){}
      return res.status(500).json({ error: 'pricing_read_failed' });
    }
  });
  // POST /pricing
  router.post('/pricing', (req, res) => {
    try {
      if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
      const body = (req.body && typeof req.body === 'object') ? req.body : null;
      if (!body) return res.status(400).json({ error: 'invalid_body' });
      const copy = JSON.parse(JSON.stringify(body));
      const v = validatePricingShape(copy);
      if (!v.ok) return res.status(400).json({ error: v.error || 'invalid' });
      writePricing(copy);
      return res.json({ ok: true, updated: Object.keys(copy).length });
    } catch (e) {
      return res.status(500).json({ error: 'pricing_write_failed' });
    }
  });
  return router;
}

module.exports.createPricingRouter = createPricingRouter;
