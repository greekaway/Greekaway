const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  getIconsDir,
  absolutizeUploadsUrl,
  toRelativeUploadsPath,
} = require('../lib/uploads');

const ROOT_DIR = path.join(__dirname, '..', '..', '..');
const CATEGORIES_PATH = path.join(ROOT_DIR, 'data', 'categories.json');
const PUBLIC_CATEGORIES_DIR = path.join(ROOT_DIR, 'public', 'categories');
const DEFAULT_ICON_PATH = 'uploads/icons/default.svg';
const jsonParser = express.json({ limit: '1mb' });
const LEGACY_MODE_TEXT_FIELDS = [
  'mode_card_title',
  'mode_card_subtitle',
  'mode_van_description',
  'mode_mercedes_description',
  'mode_bus_description'
];

function emptyModeCard(){
  return {
    title: '',
    subtitle: '',
    desc: {
      van: '',
      mercedes: '',
      bus: ''
    }
  };
}

function hydrateModeCard(raw, legacySource){
  const base = emptyModeCard();
  const src = (raw && typeof raw === 'object') ? raw : {};
  const desc = (src.desc && typeof src.desc === 'object') ? src.desc : {};
  if (typeof src.title === 'string') base.title = src.title;
  if (typeof src.subtitle === 'string') base.subtitle = src.subtitle;
  if (typeof desc.van === 'string') base.desc.van = desc.van;
  if (typeof desc.mercedes === 'string') base.desc.mercedes = desc.mercedes;
  if (typeof desc.bus === 'string') base.desc.bus = desc.bus;
  const legacy = legacySource && typeof legacySource === 'object' ? legacySource : {};
  if (!base.title && typeof legacy.mode_card_title === 'string') base.title = legacy.mode_card_title;
  if (!base.subtitle && typeof legacy.mode_card_subtitle === 'string') base.subtitle = legacy.mode_card_subtitle;
  if (!base.desc.van && typeof legacy.mode_van_description === 'string') base.desc.van = legacy.mode_van_description;
  if (!base.desc.mercedes && typeof legacy.mode_mercedes_description === 'string') base.desc.mercedes = legacy.mode_mercedes_description;
  if (!base.desc.bus && typeof legacy.mode_bus_description === 'string') base.desc.bus = legacy.mode_bus_description;
  return base;
}

function stripLegacyModeCardFields(obj){
  LEGACY_MODE_TEXT_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(obj, field)) delete obj[field];
  });
}

function applyModeCardPayload(target, payload){
  const card = hydrateModeCard(target.modeCard, target);
  const assign = (key, value) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (key === 'title') card.title = text;
    else if (key === 'subtitle') card.subtitle = text;
    else if (key === 'van') card.desc.van = text;
    else if (key === 'mercedes') card.desc.mercedes = text;
    else if (key === 'bus') card.desc.bus = text;
  };
  if (payload && typeof payload === 'object') {
    if (Object.prototype.hasOwnProperty.call(payload, 'mode_card_title')) assign('title', payload.mode_card_title);
    if (Object.prototype.hasOwnProperty.call(payload, 'mode_card_subtitle')) assign('subtitle', payload.mode_card_subtitle);
    if (Object.prototype.hasOwnProperty.call(payload, 'mode_van_description')) assign('van', payload.mode_van_description);
    if (Object.prototype.hasOwnProperty.call(payload, 'mode_mercedes_description')) assign('mercedes', payload.mode_mercedes_description);
    if (Object.prototype.hasOwnProperty.call(payload, 'mode_bus_description')) assign('bus', payload.mode_bus_description);
  }
  target.modeCard = card;
  stripLegacyModeCardFields(target);
  return card;
}

