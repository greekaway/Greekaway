#!/usr/bin/env node
/*
  File Guard: prevents accidental duplicate files.
  Usage examples:
    node tools/file_guard.js --path public/js/manual-payments.js
    node tools/file_guard.js --name manual-payments.js
    node tools/file_guard.js --like manual-payments

  Behavior:
    - Searches the repository for exact path and basename matches
    - If reports/repo-inventory.json exists, uses it to find similar items
    - Prints guidance based on repo-functional-map.md categories
*/
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { like: null, name: null, path: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--like' && v) { args.like = v; i++; }
    else if (a === '--name' && v) { args.name = v; i++; }
    else if (a === '--path' && v) { args.path = v; i++; }
  }
  return args;
}

function walk(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name === '.git' || ent.name === 'node_modules') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full));
    else if (ent.isFile()) out.push(full);
  }
  return out;
}

function loadInventory() {
  const p = path.join(repoRoot, 'reports', 'repo-inventory.json');
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  }
  return null;
}

function loadFunctionalMap() {
  const p = path.join(repoRoot, 'repo-functional-map.md');
  if (fs.existsSync(p)) {
    try { return fs.readFileSync(p, 'utf8'); } catch {}
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.name && !args.path && !args.like) {
    console.log('Usage:');
    console.log('  node tools/file_guard.js --path <path>');
    console.log('  node tools/file_guard.js --name <basename>');
    console.log('  node tools/file_guard.js --like <substring>');
    process.exit(0);
  }

  const allFiles = walk(repoRoot).map(f => path.relative(repoRoot, f).replace(/\\/g, '/'));
  const results = { exactPath: [], sameName: [], similar: [] };

  if (args.path) {
    const rel = args.path.replace(/^\/+/, '');
    if (allFiles.includes(rel)) results.exactPath.push(rel);
  }
  const targetName = args.name || (args.path ? path.basename(args.path) : null);
  if (targetName) {
    for (const f of allFiles) if (path.basename(f) === targetName) results.sameName.push(f);
  }
  const like = args.like || (targetName ? targetName.replace(/\.[^.]+$/, '') : null);
  if (like) {
    const likeLc = like.toLowerCase();
    for (const f of allFiles) if (f.toLowerCase().includes(likeLc)) results.similar.push(f);
  }

  const inventory = loadInventory();
  const functionalMap = loadFunctionalMap();

  const out = { query: args, results, suggestions: [] };

  // Suggestions based on categories
  function suggestCategory(keyword, folder) {
    if (like && keyword && like.toLowerCase().includes(keyword)) {
      out.suggestions.push(`Consider placing under ${folder}`);
    }
  }
  suggestCategory('route', 'routes/');
  suggestCategory('provider', 'public/provider/');
  suggestCategory('driver', 'public/driver/');
  suggestCategory('admin', 'public/js/ or public/admin*/');
  suggestCategory('payment', 'public/js/ or services/ or routes/');

  // Inventory duplicates by basename
  if (inventory && targetName) {
    const items = inventory.items || [];
    const dupe = items.filter(it => path.basename(it.path) === targetName).map(it => it.path);
    if (dupe.length) out.results.sameName = Array.from(new Set(out.results.sameName.concat(dupe)));
  }

  // Functional map clueing
  if (functionalMap && (targetName || like)) {
    const needle = (targetName || like).toLowerCase();
    const lines = functionalMap.split(/\r?\n/).filter(l => l.toLowerCase().includes(needle));
    if (lines.length) out.suggestions.push('Matches in repo-functional-map.md:\n' + lines.slice(0, 10).join('\n'));
  }

  const hasConflict = (out.results.exactPath.length + out.results.sameName.length) > 0;
  console.log('--- File Guard Report ---');
  console.log(JSON.stringify(out, null, 2));
  if (hasConflict) {
    console.log('\nDecision: DO NOT create a new file. Prefer editing one of the above.');
    process.exit(2);
  } else {
    console.log('\nDecision: No conflicts detected. Safe to create if needed.');
  }
}

main();
