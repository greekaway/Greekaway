// Dynamic vehicle price map per trip (values in EUR for display/use in UI)
// Source of truth: /api/pricing (cents). Here we convert to euros for the current trip.
(function(){
  function getTripIdFromUrl(){
    try {
      const p = new URLSearchParams(window.location.search);
      // trip mode select uses ?trip=, trip page uses trips/trip.html?id=
      return (p.get('id') || p.get('trip') || '').toLowerCase().trim();
    } catch(_){ return ''; }
  }
  function centsToEuros(c){ return (Number(c)||0)/100; }
  async function load(){
    const tripId = getTripIdFromUrl();
    try {
      const r = await fetch('/api/pricing', { cache:'no-store' });
      if (!r.ok) throw new Error('HTTP '+r.status);
      const data = await r.json();
      const e = (tripId && data && data[tripId]) ? data[tripId] : null;
      const map = e ? {
        van: centsToEuros(e.van),
        bus: centsToEuros(e.bus),
        mercedes: centsToEuros(e.private)
      } : { van: 0, bus: 0, mercedes: 0 };
      window.vehiclePriceMap = map;
      // If a vehicle type was preselected earlier, refresh stored price
      try {
        const veh = sessionStorage.getItem('selectedVehicleType');
        if (veh && Object.prototype.hasOwnProperty.call(map, veh)) {
          sessionStorage.setItem('selectedVehiclePrice', String(map[veh]));
        }
      } catch(_){ }
    } catch(_){ window.vehiclePriceMap = { van:0, bus:0, mercedes:0 }; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
