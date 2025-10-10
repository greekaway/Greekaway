#!/usr/bin/env bash
# Run stripe listen and write the STRIPE_WEBHOOK_SECRET to .env
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v stripe >/dev/null 2>&1; then
  echo "stripe CLI not found. Install via 'brew install stripe/stripe-cli/stripe' or from https://stripe.com/docs/stripe-cli"
  exit 1
fi

echo "Starting stripe listen... (you will be prompted to login if needed)"
echo "When stripe listen prints 'Webhook signing secret', copy the whsec_... value and press Enter to save it to .env"

stripe listen --print-secret | sed -n '1,200p'
echo
read -p "Paste the webhook signing secret (whsec_...): " SECRET
if [ -z "$SECRET" ]; then
  echo "No secret provided, aborting."; exit 1
fi

ENV_FILE=.env
if [ ! -f "$ENV_FILE" ]; then
  cp .env.example .env
fi

# replace or append STRIPE_WEBHOOK_SECRET in .env
if grep -q "^STRIPE_WEBHOOK_SECRET=" $ENV_FILE; then
  sed -i.bak "s/^STRIPE_WEBHOOK_SECRET=.*/STRIPE_WEBHOOK_SECRET=$SECRET/" $ENV_FILE
else
  echo "STRIPE_WEBHOOK_SECRET=$SECRET" >> $ENV_FILE
fi

echo "Wrote STRIPE_WEBHOOK_SECRET to $ENV_FILE (saved backup as .env.bak)"
