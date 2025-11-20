const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.join(__dirname, '..', '..', '..');
const TRIPS_DIR = path.join(ROOT_DIR, 'data', 'trips');
const TRIP_TEMPLATE_FILE = path.join(TRIPS_DIR, '_template.json');
const UPLOAD_TRIPS_DIR = path.join(ROOT_DIR, 'public', 'uploads', 'trips');
let multer = null;
try { multer = require('multer'); } catch(_) { multer = null; }
const TEMPLATE_FILENAME = path.basename(TRIP_TEMPLATE_FILE);

let tripTemplateCache = null;
function loadTripTemplate(){
  if (tripTemplateCache) return tripTemplateCache;
  try {
    const raw = fs.readFileSync(TRIP_TEMPLATE_FILE, 'utf8');
    tripTemplateCache = JSON.parse(raw || '{}') || {};
  } catch (err) {
    console.warn('trips: failed to load template, falling back to empty structure', err && err.message ? err.message : err);
    tripTemplateCache = {
      id: '', slug: '', title: '', subtitle: '', description: '',
      duration_hours: 0, duration_days: 0,
      modes: {
        van: { price: 0, capacity: 7 },
        bus: { price: 0, capacity: 40 },
        mercedes: { price: 0, capacity: 3 }
      },
      stops: [{ title: '', description: '', videos: ['', '', ''] }],
      sections: [{ title: '', content: '' }],
      includes: [], excludes: [], tags: [], faq: [{ q: '', a: '' }],
      gallery: [],
      video: { url: '', thumbnail: '' },
      map: { lat: null, lng: null, markers: [] },
      createdAt: '',
      updatedAt: ''
    };
  }
  return tripTemplateCache;
}

