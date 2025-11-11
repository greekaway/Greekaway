'use strict';
const fs = require('fs');

function readVersionFile(versionFilePath) {
  try {
    const raw = fs.readFileSync(versionFilePath, 'utf8');
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') return obj;
  } catch (_) {}
  return null;
}

function formatBuild(ts) {
  try {
    const d = ts instanceof Date ? ts : new Date(ts);
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch(_) { return null; }
}

module.exports = { readVersionFile, formatBuild };
