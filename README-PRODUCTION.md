Production migration checklist (Greekaway)

Overview
--------
This checklist helps you migrate from the local dev setup (SQLite + local server) to a production deployment using PostgreSQL, S3 backups, and HTTPS.

1) Provision managed Postgres
- Choose provider: Supabase / Amazon RDS / DigitalOcean Managed DB / Heroku Postgres
- Create database and copy the connection URL (DATABASE_URL)

2) Local testing with docker-compose
- Start local Postgres for testing:
  docker-compose up -d
- Export your local SQLite data to Postgres: set DATABASE_URL to e.g. postgres://postgres:secret@localhost:5432/greekaway
  export DATABASE_URL=postgres://postgres:secret@localhost:5432/greekaway
  node tools/migrate_sqlite_to_postgres.js

3) Configure app env
- Set in production env variables: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET, DATABASE_URL, ADMIN_USER, ADMIN_PASS, S3_BUCKET (optional)

4) Backups
- Use managed provider backups (enable automated backups) AND upload an extra copy to S3 using tools/backup_db.sh
- Example AWS CLI upload (script already supports S3_BUCKET env var)

5) Webhooks
- Register https://yourdomain.com/webhook in Stripe dashboard and verify domain
- Add STRIPE_WEBHOOK_SECRET to production env (from stripe cli or dashboard)

6) Deploy
- Choose hosting (Render, Heroku, Railway, VPS + nginx)
- Ensure HTTPS with Let's Encrypt or provider certs

7) Monitoring
- Configure UptimeRobot for /health and Slack/email alerts for failures

8) Improvements
- Replace BasicAuth admin with stronger auth (OAuth or internal dashboard)
- Add migrations and CI/CD

