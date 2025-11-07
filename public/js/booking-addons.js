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
    // Persist array form: [{type,count}]
    const arr = ['small','medium','large'].filter(t=>luggageState[t]>0).map(type => ({ type, count: luggageState[type] }));
    persist.setJSON('gw_luggage', arr);
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
  function loadGoogleMapsPlaces(){
    return new Promise((resolve, reject)=>{
      if (window.google && window.google.maps && window.google.maps.places) { googleReady=true; return resolve(); }
      // Fetch injected trip.html to extract key
      fetch('/trips/trip.html', { cache: 'no-cache' })
        .then(r => r.ok ? r.text() : Promise.reject(new Error('no-trip')))
        .then(html => {
          const m = html.match(/maps\.googleapis\.com\/maps\/api\/js\?key=([^"&]+)/i);
          const key = m && m[1];
          if (!key || key === 'YOUR_GOOGLE_MAPS_API_KEY') throw new Error('no-key');
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

  function setNextEnabled(on){ try { const b = $('#s2Next'); if (b) { b.disabled = !on; b.classList.toggle('disabled', !on); } } catch(_){ } }

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
      // Enable Next
      setNextEnabled(!!chosenPlace.place_id);
    };

    function ensureServices(cb){
      if (acService && placesService) return cb();
      if (!googleReady) { loadGoogleMapsPlaces().then(()=>ensureServices(cb)).catch(()=>{}); return; }
      try {
        acService = new google.maps.places.AutocompleteService();
        const dummyMap = document.createElement('div');
        placesService = new google.maps.places.PlacesService(dummyMap);
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

    const doSearch = debounce(() => {
      const q = String(input.value || '').trim();
      if (q.length < 3) { dropdown.hidden = true; dropdown.innerHTML=''; setNextEnabled(false); return; }
      ensureServices(() => {
        try {
          acService.getPlacePredictions({ input: q, types: ['geocode'] }, (preds, status)=>{
            if (status !== google.maps.places.PlacesServiceStatus.OK) {
              console.warn('places: prediction status', status);
              let msg = null;
              if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) msg = t('booking.no_addresses','Δεν βρέθηκαν διευθύνσεις');
              else if (status === google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT) msg = t('booking.rate_limit','Προσωρινό όριο – δοκίμασε ξανά');
              else if (status === google.maps.places.PlacesServiceStatus.REQUEST_DENIED) msg = t('booking.api_denied','Το API κλειδωμένο – έλεγξε το κλειδί');
              else if (status === google.maps.places.PlacesServiceStatus.INVALID_REQUEST) msg = t('booking.invalid_request','Μη έγκυρο αίτημα');
              else msg = t('booking.error_generic','Σφάλμα προτάσεων');
              renderPreds([], msg);
              return;
            }
            renderPreds(preds || []);
          });
        } catch(_){ }
      });
    }, 280);

    input.addEventListener('input', () => { chosenPlace=null; persist.set('gw_pickup_place_id',''); setNextEnabled(false); doSearch(); });
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
      setNextEnabled(true);
    }
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
      const placeId = persist.get('gw_pickup_place_id');
      if (!placeId) {
        ev.preventDefault(); ev.stopPropagation();
        showToast(t('booking.error_select_address','Select an address from the list'));
        setNextEnabled(false);
        return false;
      }
      // Ensure we persist current language and dropoff same
      assignPreferredLanguage();
      persist.set('gw_dropoff_same','true');
      return true;
    }, true); // capture to run before other handlers
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
