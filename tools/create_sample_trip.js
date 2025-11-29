#!/usr/bin/env node
/**
 * create_sample_trip.js
 * Helper script to quickly seed a sample trip with a cover + icon for visual verification.
 *
 * Usage:
 *   ADMIN_USER=admin ADMIN_PASS=pass node tools/create_sample_trip.js
 *   (or set env vars in your shell beforehand)
 *
 * Steps:
 * 1. Upload a tiny SVG icon (generated inline) via /api/admin/upload (folder=trips/icons)
 * 2. Upload a tiny PNG cover image (generated in-memory) via /api/admin/upload (folder=trips/sample/featured)
 * 3. POST /api/admin/trips to create/update the trip JSON with iconPath + coverImage.
 * 4. Print public URL to view (trip list via category and direct trip detail).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT || 3101; // matches dev server output
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'pass';
const RAW_UPLOADS_BASE = (process.env.UPLOADS_BASE_URL || process.env.PUBLIC_BASE_URL || 'https://greekaway.com');
const UPLOADS_BASE = String(RAW_UPLOADS_BASE || '').replace(/\/+$/, '') || 'https://greekaway.com';

function buildTripUploadsUrl(filename){
  if (!filename) return '';
  const clean = String(filename).replace(/^\/+/, '');
  if (clean.startsWith('uploads/')) return `${UPLOADS_BASE}/${clean}`;
  return `${UPLOADS_BASE}/uploads/trips/${clean}`;
}

function basicAuthHeader(){
  return 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64');
}

function postMultipart(endpoint, fields){
  return new Promise((resolve, reject) => {
    const boundary = '----gwTripUpload' + Date.now();
    let body = '';
    for (const f of fields) {
      if (f.type === 'file') {
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="${f.name}"; filename="${f.filename}"\r\n`;
        body += `Content-Type: ${f.contentType || 'application/octet-stream'}\r\n\r\n`;
        body += f.content + '\r\n';
      } else {
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="${f.name}"\r\n\r\n${f.value}\r\n`;
      }
    }
    body += `--${boundary}--\r\n`;
    const opts = {
      hostname: HOST,
      port: PORT,
      path: endpoint,
      method: 'POST',
      headers: {
        'Authorization': basicAuthHeader(),
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = http.request(opts, res => {
      let chunks = '';
      res.on('data', d => chunks += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(chunks || '{}') }); }
        catch(e){ resolve({ status: res.statusCode, text: chunks }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function postJson(endpoint, data){
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const opts = {
      hostname: HOST,
      port: PORT,
      path: endpoint,
      method: 'POST',
      headers: {
        'Authorization': basicAuthHeader(),
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const req = http.request(opts, res => {
      let chunks = '';
      res.on('data', d => chunks += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(chunks || '{}') }); }
        catch(e){ resolve({ status: res.statusCode, text: chunks }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

(async () => {
  try {
    console.log('> Uploading sample trip icon...');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#1e5179"/><text x="32" y="38" font-size="20" text-anchor="middle" fill="#fff">T</text></svg>';
    const iconResp = await postMultipart('/api/admin/upload', [
      { type:'text', name:'folder', value:'trips/icons' },
      { type:'file', name:'file', filename:'sample-icon.svg', contentType:'image/svg+xml', content: svg }
    ]);
    if (iconResp.status !== 200 || !iconResp.json || !iconResp.json.success) {
      console.error('Icon upload failed', iconResp);
      return process.exit(1);
    }
    const iconRelative = iconResp.json.filename || '';
    const iconAbsolute = iconResp.json.absoluteUrl || buildTripUploadsUrl(iconRelative);
    console.log('> Icon uploaded:', iconAbsolute || iconRelative);

    console.log('> Uploading sample cover image...');
    // Tiny 1x1 PNG (transparent) base64
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
    const coverResp = await postMultipart('/api/admin/upload', [
      { type:'text', name:'folder', value:'trips/sample/featured' },
      { type:'file', name:'file', filename:'sample-cover.png', contentType:'image/png', content: Buffer.from(pngBase64,'base64') }
    ]);
    if (coverResp.status !== 200 || !coverResp.json || !coverResp.json.success) {
      console.error('Cover upload failed', coverResp);
      return process.exit(1);
    }
    const coverRelative = coverResp.json.filename || '';
    const coverAbsolute = coverResp.json.absoluteUrl || buildTripUploadsUrl(coverRelative);
    console.log('> Cover uploaded:', coverAbsolute || coverRelative);

    console.log('> Creating / updating sample trip...');
    const tripPayload = {
      title: 'Ακρόπολη – Premium Van Tour',
      slug: 'akropoli-premium-van-tour',
      description: 'Δείγμα εκδρομής για επαλήθευση cover & icon.',
      category: 'politismos',
      duration: '4 ώρες',
      stops: ['Ακρόπολη','Μουσείο','Πλάκα'],
      coverImage: coverRelative,
      iconPath: iconRelative
    };
    const tripResp = await postJson('/api/admin/trips', tripPayload);
    if (tripResp.status !== 200 || !tripResp.json || !tripResp.json.ok) {
      console.error('Trip save failed', tripResp);
      return process.exit(1);
    }
    console.log('> Trip saved. Slug:', tripResp.json.trip.slug);
    console.log('\nVerification URLs:');
    console.log(` - Category listing: http://${HOST}:${PORT}/category.html?slug=politismos`);
    console.log(` - Trip detail: http://${HOST}:${PORT}/trip.html?trip=${tripResp.json.trip.slug}`);
    console.log('\nDone.');
  } catch (e) {
    console.error('Script error:', e);
    process.exit(1);
  }
})();
