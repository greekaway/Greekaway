Stripe integration notes

To enable real Stripe payments locally:

1. Install dependency:
   npm install stripe

2. Add environment variables (example on macOS zsh):
   export STRIPE_SECRET_KEY="sk_test_..."
   export STRIPE_PUBLISHABLE_KEY="pk_test_..."

3. Start server:
   node server.js

4. Open checkout page and test.

Notes:
- The server injects the publishable key into `/checkout.html` when served.
- For testing you can use a small amount (e.g., 1000 = €10.00) in the client create-payment-intent request.
- Webhooks / production setup require HTTPS and secure key management; don't commit keys to git.
