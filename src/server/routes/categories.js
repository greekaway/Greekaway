const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CATEGORIES_PATH = path.join(__dirname, '..', '..', '..', 'data', 'categories.json');
const PUBLIC_CATEGORIES_DIR = path.join(__dirname, '..', '..', '..', 'public', 'categories');

function ensureCategoriesFile(){
  try { fs.mkdirSync(path.dirname(CATEGORIES_PATH), { recursive: true }); } catch(_){ }
  try { fs.mkdirSync(PUBLIC_CATEGORIES_DIR, { recursive: true }); } catch(_){ }
  if (!fs.existsSync(CATEGORIES_PATH)) {
    try { fs.writeFileSync(CATEGORIES_PATH, '[]', 'utf8'); } catch(_){ }
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
  return existing;
}
function saveIconIfProvided(category, iconSvg){
  if (!iconSvg || typeof iconSvg !== 'string') return;
  const catDir = path.join(PUBLIC_CATEGORIES_DIR, category.slug);
  try { fs.mkdirSync(catDir, { recursive:true }); } catch(_){ }
  const iconPathDisk = path.join(catDir, 'icon.svg');
  try { fs.writeFileSync(iconPathDisk, iconSvg, 'utf8'); category.iconPath = `/categories/${category.slug}/icon.svg`; } catch(_){ }
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
      // Enrich with inline SVG content for convenience on the client
      const enriched = list.map(c => {
        const slug = c.slug || '';
        const fp = path.join(PUBLIC_CATEGORIES_DIR, slug, 'icon.svg');
        let iconSvg = null;
        try { if (fs.existsSync(fp)) iconSvg = fs.readFileSync(fp, 'utf8'); } catch(_){ }
        const iconPath = c.iconPath && typeof c.iconPath === 'string' && c.iconPath.trim() ? c.iconPath : `/categories/${slug}/icon.svg`;
        return { id: c.id, title: c.title, slug, order: c.order||0, published: !!c.published, iconPath, iconSvg };
      });
      return res.json(enriched);
    } catch(e){ console.error('categories: unexpected GET', e); return res.status(500).json({ error:'read_failed' }); }
  });
  router.post('/', (req,res) => {
    try {
      if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error:'Forbidden' });
      const body = (req.body && typeof req.body==='object') ? req.body : null;
      if (!body) return res.status(400).json({ error:'invalid_body' });
      const list = safeReadCategories();
      let updated; try { updated = upsertCategory(list, body); } catch(err){ return res.status(400).json({ error: err.message||'upsert_failed' }); }
      if (body.iconSvg) saveIconIfProvided(updated, body.iconSvg);
      if (updated.iconPath && !updated.iconPath.startsWith('/categories/')) updated.iconPath = `/categories/${updated.slug}/icon.svg`;
      list.sort((a,b)=>(a.order-b.order)||a.title.localeCompare(b.title));
      if (!writeCategories(list)) return res.status(500).json({ error:'write_failed' });
      return res.json({ ok:true, category:updated, total:list.length });
    } catch(e){ console.error('categories: unexpected POST', e); return res.status(500).json({ error:'write_failed' }); }
  });
  return router;
}

function registerCategoriesRoutes(app, { checkAdminAuth }){
  try {
    app.use('/api/categories', buildCategoriesRouter({ checkAdminAuth }));
    console.log('categories: router mounted at /api/categories');
  } catch(e){ console.error('categories: router mount failed', e && e.message ? e.message : e); }
}

module.exports = { registerCategoriesRoutes };
