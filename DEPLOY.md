Deployment quick guide
======================

1) Prepare server
- Create a VM or use managed host. Ensure Node 18+ installed, pm2, nginx, certbot.

2) Clone repo
   git clone https://github.com/greekaway/Greekaway.git

3) Copy .env (do NOT commit). Fill in STRIPE keys, ADMIN_USER/PASS, DATABASE_URL

4) Start Postgres (managed or local). If local, use docker-compose.app.yml

5) Migrate data (if coming from SQLite)
   export DATABASE_URL=postgres://postgres:secret@localhost:5432/greekaway
   node tools/migrate_sqlite_to_postgres.js

6) Configure nginx with `deploy/nginx.example.conf` and obtain certs using certbot

7) Start the app with pm2
   npm ci --production
   pm2 start server.js --name greekaway
   pm2 save

8) Register webhook in Stripe dashboard to https://yourdomain.com/webhook and set STRIPE_WEBHOOK_SECRET in env
