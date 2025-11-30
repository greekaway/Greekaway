(function(){
  const state = { boundItems: new WeakSet() };

  function setStatus(item, status, message){
    const el = item && item.querySelector('.bus-pickup-geo-status');
    if (!el) return;
    if (status) el.dataset.state = status;
    else delete el.dataset.state;
    el.textContent = message || '';
  }

  function fallbackParseCoordinates(raw){
    const text = String(raw || '').trim();
    if (!text) return { lat:null, lng:null, error:'missing' };
    const parts = text.split(',').map((part) => part.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return { lat:null, lng:null, error:'format' };
    }
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { lat:null, lng:null, error:'nan' };
    }
    if (lat < -90 || lat > 90) return { lat:null, lng:null, error:'lat_range' };
    if (lng < -180 || lng > 180) return { lat:null, lng:null, error:'lng_range' };
    return { lat, lng, error:null };
  }

  function parseCoordinates(raw){
    if (window.TripBusPickups && typeof window.TripBusPickups.parseCoordinates === 'function') {
      return window.TripBusPickups.parseCoordinates(raw);
    }
    return fallbackParseCoordinates(raw);
  }

  function messageFor(errorCode){
    switch (errorCode) {
      case 'format':
        return 'Χρησιμοποίησε μορφή lat,lng με ένα κόμμα.';
      case 'nan':
        return 'Τα δύο νούμερα πρέπει να είναι δεκαδικοί αριθμοί.';
      case 'lat_range':
        return 'Το πλάτος (lat) πρέπει να είναι μεταξύ -90 και 90.';
      case 'lng_range':
        return 'Το μήκος (lng) πρέπει να είναι μεταξύ -180 και 180.';
      case 'missing':
      default:
        return 'Συμπλήρωσε συντεταγμένες lat,lng (π.χ. 37.97535,23.73558).';
    }
  }

  function refreshStatus(item){
    if (!item) return;
    const input = item.querySelector('.bus-pickup-coordinates');
    if (!input) {
      setStatus(item, 'error', 'Το πεδίο συντεταγμένων δεν βρέθηκε.');
      return;
    }
    const value = input.value || '';
    if (!value.trim()) {
      setStatus(item, 'empty', messageFor('missing'));
      return;
    }
    const parsed = parseCoordinates(value);
    if (parsed && parsed.error) {
      setStatus(item, 'error', messageFor(parsed.error));
      return;
    }
    setStatus(item, 'ok', '✔ Έγκυρες συντεταγμένες.');
  }

  function bindItem(item){
    if (!item || state.boundItems.has(item)) return;
    state.boundItems.add(item);
    const coordsInput = item.querySelector('.bus-pickup-coordinates');
    if (coordsInput) {
      coordsInput.addEventListener('input', () => refreshStatus(item));
      coordsInput.addEventListener('blur', () => refreshStatus(item));
      refreshStatus(item);
    } else {
      setStatus(item, 'error', 'Δεν βρέθηκε πεδίο συντεταγμένων.');
    }
  }

  window.AdminBusPickups = {
    bindItem,
    updateIndex(item, index){
      if (!item) return;
      if (typeof index === 'number') item.dataset.pickupIndex = String(index);
    }
  };
})();
