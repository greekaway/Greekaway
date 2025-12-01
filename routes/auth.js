const express = require('express');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
let nodemailer = null; try { nodemailer = require('nodemailer'); } catch (_) {}
let rateLimit = null; try { rateLimit = require('express-rate-limit'); } catch (_) {}

try { require('dotenv').config(); } catch (_) {}

const router = express.Router();
router.use(express.urlencoded({ extended: true }));

let cachedFetch = null;
async function getFetch() {
  if (typeof fetch === 'function') return fetch;
  if (cachedFetch) return cachedFetch;
  const imported = await import('node-fetch');
  cachedFetch = imported.default || imported;
  return cachedFetch;
}

const envString = (value) => (typeof value === 'string' ? value.trim().replace(/^['"]|['"]$/g, '') : '');
const GOOGLE_CLIENT_ID = envString(process.env.GOOGLE_CLIENT_ID);
const GOOGLE_CLIENT_SECRET = envString(process.env.GOOGLE_CLIENT_SECRET);
const TWILIO_ACCOUNT_SID = envString(process.env.TWILIO_ACCOUNT_SID);
const TWILIO_AUTH_TOKEN = envString(process.env.TWILIO_AUTH_TOKEN);
const TWILIO_PHONE_NUMBER = envString(process.env.TWILIO_PHONE_NUMBER);
const EMAIL_FROM = envString(process.env.EMAIL_FROM) || 'info@greekaway.com';
const SESSION_SECRET = envString(process.env.USER_SESSION_SECRET) || envString(process.env.SESSION_SECRET) || envString(process.env.ADMIN_SESSION_SECRET) || crypto.randomBytes(48).toString('hex');

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const MAX_ATTEMPTS = 5;

const emailCodes = new Map();
const smsCodes = new Map();
const activeSessions = new Map();

const limiter = rateLimit ? rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
}) : null;
if (limiter) {
  router.use(['/email/send', '/sms/send', '/google'], limiter);
}

function cleanupStore(store) {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (!entry || entry.expiresAt <= now) {
      store.delete(key);
    }
  }
}
const cleanupTimer = setInterval(() => {
  cleanupStore(emailCodes);
  cleanupStore(smsCodes);
  cleanupStore(activeSessions);
}, 5 * 60 * 1000);
if (typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function storeCode(map, key, code) {
  if (!key) return;
  map.set(key, { code, expiresAt: Date.now() + CODE_TTL_MS, attempts: 0 });
}

function validateCode(map, key, inputCode) {
  if (!key) return { ok: false, reason: 'missing' };
  const record = map.get(key);
  if (!record) return { ok: false, reason: 'missing' };
  if (record.expiresAt <= Date.now()) {
    map.delete(key);
    return { ok: false, reason: 'expired' };
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    map.delete(key);
    return { ok: false, reason: 'locked' };
  }
  if (String(record.code) !== String(inputCode)) {
    record.attempts += 1;
    if (record.attempts >= MAX_ATTEMPTS) {
      map.delete(key);
      return { ok: false, reason: 'locked' };
    }
    return { ok: false, reason: 'invalid' };
  }
  map.delete(key);
  return { ok: true };
}

function issueSessionToken(strategy, identifier, profile = {}) {
  if (!identifier) throw new Error('identifier required');
  const sessionId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  const payload = {
    sessionId,
    strategy,
    sub: identifier,
    profile,
    createdAt: new Date().toISOString()
  };
  const token = jwt.sign(payload, SESSION_SECRET, { expiresIn: SESSION_TTL_SECONDS });
  activeSessions.set(sessionId, {
    strategy,
    identifier,
    profile,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000
  });
  return { token, expiresIn: SESSION_TTL_SECONDS, sessionId, profile };
}

function normalizeEmail(value) {
  return value ? String(value).trim().toLowerCase() : '';
}

function normalizePhone(value) {
  if (!value) return '';
  return String(value).replace(/[^0-9]/g, '');
}

function toE164(phoneDigits) {
  if (!phoneDigits) return '';
  return phoneDigits.startsWith('+') ? phoneDigits : `+${phoneDigits}`;
}

function sanitizeCode(value) {
  return String(value || '').replace(/[^0-9]/g, '').slice(0, 6);
}

function buildMailTransport() {
  if (!nodemailer) return null;
  if (process.env.SMTP_URL) {
    return nodemailer.createTransport(process.env.SMTP_URL);
  }
  const host = envString(process.env.MAIL_HOST);
  const port = parseInt(process.env.MAIL_PORT || '587', 10);
  const user = envString(process.env.MAIL_USER);
  const pass = envString(process.env.MAIL_PASS);
  if (host) {
    const secure = port === 465;
    const auth = user && pass ? { user, pass } : undefined;
    return nodemailer.createTransport({ host, port, secure, auth });
  }
  return nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true
  });
}

async function sendEmailCode(to, code) {
  if (!nodemailer) throw new Error('nodemailer unavailable');
  const transporter = buildMailTransport();
  if (!transporter) throw new Error('email transport unavailable');
  const mail = {
    from: EMAIL_FROM,
    to,
    subject: 'Ο κωδικός σύνδεσης στο Greekaway',
    text: `Ο κωδικός σας είναι ${code}. Ισχύει για 10 λεπτά.`,
    html: `<p>Ο κωδικός σας είναι <strong>${code}</strong>.</p><p>Ισχύει για 10 λεπτά.</p>`
  };
  await transporter.sendMail(mail);
}

