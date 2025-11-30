(function(){
  const STORAGE_KEY = 'greekaway_booking_state';
  function readJSON(k){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch(_){ return null; } }
  function writeJSON(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(_){ } }
  function clearKey(k){ try { localStorage.removeItem(k); } catch(_){ } }
  function getParams(){
    try {
      const params = new URLSearchParams(window.location.search);
      normalizeTripParam(params);
      return params;
    } catch(_){ return new URLSearchParams(''); }
  }
  function getLang(){ try { return (window.currentI18n && window.currentI18n.lang) || (localStorage.getItem('gw_lang') || 'el'); } catch(_){ return 'el'; } }
  function computePriceCents(basePricePerPersonCents, seats){
    const b = Math.max(0, parseInt(basePricePerPersonCents || 0, 10) || 0);
    const s = Math.max(1, parseInt(seats || 1, 10) || 1);
    return b * s;
  }
  function normalizeMode(mode){
    const m = String(mode || '').toLowerCase();
    if (m === 'private' || m === 'mercedes/private') return 'mercedes';
    if (m === 'multi' || m === 'shared') return 'van';
    return ['van','bus','mercedes'].includes(m) ? m : 'van';
  }
  function resolveTripMode(trip, mode){
    if (!trip) return null;
    const normalized = normalizeMode(mode);
    const currency = (trip.currency || 'EUR').toUpperCase();
    const fromNewSchema = trip.modes && trip.modes[normalized];
    if (fromNewSchema) {
      const price = Number(fromNewSchema.price || 0);
      const chargeType = fromNewSchema.charging_type || fromNewSchema.charge_type || 'per_person';
      const capacity = fromNewSchema.capacity != null ? fromNewSchema.capacity : fromNewSchema.default_capacity;
      return { price, chargeType, capacity, currency };
    }
    if (typeof trip.price_cents === 'number') {
      return { price: trip.price_cents / 100, chargeType: 'per_person', capacity: null, currency };
    }
    return null;
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
    const trip_id = (p.get('trip') || (existing && existing.trip_id) || '').trim();
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
  function getBusPickupFromSession(){
    try {
      const raw = sessionStorage.getItem('gw_bus_pickup_point');
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return obj && obj.id ? obj : null;
    } catch(_){ return null; }
  }
  function getTravelerProfileFromSession(){
    try {
      return {
        age_group: sessionStorage.getItem('gw_age_group') || '',
        type: sessionStorage.getItem('gw_traveler_type') || '',
        social: sessionStorage.getItem('gw_sociality') || '',
        interest: sessionStorage.getItem('gw_interest') || '',
        language: (sessionStorage.getItem('gw_pref_lang') || localStorage.getItem('gw_pref_lang') || localStorage.getItem('gw_lang') || getLang())
      };
    } catch(_){ return { age_group:'', type:'', social:'', interest:'', language:getLang() }; }
  }
  async function buildFromStep2(){
    const base = ensureBaseFromUrl(load());
    const seats = getSeatsFromSession();
    const pickup = getPickupFromSession();
    const busPickupPoint = getBusPickupFromSession();
    const suitcases = getSuitcasesFromSession();
    const special_requests = (function(){ try { return (sessionStorage.getItem('gw_notes')||'').trim(); } catch(_){ return ''; } })();
    const traveler_profile = getTravelerProfileFromSession();
    if (!traveler_profile.interest) {
      try { traveler_profile.interest = sessionStorage.getItem('gw_interest') || ''; } catch(_){ traveler_profile.interest = ''; }
    }
    let price_cents = 0;
    let currency = 'eur';
    let chargeType = 'per_person';
    const normalizedMode = normalizeMode(base.mode);
    try {
      const trip = await loadTrip(base.trip_id);
      const info = trip ? resolveTripMode(trip, normalizedMode) : null;
      if (trip && trip.currency) currency = String(trip.currency).toLowerCase();
      if (info) {
        chargeType = info.chargeType || 'per_person';
        const perUnitCents = Math.round(Number(info.price || 0) * 100);
        const units = chargeType === 'per_vehicle' ? 1 : seats;
        price_cents = Math.max(0, perUnitCents * units);
        if (info.currency) currency = String(info.currency).toLowerCase();
      }
    } catch(_){ }
    if (!price_cents) {
      // fallback to session overrides (vehicle price) or last computed amount
      try {
        const sel = sessionStorage.getItem('selectedVehiclePrice');
        if (sel) {
          const euros = parseFloat(sel);
          if (!isNaN(euros) && euros>0) {
            const perUnit = Math.round(euros * 100);
            const units = chargeType === 'per_vehicle' ? 1 : seats;
            price_cents = Math.max(0, perUnit * units);
            try {
              const curStored = sessionStorage.getItem('selectedVehicleCurrency');
              if (curStored) currency = String(curStored).toLowerCase();
            } catch(_){ }
          }
        }
      } catch(_){ }
      if (!price_cents) { try { price_cents = parseInt(sessionStorage.getItem('gw_amount_cents')||'0',10)||0; } catch(_){ price_cents = 0; } }
    }
    const state = Object.assign({}, base, {
      seats,
      pickup,
      suitcases,
      special_requests,
      traveler_profile,
      price_cents,
      currency,
      address: pickup && pickup.address ? pickup.address : '',
      busPickupPoint: normalizedMode === 'bus' ? (busPickupPoint || null) : null
    });
    save(state);
    return state;
  }
  function get(){ return load() || null; }
  window.GWBookingState = { key: STORAGE_KEY, load, save, clear, ensureBaseFromUrl, computePriceCents, buildFromStep2, get, getParams };

  function normalizeTripParam(params){
    try {
      if (!params) return;
      const current = (params.get('trip') || '').trim();
      if (current) return;
      const legacy = (params.get('id') || '').trim();
      if (!legacy) return;
      params.set('trip', legacy);
      params.delete('id');
      const query = params.toString();
      const hash = window.location.hash || '';
      const next = query ? `${window.location.pathname}?${query}${hash}` : `${window.location.pathname}${hash}`;
      window.history.replaceState({}, '', next);
    } catch(_){ }
  }
})();
