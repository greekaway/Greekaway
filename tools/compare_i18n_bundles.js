#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (e) {
    // return null but keep process running so we can report missing files
    return null
  }
}

function flatten(obj, prefix = '') {
  const res = {}
  for (const k of Object.keys(obj || {})) {
    const v = obj[k]
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(res, flatten(v, key))
    } else {
      res[key] = v
    }
  }
  return res
}

const repoRoot = path.resolve(__dirname, '..')
const localesDir = path.join(repoRoot, 'locales')
const publicDir = path.join(repoRoot, 'public', 'i18n')

function listJsonFiles(dir) {
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.json'))
  } catch (e) {
    return []
  }
}

const localesFiles = listJsonFiles(localesDir)
const publicFiles = listJsonFiles(publicDir)

// derive language codes
const localesLangs = localesFiles.map(f => path.basename(f, '.json'))
const publicLangs = publicFiles.map(f => path.basename(f, '.json'))

const allLangs = Array.from(new Set([...localesLangs, ...publicLangs])).sort()

const results = {}

for (const lang of allLangs) {
  const localesPath = path.join(localesDir, `${lang}.json`)
  const publicPath = path.join(publicDir, `${lang}.json`)
  const a = readJson(localesPath)
  const b = readJson(publicPath)
  const fa = a ? flatten(a) : {}
  const fb = b ? flatten(b) : {}

  const missingInPublic = []
  const missingInLocales = []
  const diffValues = []

  for (const k of Object.keys(fa)) {
    if (!(k in fb)) missingInPublic.push(k)
    else if (String(fa[k]) !== String(fb[k])) diffValues.push({ key: k, locales: fa[k], public: fb[k] })
  }
  for (const k of Object.keys(fb)) if (!(k in fa)) missingInLocales.push(k)

  results[lang] = {
    localesPath: a ? localesPath : null,
    publicPath: b ? publicPath : null,
    counts: { localesKeys: Object.keys(fa).length, publicKeys: Object.keys(fb).length },
    missingInPublic,
    missingInLocales,
    diffValues
  }
}

const summary = { generatedAt: new Date().toISOString(), langs: allLangs, counts: { localesFiles: localesFiles.length, publicFiles: publicFiles.length } }
const outReport = { summary, results }

const out = path.join(repoRoot, 'tools', 'compare_i18n_report_all.json')
fs.writeFileSync(out, JSON.stringify(outReport, null, 2), 'utf8')
console.log('report written to', out)
