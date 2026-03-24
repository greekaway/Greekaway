/**
 * MoveAthens File Uploads — Admin API Routes
 * Admin: POST /api/admin/moveathens/upload-hero-video
 *        POST /api/admin/moveathens/upload-hero-logo
 *        POST /api/admin/moveathens/upload-vehicle-image
 *        POST /api/admin/moveathens/upload-category-icon
 *        POST /api/admin/moveathens/upload-footer-icon
 */
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
let multer = null;
try { multer = require('multer'); } catch (_) { multer = null; }
let sharp = null;
try { sharp = require('sharp'); } catch (_) { sharp = null; }

const dataLayer = require('../../src/server/data/moveathens');

module.exports = function registerUploadRoutes(app, opts = {}) {
  const checkAdminAuth = typeof opts.checkAdminAuth === 'function' ? opts.checkAdminAuth : null;

  if (!multer) {
    console.warn('[MoveAthens] multer not available — upload routes skipped');
    return;
  }

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
  });

  // ========================================
  // Hero Video
  // ========================================
  app.post('/api/admin/moveathens/upload-hero-video', upload.single('video'), async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      if (!req.file) return res.status(400).json({ error: 'Missing file' });
      if (req.file.mimetype !== 'video/mp4') return res.status(400).json({ error: 'Invalid file type' });
      const videosDir = path.join(__dirname, '..', '..', 'uploads', 'moveathens', 'videos');
      fs.mkdirSync(videosDir, { recursive: true });
      const outPath = path.join(videosDir, 'hero.mp4');
      fs.writeFileSync(outPath, req.file.buffer);
      const url = '/uploads/moveathens/videos/hero.mp4';
      try {
        await dataLayer.updateConfig({ heroVideoUrl: url });
      } catch (_) {}
      return res.json({ url });
    } catch (err) {
      return res.status(500).json({ error: 'Upload failed' });
    }
  });

  // ========================================
  // Hero Logo
  // ========================================
  app.post('/api/admin/moveathens/upload-hero-logo', upload.single('logo'), async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      if (!req.file) return res.status(400).json({ error: 'Missing file' });
      const allowed = new Set(['image/png', 'image/webp', 'image/svg+xml']);
      if (!allowed.has(req.file.mimetype)) return res.status(400).json({ error: 'Invalid file type' });
      const ext = req.file.mimetype === 'image/svg+xml' ? 'svg' : (req.file.mimetype === 'image/webp' ? 'webp' : 'png');
      const videosDir = path.join(__dirname, '..', '..', 'uploads', 'moveathens', 'videos');
      fs.mkdirSync(videosDir, { recursive: true });
      const outPath = path.join(videosDir, `hero-logo.${ext}`);
      fs.writeFileSync(outPath, req.file.buffer);

      // Auto-generate WebP version for performance (smaller file size)
      if (sharp && ext === 'png') {
        try {
          await sharp(req.file.buffer).webp({ quality: 80 }).toFile(path.join(videosDir, 'hero-logo.webp'));
        } catch (_) { /* WebP generation is best-effort */ }
      }

      const url = `/uploads/moveathens/videos/hero-logo.${ext}`;
      try {
        await dataLayer.updateConfig({ heroLogoUrl: url });
      } catch (_) {}
      return res.json({ url });
    } catch (err) {
      return res.status(500).json({ error: 'Upload failed' });
    }
  });

  // ========================================
  // Vehicle Image
  // ========================================
  app.post('/api/admin/moveathens/upload-vehicle-image', upload.single('image'), (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      if (!req.file) return res.status(400).json({ error: 'Missing file' });
      const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);
      if (!allowed.has(req.file.mimetype)) return res.status(400).json({ error: 'Invalid file type' });
      const ext = req.file.mimetype === 'image/webp' ? 'webp' : (req.file.mimetype === 'image/jpeg' ? 'jpg' : 'png');
      const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'moveathens', 'vehicles');
      fs.mkdirSync(uploadsDir, { recursive: true });
      const name = crypto.randomUUID ? crypto.randomUUID() : `veh_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const outPath = path.join(uploadsDir, `vehicle-${name}.${ext}`);
      fs.writeFileSync(outPath, req.file.buffer);
      const url = `/uploads/moveathens/vehicles/vehicle-${name}.${ext}`;
      return res.json({ url });
    } catch (err) {
      return res.status(500).json({ error: 'Upload failed' });
    }
  });

  // ========================================
  // Category Icon
  // ========================================
  app.post('/api/admin/moveathens/upload-category-icon', upload.single('icon'), (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      if (!req.file) return res.status(400).json({ error: 'Missing file' });
      const allowed = new Set(['image/svg+xml', 'image/png', 'image/jpeg']);
      if (!allowed.has(req.file.mimetype)) return res.status(400).json({ error: 'Invalid file type. Use SVG, PNG or JPEG' });
      const ext = req.file.mimetype === 'image/svg+xml' ? 'svg' : (req.file.mimetype === 'image/jpeg' ? 'jpg' : 'png');
      const iconsDir = path.join(__dirname, '..', '..', 'uploads', 'moveathens', 'icons', 'categories');
      fs.mkdirSync(iconsDir, { recursive: true });
      const name = crypto.randomUUID ? crypto.randomUUID() : `cat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const outPath = path.join(iconsDir, `category-${name}.${ext}`);
      fs.writeFileSync(outPath, req.file.buffer);
      const url = `/uploads/moveathens/icons/categories/category-${name}.${ext}`;
      return res.json({ url });
    } catch (err) {
      return res.status(500).json({ error: 'Upload failed' });
    }
  });

  // ========================================
  // Footer Icon
  // ========================================
  app.post('/api/admin/moveathens/upload-footer-icon', upload.single('icon'), async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const key = String(req.query.key || '').trim();
      const allowedKeys = new Set(['home', 'prices', 'cta', 'info', 'context']);
      if (!allowedKeys.has(key)) return res.status(400).json({ error: 'Invalid key' });
      if (!req.file) return res.status(400).json({ error: 'Missing file' });
      if (req.file.mimetype !== 'image/svg+xml') return res.status(400).json({ error: 'Invalid file type' });
      const iconsDir = path.join(__dirname, '..', '..', 'uploads', 'moveathens', 'icons');
      fs.mkdirSync(iconsDir, { recursive: true });
      const outPath = path.join(iconsDir, `footer-${key}.svg`);
      fs.writeFileSync(outPath, req.file.buffer);
      const url = `/uploads/moveathens/icons/footer-${key}.svg?v=${Date.now()}`;
      try {
        const current = await dataLayer.getConfig();
        await dataLayer.updateConfig({
          footerIcons: { ...(current && current.footerIcons ? current.footerIcons : {}), [key]: url }
        });
      } catch (_) {}
      return res.json({ url });
    } catch (err) {
      return res.status(500).json({ error: 'Upload failed' });
    }
  });

  console.log('[MoveAthens] Upload routes registered');
};
