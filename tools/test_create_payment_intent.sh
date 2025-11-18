#!/usr/bin/env bash
# Simple diagnostic script for /api/partners/create-payment-intent
# Usage:
#   STRIPE_SECRET_KEY=sk_test_xxx bash tools/test_create_payment_intent.sh 1000 eur acropolis van 2
# Amount in cents, currency, tripId, vehicleType, seats
set -euo pipefail
AMOUNT_CENTS=${1:-1000}
CURRENCY=${2:-eur}
TRIP_ID=${3:-acropolis}
VEH_TYPE=${4:-van}
SEATS=${5:-2}
HOST=${HOST:-127.0.0.1}
PORT=${PORT:-3000}
JSON_BODY=$(jq -n --argjson a "$AMOUNT_CENTS" --arg c "$CURRENCY" --arg t "$TRIP_ID" --arg v "$VEH_TYPE" --argjson s "$SEATS" '{price_cents:$a,currency:$c,tripId:$t,vehicleType:$v,seats:$s}')
echo "Request body: $JSON_BODY"
curl -s -D /tmp/headers.out -H 'Content-Type: application/json' -X POST \
  "http://$HOST:$PORT/api/partners/create-payment-intent" \
  -d "$JSON_BODY" | jq .
echo "--- Response headers ---"; sed -n '1,20p' /tmp/headers.out
