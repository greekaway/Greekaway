const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.join(__dirname, '..', '..', '..');
const TRIPS_DIR = path.join(ROOT_DIR, 'trips');
const UPLOAD_TRIPS_DIR = path.join(ROOT_DIR, 'public', 'uploads', 'trips');
let multer = null;
try { multer = require('multer'); } catch(_) { multer = null; }

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
    const file = path.join(TRIPS_DIR, slug + '.json');
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw||'null');
  } catch(e){ console.error('trips: readTrip failed', slug, e.message); return null; }
}
function writeTrip(data){
  ensureTripsDir();
  try {
    const file = path.join(TRIPS_DIR, data.slug + '.json');
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch(e){ console.error('trips: writeTrip failed', data.slug, e.message); return false; }
}
function deleteTrip(slug){
  ensureTripsDir();
  try { const file = path.join(TRIPS_DIR, slug + '.json'); if (fs.existsSync(file)) fs.unlinkSync(file); return true; } catch(e){ console.error('trips: deleteTrip failed', slug, e.message); return false; }
}
function listTrips(){
  ensureTripsDir();
  try {
    const fns = fs.readdirSync(TRIPS_DIR).filter(f=>f.endsWith('.json'));
    return fns.map(fn=>{
      try { const raw = fs.readFileSync(path.join(TRIPS_DIR, fn), 'utf8'); const obj = JSON.parse(raw||'null'); return obj; } catch(e){ return null; }
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
  return { ok: errors.length===0, errors, data: { id: input.id || crypto.randomUUID(), title, slug, description, category, duration, stops, coverImage, iconPath } };
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
        const stem = sanitizeSlug((req.body && (req.body.slug||req.body.title)) || 'cover');
        const fname = `${stem}-${Date.now()}.${ext}`;
        cb(null, fname);
      }
    }),
    fileFilter: (req,file,cb) => {
      const ok = /(jpg|jpeg|png|webp)$/i.test(file.originalname||'');
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
    const toWrite = existing ? { ...existing, ...v.data, slug: v.data.slug } : v.data;
    if (!writeTrip(toWrite)) return res.status(500).json({ error:'write_failed' });
    return res.json({ ok:true, trip: toWrite });
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
