#!/usr/bin/env bash
set -euo pipefail

# Simple backup script for data/db.sqlite3 and webhook.log
# Usage: tools/backup_db.sh [BACKUP_DIR] [RETENTION_DAYS]

BACKUP_DIR=${1:-"$HOME/greekaway_backups"}
RETENTION_DAYS=${2:-7}

mkdir -p "$BACKUP_DIR"

TS=$(date -u +%Y%m%dT%H%M%SZ)

DB_SRC="$(pwd)/data/db.sqlite3"
LOG_SRC="$(pwd)/webhook.log"

if [ -f "$DB_SRC" ]; then
  cp "$DB_SRC" "$BACKUP_DIR/db.sqlite3.$TS"
  gzip -f "$BACKUP_DIR/db.sqlite3.$TS"
fi

if [ -f "$LOG_SRC" ]; then
  cp "$LOG_SRC" "$BACKUP_DIR/webhook.log.$TS"
  gzip -f "$BACKUP_DIR/webhook.log.$TS"
fi

# optional: upload to s3 if S3_BUCKET env var present
if [ -n "${S3_BUCKET:-}" ]; then
  if command -v aws >/dev/null 2>&1; then
    echo "Uploading backups to s3://${S3_BUCKET}/... via aws CLI"
    aws s3 cp "$BACKUP_DIR/db.sqlite3.$TS.gz" "s3://${S3_BUCKET}/" || true
    aws s3 cp "$BACKUP_DIR/webhook.log.$TS.gz" "s3://${S3_BUCKET}/" || true
  else
    # fallback to Node uploader using AWS SDK (requires AWS creds in env or credentials file)
    if node -e "process.exit(0)" 2>/dev/null; then
      echo "aws CLI not found; attempting node uploader"
      node "$(pwd)/tools/upload_to_s3.js" "$S3_BUCKET" "$BACKUP_DIR/db.sqlite3.$TS.gz" "$BACKUP_DIR/webhook.log.$TS.gz" || echo "node uploader failed"
    else
      echo "No aws CLI and no node available; skipping S3 upload"
    fi
  fi
fi

# rotate
find "$BACKUP_DIR" -type f -mtime +${RETENTION_DAYS} -delete

echo "Backup completed to $BACKUP_DIR (retention $RETENTION_DAYS days)"
