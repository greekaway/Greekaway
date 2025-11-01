# Partner Dispatch Integration + Provider Panel (MVP)

## .env flags

- DISPATCH_ENABLED=true|false (default false)
- MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_FROM
- JWT_SECRET (for provider JWT tokens)
- BASE_URL (used for links in emails)
- DEV_LOCAL_IP=10.10.100.90 (optional, for mobile testing)

In production, if DISPATCH_ENABLED=false, emails are not sent (logs only as pending).

## Migration

SQLite or Postgres supported.

- Create/alter tables:
  - partners: add password_hash (TEXT), panel_enabled (BOOLEAN/INTEGER), last_seen (TIMESTAMP/TEXT)
  - dispatch_log: (id, booking_id, partner_id, sent_at, sent_by, status, response_text, payload_json, retry_count, created_at)
  - Unique idempotency index on (booking_id, partner_id) for status='success'

Run:

```
npm run migrate:dispatch
```

## Mounts in server.js

Two lines only:

```
app.use('/provider', require('./routes/provider'));
app.use('/partner-dispatch', require('./routes/partner-dispatch'));
```

## Provider login (test)

Seed a test driver and booking:

```
node tools/seed_dispatch_test.js
```

Then on mobile LAN:

- http://10.10.100.90:3000/provider/login
- Email: set via TEST_DRIVER_EMAIL in env (defaults to driver@example.com)
- Pass: TestPass123

## Admin add-on

The admin bookings page now loads two small files:

- /public/admin-addons/admin-dispatch.css
- /public/admin-addons/admin-dispatch.js

They add a "Dispatch" column with status and a Resend button (calls POST /partner-dispatch/admin/resend). Admin Basic Auth is reused.

## Notes

- Auto-dispatch triggers when a booking becomes confirmed via Stripe webhook (webhook.js calls dispatchService.queue).
- Idempotent: existing success logs for (booking_id, partner_id) skip re-sending unless admin override.
- Retries: in-process backoff 0s, 60s, 300s, 900s up to 3 retries; persisted log status.
- Graceful fallback for missing pickup/dropoff info to 'N/A'.
