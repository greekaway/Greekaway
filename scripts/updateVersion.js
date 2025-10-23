#!/usr/bin/env node
/**
 * Update version.json with stable version (from package.json) and build metadata.
 * - version: taken from package.json (semantic, manual bump)
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

  let version = '0.0.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg && pkg.version) version = String(pkg.version);
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

  const build = (process.env.BUILD_DATE_OVERRIDE || '').trim() || gitCommitDate || nowStamp();
  const obj = { version, build };
  if (buildNumber != null) obj.buildNumber = buildNumber;
  if (commit) obj.commit = commit;
  fs.writeFileSync(outPath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  console.log('version.json updated:', obj);
}

if (require.main === module) main();
