'use strict';
// Admin Trip Availability Editor – month prefetch & per-day override
(function(){
  const tripSel = document.getElementById('tripSelect');
  const modeSel = document.getElementById('modeSelect');
  const calWrap = document.getElementById('calendar');
  const capInput = document.getElementById('capacityInput');
  const takenInput = document.getElementById('takenInput');
  const availInput = document.getElementById('availableInput');
  const saveBtn = document.getElementById('saveBtn');
  const saveMsg = document.getElementById('saveMsg');
  const dateDisplay = document.getElementById('selectedDateDisplay');

  const availabilityMonthCache = {}; // key: trip|mode|YYYY-MM -> { days: { date: {capacity,taken,available} } }
  let fpInstance = null;
  let selectedDate = null; // ISO YYYY-MM-DD

  function log(...args){ try { console.log('[admin-trip-avail]', ...args); } catch(_){ } }
  function escapeHtml(str){ return String(str||'').replace(/[&<>"']/g,s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[s])); }

  async function fetchTrips(){
    try {
      let r = await fetch('/api/admin/trips', { cache:'no-store', credentials:'same-origin' });
      if (!r.ok) r = await fetch('/api/public/trips', { cache:'no-store' });
      if (!r.ok) { tripSel.innerHTML='<option value="">Σφάλμα...</option>'; return; }
      const data = await r.json();
      const arr = Array.isArray(data) ? data : [];
      tripSel.innerHTML = '<option value="">— Επιλογή εκδρομής —</option>' + arr.map(t=>`<option value="${escapeHtml(t.slug||t.id||'')}">${escapeHtml(t.title||t.slug||t.id||'')}</option>`).join('');
    } catch(e){ tripSel.innerHTML='<option value="">Σφάλμα φόρτωσης</option>'; }
  }

  function computeDefaultCapacity(mode){
    if (mode==='bus') return 50; if (mode==='van') return 7; if (mode==='mercedes') return 1; return 0;
  }

  async function prefetchMonth(trip, mode, year, month){
    if (!trip || !mode) return; if (!year || !month) return;
    const monthStr = `${year}-${String(month).padStart(2,'0')}`;
    const key = `${trip}|${mode}|${monthStr}`;
    if (availabilityMonthCache[key]) return; // already loaded
    try {
      const q = new URLSearchParams({ trip_id: trip, mode, month: monthStr });
      const r = await fetch('/api/availability?'+q.toString(), { cache:'no-store' });
      const j = await r.json().catch(()=>({}));
      if (r.ok && j && Array.isArray(j.days)) {
        const map = {}; j.days.forEach(d=>{ if (d && d.date) map[d.date] = { capacity: d.capacity||0, taken: d.taken||0, available: d.available||0 }; });
        availabilityMonthCache[key] = { days: map };
      } else {
        // build fallback month
        const daysCount = new Date(year, month, 0).getDate();
        const map = {}; for (let d=1; d<=daysCount; d++){ const ds = `${monthStr}-${String(d).padStart(2,'0')}`; map[ds] = { capacity: computeDefaultCapacity(mode), taken:0, available: computeDefaultCapacity(mode) }; }
        availabilityMonthCache[key] = { days: map };
      }
    } catch(e){
      const daysCount = new Date(year, month, 0).getDate();
      const map = {}; for (let d=1; d<=daysCount; d++){ const ds = `${monthStr}-${String(d).padStart(2,'0')}`; map[ds] = { capacity: computeDefaultCapacity(mode), taken:0, available: computeDefaultCapacity(mode) }; }
      availabilityMonthCache[key] = { days: map };
    }
  }

  function getDayData(trip, mode, dateStr){
    if (!trip || !mode || !dateStr) return null;
    const monthStr = dateStr.slice(0,7);
    const key = `${trip}|${mode}|${monthStr}`;
    const bucket = availabilityMonthCache[key]; if (!bucket) return null;
    return bucket.days[dateStr] || null;
  }

  function setEditor(dateStr){
    selectedDate = dateStr;
    if (dateDisplay) dateDisplay.textContent = dateStr || 'Καμία ημερομηνία';
    const trip = tripSel.value.trim(); const mode = modeSel.value.trim();
    const data = getDayData(trip, mode, dateStr);
    const defCap = computeDefaultCapacity(mode);
    const capacity = data ? data.capacity : defCap;
    const taken = data ? data.taken : 0;
    const available = Math.max(0, (capacity||0) - (taken||0));
    if (capInput) capInput.value = capacity;
    if (takenInput) takenInput.value = taken;
    if (availInput) availInput.value = available;
    if (saveBtn) saveBtn.disabled = !trip || !mode || !dateStr;
  }

  function recalcAvailable(){
    const capacity = parseInt(capInput.value,10) || 0;
    const taken = parseInt(takenInput.value,10) || 0;
    const available = Math.max(0, capacity - taken);
    availInput.value = available;
  }

  function updateCache(trip, mode, dateStr, capacity, taken){
    const monthStr = dateStr.slice(0,7);
    const key = `${trip}|${mode}|${monthStr}`;
    if (!availabilityMonthCache[key]) availabilityMonthCache[key] = { days: {} };
    const available = Math.max(0, capacity - taken);
    availabilityMonthCache[key].days[dateStr] = { capacity, taken, available };
  }

  async function saveCurrent(){
    const trip = tripSel.value.trim(); const mode = modeSel.value.trim(); const dateStr = selectedDate;
    if (!trip || !mode || !dateStr) return;
    const capacity = parseInt(capInput.value,10) || 0;
    const taken = parseInt(takenInput.value,10) || 0;
    try {
      saveMsg.textContent = 'Αποθήκευση...'; saveMsg.style.color = '#fff';
      const r = await fetch('/api/availability', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ trip_id: trip, date: dateStr, mode, capacity, taken }) });
      const j = await r.json().catch(()=>({}));
      if (r.ok && j && j.ok){
        updateCache(trip, mode, dateStr, (mode==='mercedes')?1:capacity, taken); // enforce mercedes capacity=1
        saveMsg.textContent = '✅ Αποθηκεύτηκε'; saveMsg.style.color = '#2a7';
        try { fpInstance && fpInstance.redraw(); } catch(_){ }
      } else { saveMsg.textContent = '❌ Αποτυχία'; saveMsg.style.color = '#c33'; }
    } catch(e){ saveMsg.textContent = '❌ Σφάλμα δικτύου'; saveMsg.style.color = '#c33'; }
  }

  function annotateDay(dayElem, dateObj){
    try {
      const trip = tripSel.value.trim(); const mode = modeSel.value.trim();
      if (!trip || !mode) return;
      const iso = dateObj.toISOString().slice(0,10);
      const d = getDayData(trip, mode, iso);
      if (!d){ return; }
      dayElem.classList.add('ga-day');
      if (d.available <= 0) dayElem.classList.add('ga-day-full');
      const badge = document.createElement('span');
      badge.className = 'ga-day-badge'; badge.textContent = String(d.available);
      dayElem.appendChild(badge);
    } catch(_){ }
  }

  function initCalendar(){
    if (!window.flatpickr || !calWrap) return;
    // Remove previous instance markup if needed
    try { while (calWrap.firstChild) calWrap.removeChild(calWrap.firstChild); } catch(_){ }
    const input = document.createElement('input');
    input.type='text'; input.id='calInput'; input.className='flatpickr-input';
    calWrap.appendChild(input);
    const todayIso = new Date().toISOString().slice(0,10);
    fpInstance = window.flatpickr(input, {
      altInput:true,
      altFormat:'d F Y',
      dateFormat:'Y-m-d',
      defaultDate: todayIso,
      locale: (typeof getFlatpickrLocale==='function') ? getFlatpickrLocale() : undefined,
      onDayCreate: function(_, __, ___, dayElem){ try { annotateDay(dayElem, dayElem.dateObj); } catch(_){ } },
      onChange: function(sel, dateStr){ setEditor(dateStr); },
      onMonthChange: function(selDates, dateStr, inst){
        const y = inst.currentYear; const m = inst.currentMonth + 1; // 1-based
        const trip = tripSel.value.trim(); const mode = modeSel.value.trim();
        prefetchMonth(trip, mode, y, m).then(()=>{ try { inst.redraw(); } catch(_){ } });
      },
      onReady: function(selDates, dateStr, inst){
        const y = inst.currentYear; const m = inst.currentMonth + 1;
        const trip = tripSel.value.trim(); const mode = modeSel.value.trim();
        prefetchMonth(trip, mode, y, m).then(()=>{ try { inst.redraw(); } catch(_){ } });
      }
    });
    setEditor(todayIso);
  }

  function reloadCalendar(){
    initCalendar();
  }

  // Event listeners
  tripSel.addEventListener('change', ()=>{ reloadCalendar(); });
  modeSel.addEventListener('change', ()=>{ reloadCalendar(); });
  capInput.addEventListener('input', recalcAvailable);
  takenInput.addEventListener('input', recalcAvailable);
  saveBtn.addEventListener('click', ()=>{ saveCurrent(); });

  // Boot
  fetchTrips().then(()=>{ reloadCalendar(); });
})();