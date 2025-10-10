// webhook.js
// CommonJS module to attach Stripe webhook route to an existing express app
const express = require('express');

module.exports = function attachWebhook(app, stripe) {
  // raw body required to verify Stripe signature
  app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || null;

    let event = null;
    try {
      if (webhookSecret && stripe) {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } else {
        // dev fallback: parse body as JSON (unsigned)
        event = JSON.parse(req.body.toString('utf8'));
      }
    } catch (err) {
      console.error('Webhook signature verification failed.', err && err.message ? err.message : err);
      return res.status(400).send(`Webhook Error: ${err && err.message ? err.message : err}`);
    }

    // Handle the event types you care about
    switch (event.type) {
      case 'payment_intent.succeeded':
        console.log('Webhook: payment_intent.succeeded', event.data.object.id);
        // TODO: Mark booking as paid in DB
        break;
      case 'payment_intent.payment_failed':
        console.log('Webhook: payment_intent.payment_failed', event.data.object.id);
        break;
      default:
        console.log(`Webhook received event: ${event.type}`);
    }

    res.json({ received: true });
  });
};