async function sendSmsCode(recipient, code) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    throw new Error('twilio-missing');
  }
  const body = new URLSearchParams({
    To: recipient,
    From: TWILIO_PHONE_NUMBER,
    Body: `Greekaway code: ${code}`
  });
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const fetcher = await getFetch();
  const resp = await fetcher(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  if (!resp.ok) {
    const text = await resp.text();
    const error = new Error('twilio-failed');
    error.details = text;
    throw error;
  }
}

async function verifyGoogleToken(idToken) {
  if (!idToken) throw new Error('missing_token');
  const params = new URLSearchParams({ id_token: idToken });
  const fetcher = await getFetch();
  const resp = await fetcher(`https://oauth2.googleapis.com/tokeninfo?${params.toString()}`);
  if (!resp.ok) throw new Error('invalid_token');
  const data = await resp.json();
  if (GOOGLE_CLIENT_ID && data.aud !== GOOGLE_CLIENT_ID) throw new Error('audience_mismatch');
  const expiry = parseInt(data.exp, 10);
  if (expiry && expiry * 1000 < Date.now()) throw new Error('expired_token');
  return {
    id: data.sub,
    email: data.email,
    name: data.name || data.email,
    picture: data.picture || null
  };
}

function serveView(file) {
  return (req, res) => {
    const filePath = path.join(__dirname, '..', 'views', 'auth', file);
    res.sendFile(filePath, (err) => {
      if (err) {
        res.status(err.status || 500).send('Auth view unavailable');
      }
    });
  };
}

router.get('/login', serveView('login.html'));
router.get('/email-verify', serveView('email-verify.html'));
router.get('/sms-verify', serveView('sms-verify.html'));
router.get('/config', (req, res) => {
  res.json({
    googleClientId: GOOGLE_CLIENT_ID || null,
    emailEnabled: true,
    smsEnabled: !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER),
    appleEnabled: false
  });
});

router.post('/email/send', async (req, res) => {
  try {
    const email = normalizeEmail(req.body && req.body.email);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'invalid_email' });
    }
    const code = generateCode();
    await sendEmailCode(email, code);
    storeCode(emailCodes, email, code);
    return res.json({ ok: true, expiresInMs: CODE_TTL_MS });
  } catch (err) {
    console.error('auth/email/send', err && err.message ? err.message : err);
    const message = err && /nodemailer/i.test(err.message || '') ? 'email_config_error' : 'email_failed';
    return res.status(500).json({ error: message });
  }
});

router.post('/email/verify', (req, res) => {
  try {
    const email = normalizeEmail(req.body && req.body.email);
    const code = sanitizeCode(req.body && req.body.code);
    if (!email || !code) return res.status(400).json({ error: 'missing_fields' });
    const result = validateCode(emailCodes, email, code);
    if (!result.ok) return res.status(400).json({ error: result.reason || 'invalid_code' });
    const session = issueSessionToken('email', email, { email });
    return res.json({ ok: true, token: session.token, expiresIn: session.expiresIn, profile: session.profile });
  } catch (err) {
    console.error('auth/email/verify', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'server_error' });
  }
});

router.post('/sms/send', async (req, res) => {
  try {
    const phone = normalizePhone(req.body && req.body.phone);
    if (!phone || !/^[1-9][0-9]{7,14}$/.test(phone)) {
      return res.status(400).json({ error: 'invalid_phone' });
    }
    const code = generateCode();
    await sendSmsCode(toE164(phone), code);
    storeCode(smsCodes, phone, code);
    return res.json({ ok: true, expiresInMs: CODE_TTL_MS });
  } catch (err) {
    console.error('auth/sms/send', err && err.message ? err.message : err);
    const message = err && err.message === 'twilio-missing' ? 'config_error' : 'sms_failed';
    return res.status(500).json({ error: message });
  }
});

router.post('/sms/verify', (req, res) => {
  try {
    const phone = normalizePhone(req.body && req.body.phone);
    const code = sanitizeCode(req.body && req.body.code);
    if (!phone || !code) return res.status(400).json({ error: 'missing_fields' });
    const result = validateCode(smsCodes, phone, code);
    if (!result.ok) return res.status(400).json({ error: result.reason || 'invalid_code' });
    const normalized = toE164(phone);
    const session = issueSessionToken('sms', normalized, { phone: normalized });
    return res.json({ ok: true, token: session.token, expiresIn: session.expiresIn, profile: session.profile });
  } catch (err) {
    console.error('auth/sms/verify', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'server_error' });
  }
});

router.post('/google', async (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: 'google_config_missing' });
    }
    const idToken = req.body && (req.body.credential || req.body.idToken || req.body.token);
    if (!idToken) return res.status(400).json({ error: 'missing_token' });
    const profile = await verifyGoogleToken(idToken);
    const session = issueSessionToken('google', profile.id, {
      email: profile.email,
      name: profile.name,
      picture: profile.picture || null
    });
    return res.json({ ok: true, token: session.token, expiresIn: session.expiresIn, profile: session.profile });
  } catch (err) {
    console.error('auth/google', err && err.message ? err.message : err);
    return res.status(400).json({ error: err && err.message ? err.message : 'google_error' });
  }
});

router.get('/apple', (req, res) => {
  return res.status(501).json({ error: 'apple_login_placeholder', message: 'Apple login coming soon' });
});

router.post('/apple/callback', (req, res) => {
  return res.status(501).json({ error: 'apple_login_placeholder', message: 'Apple login coming soon' });
});

module.exports = router;
