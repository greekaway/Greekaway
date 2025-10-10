const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

// Read Maps API key from environment. If not provided, the placeholder remains.
const MAP_KEY = process.env.GOOGLE_MAPS_API_KEY || 'YOUR_GOOGLE_MAPS_API_KEY';
// Stripe secret key from environment (do not commit real keys)
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || null;
let stripe = null;
if (STRIPE_SECRET) {
  try { stripe = require('stripe')(STRIPE_SECRET); } catch(e) { console.warn('Stripe not initialized (install package?)'); }
}

// Serve /trips/trip.html with the API key injected from environment.
// This route is placed before the static middleware so it takes precedence
// over the on-disk file and avoids writing the key into committed files.
app.get('/trips/trip.html', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'trips', 'trip.html');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error reading trip.html');
    // Replace the placeholder key in the Google Maps script URL.
    const replaced = data.replace('key=YOUR_GOOGLE_MAPS_API_KEY', `key=${encodeURIComponent(MAP_KEY)}`);
    res.send(replaced);
  });
});

// Serve checkout.html and inject Stripe publishable key placeholder
app.get('/checkout.html', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'checkout.html');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error reading checkout.html');
    const pub = process.env.STRIPE_PUBLISHABLE_KEY || '%STRIPE_PUBLISHABLE_KEY%';
    const replaced = data.replace('%STRIPE_PUBLISHABLE_KEY%', pub);
    res.send(replaced);
  });
});

// 1️⃣ Σερβίρουμε στατικά αρχεία από το /public
app.use(express.static(path.join(__dirname, "public")));

// Mock checkout endpoint (POST) — simulates a payment processor response
app.post('/mock-checkout', express.urlencoded({ extended: true }), (req, res) => {
  try {
    const { name, email, card } = req.body || {};
    // Simple mock: if card contains '4242' succeed, otherwise fail
    if (card && card.indexOf('4242') !== -1) {
      return res.json({ success: true, message: `Mock payment successful for ${name || 'customer'}` });
    }
    return res.json({ success: false, message: 'Mock payment failed — invalid card.' });
  } catch (err) {
    console.error('Error in /mock-checkout:', err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, message: 'Server error during mock checkout.' });
  }
});

// Create a PaymentIntent via Stripe (expects JSON body {amount, currency})
app.post('/create-payment-intent', express.json(), async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured on server.' });
  try {
    const { amount, currency } = req.body;
    // basic validation
    const amt = parseInt(amount, 10) || 0;
    if (amt <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amt,
      currency: currency || 'eur',
      automatic_payment_methods: { enabled: true },
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Stripe create payment intent error:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// Global error handlers to prevent process exit on unexpected errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
});

process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason && reason.stack ? reason.stack : reason);
});

// 2️⃣ Επιστρέφει όλες τις εκδρομές από trip.json
app.get("/api/trips", (req, res) => {
  fs.readFile(path.join(__dirname, "trip.json"), "utf8", (err, data) => {
    if (err) {
      console.error("Σφάλμα ανάγνωσης trip.json:", err);
      res.status(500).json({ error: "Δεν μπορέσαμε να διαβάσουμε τα δεδομένα." });
    } else {
      res.json(JSON.parse(data));
    }
  });
});

// 3️⃣ Όταν ο χρήστης πάει στο "/", να του δείχνει το index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 4️⃣ Εκκίνηση server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});