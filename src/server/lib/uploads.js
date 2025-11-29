const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.join(__dirname, '..', '..', '..');
const FALLBACK_UPLOADS_ROOT = path.join(ROOT_DIR, 'uploads');
const RENDER_PERSISTENT_ROOT = '/opt/render/project/src/uploads';
const DEFAULT_DEV_PORT = (() => {
  const fromEnv = Number(process.env.PORT || process.env.APP_PORT || process.env.DEV_SERVER_PORT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return 3101;
})();
const DEFAULT_DEV_ORIGIN = `http://localhost:${DEFAULT_DEV_PORT}`;
const DEFAULT_ORIGIN = process.env.NODE_ENV === 'production'
  ? 'https://greekaway.com'
  : DEFAULT_DEV_ORIGIN;
const KNOWN_UPLOAD_HOSTS = new Set([
  'greekaway.com',
  'www.greekaway.com',
  'localhost',
  '127.0.0.1',
  '0.0.0.0'
]);

function ensureDir(dirPath) {
  if (!dirPath) return dirPath;
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    return dirPath;
  } catch (err) {
    console.warn('uploads: failed to ensure dir', dirPath, err && err.message ? err.message : err);
    return null;
  }
}

let cachedUploadsRoot = null;
function resolveUploadsRoot() {
  if (cachedUploadsRoot) return cachedUploadsRoot;
  const envDir = (process.env.UPLOADS_DIR || '').trim();
  if (envDir) {
    const candidate = path.isAbsolute(envDir) ? envDir : path.join(ROOT_DIR, envDir);
    const ensured = ensureDir(candidate);
    if (ensured) {
      cachedUploadsRoot = ensured;
      return cachedUploadsRoot;
    }
  }
  if (!process.env.RENDER) {
    cachedUploadsRoot = ensureDir(FALLBACK_UPLOADS_ROOT) || FALLBACK_UPLOADS_ROOT;
    return cachedUploadsRoot;
  }
  const ensuredRenderPath = ensureDir(RENDER_PERSISTENT_ROOT);
  if (ensuredRenderPath) {
    cachedUploadsRoot = ensuredRenderPath;
    return cachedUploadsRoot;
  }
  cachedUploadsRoot = ensureDir(FALLBACK_UPLOADS_ROOT) || FALLBACK_UPLOADS_ROOT;
  return cachedUploadsRoot;
}

function getUploadsRoot() {
  return resolveUploadsRoot();
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

function buildUploadsPath(group, filename) {
  const subFolder = cleanSegment(group) || '';
  const filePart = cleanSegment(filename);
  const basePath = subFolder ? `uploads/${subFolder}` : 'uploads';
  return filePart ? `${basePath}/${filePart}` : basePath;
}

function absolutizeUploadsUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalized = raw.replace(/^\/+/, '');
  if (!normalized.startsWith('uploads/')) return raw;
  return `${resolveUploadsOrigin()}/${normalized}`;
}

function toRelativeUploadsPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const stripLeadingSlash = (str) => str.replace(/^\/+/, '');
  if (raw.startsWith('uploads/')) return raw;
  if (raw.startsWith('/uploads/')) return stripLeadingSlash(raw);
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const path = stripLeadingSlash(url.pathname || '');
      if (path.startsWith('uploads/')) {
        const host = (url.hostname || '').toLowerCase();
        let resolvedHost = '';
        try {
          resolvedHost = new URL(resolveUploadsOrigin()).hostname.toLowerCase();
        } catch (_) {
          resolvedHost = '';
        }
        if (host === resolvedHost || KNOWN_UPLOAD_HOSTS.has(host)) {
          return path;
        }
      }
    } catch (_) {
      // keep original value on URL parse failure
    }
  }
  return raw;
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
  buildUploadsPath,
  absolutizeUploadsUrl,
  toRelativeUploadsPath,
  resolveUploadsOrigin,
  resolveUploadsRoot,
  ensureDir,
};
