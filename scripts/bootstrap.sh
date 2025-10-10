#!/usr/bin/env bash
# Bootstrap script to help start docker compose, run migration and launch the app.
# Usage: bash scripts/bootstrap.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "Root: $ROOT_DIR"

cd "$ROOT_DIR"

command -v docker >/dev/null 2>&1 || { echo "Docker not found. Please install Docker Desktop for macOS and run this script again."; exit 1; }

echo "Building and starting app + postgres via docker-compose.app.yml..."
docker compose -f docker-compose.app.yml up -d --build

echo "Waiting for Postgres to be ready (attempts up to 30)..."
TRIES=0
until docker compose -f docker-compose.app.yml exec -T db pg_isready >/dev/null 2>&1 || [ $TRIES -ge 30 ]; do
  TRIES=$((TRIES+1))
  echo "  waiting ($TRIES)..."
  sleep 2
done
if [ $TRIES -ge 30 ]; then
  echo "Postgres didn't become ready in time; check docker logs: docker compose -f docker-compose.app.yml logs db";
  exit 1
fi

echo "Postgres is ready. Running migration script to copy SQLite -> Postgres..."
# set DATABASE_URL to the docker compose postgres
export DATABASE_URL=postgres://postgres:secret@localhost:5432/greekaway
node tools/migrate_sqlite_to_postgres.js || { echo "Migration script failed — check output"; }

echo "Migration finished. Start server (pm2 recommended)"
if command -v pm2 >/dev/null 2>&1; then
  pm2 start server.js --name greekaway || true
  pm2 save || true
  echo "Server started with pm2 (pm2 list)"
else
  echo "pm2 not found — starting in background with node"
  nohup node server.js > server.out 2>&1 &
  echo "Server started (pid $!) — tail server.out to view logs"
fi

echo "Bootstrap complete. Next: run 'stripe listen --forward-to localhost:3000/webhook' (see scripts/setup_stripe_webhook.sh) to obtain STRIPE_WEBHOOK_SECRET and add it to .env"
