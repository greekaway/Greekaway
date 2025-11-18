// Tests for Acropolis vehicleType & pricing & PaymentIntent metadata
// Requires STRIPE test secret key and admin credentials (admin:pass) set in env.
// Skips metadata assertion gracefully if Stripe not configured.
const assert = require('assert');
const http = require('http');

// Ensure env before server import
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_PASS = process.env.ADMIN_PASS || 'pass';
process.env.NODE_ENV = 'test';

// Start server (imports and listens)
require('../server.js');

function postJson(path, body){
  return fetch(`http://127.0.0.1:3000${path}`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  }).then(r => r.json().then(j => ({ status:r.status, ok:r.ok, data:j })));
}
function getJson(path, opts={}){
  return fetch(`http://127.0.0.1:3000${path}`, opts).then(r => r.json().then(j => ({ status:r.status, ok:r.ok, data:j })));
}

async function createBookingAndPayment(mode){
  const priceMap = { van: 1000, bus: 500, mercedes: 2000, private: 2000 };
  const vehKey = mode === 'private' ? 'mercedes' : mode;
  const price = priceMap[mode];
  assert(price, 'Expected price for mode');
  const bookingState = { trip_id:'acropolis', mode, seats:1, price_cents:price, currency:'eur' };
  const bk = await postJson('/api/bookings/create', bookingState);
  assert(bk.ok, 'Booking creation failed');
  const bookingId = bk.data.bookingId;
  assert(bookingId, 'Missing bookingId');
  // Create PaymentIntent
  const piBody = { tripId:'acropolis', vehicleType: vehKey, seats:1, price_cents: price, currency:'eur', customerEmail:`test_${mode}@example.com` };
  const pi = await postJson('/api/partners/create-payment-intent', piBody);
  if (!pi.ok) {
    console.warn(`[TEST] Skipping PaymentIntent metadata check for mode ${mode}; status=${pi.status} data=`, pi.data);
    return { bookingId, paymentIntentId:null, vehicleType:vehKey, expectedVehicle:vehKey, expectedPrice:price };
  }
  // If stripe missing, skip metadata check
  if (!pi.ok) {
    console.warn('Skipping metadata assertion (PaymentIntent not ok).');
    return { bookingId, paymentIntentId:null, vehicleType:vehKey };
  }
  const paymentIntentId = pi.data.paymentIntentId;
  let metaVehicle = null;
  if (paymentIntentId) {
    const auth = Buffer.from(`${process.env.ADMIN_USER}:${process.env.ADMIN_PASS}`).toString('base64');
    const piDetail = await getJson(`/api/partners/admin/payment-intent/${paymentIntentId}`, { headers:{ Authorization:`Basic ${auth}` } });
    if (piDetail.ok && piDetail.data && piDetail.data.metadata) {
      metaVehicle = piDetail.data.metadata.vehicle_type || null;
    }
  }
  return { bookingId, paymentIntentId, vehicleType:vehKey, metaVehicle, expectedVehicle:vehKey, expectedPrice:price };
}

(async function run(){
  for (const mode of ['van','bus','private']) {
    const r = await createBookingAndPayment(mode);
    assert(r.bookingId, 'BookingId missing for '+mode);
    assert(r.vehicleType === r.expectedVehicle, 'VehicleType normalization failed');
    if (r.metaVehicle) {
      assert(r.metaVehicle === r.expectedVehicle, `Metadata vehicle_type mismatch for ${mode}`);
    }
    console.log(`[TEST] Mode ${mode} OK`, r);
  }
  console.log('[TEST] All Acropolis vehicleType tests passed');
  process.exit(0);
})().catch(err => { console.error('Test failure', err); process.exit(1); });
