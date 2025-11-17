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
      fetch('/trips/trip.html', { cache: 'no-cache' })
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
      if (q.length < 3) { dropdown.hidden = true; dropdown.innerHTML=''; setNextEnabled(false); return; }
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

    function updateNextVisualState(){
      // Bus mode: always allow proceed visually
      try {
        const qsMode = (new URLSearchParams(window.location.search)).get('mode');
        const mode = (qsMode || localStorage.getItem('trip_mode') || 'van').toLowerCase();
        if (mode === 'bus') { setNextEnabled(true); return; }
      } catch(_){}
      const val = (input.value||'').trim();
      const ageOk = !!(persist.get('gw_age_group')||'');
      const travOk = !!(persist.get('gw_traveler_type')||'');
      let pickupOk = false;
      if (strictPickupActive()) {
        pickupOk = !!chosenPlace?.place_id;
      } else {
        pickupOk = val.length>0;
      }
      setNextEnabled(!!(pickupOk && ageOk && travOk));
    }

    input.addEventListener('input', () => {
      chosenPlace=null; persist.set('gw_pickup_place_id','');
      const val = (input.value||'').trim();
      if (val.length){
        // Clear label required only (we keep static helper below label)
        input.classList.remove('error');
        $('#pickupLabel')?.classList.remove('required');
      }
      updateNextVisualState();
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
    } else {
      updateNextVisualState();
    }

    // Listen for field changes from other scripts (age/traveler selections) to refresh Next button visual state
    try {
      document.addEventListener('gw:step2:fieldsChanged', () => { try { updateNextVisualState(); } catch(_){ } });
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
      // Bus mode: bypass all validations and persist the auto pickup
      try {
        const qsMode = (new URLSearchParams(window.location.search)).get('mode');
        const mode = (qsMode || localStorage.getItem('trip_mode') || 'van').toLowerCase();
        if (mode === 'bus') {
          const input = $('#pickupInput');
          const val = (input && input.value || '').trim();
          try {
            persist.set('gw_pickup_address', val);
            persist.set('gw_dropoff_same','true');
            persist.set('gw_dropoff_address', val);
            // place_id not required for bus
            persist.set('gw_pickup_place_id','');
          } catch(_){ }
          assignPreferredLanguage();
          return true;
        }
      } catch(_){ }
      const input = $('#pickupInput');
      const val = (input && input.value || '').trim();
      // validate age group & traveler type inline on Step 2
      const ageCode = persist.get('gw_age_group') || '';
      const travCode = persist.get('gw_traveler_type') || '';
      let block = false;
      const ageRowTitle = document.querySelector('#ageGroupRow .s2-labels .title');
      const travRowTitle = document.querySelector('#travTypeRow .s2-labels .title');
      const ageErr = document.getElementById('ageGroupError');
      const travErr = document.getElementById('travTypeError');
      const ageBtn = document.getElementById('ageSelectBtn');
      const travBtn = document.getElementById('travTypeSelectBtn');
      if (!ageCode) { block = true; ageRowTitle && ageRowTitle.classList.add('required'); ageErr && ageErr.removeAttribute('hidden'); }
      else { ageRowTitle && ageRowTitle.classList.remove('required'); ageErr && ageErr.setAttribute('hidden',''); }
      // Apply red border on dropdown trigger when missing
      if (!ageCode) { ageBtn && ageBtn.classList.add('error'); } else { ageBtn && ageBtn.classList.remove('error'); }
      if (!travCode) { block = true; travRowTitle && travRowTitle.classList.add('required'); travErr && travErr.removeAttribute('hidden'); }
      else { travRowTitle && travRowTitle.classList.remove('required'); travErr && travErr.setAttribute('hidden',''); }
      if (!travCode) { travBtn && travBtn.classList.add('error'); } else { travBtn && travBtn.classList.remove('error'); }
      if (block) {
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
    bindSpecialRequests();
    guardNext();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Re-translate summary on language change
  try { window.addEventListener('i18n:changed', updateSuitcaseSummary); } catch(_){ }
  // Reflow summary on resize to switch compact/full rendering
  try { window.addEventListener('resize', debounce(updateSuitcaseSummary, 140)); } catch(_){ }
})();
