#!/usr/bin/env bash
# Robust report generator for macOS/BSD utils; avoids fragile quoting and SIGPIPE exits
set -u
cd "$(dirname "$0")/.."
mkdir -p reports
log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) - $*" | tee -a reports/run-log.txt >/dev/null; }
log "Starting reports generation"

# a) Largest by bytes (text)
log "Generating largest-by-bytes.txt"
find . \( -path ./node_modules -o -path ./.git -o -path ./dist -o -path ./build \) -prune -o -type f -print0 \
  | xargs -0 stat -f '%z %N' 2>/dev/null \
  | sort -rn | head -n 100 > reports/largest-by-bytes.txt || true

# b) Largest by lines (tracked only)
log "Generating largest-by-lines.txt"
{
  git ls-files -z \
    | while IFS= read -r -d '' f; do
        wc -l "$f" 2>/dev/null || true;
      done \
    | sort -rn | head -n 100 > reports/largest-by-lines.txt
} || true

# c) Largest by extension (selected types)
log "Generating largest-by-ext.txt"
{
  git ls-files -z \
    | while IFS= read -r -d '' f; do
        case "$f" in
          *.js|*.ts|*.jsx|*.tsx|*.css|*.scss|*.html|*.py|*.go|*.java|*.json|*.md)
            sz=$(wc -c < "$f" 2>/dev/null || echo 0)
            printf "%s\t%s\n" "$f" "$sz";
            ;;
        esac
      done \
    | sort -k2 -rn | head -n 200 > reports/largest-by-ext.txt
} || true

# d1) CSV: size bytes,path
log "Generating largest-by-bytes.csv"
find . \( -path ./node_modules -o -path ./.git -o -path ./dist -o -path ./build \) -prune -o -type f -print0 \
  | xargs -0 stat -f '%z,%N' 2>/dev/null \
  | sort -rn | head -n 200 > reports/largest-by-bytes.csv || true

# d2) CSV: lines,path (tracked only)
log "Generating largest-by-lines.csv"
{
  git ls-files -z \
    | while IFS= read -r -d '' f; do
        c=$(wc -l < "$f" 2>/dev/null || echo 0)
        printf "%s,%s\n" "$c" "$f";
      done \
    | sort -rn | head -n 200 > reports/largest-by-lines.csv
} || true

log "Reports generated successfully"
