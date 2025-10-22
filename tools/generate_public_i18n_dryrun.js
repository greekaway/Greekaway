#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')
const localesDir = path.join(repoRoot, 'locales')
const dryrunOutDir = path.join(repoRoot, 'tools', 'public_i18n_dryrun')
const publicOutDir = path.join(repoRoot, 'public', 'i18n')

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')

if (!fs.existsSync(dryrunOutDir)) fs.mkdirSync(dryrunOutDir, { recursive: true })
if (APPLY && !fs.existsSync(publicOutDir)) fs.mkdirSync(publicOutDir, { recursive: true })

function listJsonFiles(dir) {
  try { return fs.readdirSync(dir).filter(f => f.endsWith('.json')) } catch (e) { return [] }
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { return null }
}

function copyFile(src, dst) {
  fs.copyFileSync(src, dst)
}

const files = listJsonFiles(localesDir)
const summary = []

let backupDir = null
if (APPLY) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  backupDir = path.join(repoRoot, 'tools', `public_i18n_backup_${ts}`)
  fs.mkdirSync(backupDir, { recursive: true })
  // backup existing public files if present
  const existing = listJsonFiles(publicOutDir)
  for (const f of existing) {
    try {
      copyFile(path.join(publicOutDir, f), path.join(backupDir, f))
    } catch (e) {
      // ignore
    }
  }
}

for (const f of files) {
  const lang = path.basename(f, '.json')
  const src = path.join(localesDir, f)
  const data = readJson(src)
  if (!data) { summary.push({ lang, status: 'error_reading' }); continue }

  // write dry-run copy
  const dryOutPath = path.join(dryrunOutDir, `${lang}.json`)
  fs.writeFileSync(dryOutPath, JSON.stringify(data, null, 2), 'utf8')

  // if apply, write to public/i18n/<lang>.json (overwrite)
  let publicOutPath = null
  if (APPLY) {
    publicOutPath = path.join(publicOutDir, `${lang}.json`)
    fs.writeFileSync(publicOutPath, JSON.stringify(data, null, 2), 'utf8')
  }

  summary.push({ lang, src, dryOutPath, publicOutPath, topLevelKeys: Object.keys(data).length })
}

const report = { generatedAt: new Date().toISOString(), applied: APPLY, backupDir, items: summary }
const reportPathDry = path.join(dryrunOutDir, 'summary.json')
fs.writeFileSync(reportPathDry, JSON.stringify(report, null, 2), 'utf8')
console.log('dry-run bundles written to', dryrunOutDir)
console.log('summary written to', reportPathDry)
if (APPLY) {
  const reportPathPublic = path.join(publicOutDir, 'summary_apply.json')
  fs.writeFileSync(reportPathPublic, JSON.stringify(report, null, 2), 'utf8')
  console.log('APPLY mode: wrote files to', publicOutDir)
  console.log('Backed up existing public files to', backupDir)
  console.log('public summary written to', reportPathPublic)
}
