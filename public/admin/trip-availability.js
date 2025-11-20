'use strict';
// Admin Trip Availability Editor – month prefetch & per-day override
 (function(){
  const tripSel = document.getElementById('tripSelect');
  const modeSel = document.getElementById('modeSelect');
  const monthInput = document.getElementById('monthSelect');
  const prevMonthBtn = document.getElementById('prevMonthBtn');
  const nextMonthBtn = document.getElementById('nextMonthBtn');
  const calWrap = document.getElementById('calendar-container');
  const capInput = document.getElementById('capacityInput');
  const takenInput = document.getElementById('takenInput');
  const availInput = document.getElementById('availableInput');
  const saveBtn = document.getElementById('saveBtn');
  const saveMsg = document.getElementById('saveMsg');
  const dateDisplay = document.getElementById('selectedDateDisplay');

  const availabilityMonthCache = {}; // key: trip|mode|YYYY-MM -> { days: { date: {capacity,taken,available} } }
  let selectedDate = null; // ISO YYYY-MM-DD (raw string, no Date())

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
        // Immediate calendar refresh to reflect new availability without extra click
        try { renderCalendar(); } catch(_){ }
      } else { saveMsg.textContent = '❌ Αποτυχία'; saveMsg.style.color = '#c33'; }
    } catch(e){ saveMsg.textContent = '❌ Σφάλμα δικτύου'; saveMsg.style.color = '#c33'; }
  }

  function buildMonthGrid(year, month){
    const firstDay = new Date(year, month-1, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells = [];
    // Pad before (convert Sunday=0 to 6 if we want Monday-first)
    const pad = (firstDay === 0) ? 6 : firstDay - 1;
    for (let i=0;i<pad;i++) cells.push({ spacer:true });
    for (let d=1; d<=daysInMonth; d++){
      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      cells.push({ dateStr });
    }
    return cells;
  }

  function renderCalendar(){
    if (!calWrap) return;
    const trip = tripSel.value.trim(); const mode = modeSel.value.trim();
    if (!trip || !mode){ calWrap.innerHTML='<div style="font-size:12px;color:#89a9c1">Επιλέξτε trip & mode.</div>'; return; }
    let monthVal = (monthInput && monthInput.value) ? monthInput.value : null; // YYYY-MM
    if (!monthVal){
      const now = new Date(); monthVal = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      if (monthInput) monthInput.value = monthVal;
    }
    const year = parseInt(monthVal.slice(0,4),10);
    const month = parseInt(monthVal.slice(5,7),10);
    const monthStr = `${year}-${String(month).padStart(2,'0')}`;
    const key = `${trip}|${mode}|${monthStr}`;
    const doRender = ()=>{
      const cells = buildMonthGrid(year, month);
      const bucket = availabilityMonthCache[key];
      calWrap.innerHTML='';
      const header = document.createElement('div');
      header.className='calendar-grid';
      ['ΔΕΥ','ΤΡΙ','ΤΕΤ','ΠΕΜ','ΠΑΡ','ΣΑΒ','ΚΥΡ'].forEach(w=>{ const wd=document.createElement('div'); wd.className='calendar-weekday'; wd.textContent=w; header.appendChild(wd); });
      calWrap.appendChild(header);
      const grid = document.createElement('div'); grid.className='calendar-grid';
      cells.forEach(cell=>{
        if (cell.spacer){ const sp=document.createElement('div'); sp.className='calendar-spacer'; grid.appendChild(sp); return; }
        const dData = bucket ? bucket.days[cell.dateStr] : null;
        const capacity = dData ? dData.capacity : computeDefaultCapacity(mode);
        const taken = dData ? dData.taken : 0;
        const available = Math.max(0, capacity - taken);
        const dayEl = document.createElement('div');
        let cls = 'day-cell';
        if (available <= 0) cls += ' full';
        else if (available <= Math.floor(capacity * 0.25)) cls += ' low';
        else cls += ' medium';
        dayEl.className = cls;
        if (selectedDate === cell.dateStr) dayEl.classList.add('selected');
        const dateDiv = document.createElement('div'); dateDiv.className='day-date'; dateDiv.textContent = cell.dateStr.slice(-2) + '/' + monthStr.slice(5,7);
        const metrics = document.createElement('div'); metrics.className='day-metrics';
        metrics.innerHTML = `<span class="metric-cap">C:${capacity}</span><span class="metric-taken">T:${taken}</span><span class="metric-avail">A:${available}</span>`;
        dayEl.appendChild(dateDiv); dayEl.appendChild(metrics);
        dayEl.addEventListener('click', ()=>{ setEditor(cell.dateStr); renderCalendar(); });
        grid.appendChild(dayEl);
      });
      calWrap.appendChild(grid);
    };
    if (availabilityMonthCache[key]){ doRender(); }
    else { prefetchMonth(trip, mode, year, month).then(doRender); }
  }

  function reloadCalendar(){ renderCalendar(); }

  // Event listeners
  tripSel.addEventListener('change', ()=>{ selectedDate=null; reloadCalendar(); });
  modeSel.addEventListener('change', ()=>{ selectedDate=null; reloadCalendar(); });
  monthInput.addEventListener('change', ()=>{ selectedDate=null; reloadCalendar(); });
  function shiftMonth(delta){
    if (!monthInput) return;
    let val = monthInput.value;
    if (!val){ const now=new Date(); val = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; }
    const y = parseInt(val.slice(0,4),10);
    const m = parseInt(val.slice(5,7),10);
    const date = new Date(y, m-1+delta, 1);
    const newVal = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    monthInput.value = newVal;
    selectedDate = null;
    reloadCalendar();
  }
  prevMonthBtn && prevMonthBtn.addEventListener('click', ()=>shiftMonth(-1));
  nextMonthBtn && nextMonthBtn.addEventListener('click', ()=>shiftMonth(1));
  capInput.addEventListener('input', recalcAvailable);
  takenInput.addEventListener('input', recalcAvailable);
  saveBtn.addEventListener('click', ()=>{ saveCurrent(); });

  // Boot
  // Initialize month input default
  (function initMonth(){ if (monthInput && !monthInput.value){ const now=new Date(); monthInput.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; } })();
  fetchTrips().then(()=>{ reloadCalendar(); });
})();