function ensureCategoriesFile(){
  try { fs.mkdirSync(path.dirname(CATEGORIES_PATH), { recursive: true }); } catch(_){ }
  try { fs.mkdirSync(PUBLIC_CATEGORIES_DIR, { recursive: true }); } catch(_){ }
  const ICONS_DIR = getIconsDir();
  if (!fs.existsSync(CATEGORIES_PATH)) {
    try { fs.writeFileSync(CATEGORIES_PATH, '[]', 'utf8'); } catch(_){ }
  }
  // Ensure a default.svg exists for fallback
  const defaultIconPath = path.join(ICONS_DIR, 'default.svg');
  if (!fs.existsSync(defaultIconPath)) {
    const fallbackSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect x="4" y="4" width="56" height="56" rx="12" fill="#1e5179"/><text x="32" y="38" font-size="18" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif">CAT</text></svg>';
    try { fs.writeFileSync(defaultIconPath, fallbackSvg, 'utf8'); } catch(_){ }
  }
  try {
    // Check write access and log absolute path resolutions
    const resolved = path.resolve(ICONS_DIR);
    fs.accessSync(resolved, fs.constants.W_OK);
    console.log('categories: upload dir ready:', resolved);
  } catch(e){
    console.error('categories: upload dir not writable', {
      dir: path.resolve(ICONS_DIR),
      error: e && e.message ? e.message : e
    });
  }
}
function safeReadCategories(){
  ensureCategoriesFile();
  try {
    const raw = fs.readFileSync(CATEGORIES_PATH, 'utf8');
    const data = JSON.parse(raw || '[]');
    return Array.isArray(data) ? data : [];
  } catch(err){ console.error('categories: read failed', err.message); return []; }
}
function writeCategories(arr){
  try { fs.writeFileSync(CATEGORIES_PATH, JSON.stringify(arr, null, 2), 'utf8'); return true; }
  catch(err){ console.error('categories: write failed', err.message); return false; }
}
function sanitizeSlug(raw){
  return String(raw||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
function upsertCategory(list, input){
  const slug = sanitizeSlug(input.slug || input.title || '');
  if (!slug) throw new Error('missing_slug');
  let existing = list.find(c => c.slug === slug || c.id === input.id);
  if (!existing){ existing = { id: crypto.randomUUID(), title:'', slug, iconPath:'', order:0, published:false }; list.push(existing); }
  if (typeof input.title === 'string') existing.title = input.title.trim();
  existing.slug = slug;
  existing.order = Number.isFinite(input.order) ? input.order : parseInt(input.order,10) || 0;
  existing.published = !!input.published;
  applyModeCardPayload(existing, input);
  return existing;
}

function buildCategoriesRouter({ checkAdminAuth }){
  ensureCategoriesFile();
  const router = express.Router();
  router.get('/', (req,res) => {
    try {
      const isAdmin = (checkAdminAuth && checkAdminAuth(req)) ? true : false;
      let list = safeReadCategories();
      // Always sort by order then title for deterministic output
      list.sort((a,b)=>(a.order-b.order)||String(a.title||'').localeCompare(String(b.title||'')));
      const qp = String(req.query.published || '').toLowerCase();
      const wantPublishedOnly = (qp === 'true' || qp === '1' || qp === 'yes');
      if (wantPublishedOnly || !isAdmin) {
        list = list.filter(c => !!c.published);
      }
      const enriched = list.map(c => {
        const slug = c.slug || '';
        // Priority: stored iconPath -> legacy /categories/<slug>/icon.svg if exists -> default fallback
        let iconPath = (c.iconPath && c.iconPath.trim()) ? c.iconPath.trim() : '';
        iconPath = absolutizeUploadsUrl(iconPath, req);
        if (!iconPath) {
          const legacy = path.join(PUBLIC_CATEGORIES_DIR, slug, 'icon.svg');
          if (fs.existsSync(legacy)) iconPath = `/categories/${slug}/icon.svg`;
        }
        if (!iconPath) iconPath = absolutizeUploadsUrl(DEFAULT_ICON_PATH, req);
        const modeCard = hydrateModeCard(c.modeCard, c);
        return { id: c.id, title: c.title, slug, order: c.order||0, published: !!c.published, iconPath, modeCard };
      });
      return res.json(enriched);
    } catch(e){ console.error('categories: unexpected GET', e); return res.status(500).json({ error:'read_failed' }); }
  });
  router.post('/', jsonParser, (req,res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error:'Forbidden' });
    try {
      const body = (req.body && typeof req.body==='object') ? req.body : null;
      if (!body) return res.status(400).json({ error:'invalid_body' });
      const list = safeReadCategories();
      let updated; try { updated = upsertCategory(list, body); } catch(err){ return res.status(400).json({ error: err.message||'upsert_failed' }); }
      if (typeof body.iconPath === 'string' && body.iconPath.trim()) {
        updated.iconPath = toRelativeUploadsPath(body.iconPath.trim());
      } else {
        updated.iconPath = toRelativeUploadsPath(updated.iconPath);
      }
      list.sort((a,b)=>(a.order-b.order)||a.title.localeCompare(b.title));
      if (!writeCategories(list)) return res.status(500).json({ error:'write_failed' });
      console.log('categories: POST saved', { slug: updated.slug, iconPath: updated.iconPath });
      return res.json({ ok:true, category:updated, total:list.length });
    } catch(e){
      console.error('categories: POST error', e && e.stack ? e.stack : e);
      return res.status(500).json({ error:'write_failed', detail: e && e.message ? e.message : String(e) });
    }
  });
  router.delete('/:slug', (req, res) => {
    try {
      if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error:'Forbidden' });
      const slug = String(req.params.slug || '').trim().toLowerCase();
      if (!slug) return res.status(400).json({ error: 'invalid_slug' });
      const list = safeReadCategories();
      const before = list.length;
      const filtered = list.filter(c => String(c.slug||'').toLowerCase() !== slug);
      if (filtered.length === before) return res.status(404).json({ error: 'not_found' });
      if (!writeCategories(filtered)) return res.status(500).json({ error: 'write_failed' });
      return res.json({ success: true });
    } catch(e){ console.error('categories: unexpected DELETE', e); return res.status(500).json({ error:'delete_failed' }); }
  });
  return router;
}

