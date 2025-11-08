(function(){
  // Auth guard: ensure logged in before any UI setup
  if (window.ProviderAuth) { window.ProviderAuth.requireSync(); }
  function getCalendarCtor(){
    if (window.FullCalendar && window.FullCalendar.Calendar) return window.FullCalendar.Calendar;
    if (window.Calendar) return window.Calendar;
    return null;
  }

  function openModal(mode, data){
    const modal = document.getElementById('avModal');
    modal.classList.add('show');
    modal.dataset.mode = mode;
    modal.dataset.id = data && data.id || '';
    document.getElementById('modalTitle').textContent = mode === 'edit' ? 'Επεξεργασία διαθεσιμότητας' : 'Νέα διαθεσιμότητα';
    document.getElementById('mDate').value = (data && data.date) || '';
    document.getElementById('mStart').value = (data && data.start_time) || '';
    document.getElementById('mEnd').value = (data && data.end_time) || '';
    document.getElementById('mCapacity').value = (data && (data.capacity ?? ''));
    document.getElementById('mNotes').value = (data && (data.notes || ''));
    const info = document.getElementById('mInfo');
    info.textContent = (data && Number.isFinite(+data.reserved)) ? (`Κρατήσεις: ${data.reserved}/${data.capacity||0}`) : '';
    document.getElementById('modalDelete').style.display = (mode === 'edit') ? '' : 'none';
  }
  function closeModal(){ document.getElementById('avModal').classList.remove('show'); }

  async function loadData(){
    const r = await ProviderAPI.authed('/api/availability');
    return (r && r.rows) || [];
  }

  function toEvent(row){
    // Build ISO start/end for FullCalendar
    const start = `${row.date}T${(row.start_time||'00:00')}:00`;
    const end = `${row.date}T${(row.end_time||'23:59')}:00`;
    const title = `Cap ${row.capacity||0}${Number.isFinite(+row.reserved) ? ` • Booked ${row.reserved}`: ''}${row.notes?`\n${row.notes}`:''}`;
    const className = row.status === 'full' ? 'full' : (row.status === 'partial' ? 'partial' : 'available');
    return { id: row.id, title, start, end, allDay: false, classNames:['fc-event', className], extendedProps: { ...row }, display: 'block' };
  }

  async function saveCurrent(){
    const id = document.getElementById('avModal').dataset.id || '';
    const payload = {
      date: document.getElementById('mDate').value,
      start_time: document.getElementById('mStart').value,
      end_time: document.getElementById('mEnd').value,
      capacity: parseInt(document.getElementById('mCapacity').value||'0',10),
      notes: document.getElementById('mNotes').value
    };
    if (!payload.date || !payload.start_time || !payload.end_time) { alert('Συμπληρώστε ημερομηνία και ώρες.'); return; }
    try {
      if (id) {
        await ProviderAPI.authed(`/api/availability/${encodeURIComponent(id)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      } else {
        await ProviderAPI.authed('/api/availability', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      }
      closeModal();
      await refreshCalendar();
    } catch (e) { alert('Αποτυχία αποθήκευσης'); }
  }

  async function deleteCurrent(){
    const id = document.getElementById('avModal').dataset.id || '';
    if (!id) return closeModal();
    if (!confirm('Οριστική διαγραφή;')) return;
    try {
      await ProviderAPI.authed(`/api/availability/${encodeURIComponent(id)}`, { method:'DELETE' });
      closeModal();
      await refreshCalendar();
    } catch (e) { alert('Αποτυχία διαγραφής'); }
  }

  let calendar = null;
  async function refreshCalendar(){
    const data = await loadData();
    const events = data.map(toEvent);
    calendar.removeAllEvents();
    calendar.addEventSource(events);
    // Empty-state handling
    let empty = document.getElementById('emptyState');
    if (!empty) {
      const wrap = document.getElementById('calendarWrap') || document.querySelector('main') || document.body;
      empty = document.createElement('div');
      empty.id = 'emptyState';
      empty.className = 'empty-state';
      wrap.appendChild(empty);
    }
    empty.textContent = 'Δεν υπάρχουν διαθέσιμες ημερομηνίες';
    empty.style.display = (events.length === 0) ? 'block' : 'none';
  }

  async function init(){
    if (window.ProviderAuth) { window.ProviderAuth.requireSync(); }
    Theme.init();
    footerNav();
    // Ensure calendar container exists
    let el = document.getElementById('calendar');
    if (!el) {
      const wrap = document.getElementById('calendarWrap') || document.querySelector('main') || document.body;
      el = document.createElement('div'); el.id = 'calendar'; wrap.appendChild(el);
    }
    const CalendarCtor = getCalendarCtor();
    if (!CalendarCtor) { console.error('FullCalendar not available'); return; }
    calendar = new CalendarCtor(el, {
      initialView: 'dayGridMonth',
      height: 'auto',
      selectable: true,
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek'
      },
      dateClick(info){
        // Pre-fill times for convenience
        openModal('add', { date: info.dateStr, start_time:'09:00', end_time:'17:00', capacity: 0, notes:'' });
      },
      select(info){
        const ds = info.startStr.slice(0,10);
        const st = info.startStr.slice(11,16) || '09:00';
        const et = info.endStr ? info.endStr.slice(11,16) : '17:00';
        openModal('add', { date: ds, start_time: st, end_time: et, capacity: 0, notes:'' });
      },
      eventClick(arg){
        const r = arg.event.extendedProps || {};
        openModal('edit', r);
      }
    });
    calendar.render();

  const btnRefresh = document.getElementById('btnRefresh'); if (btnRefresh) btnRefresh.addEventListener('click', refreshCalendar);
  const btnToday = document.getElementById('btnToday'); if (btnToday) btnToday.addEventListener('click', () => calendar.today());
  const mClose = document.getElementById('modalClose'); if (mClose) mClose.addEventListener('click', closeModal);
  const mSave = document.getElementById('modalSave'); if (mSave) mSave.addEventListener('click', (e) => { e.preventDefault(); saveCurrent(); });
  const mDel = document.getElementById('modalDelete'); if (mDel) mDel.addEventListener('click', (e) => { e.preventDefault(); deleteCurrent(); });

    await refreshCalendar();
    // Lightweight real-time: periodic refresh
    setInterval(refreshCalendar, 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
