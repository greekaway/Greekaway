(function(){
  'use strict';

  // Utilities
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const t = (k, fb) => { try { const v = (window.t && window.t(k)) || ''; return (v && v !== k) ? v : (fb || k); } catch(_) { return fb || k; } };
  const debounce = (fn, ms=250) => { let to=null; return (...args)=>{ clearTimeout(to); to=setTimeout(()=>fn(...args), ms); }; };

  // Persist helpers
  const persist = {
    set(key, val){ try { sessionStorage.setItem(key, val); } catch(_){ } },
    setJSON(key, obj){ try { sessionStorage.setItem(key, JSON.stringify(obj)); } catch(_){ } },
    get(key){ try { return sessionStorage.getItem(key); } catch(_){ return null; } },
    getJSON(key){ try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : null; } catch(_){ return null; } }
  };

  const PROFILE_FIELD_UI = {
    age: { titleSelector: '#ageGroupTitle', errorSelector: '#ageGroupError', buttonSelector: '#ageSelectBtn' },
    traveler: { titleSelector: '#travTypeTitle', errorSelector: '#travTypeError', buttonSelector: '#travTypeSelectBtn' },
    interest: { titleSelector: '#interestsRow .title', buttonSelector: '#interestSelectBtn' },
    social: { titleSelector: '#socialityRow .title', buttonSelector: '#socialSelectBtn' }
  };
  const PROFILE_FIELD_KEYS = Object.keys(PROFILE_FIELD_UI);
  const busPickupCache = {
    raw: null,
    localized: [],
    lang: null,
    map: new Map(),
    selectedId: '',
    suggestionId: '',
    recommendedId: '',
    userOverride: ''
  };
  let tripDataPromise = null;
  const EARTH_RADIUS_KM = 6371;

  function toggleBusExtrasContainer(visible){
    const container = $('#busExtrasContainer');
    if (!container) return;
    if (visible) {
      container.style.display = '';
      container.removeAttribute('hidden');
    } else {
      container.style.display = 'none';
      container.setAttribute('hidden','');
    }
  }

  function currentLang(){
    try { return (window.currentI18n && window.currentI18n.lang) || localStorage.getItem('gw_lang') || 'el'; }
    catch(_){ return 'el'; }
  }

  function getTripIdFromContext(){
    try {
      const params = new URLSearchParams(window.location.search || '');
      const fromQuery = params.get('trip');
      if (fromQuery) return fromQuery.trim();
    } catch(_){ }
    try {
      const stored = sessionStorage.getItem('gw_trip_id');
      if (stored) return stored.trim();
    } catch(_){ }
    return '';
  }

  async function fetchTripById(tripId){
    if (!tripId) return null;
    try {
      const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      if (data && data.trip) return data.trip;
      return null;
    } catch(_){ return null; }
  }

  async function ensureTripData(){
    if (window.__loadedTrip) return window.__loadedTrip;
    if (!tripDataPromise) {
      const tripId = getTripIdFromContext();
      if (!tripId) return null;
      tripDataPromise = fetchTripById(tripId).then((trip) => {
        if (trip) {
          try { window.__loadedTrip = trip; } catch(_){ }
        }
        return trip;
      });
    }
    return tripDataPromise;
  }

  function localizeField(field, lang){
    if (!field) return '';
    if (typeof field === 'string') return field;
    if (typeof field === 'object') {
      if (field[lang]) return field[lang];
      if (field.el) return field.el;
      const first = Object.values(field).find(Boolean);
      return first || '';
    }
    return '';
  }

  function normalizeStopTime(value){
    if (value == null) return '';
    let raw = typeof value === 'number' ? String(value) : String(value || '').trim();
    if (!raw) return '';
    const colon = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (colon) {
      const hh = Math.min(23, Math.max(0, parseInt(colon[1], 10)));
      const mm = Math.min(59, Math.max(0, parseInt(colon[2], 10)));
      return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
    }
    if (/^\d{3,4}$/.test(raw)) {
      const hh = Math.min(23, Math.max(0, parseInt(raw.slice(0, raw.length-2), 10)));
      const mm = Math.min(59, Math.max(0, parseInt(raw.slice(-2), 10)));
      return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
    }
    return '';
  }

  function toNumber(value){
    if (value == null) return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function haversineKm(lat1, lng1, lat2, lng2){
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
    const toRad = (deg) => deg * (Math.PI / 180);
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
  }

  function busStopsHaveCoordinates(points){
    if (!Array.isArray(points) || !points.length) return false;
    return points.every((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
  }

  function localizeBusPickupPoints(rawList, lang){
    if (!Array.isArray(rawList)) return [];
    return rawList.map((point, index) => {
      if (!point || typeof point !== 'object') return null;
      const id = String(point.id || point.uuid || point.slug || `bus-stop-${index}`).trim();
      const title = localizeField(point.title, lang) || localizeField(point.label, lang) || '';
      const address = localizeField(point.address, lang) || '';
      const time = normalizeStopTime(point.departureTime || point.time || point.departure_time);
      const lat = toNumber(point.lat ?? point.latitude);
      const lng = toNumber(point.lng ?? point.longitude);
      if (!id && !title && !address && lat == null && lng == null) return null;
      return { id: id || `bus-stop-${index}`, title: title || address || `Στάση ${index + 1}`, address, time, lat, lng, order: index };
    }).filter(Boolean);
  }

  async function resolveBusPickupPointList(forceRelocalize = false){
    const lang = currentLang();
    if (!forceRelocalize && busPickupCache.localized.length && busPickupCache.lang === lang) {
      return busPickupCache.localized;
    }
    if (!busPickupCache.raw || forceRelocalize) {
      const trip = await ensureTripData();
      const busMode = trip && trip.modes && trip.modes.bus;
      busPickupCache.raw = Array.isArray(busMode && busMode.busPickupPoints) ? busMode.busPickupPoints : [];
    }
    busPickupCache.localized = localizeBusPickupPoints(busPickupCache.raw, lang);
    busPickupCache.lang = lang;
    busPickupCache.map = new Map(busPickupCache.localized.map((point) => [point.id, point]));
    if (!busPickupCache.selectedId) {
      const stored = getStoredBusSelection();
      if (stored && stored.id) busPickupCache.selectedId = stored.id;
    }
    return busPickupCache.localized;
  }

  function getStoredBusSelection(){
    try {
      const raw = sessionStorage.getItem('gw_bus_pickup_point');
      return raw ? JSON.parse(raw) : null;
    } catch(_){ return null; }
  }

  function persistBusSelection(point){
    if (!point) return;
    persist.setJSON('gw_bus_pickup_point', {
      id: point.id,
      title: point.title,
      address: point.address,
      time: point.time || '',
      lat: point.lat,
      lng: point.lng
    });
  }

  function getSelectedBusStop(){
    const id = busPickupCache.selectedId || (getStoredBusSelection()?.id) || '';
    if (!id) return null;
    if (busPickupCache.map && busPickupCache.map.has(id)) return busPickupCache.map.get(id);
    return getStoredBusSelection();
  }

  function hideBusStopError(){
    const err = $('#busStopError');
    if (err) err.setAttribute('hidden', '');
    const row = $('#busStopsRow');
    if (row) row.classList.remove('error');
  }

  function showBusStopError(){
    const err = $('#busStopError');
    if (err) err.removeAttribute('hidden');
    const row = $('#busStopsRow');
    if (row) row.classList.add('error');
  }

  function hideBusSuggestion(row){
    if (row) row.setAttribute('hidden','');
    const hadRecommendation = !!busPickupCache.recommendedId;
    busPickupCache.suggestionId = '';
    busPickupCache.recommendedId = '';
    busPickupCache.userOverride = '';
    if (hadRecommendation) rerenderBusStopsIfPossible();
  }

  function rerenderBusStopsIfPossible(){
    if (detectTripMode() !== 'bus') return;
    if (!Array.isArray(busPickupCache.localized) || !busPickupCache.localized.length) return;
    renderBusPickupPoints(busPickupCache.localized);
  }

  function maybeAutoSelectRecommended(){
    const recommendedId = busPickupCache.recommendedId;
    if (!recommendedId) return;
    const hasOverride = !!busPickupCache.userOverride
      && busPickupCache.userOverride === recommendedId;
    if (hasOverride) return;
    if (busPickupCache.selectedId === recommendedId) return;
    busPickupCache.selectedId = recommendedId;
    busPickupCache.userOverride = '';
    const recommendedStop = busPickupCache.map.get(recommendedId);
    if (recommendedStop) persistBusSelection(recommendedStop);
    hideBusStopError();
    updateNextVisualState();
  }

  function selectBusStop(stopId){
    if (!stopId) return;
    busPickupCache.selectedId = stopId;
    if (busPickupCache.recommendedId && stopId !== busPickupCache.recommendedId) {
      busPickupCache.userOverride = busPickupCache.recommendedId;
    } else {
      busPickupCache.userOverride = '';
    }
    hideBusStopError();
    const listEl = $('#busStopList');
    if (listEl) {
      listEl.querySelectorAll('.bus-stop-item').forEach((item) => {
        item.classList.toggle('selected', item.dataset.stopId === stopId);
      });
    }
    const stop = busPickupCache.map.get(stopId);
    if (stop) persistBusSelection(stop);
    try { document.dispatchEvent(new CustomEvent('gw:step2:fieldsChanged')); } catch(_){ }
    updateNextVisualState();
  }

  function renderBusPickupPoints(points){
    const row = $('#busStopsRow');
    const listEl = $('#busStopList');
    if (!row || !listEl) return;
    const mode = detectTripMode();
    const source = Array.isArray(points) ? points : (Array.isArray(busPickupCache.localized) ? busPickupCache.localized : []);
    if (mode !== 'bus' || !source.length) {
      row.setAttribute('hidden','');
      hideBusStopError();
      hideBusSuggestion($('#busSuggestionRow'));
      listEl.innerHTML = '';
      toggleBusExtrasContainer(false);
      return;
    }
    toggleBusExtrasContainer(true);
    row.removeAttribute('hidden');
    const recommendedId = busPickupCache.recommendedId;
    const sorted = recommendedId
      ? [...source].sort((a, b) => {
          if (a.id === recommendedId && b.id !== recommendedId) return -1;
          if (b.id === recommendedId && a.id !== recommendedId) return 1;
          const aOrder = Number.isFinite(a.order) ? a.order : source.indexOf(a);
          const bOrder = Number.isFinite(b.order) ? b.order : source.indexOf(b);
          return aOrder - bOrder;
        })
      : [...source];
    listEl.innerHTML = '';
    sorted.forEach((point) => {
      const label = document.createElement('label');
      label.className = 'bus-stop-item';
      label.dataset.stopId = point.id;
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'busStopOption';
      input.value = point.id;
      input.checked = point.id === busPickupCache.selectedId;
      input.addEventListener('change', () => selectBusStop(point.id));
      const details = document.createElement('div');
      details.className = 'bus-stop-details';
      const title = document.createElement('div');
      title.className = 'bus-stop-title';
      const combinedLabel = point.address
        ? `${point.title || point.address} — ${point.address}`
        : (point.title || point.address || 'Στάση');
      title.textContent = combinedLabel;
      details.appendChild(title);
      if (point.time) {
        const time = document.createElement('div');
        time.className = 'bus-stop-time';
        time.textContent = `Αναχώρηση: ${point.time}`;
        details.appendChild(time);
      }
      label.appendChild(input);
      label.appendChild(details);
      if (point.id === busPickupCache.recommendedId) label.classList.add('recommended');
      if (point.id === busPickupCache.selectedId) label.classList.add('selected');
      listEl.appendChild(label);
    });
  }

  async function loadBusPickupPointsIfNeeded(options){
    const mode = detectTripMode();
    if (mode !== 'bus') {
      const row = $('#busStopsRow');
      if (row) row.setAttribute('hidden','');
      const suggestionRow = $('#busSuggestionRow');
      hideBusSuggestion(suggestionRow);
      hideBusStopError();
      toggleBusExtrasContainer(false);
      return;
    }
    const force = options && options.force;
    const points = await resolveBusPickupPointList(Boolean(force));
    renderBusPickupPoints(points);
    toggleBusExtrasContainer(true);
    updateNextVisualState();
  }

  async function refreshBusStopsForLanguage(){
    if (detectTripMode() !== 'bus') return;
    await loadBusPickupPointsIfNeeded({ force: true });
    await updateBusSuggestion();
  }

  async function updateBusSuggestion(){
    const row = $('#busSuggestionRow');
    const valueEl = $('#busSuggestionValue');
    if (!row || !valueEl) return;
    if (detectTripMode() !== 'bus') {
      toggleBusExtrasContainer(false);
      hideBusSuggestion(row);
      return;
    }
    toggleBusExtrasContainer(true);
    const pickupLat = chosenPlace ? Number(chosenPlace.lat) : null;
    const pickupLng = chosenPlace ? Number(chosenPlace.lng) : null;
    if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
      hideBusSuggestion(row);
      return;
    }
    const points = await resolveBusPickupPointList(false);
    if (!busStopsHaveCoordinates(points)) {
      hideBusSuggestion(row);
      return;
    }
    let nearest = null;
    let nearestDist = Infinity;
    points.forEach((stop) => {
      const dist = haversineKm(pickupLat, pickupLng, stop.lat, stop.lng);
      if (dist == null) return;
      if (dist < nearestDist) { nearestDist = dist; nearest = stop; }
    });
    if (!nearest) { hideBusSuggestion(row); return; }
    busPickupCache.suggestionId = nearest.id;
    busPickupCache.recommendedId = nearest.id;
    maybeAutoSelectRecommended();
    renderBusPickupPoints(points);
    const suggestionLabel = nearest.address
      ? `${nearest.title || nearest.address} — ${nearest.address}`
      : (nearest.title || nearest.address || '');
    valueEl.textContent = suggestionLabel;
    row.removeAttribute('hidden');
  }

  function normalizeModeInput(mode){
    const m = String(mode || '').toLowerCase();
    if (m === 'bus') return 'bus';
    if (m === 'mercedes' || m === 'private' || m === 'mercedes/private' || m === 'vip') return 'mercedes';
    if (m === 'multi' || m === 'shared') return 'van';
    return (m === 'van' || m === 'bus' || m === 'mercedes') ? m : 'van';
  }

  function detectTripMode(){
    const candidates = [];
    try {
      const params = new URLSearchParams(window.location.search || '');
      const paramMode = params.get('mode');
      if (paramMode) candidates.push(paramMode);
    } catch(_){ }
    try {
      if (document && document.body) {
        const attrMode = document.body.getAttribute('data-trip-mode');
        if (attrMode) candidates.push(attrMode);
      }
    } catch(_){ }
    try {
      const stored = localStorage.getItem('trip_mode');
      if (stored) candidates.push(stored);
    } catch(_){ }
    try {
      const sessionMode = sessionStorage.getItem('gw_trip_mode');
      if (sessionMode) candidates.push(sessionMode);
    } catch(_){ }
    try {
      if (window.GWBookingState && typeof window.GWBookingState.get === 'function') {
        const stateMode = (window.GWBookingState.get() || {}).mode;
        if (stateMode) candidates.push(stateMode);
      }
    } catch(_){ }
    const chosen = candidates.find(Boolean) || 'van';
    return normalizeModeInput(chosen);
  }

  function getProfileFieldValues(){
    return {
      age: persist.get('gw_age_group') || '',
      traveler: persist.get('gw_traveler_type') || '',
      interest: persist.get('gw_interest') || '',
      social: persist.get('gw_sociality') || ''
    };
  }

  function selectedProfileCount(values){
    if (!values) return 0;
    let count = 0;
    PROFILE_FIELD_KEYS.forEach((key) => { if (values[key]) count += 1; });
    return count;
  }

  function requiredProfileSelectionCount(mode){
    if (mode === 'bus') return 0;
    if (mode === 'van' || mode === 'mercedes') return 2;
    return 2;
  }

  function hasEnoughProfileSelections(mode, values){
    const required = requiredProfileSelectionCount(mode);
    if (required <= 0) return true;
    return selectedProfileCount(values) >= required;
  }

  function toggleProfileFieldError(fieldKey, show){
    const cfg = PROFILE_FIELD_UI[fieldKey];
    if (!cfg) return;
    const titleEl = cfg.titleSelector ? document.querySelector(cfg.titleSelector) : null;
    if (titleEl) titleEl.classList.toggle('required', !!show);
    const btnEl = cfg.buttonSelector ? document.querySelector(cfg.buttonSelector) : null;
    if (btnEl) btnEl.classList.toggle('error', !!show);
    if (cfg.errorSelector) {
      const errEl = document.querySelector(cfg.errorSelector);
      if (errEl) {
        if (show) errEl.removeAttribute('hidden');
        else errEl.setAttribute('hidden','');
      }
    }
  }

  function applyProfileValidationState(values, highlightMissing){
    PROFILE_FIELD_KEYS.forEach((key) => {
      const hasValue = !!(values && values[key]);
      toggleProfileFieldError(key, highlightMissing && !hasValue);
    });
  }

  // Auto-assign preferred language from current locale
  function assignPreferredLanguage(){
    try {
      const lang = (window.currentI18n && window.currentI18n.lang) || localStorage.getItem('gw_lang') || 'el';
      sessionStorage.setItem('gw_pref_lang', lang);
      localStorage.setItem('gw_pref_lang', lang);
    } catch(_){ }
  }

  // Suitcases popup logic
  const luggageState = { small:0, medium:0, large:0 };
  const totalLuggage = () => (luggageState.small|0) + (luggageState.medium|0) + (luggageState.large|0);
  function decrementOneLuggage(){
    // Policy: remove from the largest available type first (large -> medium -> small)
    if ((luggageState.large|0) > 0) luggageState.large -= 1;
    else if ((luggageState.medium|0) > 0) luggageState.medium -= 1;
    else if ((luggageState.small|0) > 0) luggageState.small -= 1;
  }
  function updateSuitcaseSummary(){
    const longParts = [];
    if (luggageState.small) longParts.push(`${luggageState.small} × ${t('booking.suitcase_small_short','Small')}`);
    if (luggageState.medium) longParts.push(`${luggageState.medium} × ${t('booking.suitcase_medium_short','Medium')}`);
    if (luggageState.large) longParts.push(`${luggageState.large} × ${t('booking.suitcase_large_short','Large')}`);

    // Compact tokens for small screens
    const tokens = [];
    if (luggageState.small) tokens.push(`${luggageState.small}S`);
    if (luggageState.medium) tokens.push(`${luggageState.medium}M`);
    if (luggageState.large) tokens.push(`${luggageState.large}L`);

    const sumEl = $('#suitcaseSummary');
    if (sumEl) {
      const text = tokens.join(' · ');
      sumEl.textContent = (text && text.trim().length) ? text : '—';
      // Full text as tooltip
      sumEl.title = longParts.length ? longParts.join(' · ') : '';
      sumEl.setAttribute('data-mode', 'compact');
    }
    const total = (luggageState.small + luggageState.medium + luggageState.large) || 0;
    const cntEl = $('#suitcasesCount'); if (cntEl) cntEl.textContent = String(total);
    // Persist array form: [{type,count}] and individual counts for Step 3 summary compatibility
    const arr = ['small','medium','large'].filter(t=>luggageState[t]>0).map(type => ({ type, count: luggageState[type] }));
    persist.setJSON('gw_luggage', arr);
    try {
      persist.set('gw_bags_small', String(luggageState.small||0));
      persist.set('gw_bags_medium', String(luggageState.medium||0));
      persist.set('gw_bags_large', String(luggageState.large||0));
    } catch(_){ }
  }
  function openSuitcasePopup(){ const el = $('#suitcasePopup'); if (!el) return; syncPopupCounts(); el.hidden=false; disableScroll(true); }
  function closeSuitcasePopup(){ const el = $('#suitcasePopup'); if (!el) return; el.hidden=true; disableScroll(false); updateSuitcaseSummary(); }
  function syncPopupCounts(){ $$('.suitcase-item').forEach(item=>{ const type=item.getAttribute('data-type'); const c=$('.si-count', item); if (c) c.textContent=String(luggageState[type]||0); }); }

  // Disable body scroll when modal open
  function disableScroll(on){ try { document.body.style.overflow = on ? 'hidden' : ''; } catch(_){ } }

  function bindSuitcases(){
    const incBtn = $('#suitcasesInc'); const decBtn = $('#suitcasesDec');
    if (incBtn) incBtn.addEventListener('click', (e)=>{ e.preventDefault(); openSuitcasePopup(); });
    if (decBtn) decBtn.addEventListener('click', (e)=>{
      e.preventDefault();
      if (totalLuggage() > 0) {
        decrementOneLuggage();
        updateSuitcaseSummary();
        // Keep popup counts in sync for the next time it opens
        try { syncPopupCounts(); } catch(_){ }
      }
    });
    const pop = $('#suitcasePopup'); if (!pop) return;
    pop.addEventListener('click', (ev)=>{ if (ev.target === pop) closeSuitcasePopup(); });
    $('#suitcaseCancel')?.addEventListener('click', closeSuitcasePopup);
    $('#suitcaseConfirm')?.addEventListener('click', closeSuitcasePopup);
    $$('.suitcase-item').forEach(item => {
      const type = item.getAttribute('data-type');
      $('.si-inc', item)?.addEventListener('click', ()=>{ luggageState[type] = Math.min(20, (luggageState[type]||0)+1); syncPopupCounts(); });
      $('.si-dec', item)?.addEventListener('click', ()=>{ luggageState[type] = Math.max(0, (luggageState[type]||0)-1); syncPopupCounts(); });
    });
    // restore if any
    const saved = persist.getJSON('gw_luggage');
    if (Array.isArray(saved)) { for(const it of saved){ if (it && it.type && typeof it.count==='number') luggageState[it.type]=it.count; } }
    updateSuitcaseSummary();
  }

  // Google Places Autocomplete via dynamic key extraction
  let googleReady = false;
  // Strict pickup validation: when Google Places is available we require a place_id.
  function strictPickupActive(){ return googleReady && !!acService && !!placesService; }
  function loadGoogleMapsPlaces(){
    return new Promise((resolve, reject)=>{
      if (window.google && window.google.maps && window.google.maps.places) { googleReady=true; return resolve(); }
      // Fetch injected trip.html to extract key
      fetch('/trip.html', { cache: 'no-cache' })
        .then(r => r.ok ? r.text() : Promise.reject(new Error('no-trip')))
        .then(html => {
          const m = html.match(/maps\.googleapis\.com\/maps\/api\/js\?key=([^"&]+)/i);
          const key = m && m[1];
          if (!key || key === 'YOUR_GOOGLE_MAPS_API_KEY') {
            // Fallback: call lightweight endpoint to get key
            return fetch('/api/maps-key', { cache: 'no-cache' })
              .then(r => r.ok ? r.json() : Promise.reject(new Error('api-maps-key')))
              .then(obj => {
                const apiKey = obj && obj.key;
                if (!apiKey) throw new Error('no-key');
                const s = document.createElement('script');
                s.async = true; s.defer = true;
                s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
                s.onload = () => { googleReady=true; resolve(); };
                s.onerror = () => reject(new Error('maps-load-failed'));
                document.head.appendChild(s);
              });
          }
          const s = document.createElement('script');
          s.async = true; s.defer = true;
          s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
          s.onload = () => { googleReady=true; resolve(); };
          s.onerror = () => reject(new Error('maps-load-failed'));
          document.head.appendChild(s);
        })
        .catch(err => { console.warn('maps: load failed', err && err.message ? err.message : err); try { showToast(t('booking.api_denied','Το API κλειδωμένο – έλεγξε το κλειδί ή άνοιξε τη σελίδα από τον server')); } catch(_){}; reject(err); });
    });
  }

  // Autocomplete state
  let acService = null; let placesService = null; let chosenPlace = null; let mapInstance = null; let mapMarker = null;
  let updateNextVisualState = () => {};

  function setNextEnabled(on){ try { const b = $('#s2Next'); if (b) { b.disabled = false; // keep enabled for click validation
      b.classList.toggle('disabled', !on);
      // Restore normal visual color when valid (remove .invalid-color) else add it
      if (on) {
        b.classList.remove('invalid-color');
      } else {
        b.classList.add('invalid-color');
      }
    } } catch(_){ } }

  function showToast(msg){
    let el = $('#s2Toast');
    if (!el) { el = document.createElement('div'); el.id='s2Toast'; el.className='s2-toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    setTimeout(()=> el.classList.remove('show'), 2200);
  }

  function bindPickup(){
    const input = $('#pickupInput'); const dropdown = $('#pickupSuggest'); const mapBtn = $('#pickupMapBtn');
    if (!input || !dropdown) return;

    const applyChoice = (pred, details) => {
      chosenPlace = {
        description: pred && (pred.description || pred.structured_formatting?.main_text || pred.terms?.map(x=>x.value).join(', ')),
        place_id: pred.place_id,
        lat: details && details.geometry && details.geometry.location ? details.geometry.location.lat() : null,
        lng: details && details.geometry && details.geometry.location ? details.geometry.location.lng() : null,
        formatted_address: (details && (details.formatted_address || details.name)) || (pred && pred.description) || ''
      };
      input.value = chosenPlace.formatted_address || chosenPlace.description || '';
      dropdown.hidden = true; dropdown.innerHTML = '';
      // Persist
      persist.set('gw_pickup_address', input.value);
      persist.set('gw_pickup_place_id', chosenPlace.place_id || '');
      if (chosenPlace.lat != null && chosenPlace.lng != null) {
        persist.set('gw_pickup_lat', String(chosenPlace.lat));
        persist.set('gw_pickup_lng', String(chosenPlace.lng));
      }
      // Drop-off same
      persist.set('gw_dropoff_same', 'true');
      persist.set('gw_dropoff_address', input.value);
      updateNextVisualState();
      updateBusSuggestion().catch(()=>{});
    };

    function ensureServices(cb){
      if (acService && placesService) return cb();
      if (!googleReady) { loadGoogleMapsPlaces().then(()=>ensureServices(cb)).catch(()=>{}); return; }
      try {
        acService = new google.maps.places.AutocompleteService();
        const dummyMap = document.createElement('div');
        placesService = new google.maps.places.PlacesService(dummyMap);
        // Once services are ready, re-evaluate Next button state under strict rules
        try { updateNextVisualState(); } catch(_){ }
        cb();
      } catch(_){ }
    }

    const renderPreds = (preds, statusMsg) => {
      dropdown.innerHTML='';
      if (statusMsg && (!preds || !preds.length)) {
        const msg = document.createElement('div'); msg.className='place-empty'; msg.textContent = statusMsg; dropdown.appendChild(msg); dropdown.hidden = false; return; }
      if (!Array.isArray(preds) || preds.length===0) { dropdown.hidden=true; return; }
      preds.slice(0,7).forEach(p => {
        const btn = document.createElement('button');
        btn.type='button'; btn.className='place-item'; btn.textContent = p.description || '';
        btn.addEventListener('click', ()=>{
          // Fetch details to get lat/lng
          try {
            placesService.getDetails({ placeId: p.place_id, fields: ['formatted_address','geometry','place_id','name'] }, (d, status)=>{
              if (status === google.maps.places.PlacesServiceStatus.OK && d) applyChoice(p, d);
              else applyChoice(p, null);
            });
          } catch(_){ applyChoice(p, null); }
        });
        dropdown.appendChild(btn);
      });
      dropdown.hidden = false;
    };

    // Debounced search for Google Places predictions (adjusted to ~480ms per requirement)
    const doSearch = debounce(() => {
      const q = String(input.value || '').trim();
      if (q.length < 3) { dropdown.hidden = true; dropdown.innerHTML=''; updateNextVisualState(); return; }
      ensureServices(() => {
        try {
          // Simple 60s memoization layer to avoid repeated identical queries hitting Google Places.
          // Cache stores the raw predictions array (or null) keyed by query string.
          const now = Date.now();
          window.__gwPlacesCache = window.__gwPlacesCache || Object.create(null);
          const cacheEntry = window.__gwPlacesCache[q];
          if (cacheEntry && (now - cacheEntry.t) < 60_000) {
            const { preds: cachedPreds, status: cachedStatus } = cacheEntry;
            try { console.log('[pickup-autocomplete] cache-hit query:"'+q+'" status:', cachedStatus, 'results:', cachedPreds ? cachedPreds.length : 0); } catch(_){}
            if (cachedStatus === google.maps.places.PlacesServiceStatus.OK) {
              renderPreds(cachedPreds || []);
            } else {
              // Reuse same status handling path
              let msg = null;
              if (cachedStatus === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) msg = t('booking.no_addresses','Δεν βρέθηκαν διευθύνσεις');
              else if (cachedStatus === google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT) msg = t('booking.rate_limit','Προσωρινό όριο – δοκίμασε ξανά');
              else if (cachedStatus === google.maps.places.PlacesServiceStatus.REQUEST_DENIED) msg = t('booking.api_denied','Το API κλειδωμένο – έλεγξε το κλειδί');
              else if (cachedStatus === google.maps.places.PlacesServiceStatus.INVALID_REQUEST) msg = t('booking.invalid_request','Μη έγκυρο αίτημα');
              else msg = t('booking.error_generic','Σφάλμα προτάσεων');
              renderPreds([], msg);
            }
            return; // served from cache
          }

          acService.getPlacePredictions({ input: q, types: ['geocode'] }, (preds, status)=>{
            // Always log status to console for monitoring (OK / ZERO_RESULTS / REQUEST_DENIED / etc.)
            try { console.log('[pickup-autocomplete] status:', status, 'query:"'+q+'"', 'results:', preds ? preds.length : 0); } catch(_){}
            if (status !== google.maps.places.PlacesServiceStatus.OK) {
              console.warn('places: prediction status', status);
              let msg = null;
              if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) msg = t('booking.no_addresses','Δεν βρέθηκαν διευθύνσεις');
              else if (status === google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT) msg = t('booking.rate_limit','Προσωρινό όριο – δοκίμασε ξανά');
              else if (status === google.maps.places.PlacesServiceStatus.REQUEST_DENIED) msg = t('booking.api_denied','Το API κλειδωμένο – έλεγξε το κλειδί');
              else if (status === google.maps.places.PlacesServiceStatus.INVALID_REQUEST) msg = t('booking.invalid_request','Μη έγκυρο αίτημα');
              else msg = t('booking.error_generic','Σφάλμα προτάσεων');
              renderPreds([], msg);
              // Cache negative status too to avoid hammering on invalid key
              window.__gwPlacesCache[q] = { preds: null, status, t: Date.now() };
              return;
            }
            renderPreds(preds || []);
            window.__gwPlacesCache[q] = { preds: (preds||[]), status, t: Date.now() };
          });
        } catch(_){ }
      });
    }, 480);

    updateNextVisualState = function(){
      const mode = detectTripMode();
      if (mode === 'bus') {
        const busReady = !!getSelectedBusStop();
        setNextEnabled(busReady);
        return;
      }
      const val = (input.value||'').trim();
      const profileValues = getProfileFieldValues();
      const profileOk = hasEnoughProfileSelections(mode, profileValues);
      let pickupOk = false;
      if (strictPickupActive()) {
        pickupOk = !!(chosenPlace && chosenPlace.place_id);
      } else {
        pickupOk = val.length>0;
      }
      setNextEnabled(!!(pickupOk && profileOk));
    };

    input.addEventListener('input', () => {
      chosenPlace=null; persist.set('gw_pickup_place_id','');
      const val = (input.value||'').trim();
      if (val.length){
        // Clear label required only (we keep static helper below label)
        input.classList.remove('error');
        $('#pickupLabel')?.classList.remove('required');
      }
      updateNextVisualState();
      updateBusSuggestion().catch(()=>{});
      doSearch();
    });
    input.addEventListener('focus', () => { if (dropdown.childElementCount>0) dropdown.hidden=false; });
    document.addEventListener('click', (ev)=>{ if (!dropdown.contains(ev.target) && ev.target !== input) dropdown.hidden=true; }, { passive: true });

    // Map preview
    function openMap(){
      if (!chosenPlace || !chosenPlace.place_id) { showToast(t('booking.error_select_address','Select an address from the list')); return; }
      const modal = $('#pickupMapModal'); if (!modal) return; modal.hidden=false; disableScroll(true);
      const mapEl = $('#pickupMap'); if (!mapEl) return;
      const center = { lat: chosenPlace.lat || 38.0, lng: chosenPlace.lng || 23.7 };
      try {
        mapInstance = new google.maps.Map(mapEl, { center, zoom: chosenPlace.lat ? 14 : 6, mapTypeId: 'roadmap' });
        mapMarker = new google.maps.Marker({ map: mapInstance, position: center });
      } catch(_){ }
    }
    function closeMap(){ const modal = $('#pickupMapModal'); if (!modal) return; modal.hidden=true; disableScroll(false); try { mapInstance=null; mapMarker=null; } catch(_){ } }

    mapBtn?.addEventListener('click', (e)=>{ e.preventDefault(); ensureServices(()=>openMap()); });
    $('#mapConfirm')?.addEventListener('click', ()=> closeMap());
    $('#mapChange')?.addEventListener('click', ()=> closeMap());
    $('#pickupMapModal')?.addEventListener('click', (ev)=>{ if (ev.target && ev.target.id==='pickupMapModal') closeMap(); });

    // Restore saved state if any
    const savedAddr = persist.get('gw_pickup_address');
    const savedPid = persist.get('gw_pickup_place_id');
    const savedLat = persist.get('gw_pickup_lat');
    const savedLng = persist.get('gw_pickup_lng');
    if (savedAddr) input.value = savedAddr;
    if (savedPid) {
      chosenPlace = { place_id: savedPid, formatted_address: savedAddr || '', lat: savedLat?Number(savedLat):null, lng: savedLng?Number(savedLng):null };
      updateNextVisualState();
      updateBusSuggestion().catch(()=>{});
    } else {
      updateNextVisualState();
      updateBusSuggestion().catch(()=>{});
    }

    // Listen for field changes from other scripts (age/traveler selections) to refresh Next button visual state
    try {
      document.addEventListener('gw:step2:fieldsChanged', () => {
        try {
          updateNextVisualState();
          applyProfileValidationState(getProfileFieldValues(), false);
        } catch(_){ }
      });
    } catch(_){ }
  }

  // Special Requests auto-resize + persist
  function bindSpecialRequests(){
    const ta = $('#specialRequests'); if (!ta) return;
    const save = () => persist.set('gw_notes', ta.value || '');
    const autoresize = () => {
      const maxH = (window.innerWidth || 0) <= 600 ? 60 : 160; // ~2-3 lines on mobile, up to more on larger screens
      ta.style.height='auto';
      ta.style.height = Math.min(maxH, ta.scrollHeight) + 'px';
    };
    ta.addEventListener('input', ()=>{ autoresize(); save(); });
    const saved = persist.get('gw_notes'); if (saved) { ta.value = saved; autoresize(); }
  }

  // Next button validation hook
  function guardNext(){
    const btn = $('#s2Next'); if (!btn) return;
    btn.addEventListener('click', (ev)=>{
      const input = $('#pickupInput');
      const val = (input && input.value || '').trim();
      const mode = detectTripMode();
      if (mode === 'bus') {
        const selectedStop = getSelectedBusStop();
        if (!selectedStop) {
          ev.preventDefault(); ev.stopPropagation();
          showBusStopError();
          try { document.getElementById('busStopsRow')?.scrollIntoView({ behavior:'smooth', block:'center' }); } catch(_){ }
          return false;
        }
        hideBusStopError();
        persistBusSelection(selectedStop);
        try {
          persist.set('gw_pickup_address', val);
          persist.set('gw_dropoff_same','true');
          persist.set('gw_dropoff_address', val);
          if (!chosenPlace || !chosenPlace.place_id) {
            persist.set('gw_pickup_place_id','');
            persist.set('gw_pickup_lat','');
            persist.set('gw_pickup_lng','');
          }
        } catch(_){ }
        assignPreferredLanguage();
        return true;
      }
      const profileValues = getProfileFieldValues();
      const profileOk = hasEnoughProfileSelections(mode, profileValues);
      applyProfileValidationState(profileValues, !profileOk);
      if (!profileOk) {
        ev.preventDefault(); ev.stopPropagation();
        try { document.getElementById('ageGroupRow').scrollIntoView({ behavior:'smooth', block:'center' }); } catch(_){ }
        return false;
      }
      if (!val) {
        ev.preventDefault(); ev.stopPropagation();
        if (input) { input.classList.add('error'); }
        const label = $('#pickupLabel'); if (label) label.classList.add('required');
        // Scroll into view if needed
        try { input.scrollIntoView({ behavior:'smooth', block:'center' }); } catch(_){ }
        return false;
      }
      // Strict mode: require Google place selection (place_id)
      if (strictPickupActive() && !chosenPlace?.place_id) {
        ev.preventDefault(); ev.stopPropagation();
        if (input) { input.classList.add('error'); }
        const label = $('#pickupLabel'); if (label) label.classList.add('required');
        try { input.scrollIntoView({ behavior:'smooth', block:'center' }); } catch(_){ }
        return false;
      }
  // Persist manual value if user didn't pick from dropdown
      persist.set('gw_pickup_address', val);
      if (!persist.get('gw_pickup_place_id')) {
        // ensure dropoff mirrors manual pickup
        persist.set('gw_dropoff_same','true');
        persist.set('gw_dropoff_address', val);
      }
      assignPreferredLanguage();
      return true;
    }, true);
  }

  // Init on DOM ready
  function init(){
    assignPreferredLanguage();
    bindSuitcases();
    bindPickup();
    loadBusPickupPointsIfNeeded().catch(()=>{});
    setTimeout(() => { loadBusPickupPointsIfNeeded().catch(()=>{}); }, 0);
    bindSpecialRequests();
    guardNext();
    toggleBusExtrasContainer(detectTripMode() === 'bus');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Re-translate summary on language change
  try {
    window.addEventListener('i18n:changed', () => {
      try { updateSuitcaseSummary(); } catch(_){ }
      try { refreshBusStopsForLanguage(); } catch(_){ }
    });
  } catch(_){ }
  // Reflow summary on resize to switch compact/full rendering
  try { window.addEventListener('resize', debounce(updateSuitcaseSummary, 140)); } catch(_){ }
})();
