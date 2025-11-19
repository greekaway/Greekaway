(function(){
  const STORAGE_KEY = 'greekaway_booking_state';
  function readJSON(k){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch(_){ return null; } }
  function writeJSON(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(_){ } }
  function clearKey(k){ try { localStorage.removeItem(k); } catch(_){ } }
  function getParams(){ try { return new URLSearchParams(window.location.search); } catch(_){ return new URLSearchParams(''); } }
  function getLang(){ try { return (window.currentI18n && window.currentI18n.lang) || (localStorage.getItem('gw_lang') || 'el'); } catch(_){ return 'el'; } }
  function computePriceCents(basePricePerPersonCents, seats){
    const b = Math.max(0, parseInt(basePricePerPersonCents || 0, 10) || 0);
    const s = Math.max(1, parseInt(seats || 1, 10) || 1);
    return b * s;
  }
  async function loadTrip(tripId){
    if (!tripId) return null;
    let dv = '';
    try { const rv = await fetch('/version.json', { cache: 'no-cache' }); if (rv.ok) { const j = await rv.json(); dv = j && j.dataVersion ? ('?v='+encodeURIComponent(String(j.dataVersion))) : ''; } } catch(_){ }
    try { const r = await fetch(`/data/trips/${encodeURIComponent(tripId)}.json${dv}`, { cache: 'no-cache' }); if (!r.ok) return null; return await r.json(); } catch(_){ return null; }
  }
  function load(){ return readJSON(STORAGE_KEY); }
  function save(state){ if (!state || typeof state !== 'object') return; writeJSON(STORAGE_KEY, state); }
  function clear(){ clearKey(STORAGE_KEY); }
  function ensureBaseFromUrl(existing){
    const p = getParams();
    const trip_id = (p.get('id') || (existing && existing.trip_id) || '').trim();
    const mode = (p.get('mode') || (existing && existing.mode) || localStorage.getItem('trip_mode') || 'van').toLowerCase();
    const date = (p.get('date') || (existing && existing.date) || '').trim();
    return Object.assign({}, existing || {}, { trip_id, mode, date });
  }
  function getSeatsFromSession(){
    try {
      const a = parseInt(sessionStorage.getItem('gw_adults')||'0',10)||0;
      const ages = JSON.parse(sessionStorage.getItem('gw_children_ages')||'[]') || [];
      return Math.max(1, a + (ages.length||0));
    } catch(_){ return 1; }
  }
  function getSuitcasesFromSession(){
    try {
      const s = parseInt(sessionStorage.getItem('gw_bags_small')||'0',10)||0;
      const m = parseInt(sessionStorage.getItem('gw_bags_medium')||'0',10)||0;
      const l = parseInt(sessionStorage.getItem('gw_bags_large')||'0',10)||0;
      return { small: s, medium: m, large: l };
    } catch(_){ return { small:0, medium:0, large:0 }; }
  }
  function getPickupFromSession(){
    try {
      const addr = (sessionStorage.getItem('gw_pickup_address')||'').trim();
      const place_id = (sessionStorage.getItem('gw_pickup_place_id')||'').trim();
      const lat = sessionStorage.getItem('gw_pickup_lat')||'';
      const lng = sessionStorage.getItem('gw_pickup_lng')||'';
      return { address: addr, place_id, lat, lng };
    } catch(_){ return { address:'', place_id:'', lat:'', lng:'' }; }
  }
  function getTravelerProfileFromSession(){
    try {
      return {
        age_group: sessionStorage.getItem('gw_age_group') || '',
        type: sessionStorage.getItem('gw_traveler_type') || '',
        social: sessionStorage.getItem('gw_sociality') || '',
        language: (sessionStorage.getItem('gw_pref_lang') || localStorage.getItem('gw_pref_lang') || localStorage.getItem('gw_lang') || getLang())
      };
    } catch(_){ return { age_group:'', type:'', social:'', language:getLang() }; }
  }
  async function buildFromStep2(){
    const base = ensureBaseFromUrl(load());
    const seats = getSeatsFromSession();
    const pickup = getPickupFromSession();
    const suitcases = getSuitcasesFromSession();
    const special_requests = (function(){ try { return (sessionStorage.getItem('gw_notes')||'').trim(); } catch(_){ return ''; } })();
    const traveler_profile = getTravelerProfileFromSession();
    let price_cents = 0;
    let currency = 'eur';
    // Pricing JSON single source: private (mercedes) fixed per vehicle; van/bus per seat
    try {
      const r = await fetch('/api/pricing', { cache: 'no-store' });
      if (r && r.ok) {
        const pricing = await r.json();
        const tripId = base.trip_id || '';
        const entry = pricing && pricing[tripId];
        if (entry) {
          const m = (base.mode || '').toLowerCase();
          if (m === 'private' || m === 'mercedes' || m === 'mercedes/private') {
            price_cents = Number(entry.private)||0;
          } else if (m === 'van') {
            price_cents = (Number(entry.van)||0) * seats;
          } else if (m === 'bus') {
            price_cents = (Number(entry.bus)||0) * seats;
          } else {
            // default per-seat van if unknown
            price_cents = (Number(entry.van)||0) * seats;
          }
        }
      }
    } catch(_){ }
    if (!price_cents) {
      // fallback to session overrides (vehicle price) or last computed amount
      try {
        const sel = sessionStorage.getItem('selectedVehiclePrice');
        if (sel) { const euros = parseFloat(sel); if (!isNaN(euros) && euros>0) price_cents = Math.round(euros*100); }
      } catch(_){ }
      if (!price_cents) { try { price_cents = parseInt(sessionStorage.getItem('gw_amount_cents')||'0',10)||0; } catch(_){ price_cents = 0; } }
    }
    const state = Object.assign({}, base, { seats, pickup, suitcases, special_requests, traveler_profile, price_cents, currency });
    save(state);
    return state;
  }
  function get(){ return load() || null; }
  window.GWBookingState = { key: STORAGE_KEY, load, save, clear, ensureBaseFromUrl, computePriceCents, buildFromStep2, get, getParams };
})();
