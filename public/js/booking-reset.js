// booking-reset.js
// Provides clearBookingState() to wipe Step 2/3 transient booking data when trip_mode changes.
(function(){
  function safeRemove(store, key){ try { store.removeItem(key); } catch(_){} }
  function clearBookingState(){
    const keep = new Set(['gw_lang','gw_pref_lang']); // keep language prefs
    try {
      // Explicit known keys (session + local)
      const explicit = [
        'gw_adults','gw_children_ages','gw_bags_small','gw_bags_medium','gw_bags_large','gw_luggage',
        'gw_age_group','gw_traveler_type','gw_interest','gw_sociality','gw_notes',
        'gw_pickup_address','gw_pickup_place_id','gw_pickup_lat','gw_pickup_lng',
        'gw_dropoff_address','gw_dropoff_same',
        'gw_amount_cents','gw_currency',
        'gw_trip_title','gw_trip_desc',
        'bus_pickup_address'
      ];
      explicit.forEach(k => { safeRemove(sessionStorage, k); safeRemove(localStorage, k); });
      // Generic purge: any gw_ key that looks booking-related (except language)
      const purgeIf = (k) => /^gw_/.test(k) && !keep.has(k) && !/^gw_lang$/.test(k);
      // sessionStorage pass
      try { for (let i=sessionStorage.length-1; i>=0; i--){ const k=sessionStorage.key(i); if (purgeIf(k)) safeRemove(sessionStorage,k); } } catch(_){}
      // localStorage pass
      try { for (let i=localStorage.length-1; i>=0; i--){ const k=localStorage.key(i); if (purgeIf(k)) safeRemove(localStorage,k); } } catch(_){}
    } catch(_){}
  }
  try { window.clearBookingState = clearBookingState; } catch(_){}
})();
