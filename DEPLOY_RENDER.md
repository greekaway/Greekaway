Deploying to Render + Stripe webhook setup
=========================================

This guide shows the minimum steps to deploy the Node app to Render and configure Stripe webhooks correctly.

1) Prepare the repo
- Ensure `.env` is NOT committed. Use Render environment variables for secrets: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_USER`, `ADMIN_PASS`, `DATABASE_URL` (if using DB).

2) Render service
- Create a new Web Service on Render. Use the `Node` environment and set the build command to `npm ci` and the start command to `node server.js`.
- Set Environment variables on the Render dashboard (the publishable & secret keys, admin creds).
- Add `UPLOADS_BASE_URL=https://greekaway.com` so that server-generated media links are absolute.
- Attach a persistent disk named **uploads** (>=5GB) mounted at `/opt/render/project/src/uploads`. This keeps `/uploads/**` across deployments. If the service already exists, add the disk via **Settings → Disks → Add Disk**.
- (One-time) SSH into the service or use the Render shell, create subfolders `uploads/trips`, `uploads/icons`, `uploads/categories`, and copy any legacy files from `public/uploads/` into the new mount.

3) Webhooks on Stripe
- In Stripe dashboard, add a webhook endpoint: `https://<your-render-app>.onrender.com/webhook`.
- Use the signing secret shown by Stripe for the webhook and set `STRIPE_WEBHOOK_SECRET` in Render environment variables.

4) Payment Request (Apple/Google Pay) notes
- Payment Request (Apple/Google Pay) requires HTTPS and a verified domain. Render provides HTTPS for the `onrender.com` domain. For Apple Pay domain verification you may need to place a verification file in `public/.well-known/` and serve it over HTTPS. See Stripe docs for domain association files.

5) Health check
- Add a health check (Render has health check config) pointing to `/` or `/health`.

6) Logs & monitoring
- Use Render logs and keep `webhook.log` or optionally push logs to an external service for production auditing.

7) Local testing
- Use `stripe listen --forward-to https://<your-render-app>.onrender.com/webhook` to test remote webhook forwarding to your deployed app.
