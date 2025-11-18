// Test fixed-price logic for mercedes/private on Acropolis.
// Ensures serverComputedCents = 2000 regardless of seats.
process.env.NODE_ENV = 'test';
process.env.ALLOW_LIVE_STRIPE_IN_DEV = '1'; // allow PI if live key present
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_PASS = process.env.ADMIN_PASS || 'pass';

require('../server.js');
const assert = require('assert');

function postJson(path, body){
  return fetch(`http://127.0.0.1:3000${path}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
  }).then(r => r.json().then(j => ({ ok:r.ok, status:r.status, data:j })));
}
function getJson(path, opts={}){
  return fetch(`http://127.0.0.1:3000${path}`, opts).then(r => r.json().then(j => ({ ok:r.ok, status:r.status, data:j })));
}

async function scenario(seats){
  const price_cents = 2000; // client submitted fixed price
  const piReq = { tripId:'acropolis', vehicleType:'mercedes', seats, price_cents, currency:'eur', customerEmail:`m_${seats}@example.com` };
  const diagAuth = Buffer.from(`${process.env.ADMIN_USER}:${process.env.ADMIN_PASS}`).toString('base64');
  // Diagnose endpoint first (does not create PI)
  const auth = Buffer.from(`${process.env.ADMIN_USER}:${process.env.ADMIN_PASS}`).toString('base64');
  const diagResp = await fetch('http://127.0.0.1:3000/api/partners/admin/payment-diagnose', {
    method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Basic ${auth}` }, body: JSON.stringify({ tripId:'acropolis', vehicleType:'mercedes', seats, price_cents, currency:'eur' })
  });
  const diag = await diagResp.json().catch(()=>({}));
  assert(diagResp.ok, 'Diagnose failed');
  const serverComputed = diag.server_computed_price_cents;
  const finalAmount = diag.final_amount_cents;
  assert(serverComputed === 2000, `Expected serverComputed 2000 got ${serverComputed}`);
  assert(finalAmount === 2000, `Expected finalAmount 2000 got ${finalAmount}`);
  // Create PaymentIntent to verify amount (may require test or allowed live key)
  const pi = await postJson('/api/partners/create-payment-intent', piReq);
  if (!pi.ok) {
    console.warn('[TEST] Skipping PI amount assertion seats', seats, pi.data);
    return { seats, serverComputed, finalAmount, paymentIntentAmount:null };
  }
  const paymentIntentId = pi.data.paymentIntentId;
  let paymentIntentAmount = null;
  if (paymentIntentId) {
    const detail = await getJson(`/api/partners/admin/payment-intent/${paymentIntentId}`, { headers:{ Authorization:`Basic ${diagAuth}` } });
    if (detail.ok) paymentIntentAmount = detail.data && detail.data.amount || null;
  }
  return { seats, serverComputed, finalAmount, paymentIntentAmount };
}

(async()=>{
  const results = [];
  for (const s of [1,2,3]) results.push(await scenario(s));
  results.forEach(r => {
    console.log('[TEST:mercedes]', r);
    if (r.paymentIntentAmount != null) assert(r.paymentIntentAmount === 2000, 'PI amount mismatch '+r.paymentIntentAmount);
  });
  console.log('[TEST] Mercedes fixed-price scenarios passed');
  process.exit(0);
})().catch(err => { console.error('Test failure', err); process.exit(1); });
