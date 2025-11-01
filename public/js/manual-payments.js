(function(){
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  let basicAuth = null;
  let items = [];
  let sortField = '';
  let sortDir = 'desc';
  let isDemoMode = false;
  // Filters state
  const filters = {
    dateFrom: null, // number (ms) start-of-day
    dateTo: null,   // number (ms) end-of-day
    partnerQuery: '',
    status: '' // '', 'paid', 'unpaid'
  };

  // Build about 32 demo items (deterministic) for showcasing when API is empty/unavailable
  function buildDemoItems(){
    const partners = [
      'Nikos Tours','Athens Daily Trips','Santorini Blue','Crete Adventures',
      'Rhodes Sailing','Parnassos Ski','Thessaloniki Food Walk','Meteora Shuttle',
      'Mykonos Riders','Corfu Experience','Zakynthos Cruises','Pelion Trails'
    ];
    const trips = [
      'Sunset Cruise Lefkada','Acropolis Guided Tour','Volcano & Hot Springs','Samaria Gorge Hike',
      'Lindos Day Trip','Ski Pass Package','Street Food Experience','Meteora Monasteries',
      'Delos Half-Day','Old Town Walk','Shipwreck Beach Boat','Centaur Path Trek'
    ];
    const ibans = [
      'GR1601101250000000012300695','GR0602600000001234567890123','GR5502600000000098765432100',
      'GR7801100000000001234500000','GR0201400000000002012345678','GR7002600000000011223344556',
      'GR4601100000000009876001234'
    ];
    const out = [];
    for (let i=1;i<=32;i++){
      const partner = partners[(i-1)%partners.length];
      const trip = trips[(i-1)%trips.length];
      const iban = ibans[(i-1)%ibans.length];
      const day = ((i-1)%28)+1; // keep within month
      const hour = 8 + ((i*3)%10); // 8..17
      const min = (i*7)%60;
      const amount = 3000 + ((i*700)%25000); // 30.00€ .. ~280.00€
      const paid = (i%3===0); // 1/3 paid
      out.push({
        id: 'demo-'+i,
        partner_name: partner,
        trip_title: trip,
        date: `2025-10-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}:00Z`,
        amount_cents: amount,
        iban,
        status: paid ? 'πληρώθηκε' : 'εκκρεμεί',
        partner_balance_cents: paid ? 0 : (50000 + (i*900)%150000)
      });
    }
    return out;
  }

  function escapeHtml(s){ if (s==null) return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
  // Format a value expressed in cents to euros with 2 decimals
  function formatAmount(amountCents){
    if (amountCents == null || amountCents === '') return '';
    let cents = Number(amountCents);
    if (!isFinite(cents)) return String(amountCents);
    const euros = cents / 100;
    return euros.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00A0€';
  }
  function formatDate(iso){
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2,'0');
    const mi = String(d.getMinutes()).padStart(2,'0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }

  function setStatus(msg,color){ const el=$('#mpStatus'); if(el){ el.textContent=msg||''; if(color) el.style.color=color; }}

  // Keep table header (thead) sticky correctly under the sticky bar
  function setStickyOffset(){
    try {
      const bar = document.getElementById('mpStickyBar');
      const h = bar ? (bar.offsetHeight || 0) : 0;
      document.documentElement.style.setProperty('--mp-sticky-offset', h + 'px');
    } catch(_) {}
  }

  async function loginSubmit(e){
    if (e) e.preventDefault();
    const u = $('#user').value || '';
    const p = $('#pass').value || '';
    basicAuth = 'Basic ' + btoa(u + ':' + p);
    $('#auth').style.display = 'none';
    $('#main').style.display = 'block';
    await fetchItems();
  }

  async function fetchItems(){
    try {
      const tbody = $('#mpTable tbody'); if (!tbody) return;
      tbody.innerHTML=''; setStatus('Φόρτωση...', '#aaa'); $('#mpMessage').textContent='';
      const res = await fetch('/api/manual-payments', { headers: { Authorization: basicAuth }});
      if (!res.ok) throw new Error('HTTP '+res.status);
      const arr = await res.json();
      if (Array.isArray(arr) && arr.length > 0) {
        items = arr; isDemoMode = false;
        $('#mpMessage').textContent = '';
      } else {
        items = buildDemoItems(); isDemoMode = true;
        $('#mpMessage').textContent = 'Εμφάνιση demo εγγραφών (το API δεν επέστρεψε δεδομένα).';
      }
      render();
      setStatus('');
    } catch (e) {
      // Fallback to demo data on error
      items = buildDemoItems(); isDemoMode = true;
      render();
      $('#mpMessage').textContent = 'Εμφάνιση demo εγγραφών (σφάλμα φόρτωσης).';
      setStatus('' , '#aaa');
    }
  }

  

  function getField(row, key){
    switch(key){
      case 'partner': return row.partner_name || row.partner || row.partnerName || '';
      case 'trip': return row.trip_title || row.trip || row.trip_title_en || row.title || '';
      case 'date': return row.date || row.created_at || row.payment_date || '';
      case 'amount': return row.amount_cents ?? row.amount ?? row.amount_eur ?? 0;
      case 'iban': return row.iban || row.bank_iban || '';
      case 'status': return row.status || row.payment_status || '';
      case 'balance': return row.partner_balance_cents ?? row.partner_balance ?? 0;
      case 'id': return row.id || row.payment_id || row._id || '';
      default: return '';
    }
  }

  function sortItems(arr){
    const base = Array.isArray(arr) ? arr : items;
    if (!sortField) return base.slice();
    const out = base.slice();
    out.sort((a,b) => {
      const av = getField(a, sortField);
      const bv = getField(b, sortField);
      if (sortField === 'amount' || sortField === 'balance') {
        const na = Number(av)||0; const nb = Number(bv)||0;
        return (na - nb) * (sortDir === 'asc' ? 1 : -1);
      }
      if (sortField === 'date') {
        const ta = av ? new Date(av).getTime() : 0;
        const tb = bv ? new Date(bv).getTime() : 0;
        return (ta - tb) * (sortDir === 'asc' ? 1 : -1);
      }
      return String(av).localeCompare(String(bv)) * (sortDir === 'asc' ? 1 : -1);
    });
    return out;
  }

  function isPaidStatus(status){
    if (!status) return false;
    return /paid|πληρώθηκε|settled|success/i.test(String(status));
  }

  function filterItems(arr){
    const src = Array.isArray(arr) ? arr : items;
    const q = (filters.partnerQuery || '').trim().toLowerCase();
    const hasQ = q.length > 0;
    const hasFrom = typeof filters.dateFrom === 'number';
    const hasTo = typeof filters.dateTo === 'number';
    const st = filters.status; // '', 'paid', 'unpaid'
    if (!hasQ && !hasFrom && !hasTo && !st) return src.slice();
    return src.filter(row => {
      // date filter
      if (hasFrom || hasTo) {
        const iso = getField(row,'date');
        const t = iso ? new Date(iso).getTime() : NaN;
        if (isNaN(t)) return false;
        if (hasFrom && t < filters.dateFrom) return false;
        if (hasTo && t > filters.dateTo) return false;
      }
      // partner/trip query
      if (hasQ) {
        const partner = String(getField(row,'partner')||'').toLowerCase();
        const trip = String(getField(row,'trip')||'').toLowerCase();
        if (!(partner.includes(q) || trip.includes(q))) return false;
      }
      // status filter
      if (st) {
        const paid = isPaidStatus(getField(row,'status'));
        if (st === 'paid' && !paid) return false;
        if (st === 'unpaid' && paid) return false;
      }
      return true;
    });
  }

  

  function render(){
    const tbody = $('#mpTable tbody'); if (!tbody) return;
    tbody.innerHTML = '';
  const data = sortItems(filterItems(items));
  if (!data.length) { $('#mpMessage').textContent = 'Δεν υπάρχουν εγγραφές.'; return; }
  $('#mpMessage').textContent = '';
    for (const row of data) {
      const tr = document.createElement('tr');
      const id = getField(row,'id');
      const partner = getField(row,'partner');
      const trip = getField(row,'trip');
      const date = getField(row,'date');
      const amount = getField(row,'amount');
      const iban = getField(row,'iban');
      const status = (getField(row,'status') || '').toString();
      const balance = getField(row,'balance');
      const isPaid = /paid|πληρώθηκε|settled/i.test(status);
      const btnLabel = isPaid ? 'Πληρώθηκε' : 'Απλήρωτο';
      const btnClass = isPaid ? 'is-paid' : 'is-pending';
      tr.innerHTML = `
        <td>${escapeHtml(partner)}</td>
        <td>${escapeHtml(trip)}</td>
        <td>${escapeHtml(formatDate(date))}</td>
        <td style="text-align:right">${escapeHtml(formatAmount(amount))}</td>
        <td>${escapeHtml(iban)}</td>
        <td class="mp-status" data-id="${escapeHtml(id)}">${escapeHtml(isPaid ? 'πληρώθηκε' : (status || 'εκκρεμεί'))}</td>
        <td style="text-align:right">${escapeHtml(formatAmount(balance))}</td>
        <td style="text-align:center">
          <button class="btn mp-mark ${btnClass}" data-id="${escapeHtml(id)}" ${isPaid?'disabled':''}>${escapeHtml(btnLabel)}</button>
        </td>`;
      tbody.appendChild(tr);
    }
  }

  async function onMarkPaid(id, btn){
    if (!id) return;
    // If in demo mode, simulate success locally
    if (isDemoMode) {
      const cell = document.querySelector(`.mp-status[data-id="${CSS.escape(id)}"]`);
      if (cell) cell.textContent = 'πληρώθηκε';
      try {
        const tr = btn.closest('tr');
        const balTd = tr ? tr.querySelector('td:nth-child(7)') : null;
        if (balTd) balTd.textContent = formatAmount(0);
      } catch(_) {}
      btn.textContent = 'Πληρώθηκε';
      btn.classList.remove('is-pending');
      btn.classList.add('is-paid');
      btn.disabled = true;
      // Update in-memory item
      const idx = items.findIndex(it => (getField(it,'id')+'')===id+'');
      if (idx>=0) {
        if (items[idx]) {
          items[idx].status = 'πληρώθηκε';
          if ('partner_balance_cents' in items[idx]) items[idx].partner_balance_cents = 0;
        }
      }
      return;
    }
    try {
      btn.disabled = true; btn.textContent = 'Αποστολή...';
      const res = await fetch('/api/manual-payments/mark-paid', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization: basicAuth },
        body: JSON.stringify({ id })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json().catch(() => null);
      const item = data && data.item ? data.item : null;
      // Update UI from server response (fallback to optimistic values)
      const cell = document.querySelector(`.mp-status[data-id="${CSS.escape(id)}"]`);
      if (cell) cell.textContent = 'πληρώθηκε';
      btn.textContent = 'Πληρώθηκε';
      btn.classList.remove('is-pending');
      btn.classList.add('is-paid');
      btn.disabled = true;
      // Reset partner balance cell (7th column) to zero as requested
      try {
        const tr = btn.closest('tr');
        const balTd = tr ? tr.querySelector('td:nth-child(7)') : null;
        if (balTd) balTd.textContent = formatAmount(0);
      } catch(_) {}
      // Update in-memory item for consistency (status + zero balance)
      const idx = items.findIndex(it => (getField(it,'id')+'')===id+'');
      if (idx>=0) {
        if (items[idx]) {
          items[idx].status = 'πληρώθηκε';
          if ('partner_balance_cents' in items[idx]) items[idx].partner_balance_cents = 0;
        }
      }
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Απλήρωτο';
      alert('Αποτυχία ενημέρωσης: ' + (e && e.message ? e.message : e));
    }
  }

  function wire(){
    const auth = $('#auth'); if (auth) auth.addEventListener('submit', loginSubmit);
    const loginBtn = $('#login'); if (loginBtn) loginBtn.addEventListener('click', loginSubmit);
    const refresh = $('#mpRefresh'); if (refresh) refresh.addEventListener('click', fetchItems);
    const exportBtn = $('#mpExport'); if (exportBtn) exportBtn.addEventListener('click', exportCsv);
    const toggleBtn = document.getElementById('mpFiltersToggle');
    // Compute sticky header offset now and on resize
    setStickyOffset();
    window.addEventListener('resize', setStickyOffset);
    // Sorting
    $$('#mpTable thead th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const f = th.getAttribute('data-sort');
        if (sortField === f) sortDir = (sortDir === 'asc' ? 'desc' : 'asc'); else sortField = f;
        render();
      });
    });
    // Filters events
    const dateFromEl = document.getElementById('mpDateFrom');
    const dateToEl = document.getElementById('mpDateTo');
    const partnerEl = document.getElementById('mpPartnerQuery');
    const statusEl = document.getElementById('mpStatusFilter');
  const resetEl = document.getElementById('mpResetFilters');
  const resetTopEl = document.getElementById('mpResetFiltersTop');

    function toStartOfDayMs(v){
      // Expect v as 'YYYY-MM-DD'
      try { const d = new Date(v + 'T00:00:00'); return isNaN(d) ? null : d.getTime(); } catch(_) { return null; }
    }
    function toEndOfDayMs(v){
      try { const d = new Date(v + 'T23:59:59.999'); return isNaN(d) ? null : d.getTime(); } catch(_) { return null; }
    }
    function applyFiltersFromUI(){
      filters.partnerQuery = partnerEl && partnerEl.value ? partnerEl.value : '';
      const vf = dateFromEl && dateFromEl.value ? toStartOfDayMs(dateFromEl.value) : null;
      const vt = dateToEl && dateToEl.value ? toEndOfDayMs(dateToEl.value) : null;
      filters.dateFrom = typeof vf === 'number' ? vf : null;
      filters.dateTo = typeof vt === 'number' ? vt : null;
      const st = statusEl && statusEl.value ? statusEl.value : '';
      filters.status = st === 'paid' || st === 'unpaid' ? st : '';
      render();
    }
    if (dateFromEl) dateFromEl.addEventListener('change', applyFiltersFromUI);
    if (dateToEl) dateToEl.addEventListener('change', applyFiltersFromUI);
    if (partnerEl) partnerEl.addEventListener('input', applyFiltersFromUI);
    if (statusEl) statusEl.addEventListener('change', applyFiltersFromUI);
    function resetFilters(){
      if (dateFromEl) dateFromEl.value = '';
      if (dateToEl) dateToEl.value = '';
      if (partnerEl) partnerEl.value = '';
      if (statusEl) statusEl.value = '';
      filters.dateFrom = null; filters.dateTo = null; filters.partnerQuery=''; filters.status='';
      render();
    }
    if (resetEl) resetEl.addEventListener('click', resetFilters);
    if (resetTopEl) resetTopEl.addEventListener('click', resetFilters);
    // Mobile-only: collapse/expand filters while keeping title+thead fixed
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const bar = document.getElementById('mpStickyBar');
        const collapsed = bar.classList.toggle('mp-filters-collapsed');
        toggleBtn.setAttribute('aria-expanded', String(!collapsed));
        // Recompute offset after transition to stabilize container height
        setStickyOffset();
        // Also after CSS transition completes
        setTimeout(setStickyOffset, 260);
      });
    }
    
    // Delegate mark-paid
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest && e.target.closest('.mp-mark');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      onMarkPaid(id, btn);
    });
  }

  function exportCsv(){
    const rows = [];
    rows.push(['Όνομα συνεργάτη','Τίτλος εκδρομής','Ημερομηνία','Ποσό (€)','IBAN','Κατάσταση','Υπόλοιπο συνεργάτη']);
  const data = sortItems(filterItems(items));
    data.forEach(row => {
      const vals = [
        getField(row,'partner'),
        getField(row,'trip'),
        formatDate(getField(row,'date')),
        formatAmount(getField(row,'amount')),
        getField(row,'iban'),
        (getField(row,'status')||'εκκρεμεί'),
        formatAmount(getField(row,'balance'))
      ];
      rows.push(vals.map(v => '"'+String(v).replace(/"/g,'""')+'"'));
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'manual-payments.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
