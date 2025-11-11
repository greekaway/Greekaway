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
    const navBtn = document.querySelector('.btn-navigate');
    const planner = document.getElementById('pickupPlanner');
    const picker = document.getElementById('firstPickupSelect');
    const applyBtn = document.getElementById('applyPickupPlan');
    const statusEl = document.getElementById('pickupPlanStatus');
    // Clear any previous status on (re)load so messages don’t stick around
    if (statusEl) statusEl.textContent = '';
    if (!bid){ header.innerHTML = '<div class="card">Χωρίς αναγνωριστικό κράτησης.</div>'; return; }
    try {
      const r = await DriverAPI.authed('/api/bookings/' + encodeURIComponent(bid));
      const b = r && r.booking;
      if (!b){ header.innerHTML = '<div class="card">Δεν βρέθηκε η διαδρομή.</div>'; return; }
  const calcLabel = (b.calc && b.calc.method) ? (b.calc.method === 'google' ? 'Υπολογισμός: Google' : 'Υπολογισμός: Fallback') : '';
  const anchorLabel = (b.calc && b.calc.anchor_hhmm) ? ` • Άφιξη πρώτης στάσης: ${b.calc.anchor_hhmm}` : '';
  header.innerHTML = `<div><b>${b.trip_title || b.id}</b></div><div class="meta">${b.date||''} • ${b.pickup_time||''}${anchorLabel}${calcLabel ? ' • '+calcLabel : ''}</div>`;
      if (!b.stops || !b.stops.length){ stopsEl.innerHTML = '<div class="card">Δεν υπάρχουν στάσεις</div>'; return; }
      stopsEl.innerHTML = b.stops.map((s,i)=>{
        const isPickup = String((s.type||'').toLowerCase()) === 'pickup' || /παραλαβή/i.test(String(s.name||''));
        const showEta = isPickup || !!s.isFirstTourStop;
        const eta = showEta ? (s.eta_local || s.time || '--:--') : '';
        const dist = s.distance_text ? ` • ${s.distance_text}` : '';
        const metaLine = showEta ? `🚐 ${eta} • ${s.address||'—'}${dist}` : `${s.address||'—'}${dist}`;
        return `<div class="card stop">
          <div>
            <div><b>Στάση ${i+1}</b> — ${s.name||'-'}</div>
            <div class="meta">${metaLine}</div>
          </div>
          <div><a class="btn" href="${mapsLink(s)}" target="_blank" rel="noopener noreferrer">Πλοήγηση</a></div>
        </div>`;
      }).join('');

      // Build pickup planner options: only pickup stops
      const pickups = (b.stops||[]).map((s,idx)=>({s,idx,orig: (typeof s.original_index==='number'? s.original_index : idx)})).filter(x=>{
        const t=String((x.s.type||'').toLowerCase());
        return t==='pickup' || /παραλαβή/i.test(String(x.s.name||''));
      });
      if (pickups.length){
        planner.style.display = '';
        picker.innerHTML = pickups.map((p,i)=>`<option value="${p.orig}">${p.s.name || ('Παραλαβή '+(i+1))} — ${p.s.address||''}</option>`).join('');
        applyBtn.onclick = async () => {
          applyBtn.disabled = true; statusEl.textContent = 'Αποθήκευση…';
          try {
            await DriverAPI.authed('/api/plan-pickups', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ booking_id: bid, first_pickup_original_index: Number(picker.value) }) });
            statusEl.textContent = 'Το σχέδιο αποθηκεύτηκε. Ενημέρωση…';
            setTimeout(load, 300);
            // Auto-hide the success message after a short delay
            setTimeout(() => { if (statusEl && statusEl.textContent) statusEl.textContent = ''; }, 2500);
          } catch(e){ statusEl.textContent = 'Σφάλμα αποθήκευσης'; }
          finally { applyBtn.disabled = false; }
        };
      } else {
        planner.style.display = 'none';
      }

      // Multi-stop Google Maps navigation (driver global button)
      // Builds a single route with all stops (origin -> waypoints -> destination)
      // optimizeWaypoints=true lets Google reorder intermediate stops for an optimal route
      if (navBtn){
        const toQuery = (s)=> s.address || ((s.lat!=null && s.lng!=null)? `${s.lat},${s.lng}` : '');
        const stops = b.stops.filter(s=> toQuery(s));
        if (stops.length > 1){
          const origin = toQuery(stops[0]);
          const destination = toQuery(stops[stops.length - 1]);
          const middle = stops.slice(1, -1).map(toQuery);
          // Build exact order from metadata.stops only (no hidden/extra waypoints, no auto-optimize)
          const waypointsParam = middle.length ? middle.map(encodeURIComponent).join('|') : '';
          const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&waypoints=${waypointsParam}&travelmode=driving`;
          navBtn.href = gmapsUrl;
        } else if (stops.length === 1){
          const single = toQuery(stops[0]);
          const singleUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(single)}`;
          navBtn.href = singleUrl;
        } else {
          navBtn.removeAttribute('href');
        }
      }
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
  // Auto-refresh every 30s to pick up ETA changes or ordering updates
  setInterval(load, 30000);
})();