function cloneJson(value){
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function applyTemplateDefaults(input){
  const tpl = loadTripTemplate();
  const obj = (input && typeof input === 'object' && !Array.isArray(input)) ? { ...input } : {};
  const visit = (target, template) => {
    if (!template || typeof template !== 'object' || Array.isArray(template)) return;
    Object.keys(template).forEach((key)=>{
      const tplVal = template[key];
      const hasKey = Object.prototype.hasOwnProperty.call(target, key);
      if (!hasKey) {
        target[key] = cloneJson(tplVal);
        return;
      }
      const curVal = target[key];
      if (curVal === undefined) {
        target[key] = cloneJson(tplVal);
        return;
      }
      if (Array.isArray(tplVal)) {
        if (!Array.isArray(curVal)) target[key] = cloneJson(tplVal);
        return;
      }
      if (tplVal && typeof tplVal === 'object' && !Array.isArray(tplVal)) {
        if (curVal && typeof curVal === 'object' && !Array.isArray(curVal)) {
          visit(curVal, tplVal);
        } else {
          target[key] = cloneJson(tplVal);
        }
      }
    });
  };
  visit(obj, tpl);
  return obj;
}

// Default mode_set factory (kept in sync with validateTrip defaults)
function getDefaultModeSet(){
  return {
    bus:      { active:false, price_cents:0, charge_type:'per_person',  default_capacity:40 },
    van:      { active:false, price_cents:0, charge_type:'per_person',  default_capacity:7 },
    // Mercedes (private) strictly per_vehicle: capacity always 1 by business rule
    mercedes: { active:false, price_cents:0, charge_type:'per_vehicle', default_capacity:1 }
  };
}

function normalizeExistingModeSet(ms){
  const def = getDefaultModeSet();
  if (!ms || typeof ms!== 'object') return def;
  return {
    bus:      { ...def.bus, ...(typeof ms.bus==='object'? ms.bus : {}) },
    van:      { ...def.van, ...(typeof ms.van==='object'? ms.van : {}) },
    mercedes: { ...def.mercedes, ...(typeof ms.mercedes==='object'? ms.mercedes : {}) }
  };
}

function ensureTripsDir(){
  try { fs.mkdirSync(TRIPS_DIR, { recursive:true }); } catch(_){ }
  try { fs.mkdirSync(UPLOAD_TRIPS_DIR, { recursive:true }); } catch(_){ }
}
function sanitizeSlug(raw){
  return String(raw||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
function readTrip(slug){
  ensureTripsDir();
  try {
    const safeSlug = sanitizeSlug(slug||'');
    if (!safeSlug || safeSlug === '_template') return null;
    const file = path.join(TRIPS_DIR, safeSlug + '.json');
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    const obj = JSON.parse(raw||'null');
    if (obj) obj.mode_set = normalizeExistingModeSet(obj.mode_set);
    return obj ? applyTemplateDefaults(obj) : null;
  } catch(e){ console.error('trips: readTrip failed', slug, e.message); return null; }
}
function writeTrip(data){
  ensureTripsDir();
  try {
    const safeSlug = sanitizeSlug(data && data.slug);
    if (!safeSlug || safeSlug === '_template') return false;
    const file = path.join(TRIPS_DIR, safeSlug + '.json');
    const prepared = applyTemplateDefaults({ ...data, slug: safeSlug });
    fs.writeFileSync(file, JSON.stringify(prepared, null, 2), 'utf8');
    return true;
  } catch(e){ console.error('trips: writeTrip failed', data.slug, e.message); return false; }
}
function deleteTrip(slug){
  ensureTripsDir();
  try {
    const safeSlug = sanitizeSlug(slug||'');
    if (!safeSlug || safeSlug === '_template') return false;
    const file = path.join(TRIPS_DIR, safeSlug + '.json');
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return true;
  } catch(e){ console.error('trips: deleteTrip failed', slug, e.message); return false; }
}
function listTrips(){
  ensureTripsDir();
  try {
    const fns = fs.readdirSync(TRIPS_DIR).filter(f => f.endsWith('.json') && f !== TEMPLATE_FILENAME);
    return fns.map(fn=>{
      try {
        const raw = fs.readFileSync(path.join(TRIPS_DIR, fn), 'utf8');
        const obj = JSON.parse(raw||'null');
        if (obj) {
          obj.mode_set = normalizeExistingModeSet(obj.mode_set);
          return applyTemplateDefaults(obj);
        }
        return null;
      } catch(e){ return null; }
    }).filter(Boolean).sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')));
  } catch(e){ console.error('trips: listTrips failed', e.message); return []; }
}
function validateTrip(input){
  const errors = [];
  const title = String(input.title||'').trim();
  let slug = sanitizeSlug(input.slug || title);
  const description = String(input.description||'').trim();
  const category = String(input.category||'').trim();
  const duration = String(input.duration||'').trim();
  const coverImage = String(input.coverImage||'').trim();
  const iconPath = String(input.iconPath||'').trim();
  function toInt(n, def){ const v = parseInt(n,10); return Number.isFinite(v) && v>=0 ? v : (def||0); }
  function toBool(v){ return !!v && String(v).toLowerCase()!=='false' && String(v)!=='0'; }
  function normChargeType(v){ return (v==='per_vehicle') ? 'per_vehicle' : 'per_person'; }
  function parseMode(m){
    if (!m || typeof m!=='object') return { active:false, price_cents:0, charge_type:'per_person', default_capacity:0 };
    return {
      active: toBool(m.active),
      price_cents: toInt(m.price_cents, 0),
      charge_type: normChargeType(m.charge_type),
      default_capacity: toInt(m.default_capacity, 0)
    };
  }
  const defaultModes = {
    bus:      { active:false, price_cents:0, charge_type:'per_person',  default_capacity:40 },
    van:      { active:false, price_cents:0, charge_type:'per_person',  default_capacity:7 },
    // Mercedes hard default capacity=1 (single vehicle/day)
    mercedes: { active:false, price_cents:0, charge_type:'per_vehicle', default_capacity:1 }
  };
  let mode_set_in = (input && input.mode_set && typeof input.mode_set==='object') ? input.mode_set : {};
  const mode_set = {
    bus: parseMode(mode_set_in.bus || defaultModes.bus),
    van: parseMode(mode_set_in.van || defaultModes.van),
    mercedes: parseMode(mode_set_in.mercedes || defaultModes.mercedes)
  };
  let stopsRaw = input.stops;
  if (typeof stopsRaw === 'string') {
    // newline or comma separated
    stopsRaw = stopsRaw.split(/\n|,/g).map(s=>s.trim()).filter(s=>s);
  }
  if (!Array.isArray(stopsRaw)) stopsRaw = [];
  const stops = stopsRaw.map(s=>String(s||'').trim()).filter(s=>s);
  if (!title) errors.push('missing_title');
  if (!slug) errors.push('missing_slug');
  if (!description) errors.push('missing_description');
  if (!category) errors.push('missing_category');
  if (!duration) errors.push('missing_duration');
  return { ok: errors.length===0, errors, data: { id: input.id || crypto.randomUUID(), title, slug, description, category, duration, stops, coverImage, iconPath, mode_set } };
}

function registerTripsRoutes(app, { checkAdminAuth }){
  ensureTripsDir();
  // Upload handler for cover images (JPG/PNG/WEBP)
  const upload = multer ? multer({
    storage: multer.diskStorage({
      destination: (req,file,cb) => {
        try { fs.mkdirSync(UPLOAD_TRIPS_DIR, { recursive:true }); } catch(_){ }
        cb(null, UPLOAD_TRIPS_DIR);
      },
      filename: (req,file,cb) => {
        const orig = String(file.originalname||'').toLowerCase();
        const extMatch = orig.match(/\.([a-z0-9]+)$/);
        const ext = extMatch ? extMatch[1] : 'jpg';
        const stem = sanitizeSlug((req.body && (req.body.slug||req.body.title)) || 'file');
        const fname = `${stem}-${Date.now()}.${ext}`;
        cb(null, fname);
      }
    }),
    fileFilter: (req,file,cb) => {
      // Allow SVG for tripIconFile; broaden to accept jpg/jpeg/png/webp/svg universally.
      const name = String(file.originalname||'');
      const ok = /(jpg|jpeg|png|webp|svg)$/i.test(name);
      if (!ok) return cb(new Error('invalid_file_type'));
      cb(null,true);
    },
    limits: { fileSize: 4 * 1024 * 1024 }
  }) : null;
  // Admin router
  const adminRouter = express.Router();
  adminRouter.get('/', (req,res)=>{
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error:'Forbidden' });
    return res.json(listTrips());
  });
  adminRouter.get('/template', (req,res)=>{
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error:'Forbidden' });
    return res.json(loadTripTemplate());
  });
  adminRouter.get('/:slug', (req,res)=>{
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error:'Forbidden' });
    const slug = sanitizeSlug(req.params.slug||'');
    if (!slug) return res.status(400).json({ error:'invalid_slug' });
    const trip = readTrip(slug);
    if (!trip) return res.status(404).json({ error:'not_found' });
    return res.json(trip);
  });
  adminRouter.post('/', express.json({ limit:'200kb' }), (req,res)=>{
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error:'Forbidden' });
    const input = (req.body && typeof req.body==='object') ? req.body : {};
    const v = validateTrip(input);
    if (!v.ok) return res.status(400).json({ error:'validation_failed', errors: v.errors });
    const existing = readTrip(v.data.slug);
    const base = existing ? { ...existing } : applyTemplateDefaults({});
    const toWrite = { ...base, ...v.data, slug: v.data.slug };
    // Ensure mode_set is always the validated version (avoid accidental loss)
    toWrite.mode_set = v.data.mode_set;
    const nowIso = new Date().toISOString();
    if (existing && existing.createdAt) {
      toWrite.createdAt = existing.createdAt;
    } else if (!toWrite.createdAt) {
      toWrite.createdAt = nowIso;
    }
    toWrite.updatedAt = nowIso;
    if (!toWrite.id) toWrite.id = crypto.randomUUID();
    if (!writeTrip(toWrite)) return res.status(500).json({ error:'write_failed' });
    return res.json({ ok:true, trip: applyTemplateDefaults(toWrite) });
  });
  adminRouter.delete('/:slug', (req,res)=>{
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error:'Forbidden' });
    const slug = sanitizeSlug(req.params.slug||'');
    if (!slug) return res.status(400).json({ error:'invalid_slug' });
    const existing = readTrip(slug);
    if (!existing) return res.status(404).json({ error:'not_found' });
    if (!deleteTrip(slug)) return res.status(500).json({ error:'delete_failed' });
    return res.json({ success:true });
  });
  // Upload endpoint for trip cover images (new path as specified)
  adminRouter.post('/upload-trip-image', (req,res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error:'Forbidden' });
    if (!upload) return res.status(500).json({ error:'upload_unavailable' });
    upload.single('coverImageFile')(req,res,(err)=>{
      if (err) {
        return res.status(400).json({ error:'upload_failed', detail: err && err.message ? err.message : String(err) });
      }
      try {
        const filename = req.file && req.file.filename ? req.file.filename : '';
        if (!filename) return res.status(400).json({ error:'no_file' });
        return res.json({ ok:true, filename, url: `/uploads/trips/${filename}` });
      } catch(e){ return res.status(500).json({ error:'upload_failed' }); }
    });
  });
  app.use('/api/admin/trips', adminRouter);
  // Backward compatible mount for new standalone upload path
  if (upload) {
    app.post('/api/admin/upload-trip-image', (req,res) => {
      if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error:'Forbidden' });
      upload.single('coverImageFile')(req,res,(err)=>{
        if (err) return res.status(400).json({ error:'upload_failed', detail: err && err.message ? err.message : String(err) });
        try {
          const filename = req.file && req.file.filename ? req.file.filename : '';
          if (!filename) return res.status(400).json({ error:'no_file' });
          return res.json({ ok:true, filename, url: `/uploads/trips/${filename}` });
        } catch(e){ return res.status(500).json({ error:'upload_failed' }); }
      });
    });
    // Trip icon upload (svg/png/webp)
    app.post('/api/admin/upload-trip-icon', (req,res) => {
      if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error:'Forbidden' });
      upload.single('tripIconFile')(req,res,(err)=>{
        if (err) return res.status(400).json({ error:'upload_failed', detail: err && err.message ? err.message : String(err) });
        try {
          const filename = req.file && req.file.filename ? req.file.filename : '';
          if (!filename) return res.status(400).json({ error:'no_file' });
          return res.json({ ok:true, filename, url: `/uploads/trips/${filename}` });
        } catch(e){ return res.status(500).json({ error:'upload_failed' }); }
      });
    });
  }

  // Public endpoints
  app.get('/api/public/trips', (req,res)=>{
    return res.json(listTrips());
  });
  app.get('/api/public/trips/:slug', (req,res)=>{
    const slug = sanitizeSlug(req.params.slug||'');
    if (!slug) return res.status(400).json({ error:'invalid_slug' });
    const trip = readTrip(slug);
    if (!trip) return res.status(404).json({ error:'not_found' });
    return res.json(trip);
  });

  console.log('trips: routes registered');
}

module.exports = { registerTripsRoutes };
