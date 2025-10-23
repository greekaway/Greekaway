#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 not installed. Install with: npm i -g pm2"
  exit 1
fi
# Ensure version.json is generated with correct build metadata before starting
if command -v npm >/dev/null 2>&1; then
  echo "Generating build metadata (version.json)..."
  npm run --silent build:version || node scripts/updateVersion.js || true
fi
pm2 start server.js --name greekaway
pm2 save
echo "pm2 started app; use 'pm2 logs greekaway' to view logs"
