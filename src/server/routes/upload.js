const express = require('express');
const path = require('path');
const crypto = require('crypto');
let multer = null;
try {
  multer = require('multer');
} catch (_) {
  multer = null;
}

const {
  getUploadsRoot,
  ensureDir,
  buildUploadsPath,
  buildUploadsUrl,
} = require('../lib/uploads');

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB per requirements
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.svg']);

function sanitizeFolder(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return '';
  if (/\.\.|\0|\/\//.test(value)) return '';
  return value.replace(/[^a-z0-9\/-]+/g, '-').replace(/^-+|-+$/g, '');
}

function pickExtension(filename) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) return ext;
  return '.jpg';
}

function buildFilename(original) {
  const ext = pickExtension(original);
  const timestamp = Date.now();
  let entropy = '';
  try {
    entropy = crypto.randomBytes(6).toString('hex');
  } catch (_) {
    entropy = Math.random().toString(36).slice(2, 8);
  }
  return `${timestamp}-${entropy}${ext}`;
}

function isAllowedFile(file) {
  if (!file) return false;
  const ext = path.extname(String(file.originalname || '')).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) return false;
  const mime = String(file.mimetype || '').toLowerCase();
  if (mime && !mime.startsWith('image/')) return false;
  if (typeof file.size === 'number' && file.size > MAX_FILE_BYTES) return false;
  return true;
}

function registerUploadRoutes(app, { checkAdminAuth }) {
  if (!multer) {
    console.warn('upload: multer is not installed; /api/admin/upload disabled');
    return;
  }

  const router = express.Router();
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const folder = sanitizeFolder((req.body && req.body.folder) || '');
      const root = getUploadsRoot();
      const dest = folder ? ensureDir(path.join(root, folder)) : root;
      if (!dest) return cb(new Error('uploads_dir_unavailable'));
      cb(null, dest);
    },
    filename: (req, file, cb) => {
      cb(null, buildFilename(file && file.originalname));
    },
  });

  const uploader = multer({
    storage,
    limits: { fileSize: MAX_FILE_BYTES },
    fileFilter: (req, file, cb) => {
      if (!isAllowedFile(file)) {
        return cb(new Error('invalid_file_type'));
      }
      cb(null, true);
    },
  }).single('file');

  router.post('/api/admin/upload', (req, res) => {
    try {
      if (!checkAdminAuth || !checkAdminAuth(req)) {
        return res.status(403).json({ success: false, error: 'forbidden' });
      }
    } catch (_) {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }

    uploader(req, res, (err) => {
      if (err) {
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        const detail = err && err.message ? err.message : 'upload_failed';
        return res.status(status).json({ success: false, error: 'upload_failed', detail });
      }
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: 'no_file' });
      }
      const folder = sanitizeFolder((req.body && req.body.folder) || '');
      const relativePath = buildUploadsPath(folder, file.filename);
      const absoluteUrl = buildUploadsUrl(folder, file.filename);
      return res.json({ success: true, filename: relativePath, absoluteUrl });
    });
  });

  app.use(router);
  console.log('upload: /api/admin/upload ready');
}

module.exports = { registerUploadRoutes };