function registerCategoriesRoutes(app, { checkAdminAuth }){
  try {
    const adminRouter = buildCategoriesRouter({ checkAdminAuth });
    app.use('/api/categories', adminRouter);
    app.use('/api/admin/categories', adminRouter);
    console.log('categories: router mounted at /api/categories (+ /api/admin/categories)');
    // Public read-only endpoint for published categories (no auth)
    app.get('/api/public/categories', (req, res) => {
      try {
        let list = safeReadCategories();
        list = list.filter(c => !!c.published);
        list.sort((a,b)=>(a.order-b.order)||String(a.title||'').localeCompare(String(b.title||'')));
        const out = list.map(c => {
          const slug = c.slug || '';
          let iconPath = (c.iconPath && c.iconPath.trim()) ? c.iconPath.trim() : '';
          iconPath = absolutizeUploadsUrl(iconPath, req);
          if (!iconPath) {
            const legacy = path.join(PUBLIC_CATEGORIES_DIR, slug, 'icon.svg');
            if (fs.existsSync(legacy)) iconPath = `/categories/${slug}/icon.svg`;
          }
          if (!iconPath) iconPath = absolutizeUploadsUrl(DEFAULT_ICON_PATH, req);
          const modeCard = hydrateModeCard(c.modeCard, c);
          return { id: c.id, title: c.title, slug, order: c.order||0, published: !!c.published, iconPath, modeCard };
        });
        return res.json(out);
      } catch(e){ console.error('categories: public GET failed', e); return res.status(500).json({ error: 'read_failed' }); }
    });
  } catch(e){ console.error('categories: router mount failed', e && e.message ? e.message : e); }
}

module.exports = { registerCategoriesRoutes };
