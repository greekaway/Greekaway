#!/usr/bin/env node
/**
 * Update version.json with stable version and build metadata.
 * - version: major.minor from package.json + buildNumber as patch (auto-increments with every deploy)
 *   e.g. package.json "2.0.0" + 703 git commits → output "2.0.703"
 * - build: timestamp of the deployment/build (prefer last git commit time; fallback to now or BUILD_DATE_OVERRIDE)
 * - buildNumber: monotonically increasing number when git is available (rev-list --count HEAD)
 * - commit: short git commit hash when available
 *
 * Usage: node scripts/updateVersion.js
 * Optional: BUILD_DATE_OVERRIDE="2025-10-23 14:15" node scripts/updateVersion.js
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function pad(n){ return n < 10 ? '0' + n : '' + n; }
function nowStamp(){
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function main(){
  const root = path.join(__dirname, '..');
  const pkgPath = path.join(root, 'package.json');
  const outPath = path.join(root, 'version.json');

  let pkgVersion = '0.0.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg && pkg.version) pkgVersion = String(pkg.version);
  } catch (e) {
    // keep default
  }

  // Try to collect git metadata (safe to ignore failures in prod where .git may not exist)
  let commit = null;
  let buildNumber = null;
  let gitCommitDate = null;
  try {
    commit = cp.execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore','pipe','ignore'] }).toString().trim();
  } catch(_) {}
  try {
    const cnt = cp.execSync('git rev-list --count HEAD', { cwd: root, stdio: ['ignore','pipe','ignore'] }).toString().trim();
    if (cnt) buildNumber = parseInt(cnt, 10);
  } catch(_) {}
  try {
    // ISO 8601 of last commit
    const iso = cp.execSync('git log -1 --format=%cI', { cwd: root, stdio: ['ignore','pipe','ignore'] }).toString().trim();
    if (iso) {
      const d = new Date(iso);
      if (!isNaN(d.getTime())) gitCommitDate = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  } catch(_) {}

  // Auto-version: take major.minor from package.json and use buildNumber as patch
  // e.g. "2.0.0" + buildNumber 703 → "2.0.703"
  const parts = pkgVersion.split('.');
  const major = parts[0] || '0';
  const minor = parts[1] || '0';
  const patch = buildNumber != null ? buildNumber : (parts[2] || '0');
  const version = `${major}.${minor}.${patch}`;

  const build = (process.env.BUILD_DATE_OVERRIDE || '').trim() || gitCommitDate || nowStamp();
  const obj = { version, build };
  if (buildNumber != null) obj.buildNumber = buildNumber;
  if (commit) obj.commit = commit;
  fs.writeFileSync(outPath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  console.log('version.json updated:', obj);
}

if (require.main === module) main();
