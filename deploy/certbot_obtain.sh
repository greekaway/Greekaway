#!/usr/bin/env bash
set -euo pipefail
DOMAIN=${1:-yourdomain.example}
if [ "$DOMAIN" = "yourdomain.example" ]; then
  echo "Usage: $0 yourdomain.example"; exit 1;
fi

echo "Install certbot on your server and ensure nginx config has a site with root /var/www/certbot for ACME challenges."
echo "Then run:"
echo "sudo certbot certonly --webroot -w /var/www/certbot -d $DOMAIN"
echo "After obtaining certs, configure nginx to use /etc/letsencrypt/live/$DOMAIN/fullchain.pem and privkey.pem"
