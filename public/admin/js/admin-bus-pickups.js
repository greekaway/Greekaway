(function(){
  const state = {
    boundItems: new WeakSet(),
    autocompleteMap: new WeakMap(),
    scriptPromise: null,
    keyPromise: null
  };

  function parseFloatSafe(value){
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : null;
  }

  function setStatus(item, status, message){
    const el = item && item.querySelector('.bus-pickup-geo-status');
    if (!el) return;
    if (status) el.dataset.state = status;
    else delete el.dataset.state;
    el.textContent = message || '';
  }

  function refreshStatus(item){
    if (!item) return;
    const addressInput = item.querySelector('.bus-pickup-address');
    const lat = parseFloatSafe((item.querySelector('.bus-pickup-lat')||{}).value);
    const lng = parseFloatSafe((item.querySelector('.bus-pickup-lng')||{}).value);
    const address = (addressInput && addressInput.value || '').trim();
    if (!address) {
      setStatus(item, 'empty', 'Πληκτρολόγησε διεύθυνση και επίλεξε από τη λίστα.');
      return;
    }
    if (lat == null || lng == null) {
      setStatus(item, 'pending', 'Επίλεξε πρόταση ώστε να αποθηκευτούν οι συντεταγμένες.');
      return;
    }
    setStatus(item, 'ok', '✔ Συντεταγμένες αποθηκεύτηκαν.');
  }

  function updateLatLngInputs(item, lat, lng){
    if (!item) return;
    const latInput = item.querySelector('.bus-pickup-lat');
    const lngInput = item.querySelector('.bus-pickup-lng');
    const addressInput = item.querySelector('.bus-pickup-address');
    if (latInput) latInput.value = (lat != null) ? String(lat) : '';
    if (lngInput) lngInput.value = (lng != null) ? String(lng) : '';
    if (addressInput) addressInput.dataset.geoSynced = (lat != null && lng != null) ? '1' : '0';
    refreshStatus(item);
  }

  function fetchTripHtmlKey(){
    return fetch('/trip.html', { cache: 'no-store' })
      .then((res) => (res.ok ? res.text() : ''))
      .then((html) => {
        if (!html) return '';
        const match = html.match(/maps\.googleapis\.com\/maps\/api\/js\?key=([^"&]+)/i);
        if (match && match[1] && match[1] !== 'YOUR_GOOGLE_MAPS_API_KEY') return match[1];
        return '';
      })
      .catch(() => '');
  }

  function resolveMapsKey(){
    if (state.keyPromise) return state.keyPromise;
    state.keyPromise = (async () => {
      const htmlKey = await fetchTripHtmlKey();
      if (htmlKey) return htmlKey;
      const res = await fetch('/api/maps-key', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.key) return data.key;
      }
      throw new Error('no-google-key');
    })();
    return state.keyPromise;
  }

  function ensureGooglePlaces(){
    if (window.google && window.google.maps && window.google.maps.places) {
      return Promise.resolve();
    }
    if (state.scriptPromise) return state.scriptPromise;
    state.scriptPromise = resolveMapsKey()
      .then((key) => {
        if (!key) throw new Error('missing-google-key');
        return new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.async = true;
          script.defer = true;
          script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('google-maps-load-failed'));
          document.head.appendChild(script);
        });
      })
      .catch((err) => {
        console.warn('[BusPickup] Google Maps load failed:', err && err.message ? err.message : err);
        throw err;
      });
    return state.scriptPromise;
  }

  function attachAutocomplete(input, item){
    if (!input || state.autocompleteMap.has(input)) return;
    setStatus(item, 'loading', 'Φόρτωση Google Places...');
    ensureGooglePlaces()
      .then(() => {
        const autocomplete = new google.maps.places.Autocomplete(input, {
          fields: ['formatted_address','geometry','name','place_id'],
          types: ['geocode']
        });
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          const formatted = (place && (place.formatted_address || place.name)) || input.value || '';
          if (formatted) input.value = formatted;
          const location = place && place.geometry && place.geometry.location;
          const lat = location && typeof location.lat === 'function' ? location.lat() : null;
          const lng = location && typeof location.lng === 'function' ? location.lng() : null;
          updateLatLngInputs(item, lat, lng);
          try {
            input.dispatchEvent(new Event('input', { bubbles: true }));
          } catch (_){
            const legacy = document.createEvent('Event');
            legacy.initEvent('input', true, true);
            input.dispatchEvent(legacy);
          }
        });
        state.autocompleteMap.set(input, autocomplete);
        refreshStatus(item);
      })
      .catch(() => {
        setStatus(item, 'error', 'Δεν φορτώθηκε το Google Places. Μπορείς να γράψεις τη διεύθυνση χειροκίνητα.');
      });
  }

  function bindItem(item){
    if (!item || state.boundItems.has(item)) return;
    state.boundItems.add(item);
    const addressInput = item.querySelector('.bus-pickup-address');
    if (!addressInput) return;
    addressInput.setAttribute('autocomplete', 'off');
    const lat = parseFloatSafe((item.querySelector('.bus-pickup-lat')||{}).value);
    const lng = parseFloatSafe((item.querySelector('.bus-pickup-lng')||{}).value);
    addressInput.dataset.geoSynced = (lat != null && lng != null) ? '1' : '0';
    addressInput.addEventListener('input', () => {
      if (addressInput.dataset.geoSynced === '1') {
        updateLatLngInputs(item, null, null);
      } else if (!addressInput.value.trim()) {
        updateLatLngInputs(item, null, null);
      } else {
        refreshStatus(item);
      }
    });
    addressInput.addEventListener('focus', () => attachAutocomplete(addressInput, item));
    attachAutocomplete(addressInput, item);
    refreshStatus(item);
  }

  window.AdminBusPickups = {
    bindItem,
    updateIndex(item, index){
      if (!item) return;
      if (typeof index === 'number') item.dataset.pickupIndex = String(index);
    }
  };
})();
