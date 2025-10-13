Payment Request (Apple Pay / Google Pay) integration

What I added
- `public/.well-known/apple-developer-merchantid-domain-association` (placeholder): Replace this file with the exact file Stripe provides when you verify a domain for Apple Pay.
- `public/js/payment-request.js`: A small helper to initialize the Stripe Payment Request flow.
- `public/checkout.html`: Updated to use the payment request helper and mount the Payment Request Button when available.

Server
- `/create-payment-intent` already exists in `server.js`. It expects JSON { amount, currency } and returns { clientSecret } when Stripe is configured.
- Ensure `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` are set in Render.

Testing locally with Stripe CLI
1. Start the app locally:

```bash
# from project root
node server.js
```

2. Forward events and test payments (this also provides a signing secret if you need to test webhooks):

```bash
stripe listen --forward-to localhost:3000/webhook
stripe trigger payment_intent.succeeded
```

3. Test the Payment Request UI from a device/browser that supports it:
- For Apple Pay: test from iOS Safari on a device with Apple Pay configured and use HTTPS (either deploy to Render or use a tunneling tool like ngrok).
- For Google Pay: test on Android Chrome.

Notes and next steps
- The `apple-developer-merchantid-domain-association` file must match exactly the file you download from Stripe. Replace the placeholder with the real file's raw bytes and redeploy to Render.
- After replacing the file, go to Stripe Dashboard > Settings > Payment methods > Apple Pay and click Verify for the domain.
- If you want, I can:
  - Replace the static amount (1000 cents) with a dynamic amount from the user's chosen trip/checkout details.
  - Add server-side idempotency and a small DB-backed Payments store if you prefer not to use `payments.json`.

Security
- Do not commit your Stripe secret keys. Use Render's environment settings for `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`.
