const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.join(__dirname, '..', '..', '..');
const UPLOADS_ROOT = path.join(ROOT_DIR, 'uploads');
const DEFAULT_ORIGIN = process.env.NODE_ENV === 'production'
  ? 'https://greekaway.com'
  : 'http://localhost:3000';

function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (_) {
    // no-op
  }
  return dirPath;
}

function getUploadsRoot() {
  return ensureDir(UPLOADS_ROOT);
}

let cachedOrigin = null;
function resolveUploadsOrigin() {
  if (cachedOrigin) return cachedOrigin;
  const candidates = [
    process.env.UPLOADS_BASE_URL,
    process.env.PUBLIC_BASE_URL,
    process.env.PUBLIC_URL,
    process.env.APP_BASE_URL,
    process.env.RENDER_EXTERNAL_URL,
  ];
  const raw = candidates.find((value) => typeof value === 'string' && value.trim());
  const normalized = (raw || DEFAULT_ORIGIN).trim().replace(/\/+$/, '');
  cachedOrigin = normalized || DEFAULT_ORIGIN;
  return cachedOrigin;
}

function cleanSegment(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '');
}

function buildUploadsUrl(group, filename) {
  const origin = resolveUploadsOrigin();
  const subFolder = cleanSegment(group) || '';
  const filePart = cleanSegment(filename);
  const basePath = subFolder ? `uploads/${subFolder}` : 'uploads';
  const relative = filePart ? `${basePath}/${filePart}` : basePath;
  return `${origin}/${relative}`;
}

function absolutizeUploadsUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalized = raw.replace(/^\/+/, '');
  if (!normalized.startsWith('uploads/')) return raw;
  return `${resolveUploadsOrigin()}/${normalized}`;
}

function getGroupDir(group) {
  const safeGroup = cleanSegment(group);
  return safeGroup ? ensureDir(path.join(getUploadsRoot(), safeGroup)) : getUploadsRoot();
}

module.exports = {
  getUploadsRoot,
  getTripsDir: () => getGroupDir('trips'),
  getIconsDir: () => getGroupDir('icons'),
  getCategoriesDir: () => getGroupDir('categories'),
  buildUploadsUrl,
  absolutizeUploadsUrl,
  resolveUploadsOrigin,
  ensureDir,
};
