#!/usr/bin/env node
/*
Quick verification script for /api/bookings and /api/assistant JSON behavior.
Sends: valid booking, malformed booking, valid assistant, malformed assistant.
Prints status, content-type and body (trimmed).
*/

const fetch = global.fetch || require('node-fetch');

const BASE = process.env.BASE || 'http://127.0.0.1:3101';

async function post(path, body, label){
  const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body };
  try {
    const res = await fetch(BASE + path, opts);
    const ct = res.headers.get('content-type');
    const text = await res.text();
    console.log(`\n[${label}] status=${res.status} ct=${ct}`);
    console.log(text.slice(0, 300));
  } catch (e) {
    console.log(`\n[${label}] ERROR`, e.message);
  }
}

async function main(){
  const validBooking = JSON.stringify({ user_name: 'Verifier', user_email: 'verifier@example.com', trip_id: 'santorini', seats: 1, price_cents: 0, currency: 'eur' });
  await post('/api/bookings', validBooking, 'booking:valid');
  await post('/api/bookings', '{bad json', 'booking:malformed');
  const validAssistant = JSON.stringify({ message: 'Tell me about Santorini', lang: 'en' });
  await post('/api/assistant', validAssistant, 'assistant:valid');
  await post('/api/assistant', '{bad json', 'assistant:malformed');
}

main();
