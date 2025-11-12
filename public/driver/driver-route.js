// Driver route details page
(function(){
  // Global UI flags to avoid re-rendering while dragging (prevents layout jumps)
  let isDragging = false;
  let pendingRefreshTimer = null;
  let pendingSaveTimer = null;
  let isSaving = false;
  let lastSentHash = null;
  let retryInterval = null;
  // Smart navigation state
  let geo = { ready:false, allowed:false, lat:null, lng:null };
  let lastOriginMode = 'first-stop'; // 'first-stop' | 'current-location'
  // Geolocation locating-delay controls (initial load only)
  let locatingInProgress = false;
  let locatingTimer = null;
  let initialGeoAttempted = false;
  function scheduleRefresh(fn, ms){
    if (pendingRefreshTimer){ clearTimeout(pendingRefreshTimer); pendingRefreshTimer = null; }
    pendingRefreshTimer = setTimeout(()=>{ pendingRefreshTimer = null; if (!isDragging) try{ fn(); }catch(_){} }, ms|0);
  }
  function cancelRefresh(){ if (pendingRefreshTimer){ clearTimeout(pendingRefreshTimer); pendingRefreshTimer = null; } }
  function debounceSave(fn, ms){
    if (pendingSaveTimer){ clearTimeout(pendingSaveTimer); pendingSaveTimer = null; }
    pendingSaveTimer = setTimeout(()=>{ pendingSaveTimer = null; fn(); }, ms|0);
  }
  function getParam(name){ const u=new URL(location.href); return u.searchParams.get(name); }
  function haversineKm(lat1, lon1, lat2, lon2){
    const toRad = (d)=> d*Math.PI/180;
    const R = 6371; // km
    const dLat = toRad(lat2-lat1);
    const dLon = toRad(lon2-lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R*c;
  }
  function setNavBanner(text){ const el = document.getElementById('navOriginBanner'); if (el) el.textContent = text||''; }
  function tryGeolocateOnce(){
    if (initialGeoAttempted) return;
    initialGeoAttempted = true;
    if (!('geolocation' in navigator)) { geo.ready=true; geo.allowed=false; return; }
  // Show locating banner immediately and wait up to 3s before fallback
    locatingInProgress = true;
    setNavBanner('📍 Εντοπισμός θέσης...');
    // Build nav once with current assumed origin to avoid empty state
    try { updateTopNavFromDom(); } catch(_){ }
    locatingTimer = setTimeout(()=>{
      // If still no allowed geolocation, show fallback
      if (!(geo && geo.allowed)){
        geo.ready = true; geo.allowed = false; geo.lat = null; geo.lng = null;
        locatingInProgress = false;
        setNavBanner('⚠️ Δεν είναι δυνατός ο αυτόματος εντοπισμός θέσης – η διαδρομή ξεκινά από την πρώτη στάση.');
        try { updateTopNavFromDom(); } catch(_){ }
      }
  }, 3000);
    navigator.geolocation.getCurrentPosition((pos)=>{
      geo = { ready:true, allowed:true, lat: pos.coords.latitude, lng: pos.coords.longitude };
      locatingInProgress = false;
      if (locatingTimer){ clearTimeout(locatingTimer); locatingTimer = null; }
      setNavBanner('📍 Έναρξη από τρέχουσα θέση (ενεργό)');
      try { updateTopNavFromDom(); } catch(_){ }
    }, (_err)=>{
      // Mark as ready but keep the locating banner until the 3s fallback fires
      geo = { ready:true, allowed:false, lat:null, lng:null };
      // Do not show fallback yet; timer will handle after 3s
    }, { enableHighAccuracy:true, maximumAge:15000, timeout:7000 });
  }
  function mapsLink(s){
    if (s.map) return s.map;
    if (s.lat && s.lng) return `https://maps.google.com/?q=${encodeURIComponent(s.lat+','+s.lng)}`;
    if (s.address) return `https://maps.google.com/?q=${encodeURIComponent(s.address)}`;
    return 'https://maps.google.com/';
  }
  function isPickup(s){ return String((s.type||'').toLowerCase()) === 'pickup' || /παραλαβή/i.test(String(s.name||'')); }
  function cardHtml(s,i){
    const isP = isPickup(s);
    const timeStr = (s.eta_local || s.time || '--:--');
    const dist = s.distance_text ? ` • ${s.distance_text}` : '';
    const timeIcon = () => (
      `<svg class="ico ico-time" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 1.75a10.25 10.25 0 1 0 0 20.5 10.25 10.25 0 0 0 0-20.5Zm0 1.5a8.75 8.75 0 1 1 0 17.5 8.75 8.75 0 0 1 0-17.5Zm-.75 3.5c0-.414.336-.75.75-.75s.75.336.75.75v5.19l3.41 1.965a.75.75 0 1 1-.75 1.3l-3.78-2.18a.75.75 0 0 1-.38-.65V6.75Z"/>
      </svg>`
    );
    const pickupIcon = () => (
      `<svg class="ico ico-pickup" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 7.5h9l2.25 3H19c1.657 0 3 1.343 3 3v3.75a.75.75 0 0 1-.75.75h-1.5a2.25 2.25 0 0 1-4.5 0H8.25a2.25 2.25 0 0 1-4.5 0H2.75a.75.75 0 0 1-.75-.75V8.25c0-.414.336-.75.75-.75Zm.75 1.5v6h.75a2.25 2.25 0 0 1 4.5 0h6a2.25 2.25 0 0 1 4.5 0h.75V13.5c0-.828-.672-1.5-1.5-1.5h-5.25a.75.75 0 0 1-.6-.3L10.5 9H3.75Z"/>
      </svg>`
    );
    const iconHtml = isP ? pickupIcon() : timeIcon();
    const metaLine = `${iconHtml} ${timeStr} • ${s.address||'—'}${dist}`;
    const dragAttr = isP ? ' draggable="true" ' : '';
    const dragCls = isP ? ' dnd-item ' : '';
  const dataIdx = (typeof s.original_index==='number') ? ` data-orig-idx="${s.original_index}" ` : '';
  const dataAddr = s.address ? ` data-addr="${String(s.address).replace(/"/g,'&quot;')}" ` : '';
  const dataLat = (s.lat!=null) ? ` data-lat="${s.lat}" ` : '';
  const dataLng = (s.lng!=null) ? ` data-lng="${s.lng}" ` : '';
    const titleLabel = isP ? `Παραλαβή ${i+1}` : `Στάση ${i+1}`;
      return `<div class="card stop${dragCls}"${dragAttr}${dataIdx}${dataAddr}${dataLat}${dataLng}>
        <div>
          <div><b>${titleLabel}</b> — ${s.name||'-'}</div>
          <div class="meta">${metaLine}</div>
        </div>
      </div>`;
  }
    // Build/update the top navigation URL based on current DOM order
    function updateTopNavFromDom(){
      const navBtn = document.querySelector('.btn-navigate');
      if (!navBtn) return;
      const toQueryFromEl = (el)=>{
        const addr = (el.getAttribute('data-addr')||'').trim();
        const lat = el.getAttribute('data-lat');
        const lng = el.getAttribute('data-lng');
        if (addr) return addr;
        if (lat && lng) return `${lat},${lng}`;
        return '';
      };
      const pickEls = Array.from(document.querySelectorAll('#pickupStops .card.stop'));
      const tourEls = Array.from(document.querySelectorAll('#tourStops .card.stop'));
      const allEls = pickEls.concat(tourEls);
      const stops = allEls.map(toQueryFromEl).filter(Boolean);
      if (stops.length > 1){
        if (locatingInProgress){
          const origin = stops[0];
          const destination = stops[stops.length - 1];
          const middle = stops.slice(1, -1);
          const waypointsParam = middle.length ? middle.map(encodeURIComponent).join('|') : '';
          const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&waypoints=${waypointsParam}&travelmode=driving`;
          navBtn.href = gmapsUrl;
          setNavBanner('📍 Εντοπισμός θέσης...');
          return;
        }
        // Decide origin: if geolocation allowed and far from first stop (>300m), use Current Location, else use first stop
        let origin = stops[0];
        let destination = stops[stops.length - 1];
        let middle = stops.slice(1, -1);
        if (geo && geo.allowed && geo.lat!=null && geo.lng!=null){
          // try to read first stop lat/lng from DOM for precise distance
          const firstEl = allEls[0];
          const fLat = parseFloat(firstEl && firstEl.getAttribute('data-lat'));
          const fLng = parseFloat(firstEl && firstEl.getAttribute('data-lng'));
          if (Number.isFinite(fLat) && Number.isFinite(fLng)){
            const km = haversineKm(geo.lat, geo.lng, fLat, fLng);
            if (km > 0.3){
              origin = 'Current Location';
              middle = stops.slice(0, -1); // include first stop in waypoints when starting from current location
              lastOriginMode = 'current-location';
              setNavBanner('📍 Έναρξη από τρέχουσα θέση (ενεργό)');
            } else {
              lastOriginMode = 'first-stop';
              setNavBanner('📍 Έναρξη από πρώτη στάση');
            }
          } else {
            lastOriginMode = 'first-stop';
            setNavBanner('📍 Έναρξη από πρώτη στάση');
          }
        } else {
          lastOriginMode = 'first-stop';
          if (geo.ready && !geo.allowed){ setNavBanner('⚠️ Δεν είναι δυνατός ο αυτόματος εντοπισμός θέσης – η διαδρομή ξεκινά από την πρώτη στάση.'); }
          else { setNavBanner('📍 Έναρξη από πρώτη στάση'); }
        }
        const waypointsParam = middle.length ? middle.map(encodeURIComponent).join('|') : '';
        const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&waypoints=${waypointsParam}&travelmode=driving`;
        navBtn.href = gmapsUrl;
      } else if (stops.length === 1){
        if (locatingInProgress){
          const dest = stops[0];
          navBtn.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest)}`;
          setNavBanner('📍 Εντοπισμός θέσης...');
          return;
        }
        // Single stop: if geolocation allowed, start from current location with directions
        const dest = stops[0];
        if (geo && geo.allowed){
          navBtn.href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent('Current Location')}&destination=${encodeURIComponent(dest)}&travelmode=driving`;
          setNavBanner('📍 Έναρξη από τρέχουσα θέση (ενεργό)');
        } else {
          navBtn.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest)}`;
          setNavBanner('📍 Έναρξη από πρώτη στάση');
        }
      } else {
        navBtn.removeAttribute('href');
      }
    }
  function renderStopsSplit(b){
    const pickups = (b.stops||[]).filter(isPickup);
    const tours = (b.stops||[]).filter(s => !isPickup(s));
    const pEl = document.getElementById('pickupStops');
    const tEl = document.getElementById('tourStops');
    const act = document.getElementById('pickupActions');
    pEl.innerHTML = pickups.map((s,i)=>cardHtml(s,i)).join('');
    tEl.innerHTML = tours.map((s,i)=>cardHtml(s,i)).join('');
    act.style.display = pickups.length ? '' : 'none';
    enableDnD(pEl);
  }
  // Renumber the visible pickup cards immediately based on current DOM order (optimistic UI)
  function renumberPickups(container){
    const cards = Array.from(container.querySelectorAll('.dnd-item'));
    cards.forEach((el, i) => {
      const title = el.querySelector('b');
      if (title) title.textContent = `Παραλαβή ${i+1}`;
    });
  }
  function enableDnD(container){
    // Basic HTML5 drag-and-drop between pickup cards (desktop/mouse)
    let dragSrc = null;
    // Build current order payload (indices + addresses) based on DOM
    function currentOrderPayload(){
      const items = Array.from(container.querySelectorAll('.dnd-item'));
      const order = items.map(el => Number(el.getAttribute('data-orig-idx'))).filter(v => Number.isFinite(v));
      const order_addresses = items.map(el => (el.getAttribute('data-addr')||'').trim()).filter(Boolean);
      return { order, order_addresses };
    }
    // Try send pending order saved in localStorage (fail-safe)
    async function tryResendPending(bid){
      if (isSaving) return;
      let stored = null;
      try { const raw = localStorage.getItem('ga_pending_pickup_order_'+bid); stored = raw ? JSON.parse(raw) : null; } catch(_){ stored = null; }
      if (!stored) return;
      try {
        isSaving = true;
        await DriverAPI.authed('/api/update-pickup-order', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(stored) });
        isSaving = false; localStorage.removeItem('ga_pending_pickup_order_'+bid);
        showStatus('✅ Η νέα σειρά αποθηκεύτηκε επιτυχώς.', 1500);
        if (retryInterval){ clearInterval(retryInterval); retryInterval = null; }
      } catch(_){ isSaving = false; }
    }
    // Persist order now (debounced externally)
    function saveNow(){
      const bid = getParam('booking');
      const { order, order_addresses } = currentOrderPayload();
      if (!order.length) return;
      const h = JSON.stringify({ order, order_addresses });
      if (lastSentHash === h) return; // avoid duplicate sends for same order
      lastSentHash = h;
      const body = { booking_id: bid, new_order_original_indices: order, order_addresses };
      const attempt = async () => {
        try {
          isSaving = true;
          await DriverAPI.authed('/api/update-pickup-order', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
          isSaving = false;
          showStatus('✅ Η νέα σειρά αποθηκεύτηκε επιτυχώς.', 1500);
          try { localStorage.removeItem('ga_pending_pickup_order_'+bid); } catch(_){}
          if (retryInterval){ clearInterval(retryInterval); retryInterval = null; }
        } catch(e){
          isSaving = false;
          showStatus('⚠️ Η αποθήκευση δεν ολοκληρώθηκε – θα επαναπροσπαθήσουμε.', 0);
          try { localStorage.setItem('ga_pending_pickup_order_'+bid, JSON.stringify(body)); } catch(_){}
          if (!retryInterval){ retryInterval = setInterval(()=>{ tryResendPending(bid); }, 15000); }
        }
      };
      attempt();
    }
    window.addEventListener('online', ()=>{ const bid = getParam('booking'); tryResendPending(bid); });
    function capturePositions(){
      const map = new Map();
      Array.from(container.querySelectorAll('.dnd-item')).forEach(el=>{
        map.set(el, el.getBoundingClientRect());
      });
      return map;
    }
    function playFLIP(before, excludeEl){
      const items = Array.from(container.querySelectorAll('.dnd-item'));
      items.forEach(el => {
        if (excludeEl && el === excludeEl) return; // avoid jitter on the dragged item
        const prev = before.get(el);
        if (!prev) return;
        const now = el.getBoundingClientRect();
        const dx = prev.left - now.left;
        const dy = prev.top - now.top;
        if (!dx && !dy) return;
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        // two rAFs to ensure layout flush
        requestAnimationFrame(()=>{
          requestAnimationFrame(()=>{
            el.style.transition = '';
            el.style.transform = '';
          });
        });
      });
    }
    container.querySelectorAll('.dnd-item').forEach(el => {
      el.addEventListener('dragstart', (e) => { dragSrc = el; e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging','selected'); isDragging = true; cancelRefresh(); });
      el.addEventListener('dragend', () => { dragSrc = null; container.querySelectorAll('.dnd-item').forEach(x=>x.classList.remove('dragging')); isDragging = false; });
      el.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      el.addEventListener('drop', (e) => {
        e.preventDefault(); if (!dragSrc || dragSrc === el) return;
        const before = capturePositions();
        const items = Array.from(container.querySelectorAll('.dnd-item'));
        const srcIdx = items.indexOf(dragSrc); const dstIdx = items.indexOf(el);
        if (srcIdx < 0 || dstIdx < 0) return;
        if (srcIdx < dstIdx) container.insertBefore(dragSrc, el.nextSibling); else container.insertBefore(dragSrc, el);
        playFLIP(before, dragSrc);
        // Optimistic: update numbering immediately
        renumberPickups(container);
        // Debounced auto-save after drag end
        debounceSave(saveNow, 500);
        // Update the top navigation URL immediately to reflect new order
        updateTopNavFromDom();
      });
    });

    // Touch & pointer events (mobile/tablet) — simple vertical reorder
    (function enableTouchPointer(){
      const supportsPointer = 'PointerEvent' in window;
      let dragging = null;   // active element being reordered
      let pending = null;    // element pressed but not yet started (delay)
      let startY = 0;
      let startX = 0;
      let pressTimer = null;
      const DELAY_MS = 0;             // immediate start when possible
      const MOVE_THRESHOLD = 2;       // smaller threshold for sensitivity
      function getY(e){ return (e.touches && e.touches[0] && e.touches[0].clientY) || e.clientY || 0; }
      function getX(e){ return (e.touches && e.touches[0] && e.touches[0].clientX) || e.clientX || 0; }
      function vibrate(ms){ try { if (window.navigator && typeof window.navigator.vibrate === 'function') window.navigator.vibrate(ms|0); } catch(_){} }

      // Mirror/placeholder mechanics for smoother follow
      let placeholder = null;
      let offsetY = 0, offsetX = 0;
      let rafMove = null; let latestPos = null;
      function startDragNow(el, x, y){
        isDragging = true; cancelRefresh();
        dragging = el;
        el.classList.add('dragging');
        // Haptic feedback on start
        vibrate(20);
        const r = el.getBoundingClientRect();
        offsetY = y - r.top; offsetX = x - r.left;
        // Insert placeholder with same height/margins to keep layout stable
  placeholder = document.createElement('div');
  placeholder.className = 'dnd-placeholder';
  const cs = getComputedStyle(el);
  const mt = parseFloat(cs.marginTop||'0')||0;
  const mb = parseFloat(cs.marginBottom||'0')||0;
  placeholder.style.height = (r.height + mt + mb) + 'px';
  // Avoid double vertical spacing due to adjacent margins
  placeholder.style.margin = '0';
        el.parentNode.insertBefore(placeholder, el.nextSibling);
        // Float the dragged element
        el.style.width = r.width + 'px';
        el.style.position = 'fixed';
        el.style.top = (y - offsetY) + 'px';
        el.style.left = (r.left) + 'px';
        el.style.zIndex = 1000;
        el.style.pointerEvents = 'none';
        el.style.transition = 'none';
      }
      function moveDragTo(x, y){
        latestPos = { x, y };
        if (rafMove) return;
        rafMove = requestAnimationFrame(() => {
          rafMove = null;
          if (!dragging || !latestPos) return;
          const { x:mx, y:my } = latestPos; latestPos = null;
          dragging.style.top = (my - offsetY) + 'px';
          // Reorder placeholder among siblings
          const before = capturePositions();
          const items = Array.from(container.querySelectorAll('.dnd-item'));
          const siblings = items.filter(x => x !== dragging);
          let placed = false;
          for (const s of siblings){
            const r = s.getBoundingClientRect();
            const mid = r.top + r.height/2;
            if (my < mid){
              if (placeholder !== s) container.insertBefore(placeholder, s);
              placed = true; break;
            }
          }
          if (!placed && placeholder && placeholder.parentNode === container){
            container.appendChild(placeholder);
          }
          playFLIP(before, dragging);
        });
      }
      function finishDrag(){
        if (!dragging) return;
        // Place dragged element into placeholder spot
        if (placeholder && placeholder.parentNode){
          placeholder.parentNode.insertBefore(dragging, placeholder);
          placeholder.parentNode.removeChild(placeholder);
        }
        placeholder = null;
        // Reset styles/classes
        dragging.classList.remove('dragging','selected');
        dragging.style.position = '';
        dragging.style.top = '';
        dragging.style.left = '';
        dragging.style.width = '';
        dragging.style.zIndex = '';
        dragging.style.pointerEvents = '';
        dragging.style.transition = '';
        dragging = null;
        isDragging = false;
        // Optimistic: update numbering immediately
        renumberPickups(container);
        // Debounced auto-save after touch/pointer drag end
        debounceSave(saveNow, 500);
        // Update the top navigation URL immediately to reflect new order
        updateTopNavFromDom();
      }
      function onDown(e){
        const t = (e.target && e.target.closest) ? e.target.closest('.dnd-item') : null;
        if (!t) return;
        // Avoid starting drag from navigation button or anchor
        if (e.target && e.target.closest && e.target.closest('a, .btn')) return;
        // Ignore mouse here; native DnD handles it
        if (!e.touches && e.pointerType === 'mouse') return;
        pending = t; startY = getY(e); startX = getX(e);
        t.classList.add('selected');
        // start delayed activation
        clearTimeout(pressTimer);
        pressTimer = setTimeout(()=>{ if (pending){ startDragNow(pending, startX, startY); } }, DELAY_MS);
      }
      function onMove(e){
        const y = getY(e); const x = getX(e);
        if (!y && !x) return;
        if (!dragging){
          // if moved more than threshold, start drag immediately
          if (pending && (Math.abs(y - startY) > MOVE_THRESHOLD || Math.abs(x - startX) > MOVE_THRESHOLD)){
            startDragNow(pending, x, y);
          } else {
            return; // not yet dragging
          }
        }
        // Prevent page scroll while dragging
        e.preventDefault();
        moveDragTo(x, y);
      }
      function onUp(){
        clearTimeout(pressTimer);
        if (pending){ pending.classList.remove('selected'); pending = null; }
        if (!dragging) return;
        finishDrag();
      }

      // Touch events
      container.addEventListener('touchstart', onDown, { passive: true });
      container.addEventListener('touchmove', onMove, { passive: false });
      container.addEventListener('touchend', onUp);
      // Pointer events (non-mouse)
      if (supportsPointer){
        container.addEventListener('pointerdown', (e)=>{ if (e.pointerType !== 'mouse') onDown(e); }, { passive: false });
        container.addEventListener('pointermove', (e)=>{ if (e.pointerType !== 'mouse') onMove(e); }, { passive: false });
        container.addEventListener('pointerup',   (e)=>{ if (e.pointerType !== 'mouse') onUp(e); });
        container.addEventListener('pointercancel',(e)=>{ if (e.pointerType !== 'mouse') onUp(e); });
      }
    })();
    // Status helper for auto-save toasts
    const statusEl = document.getElementById('pickupSaveStatus');
    let statusTimer = null;
    function showStatus(msg, ms=1500){
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
      if (msg && ms>0){ statusTimer = setTimeout(()=>{ statusEl.textContent=''; }, ms); }
    }
  }
  async function load(){
    if (isDragging) return; // avoid re-render while dragging to prevent layout jumps
    const bid = getParam('booking');
    const header = document.getElementById('routeHeader');
    const navBtn = document.querySelector('.btn-navigate');
    if (!bid){ header.innerHTML = '<div class="card">Χωρίς αναγνωριστικό κράτησης.</div>'; return; }
    try {
      const r = await DriverAPI.authed('/api/bookings/' + encodeURIComponent(bid));
      const b = r && r.booking;
      if (!b){ header.innerHTML = '<div class="card">Δεν βρέθηκε η διαδρομή.</div>'; return; }
  const calcLabel = (b.calc && b.calc.method) ? (b.calc.method === 'google' ? 'Υπολογισμός: Google' : (b.calc.method==='manual'?'Χειροκίνητη σειρά':'Υπολογισμός: Fallback')) : '';
  const anchorLabel = (b.calc && b.calc.anchor_hhmm) ? ` • Άφιξη πρώτης στάσης: ${b.calc.anchor_hhmm}` : '';
  header.innerHTML = `<div><b>${b.trip_title || b.id}</b></div><div class="meta">${b.date||''} • ${b.pickup_time||''}${anchorLabel}${calcLabel ? ' • '+calcLabel : ''}</div>`;
      if (!b.stops || !b.stops.length){
        document.getElementById('pickupStops').innerHTML = '<div class="card">Δεν υπάρχουν στάσεις</div>';
        document.getElementById('tourStops').innerHTML = '';
        return;
      }
      renderStopsSplit(b);

      // Build top navigation URL from the DOM we just rendered (reflects current on-screen order)
      updateTopNavFromDom();
    } catch(e){ header.innerHTML = '<div class="card">Σφάλμα φόρτωσης</div>'; }
  }
  // Future: distance matrix estimation (stub)
  // async function computeEtas(stops){
  //   // TODO: Integrate Google Distance Matrix and enrich stops with ETA/ordering
  //   // Keep disabled for now; requires API key and quota considerations
  //   return stops;
  // }
  function init(){ DriverAuth.requireSync(); if (DriverCommon) DriverCommon.footerNav(); tryGeolocateOnce(); load(); }
  window.DriverRoute = { init };
  // Auto-refresh every 30s to pick up ETA changes or ordering updates
  setInterval(load, 30000);
})();
