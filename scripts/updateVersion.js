#!/usr/bin/env node
/**
 * Update version.json with stable version (from package.json) and a build timestamp.
 * Usage: node scripts/updateVersion.js
 * Optional: BUILD_DATE_OVERRIDE="2025-10-23 14:15" node scripts/updateVersion.js
 */
const fs = require('fs');
const path = require('path');

function pad(n){ return n < 10 ? '0' + n : '' + n; }
function nowStamp(){
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function main(){
  const root = path.join(__dirname, '..');
  const pkgPath = path.join(root, 'package.json');
  const outPath = path.join(root, 'version.json');

  let version = '0.0.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg && pkg.version) version = String(pkg.version);
  } catch (e) {
    // keep default
  }

  const build = (process.env.BUILD_DATE_OVERRIDE || '').trim() || nowStamp();
  const obj = { version, build };
  fs.writeFileSync(outPath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  console.log('version.json updated:', obj);
}

if (require.main === module) main();
