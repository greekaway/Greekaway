// Driver route details page
(function(){
  function getParam(name){ const u=new URL(location.href); return u.searchParams.get(name); }
  function mapsLink(s){
    if (s.map) return s.map;
    if (s.lat && s.lng) return `https://maps.google.com/?q=${encodeURIComponent(s.lat+','+s.lng)}`;
    if (s.address) return `https://maps.google.com/?q=${encodeURIComponent(s.address)}`;
    return 'https://maps.google.com/';
  }
  async function load(){
    const bid = getParam('booking');
    const header = document.getElementById('routeHeader');
    const stopsEl = document.getElementById('routeStops');
    if (!bid){ header.innerHTML = '<div class="card">Χωρίς αναγνωριστικό κράτησης.</div>'; return; }
    try {
      const r = await DriverAPI.authed('/api/bookings/' + encodeURIComponent(bid));
      const b = r && r.booking;
      if (!b){ header.innerHTML = '<div class="card">Δεν βρέθηκε η διαδρομή.</div>'; return; }
      header.innerHTML = `<div><b>${b.trip_title || b.id}</b></div><div class="meta">${b.date||''} • ${b.pickup_time||''}</div>`;
      if (!b.stops || !b.stops.length){ stopsEl.innerHTML = '<div class="card">Δεν υπάρχουν στάσεις</div>'; return; }
      stopsEl.innerHTML = b.stops.map((s,i)=>`
        <div class="card stop">
          <div>
            <div><b>Στάση ${i+1}</b> — ${s.name||'-'}</div>
            <div class="meta">🚐 ${s.time||'--:--'} • ${s.address||'—'}</div>
          </div>
          <div><a class="btn" href="${mapsLink(s)}" target="_blank" rel="noopener noreferrer">Πλοήγηση</a></div>
        </div>
      `).join('');
    } catch(e){ header.innerHTML = '<div class="card">Σφάλμα φόρτωσης</div>'; }
  }
  // Future: distance matrix estimation (stub)
  // async function computeEtas(stops){
  //   // TODO: Integrate Google Distance Matrix and enrich stops with ETA/ordering
  //   // Keep disabled for now; requires API key and quota considerations
  //   return stops;
  // }
  function init(){ DriverAuth.requireSync(); if (DriverCommon) DriverCommon.footerNav(); load(); }
  window.DriverRoute = { init };
})();
