// step2-trip-mode.js
// Dynamic enable/disable logic for booking Step 2 based on localStorage trip_mode
// Modes: van, private, bus
(function(){
  const DEFAULT_BUS_ADDRESS = 'Σταθερό σημείο επιβίβασης';
  const PRIVATE_MAX_PAX = 3; // adults + children

  function qs(id){ return document.getElementById(id); }
  function disableRow(row){
    if (!row) return;
    row.classList.add('disabled-field');
    row.querySelectorAll('button, input, textarea, select').forEach(el => {
      try { el.setAttribute('disabled',''); } catch(_) {}
    });
  }
  function enableRow(row){
    if (!row) return;
    row.classList.remove('disabled-field');
    row.querySelectorAll('button[disabled], input[disabled], textarea[disabled], select[disabled]').forEach(el => {
      // Do not re-enable elements that are intentionally static in current mode (handled by caller)
      if (row.__forceDisabled) return;
      try { el.removeAttribute('disabled'); } catch(_) {}
    });
  }
  function setPickupDisabled(address){
    const row = qs('pickupRow');
    const input = qs('pickupInput');
    const mapBtn = qs('pickupMapBtn');
    if (!row) return;
    row.__forceDisabled = true;
    row.classList.add('disabled-field');
    if (input){ input.value = address || DEFAULT_BUS_ADDRESS; input.setAttribute('disabled',''); }
    if (mapBtn){ mapBtn.setAttribute('disabled',''); }
  }
  function setPickupEnabled(){
    const row = qs('pickupRow');
    const input = qs('pickupInput');
    const mapBtn = qs('pickupMapBtn');
    if (!row) return;
    row.__forceDisabled = false;
    row.classList.remove('disabled-field');
    if (input){ input.removeAttribute('disabled'); }
    if (mapBtn){ mapBtn.removeAttribute('disabled'); }
  }
  function enforcePrivateCapacity(){
    const adultsCountEl = qs('adultsCount');
    const childrenCountEl = qs('childrenCount');
    if (!adultsCountEl || !childrenCountEl) return;
    const adults = parseInt(adultsCountEl.textContent||'0',10)||0;
    const children = parseInt(childrenCountEl.textContent||'0',10)||0;
    const total = adults + children;
    if (total > PRIVATE_MAX_PAX){ highlightCapacityWarning(); }
  }
  function highlightCapacityWarning(){
    const adultsRow = qs('adultsCount')?.closest('.s2-row');
    const childrenRow = qs('childrenCount')?.closest('.s2-row');
    [adultsRow, childrenRow].forEach(r => { if (!r) return; r.classList.add('capacity-warning'); setTimeout(()=>{ r.classList.remove('capacity-warning'); },1200); });
  }
  function attachPrivateCapacityGuards(){
    const aInc = qs('adultsInc');
    const cInc = qs('childrenInc');
    const agePicker = qs('agePicker');
    function totalNow(){
      const a = parseInt((qs('adultsCount')?.textContent||'0'),10)||0;
      const c = parseInt((qs('childrenCount')?.textContent||'0'),10)||0;
      return a + c;
    }
    // Capture-phase blockers: prevent increment if total >= 3
    if (aInc){
      aInc.addEventListener('click', (ev)=>{
        if (totalNow() >= PRIVATE_MAX_PAX){ ev.preventDefault(); ev.stopImmediatePropagation(); return false; }
      }, { capture:true });
    }
    if (cInc){
      cInc.addEventListener('click', (ev)=>{
        if (totalNow() >= PRIVATE_MAX_PAX){ ev.preventDefault(); ev.stopImmediatePropagation(); return false; }
      }, { capture:true });
    }
    // Also guard clicks inside agePicker to block adding beyond limit
    if (agePicker){
      agePicker.addEventListener('click', (ev)=>{
        const target = ev.target;
        if (target && target.tagName === 'BUTTON'){
          if (totalNow() >= PRIVATE_MAX_PAX){ ev.preventDefault(); ev.stopImmediatePropagation(); return false; }
        }
      }, { capture:true });
    }
  }

  function applyVanMode(){
    // Enable all rows
    ['ageGroupRow','travTypeRow','interestsRow','socialityRow','specialRequestsRow','pickupRow','suitcasesRow'].forEach(id=> enableRow(qs(id)));
    setPickupEnabled();
    // No capacity limit beyond existing (1..10 adults / 0..10 children)
  }

  function applyPrivateMode(){
    // Keep all profile fields active
    ['ageGroupRow','travTypeRow','interestsRow','socialityRow','specialRequestsRow','suitcasesRow'].forEach(id=> enableRow(qs(id)));
    setPickupEnabled();
    // Enforce total pax <= 3
    attachPrivateCapacityGuards();
    enforcePrivateCapacity();
  }

  function applyBusMode(){
    // Disable profile & message
    ['ageGroupRow','travTypeRow','interestsRow','socialityRow','specialRequestsRow'].forEach(id=> disableRow(qs(id)));
    // Pickup auto-filled from trip page (localStorage) or fallback
    const busAddr = (function(){
      // Prefer trip JSON fixed start location if available
      try {
        const trip = (window.__loadedTrip || null);
        const depName = trip && trip.departure && trip.departure.reference_point && trip.departure.reference_point.name;
        if (depName && String(depName).trim()) return String(depName).trim();
      } catch(_){ }
      // Fallback to value persisted by trip page
      try { const v = localStorage.getItem('bus_pickup_address'); if (v && v.trim()) return v.trim(); } catch(_) { }
      // Last resort: any session value from a previous pass
      try { const v2 = sessionStorage.getItem('gw_pickup_address'); if (v2 && v2.trim()) return v2.trim(); } catch(_){ }
      return DEFAULT_BUS_ADDRESS;
    })();
    setPickupDisabled(busAddr);
    // Persist to session for Step 3 consumption
    try {
      sessionStorage.setItem('gw_pickup_address', busAddr);
      sessionStorage.setItem('gw_dropoff_same', 'true');
      sessionStorage.setItem('gw_dropoff_address', busAddr);
      sessionStorage.removeItem('gw_pickup_place_id');
    } catch(_){ }
    // Enable pax counters & suitcases
    ['suitcasesRow'].forEach(id=> enableRow(qs(id)));
    const adultsRow = qs('adultsCount')?.closest('.s2-row');
    const childrenRow = qs('childrenCount')?.closest('.s2-row');
    [adultsRow, childrenRow].forEach(r=> enableRow(r));
    // Notify other scripts to refresh Next button visual state
    try { document.dispatchEvent(new CustomEvent('gw:step2:fieldsChanged')); } catch(_){ }
  }

  // Step 1 (trip.html) occupancy/availability greying when private or bus
  function applyStep1Decorations(mode){
    if (mode !== 'private' && mode !== 'bus') return;
    try {
      const occ = document.getElementById('occupancyIndicator');
      const av = document.getElementById('availabilityBlock');
      if (occ) occ.classList.add('disabled-field');
      if (av) av.classList.add('disabled-field');
    } catch(_){}
  }
  function observeStep1Decorations(mode){
    if (mode !== 'private' && mode !== 'bus') return;
    try {
      const mo = new MutationObserver(()=> applyStep1Decorations(mode));
      mo.observe(document.body, { childList: true, subtree: true });
      // initial attempt
      applyStep1Decorations(mode);
    } catch(_){}
  }

  function init(){
    const qsMode = (new URLSearchParams(window.location.search)).get('mode');
    let mode = (qsMode || localStorage.getItem('trip_mode') || 'van').toLowerCase();
    if (mode === 'mercedes') mode = 'private';
    try { localStorage.setItem('trip_mode', mode); } catch(_) {}
    // Ensure selected vehicle type/price are present even if user landed directly with ?mode=
    try {
      const map = (window.vehiclePriceMap || {});
      const veh = (mode === 'private') ? 'mercedes' : mode;
      // Write if missing or if mode changed
      const curVeh = (function(){ try { return sessionStorage.getItem('selectedVehicleType') || ''; } catch(_){ return ''; } })();
      if (!curVeh || curVeh !== veh) {
        try { sessionStorage.setItem('selectedVehicleType', veh); } catch(_){ }
        if (Object.prototype.hasOwnProperty.call(map, veh)) {
          try { sessionStorage.setItem('selectedVehiclePrice', String(map[veh])); } catch(_){ }
        }
      }
    } catch(_){ }
    if (mode === 'private'){ applyPrivateMode(); }
    else if (mode === 'bus'){ applyBusMode(); }
    else { applyVanMode(); }
    // Also apply Step 1 decorations if we are on the trip page
    observeStep1Decorations(mode);
    // Expose globally (debug/testing)
    try { window.applyVanMode = applyVanMode; window.applyPrivateMode = applyPrivateMode; window.applyBusMode = applyBusMode; } catch(_){}
  }

  document.addEventListener('DOMContentLoaded', init);
})();
