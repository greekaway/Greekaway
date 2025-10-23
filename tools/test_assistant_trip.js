#!/usr/bin/env node
/*
Quick assistant sanity test for a given trip id or name.
- If local server is running on :3000, calls /api/assistant
- Else, falls back to local tripData.js to generate a structured reply
Usage:
  node tools/test_assistant_trip.js santorini el
  node tools/test_assistant_trip.js "Πόσες μέρες είναι η Σαντορίνη;" el
*/
const http = require('http');
const { URL } = require('url');
const path = require('path');
const tripData = require(path.join(__dirname, '..', 'live', 'tripData.js'));

async function callAssistant(message, lang='el'){
  const url = new URL('http://127.0.0.1:3000/api/assistant');
  const payload = JSON.stringify({ message, lang });
  return new Promise((resolve) => {
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }}, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { const j = JSON.parse(data); resolve(j.reply || JSON.stringify(j)); }
        catch { resolve(data || res.statusCode + ''); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });
}

function t(lang, key, vars) {
  const en = {
    'assistant_trip.title': (o)=>`Trip: ${o.title}`,
    'assistant_trip.duration': (o)=>`Duration: ${o.duration}`,
    'assistant_trip.price': (o)=>`Price: €${o.price}`,
    'assistant_trip.description': (o)=>`Description: ${o.text}`,
    'assistant_trip.stops': ()=>`Stops`,
    'assistant_trip.includes': ()=>`Includes`,
    'assistant_trip.availability': ()=>`Availability`,
    'assistant_trip.unavailable_on': (o)=>`Unavailable dates: ${o.dates}`,
    'assistant_trip.missing': ()=>`(not provided)`
  };
  const el = {
    'assistant_trip.title': (o)=>`Εκδρομή: ${o.title}`,
    'assistant_trip.duration': (o)=>`Διάρκεια: ${o.duration}`,
    'assistant_trip.price': (o)=>`Τιμή: €${o.price}`,
    'assistant_trip.description': (o)=>`Περιγραφή: ${o.text}`,
    'assistant_trip.stops': ()=>`Στάσεις`,
    'assistant_trip.includes': ()=>`Περιλαμβάνει`,
    'assistant_trip.availability': ()=>`Διαθεσιμότητα`,
    'assistant_trip.unavailable_on': (o)=>`Μη διαθέσιμες ημερομηνίες: ${o.dates}`,
    'assistant_trip.missing': ()=>`(δεν έχει καταχωρηθεί)`
  };
  const L = (lang||'el').startsWith('el') ? el : en;
  const f = L[key] || en[key];
  return typeof f === 'function' ? f(vars||{}) : key;
}

async function localGenerate(message, lang='el'){
  // Try to resolve trip id either by direct id or from text
  let id = null;
  const m = String(message||'').trim();
  id = tripData.detectTripIdFromMessage(m) || m;
  let trip = tripData.readTripJsonById(id);
  if (!trip) {
    // try detect from message words
    const maybe = tripData.detectTripIdFromMessage(m);
    if (maybe) { id = maybe; trip = tripData.readTripJsonById(id); }
  }
  if (!trip) return `(local) Trip not found for message: ${message}`;
  const summary = tripData.buildTripSummary(trip, lang);
  const parts = [];
  parts.push(t(lang, 'assistant_trip.title', { title: summary.title }));
  if (summary.duration) parts.push(t(lang, 'assistant_trip.duration', { duration: summary.duration }));
  if (summary.priceCents != null) parts.push(t(lang, 'assistant_trip.price', { price: (summary.priceCents/100).toFixed(0) }));
  if (summary.description) parts.push(t(lang, 'assistant_trip.description', { text: summary.description }));
  if (summary.stops && summary.stops.length) {
    parts.push(t(lang, 'assistant_trip.stops'));
    summary.stops.slice(0,6).forEach((s)=>{
      const name = s.name || t(lang, 'assistant_trip.missing');
      const desc = s.description ? ` — ${s.description}` : '';
      parts.push(`• ${name}${desc}`);
    });
  }
  parts.push(t(lang, 'assistant_trip.includes'));
  if (Array.isArray(summary.includes) && summary.includes.length) {
    summary.includes.forEach(v => parts.push(`• ${v}`));
  } else {
    parts.push(`• ${t(lang, 'assistant_trip.missing')}`);
  }
  if (Array.isArray(summary.unavailable) && summary.unavailable.length) {
    parts.push(t(lang, 'assistant_trip.availability'));
    parts.push(t(lang, 'assistant_trip.unavailable_on', { dates: summary.unavailable.slice(0,6).join(', ') }));
  }
  return parts.join('\n');
}

(async function(){
  const args = process.argv.slice(2);
  let message = args[0] || 'Σαντορίνη';
  let lang = args[1] || 'el';
  // If first arg looks like a known id, wrap it in a question to test intent too
  if (!/\s/.test(message) && message.length < 20) {
    message = `Πες μου λεπτομέρειες για ${message}`;
  }
  const viaServer = await callAssistant(message, lang);
  if (viaServer) {
    console.log('Assistant (server) reply:\n' + viaServer);
  } else {
    const local = await localGenerate(message, lang);
    console.log('Assistant (local) reply:\n' + local);
  }
})();
