// admin-ui.js — extracted from admin.html inline script
// Contract:
// - Requires DOM elements with the same IDs as admin.html
// - Relies on i18n.js for window.t when present
// - Exposes no globals; runs on DOMContentLoaded

(function(){
  function init(){
  // Compute sticky offset so table header sticks below the section bar (Κρατήσεις + filters)
  try {
    const stickyBar = document.getElementById('bookingsStickyBar');
    const setOffset = () => {
      const h = stickyBar ? stickyBar.offsetHeight || 0 : 0;
      document.documentElement.style.setProperty('--bookings-sticky-offset', h + 'px');
    };
    setOffset();
    window.addEventListener('resize', setOffset);
  } catch(_) {}
  // Compute sticky offset for payments sticky bar as well
  try {
    const payBar = document.getElementById('paymentsStickyBar');
    const setPayOffset = () => {
      const h = payBar ? (payBar.offsetHeight || 0) : 0;
      document.documentElement.style.setProperty('--payments-sticky-offset', h + 'px');
    };
    setPayOffset();
    window.addEventListener('resize', setPayOffset);
  } catch(_) {}
  const authForm = document.getElementById('auth');
  const main = document.getElementById('main');
  const userInput = document.getElementById('user');
  const passInput = document.getElementById('pass');
  const backupDiv = document.getElementById('backup');
  const paymentsTable = document.getElementById('paymentsTable');
  const paymentsTbody = paymentsTable ? paymentsTable.querySelector('tbody') : null;
  const paymentsMessage = document.getElementById('paymentsMessage');

  let basicAuth = null;
  let lastPayments = null; // cached array from server
  let lastFiltered = null; // cached filtered view
  let currentOffset = 0;
  let currentLimit = 50;
  let currentSortField = '';
  let currentSortDir = 'desc'; // or 'asc'
  // separate bookings sort state so bookings and payments sorting don't interfere
  let bookingsSortField = '';
  let bookingsSortDir = 'desc';
  // force demo row when fetch fails
  let bookingsDemoForce = false;

  if (!authForm) { console.error('[admin-ui] auth form not found'); return; }

  authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = userInput.value || '';
    const p = passInput.value || '';
    basicAuth = 'Basic ' + btoa(u + ':' + p);
    try { console.info('[admin-ui] login submit: starting data loads'); } catch(_){}
    // Decide visibility of #main depending on the page:
    // - On admin.html (bookings view), #main is a legacy empty panel: keep it hidden
    // - On standalone pages like admin-payments.html, #main hosts the content: show it
    authForm.style.display = 'none';
  if (backupDiv) fetchBackup();
  if (paymentsTbody) fetchPayments();
    // show bookings panel and load bookings
  const bookingsPanelEl = document.getElementById('bookingsPanel');
    if (bookingsPanelEl) {
      bookingsPanelEl.style.display = 'block';
      if (main) main.style.display = 'none';
    } else {
      if (main) main.style.display = 'block';
    }
    // show partners panel
  const partnersPanelEl = document.getElementById('partnersPanel');
  if (partnersPanelEl) partnersPanelEl.style.display = 'block';
    // load partners list for autocompletion
    fetchPartnersList();
    // open SSE for realtime payout updates
    openAdminStream(u, p);
    // fallback polling to keep statuses fresh
    if (document.getElementById('bookingsTable')) {
      setInterval(() => { if (basicAuth) fetchBookings(); }, 20000);
      fetchBookings();
    }
  });

  // Load filters from URL on page load
  (function loadFiltersFromUrl(){
    const params = new URLSearchParams(window.location.search);
    const fStatus = document.getElementById('filterStatus'); if (fStatus && params.has('status')) fStatus.value = params.get('status');
    const fFrom = document.getElementById('filterFrom'); if (fFrom && params.has('date_from')) fFrom.value = params.get('date_from');
    const fTo = document.getElementById('filterTo'); if (fTo && params.has('date_to')) fTo.value = params.get('date_to');
    const fMin = document.getElementById('filterMin'); if (fMin && params.has('min_amount')) fMin.value = (Number(params.get('min_amount'))/100).toFixed(2);
    const fMax = document.getElementById('filterMax'); if (fMax && params.has('max_amount')) fMax.value = (Number(params.get('max_amount'))/100).toFixed(2);
  })();

  const btnRefreshBackup = document.getElementById('refreshBackup'); if (btnRefreshBackup) btnRefreshBackup.addEventListener('click', fetchBackup);
  const btnRefreshPayments = document.getElementById('refreshPayments'); if (btnRefreshPayments) btnRefreshPayments.addEventListener('click', fetchPayments);
  const btnExportPayments = document.getElementById('exportPayments'); if (btnExportPayments) btnExportPayments.addEventListener('click', exportPayments_v2);
  const btnApplyFilters = document.getElementById('applyFilters'); if (btnApplyFilters) btnApplyFilters.addEventListener('click', applyFilters);
  const btnClearFilters = document.getElementById('clearFilters'); if (btnClearFilters) btnClearFilters.addEventListener('click', clearFilters);
  const btnPrevPage = document.getElementById('prevPage'); if (btnPrevPage) btnPrevPage.addEventListener('click', () => changePage(-1));
  const btnNextPage = document.getElementById('nextPage'); if (btnNextPage) btnNextPage.addEventListener('click', () => changePage(1));
  const selPageSize = document.getElementById('pageSize'); if (selPageSize) selPageSize.addEventListener('change', (e) => { currentLimit = parseInt(e.target.value,10) || 50; currentOffset = 0; fetchPayments(); });
  const selSortField = document.getElementById('sortField'); if (selSortField) selSortField.addEventListener('change', (e) => { currentSortField = e.target.value || ''; applyFilters(); });
  const btnSortDir = document.getElementById('sortDir'); if (btnSortDir) btnSortDir.addEventListener('click', (e) => { currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc'; e.target.textContent = currentSortDir === 'asc' ? '▼' : '▲'; applyFilters(); });

  function fetchBackup(){
    if (!basicAuth || !backupDiv) return;
    backupDiv.textContent = window.t ? window.t('admin.loading') : 'Loading...';
    fetch('/admin/backup-status', { headers: { Authorization: basicAuth } })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(j => {
        try { console.info('[admin] backup-status', j); } catch(_) {}
        const count = (j && (j.count ?? j.backupsCount ?? j.total)) || 0;
        const latestObj = j && (j.latestDb || j.latest || j.latestZip || j.latestLog) || null;
        const latestAt = j && (j.lastRunAt || j.latestAt || j.latestDate || (latestObj && latestObj.mtime) || '');
        const when = latestAt ? formatDate(latestAt) : '';
        const whenPretty = when ? when.replace(' ', ' – ') : '';
        const size = latestObj && typeof latestObj === 'object' ? latestObj.size : undefined;
        const sizeStr = (typeof size === 'number') ? formatFileSize(size) : '';
        const line1 = (window.t ? window.t('admin.backups_count') : 'Σύνολο αντιγράφων') + ': ' + String(count || '—');
        const latestLabel = (window.t ? window.t('admin.backups_latest') : 'Τελευταίο αντίγραφο');
        let latestDisplay = '—';
        if (whenPretty && sizeStr) latestDisplay = whenPretty + ' (' + sizeStr + ')';
        else if (whenPretty) latestDisplay = whenPretty;
        else if (latestObj) latestDisplay = escapeHtml(typeof latestObj === 'object' ? (latestObj.file || latestObj.name || '[?]') : String(latestObj));
        const line2 = latestLabel + ': ' + latestDisplay;
        backupDiv.innerHTML = '<div>'+ line1 +'</div><div>'+ line2 +'</div>';
      })
      .catch(err => {
        backupDiv.textContent = (window.t ? window.t('admin.error') : 'Error: ') + String(err);
      });
  }

  function pageInfo(){
    const page = Math.floor(currentOffset / currentLimit) + 1;
    const pi = document.getElementById('pageInfo'); if (pi) pi.textContent = (window.t ? window.t('admin.page') : 'Page: ') + ' ' + page;
  }

  function changePage(dir){
    currentOffset = Math.max(0, currentOffset + dir * currentLimit);
    fetchPayments();
  }

  function fetchPayments(){
    if(!basicAuth) return;
    if (!paymentsTbody) { console.error('[admin-ui] paymentsTbody missing'); return; }
    paymentsTbody.innerHTML = '';
    if (paymentsMessage) paymentsMessage.textContent = 'Φόρτωση...';
    const qs = `?limit=${encodeURIComponent(currentLimit)}&offset=${encodeURIComponent(currentOffset)}`;
    const params = new URLSearchParams();
    const status = document.getElementById('filterStatus').value;
    const from = document.getElementById('filterFrom').value;
    const to = document.getElementById('filterTo').value;
    const min = document.getElementById('filterMin').value;
    const max = document.getElementById('filterMax').value;
    if (status) params.set('status', status);
    if (from) params.set('date_from', from);
    if (to) params.set('date_to', to);
    if (min) params.set('min_amount', Math.round(Number(min)*100));
    if (max) params.set('max_amount', Math.round(Number(max)*100));
    const newUrl = window.location.pathname + '?' + params.toString();
    window.history.replaceState({}, '', newUrl);
    const url = '/admin/payments' + qs + (params.toString() ? '&' + params.toString() : '');
    fetch(url, { headers: { Authorization: basicAuth } })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(j => {
        try { console.info('[admin-ui] fetchPayments: received', Array.isArray(j) ? j.length : 'n/a'); } catch(_){}
        lastPayments = Array.isArray(j) ? j : [];
        applyFilters();
        pageInfo();
      })
      .catch(err => { paymentsTbody.innerHTML = ''; if (paymentsMessage) paymentsMessage.textContent = (window.t ? window.t('admin.error') : 'Error: ') + String(err); try { console.error('[admin-ui] fetchPayments error', err); } catch(_){} });
  }

  function renderPayments(arr){
    lastFiltered = Array.isArray(arr) ? arr : [];
    let out = lastFiltered.slice();
    if (currentSortField) {
      out.sort((a,b) => {
        const fa = a && (currentSortField === 'amount' ? a.amount : a[currentSortField]);
        const fb = b && (currentSortField === 'amount' ? b.amount : b[currentSortField]);
        if (currentSortField === 'timestamp') {
          const ta = fa ? new Date(fa).getTime() : 0;
          const tb = fb ? new Date(fb).getTime() : 0;
          return (ta - tb) * (currentSortDir === 'asc' ? 1 : -1);
        }
        if (currentSortField === 'amount') {
          const na = Number(fa) || 0;
          const nb = Number(fb) || 0;
          return (na - nb) * (currentSortDir === 'asc' ? 1 : -1);
        }
        const sa = fa ? String(fa) : '';
        const sb = fb ? String(fb) : '';
        return sa.localeCompare(sb) * (currentSortDir === 'asc' ? 1 : -1);
      });
    }
    paymentsTbody.innerHTML = '';
    if (!out || out.length === 0) {
      paymentsMessage.textContent = 'Δεν βρέθηκαν εγγραφές για αυτή τη σελίδα/φίλτρα.';
      return;
    }
    paymentsMessage.textContent = '';
    for (const row of out) {
      const tr = document.createElement('tr');
      const statusKey = (row.status || '').toString();
      const statusLabel = greekStatus(statusKey);
      const statusClass = statusClassFor(statusKey);
      const amountVal = formatAmount(row.amount, row.currency);
      const when = formatDate(row.timestamp);
      const statusIcon = statusIconFor(statusKey);
      tr.innerHTML = `
        <td>${escapeHtml(row.id||'')}</td>
        <td><span class="status-badge ${statusClass}"><span class="status-icon">${statusIcon}</span>${escapeHtml(statusLabel)}</span></td>
        <td>${escapeHtml(row.eventId||row.event_id||'')}</td>
        <td class="amount" style="text-align:right">${escapeHtml(amountVal)}</td>
        <td>${escapeHtml(row.currency||'')}</td>
        <td>${escapeHtml(when)}</td>
        <td>${escapeHtml(formatMeta(row.metadata||row.meta||''))} ${renderMetaButton(row.metadata||row.meta||'')}</td>
      `;
      paymentsTbody.appendChild(tr);
    }
    // After rows rendered, sync hint header widths and scroll
    queueUpdatePaymentsHintWidths();
    setupPaymentsScrollSync();
  }

  // Apply current filter inputs to lastPayments and render
  function applyFilters(){
    if(!lastPayments) { fetchPayments(); return; }
    const status = document.getElementById('filterStatus').value;
    const from = document.getElementById('filterFrom').value;
    const to = document.getElementById('filterTo').value;
    const min = document.getElementById('filterMin').value;
    const max = document.getElementById('filterMax').value;
    const filtered = lastPayments.filter(p => {
      try {
        if (status && String(p.status) !== status) return false;
        if (min) {
          const m = Math.round(Number(min) * 100);
          if (Number(p.amount) < m) return false;
        }
        if (max) {
          const M = Math.round(Number(max) * 100);
          if (Number(p.amount) > M) return false;
        }
        if (from) {
          const fromTs = new Date(from + 'T00:00:00Z').getTime();
          const pt = p.timestamp ? new Date(p.timestamp).getTime() : NaN;
          if (isFinite(pt) && pt < fromTs) return false;
        }
        if (to) {
          const toTs = new Date(to + 'T23:59:59Z').getTime();
          const pt = p.timestamp ? new Date(p.timestamp).getTime() : NaN;
          if (isFinite(pt) && pt > toTs) return false;
        }
        return true;
      } catch (_) { return false; }
    });
    renderPayments(filtered);
  }

  // Reset filters and show unfiltered results
  function clearFilters(){
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterFrom').value = '';
    document.getElementById('filterTo').value = '';
    document.getElementById('filterMin').value = '';
    document.getElementById('filterMax').value = '';
    if (lastPayments) renderPayments(lastPayments);
  }

  if (paymentsTable) {
    paymentsTable.querySelectorAll('thead th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.getAttribute('data-sort');
        if (currentSortField === field) currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
        else currentSortField = field;
        applyFilters();
      });
    });
  }

  function updatePaymentsHintColumnWidths(){
    try {
      const hintHeadRow = document.querySelector('#paymentsHintTable thead tr');
      if (!hintHeadRow || !paymentsTbody) return;
      const firstRow = paymentsTbody.querySelector('tr');
      if (!firstRow) return;
      const dataCells = Array.from(firstRow.children);
      const hintCells = Array.from(hintHeadRow.children);
      if (dataCells.length !== hintCells.length) return;
      let total = 0;
      dataCells.forEach((td, i) => {
        const w = Math.ceil(td.getBoundingClientRect().width);
        hintCells[i].style.width = w + 'px';
        hintCells[i].style.minWidth = w + 'px';
        total += w;
      });
      const hintTable = document.getElementById('paymentsHintTable');
      if (hintTable && total > 0) hintTable.style.width = total + 'px';
    } catch(_) { /* ignore */ }
  }

  function queueUpdatePaymentsHintWidths(){
    requestAnimationFrame(() => updatePaymentsHintColumnWidths());
    setTimeout(updatePaymentsHintColumnWidths, 100);
  }

  function setupPaymentsScrollSync(){
    const scroller = document.getElementById('paymentsHintScroller') || document.querySelector('#paymentsColumnsHint .hint-scroll');
    const container = document.getElementById('paymentsContainer');
    if (!scroller || !container) return;
    const sync = (from, to) => {
      if (isSyncingScroll) return; isSyncingScroll = true;
      to.scrollLeft = from.scrollLeft;
      requestAnimationFrame(() => { isSyncingScroll = false; });
    };
    if (!scroller.__gaSyncBound) {
      scroller.addEventListener('scroll', () => sync(scroller, container));
      scroller.__gaSyncBound = true;
    }
    if (!container.__gaSyncBound) {
      container.addEventListener('scroll', () => sync(container, scroller));
      container.__gaSyncBound = true;
    }
  }

  const bookingsPanel = document.getElementById('bookingsPanel');
  const bookingsTable = document.getElementById('bookingsTable');
  const bookingsTbody = bookingsTable ? bookingsTable.querySelector('tbody') : null;
  const bookingsMessage = document.getElementById('bookingsMessage');
  let bookingsHintBuilt = false;
  let isSyncingScroll = false;

  const btnRefreshBookings = document.getElementById('refreshBookings'); if (btnRefreshBookings) btnRefreshBookings.addEventListener('click', fetchBookings);
  const btnExportBookings = document.getElementById('exportBookings'); if (btnExportBookings) btnExportBookings.addEventListener('click', exportBookings);
  const selBfPaymentType = document.getElementById('bfPaymentType'); if (selBfPaymentType) selBfPaymentType.addEventListener('change', fetchBookings);
  const inpBfPartner = document.getElementById('bfPartner'); if (inpBfPartner) inpBfPartner.addEventListener('change', fetchBookings);
  const selBfPayoutStatus = document.getElementById('bfPayoutStatus'); if (selBfPayoutStatus) selBfPayoutStatus.addEventListener('change', fetchBookings);

  const btnGenStripe = document.getElementById('genStripeLink'); if (btnGenStripe) btnGenStripe.addEventListener('click', async () => {
    const email = (document.getElementById('partnerEmail').value || '').trim();
    const status = document.getElementById('genStatus');
    const resultDiv = document.getElementById('onboardingResult');
    const urlInput = document.getElementById('onboardingUrl');
    const acctSpan = document.getElementById('onboardingAccount');
    if (!email) { alert('Please enter an email'); return; }
    status.textContent = 'Generating...';
    resultDiv.style.display = 'none';
    try {
      const res = await fetch('/api/partners/connect-link?email=' + encodeURIComponent(email));
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j || !j.url) throw new Error(j && j.error ? j.error : ('HTTP ' + res.status));
      urlInput.value = j.url;
      acctSpan.textContent = j.accountId || '';
      resultDiv.style.display = 'block';
      status.textContent = 'Ready';
    } catch (e) {
      status.textContent = 'Error generating link';
      alert('Failed to generate Stripe link: ' + e.message);
    }
  });

  const btnCopyOnboarding = document.getElementById('copyOnboarding'); if (btnCopyOnboarding) btnCopyOnboarding.addEventListener('click', async () => {
    const url = document.getElementById('onboardingUrl').value || '';
    if (!url) return;
    try { await navigator.clipboard.writeText(url); alert('Copied!'); } catch (_) { /* fallback */
      const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); alert('Copied.');
    }
  });

  async function fetchPartnersList(){
    try {
      const res = await fetch('/api/partners/list', { headers: { Authorization: basicAuth } });
      if (!res.ok) return;
      const arr = await res.json();
      const dl = document.getElementById('partnersList');
      dl.innerHTML = '';
      for (const p of arr) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.label = (p.partner_name || p.partner_email || p.id);
        dl.appendChild(opt);
      }
    } catch (_) {}
  }

  function openAdminStream(u, p){
    try {
      const auth = btoa(String(u||'')+':'+String(p||''));
      const es = new EventSource('/api/partners/admin/stream?auth='+encodeURIComponent(auth));
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data || '{}');
          if (msg && msg.type && msg.booking_id) {
            if (msg.type === 'payout_sent' || msg.type === 'payout_failed') updatePayoutCells(msg.booking_id, msg.status || (msg.type==='payout_sent'?'sent':'failed'), msg.payout_date || '');
          }
        } catch(_){}
      };
    } catch (_) { /* ignore */ }
  }

  async function fetchBookings(){
    if (!basicAuth || !bookingsTbody) return;
    bookingsTbody.innerHTML = '';
    if (bookingsMessage) bookingsMessage.textContent = 'Φόρτωση...';
    try {
      const params = new URLSearchParams();
      params.set('limit', '1000');
      params.set('offset', '0');
      const pt = document.getElementById('bfPaymentType').value;
      const partner = document.getElementById('bfPartner').value.trim();
      const ps = document.getElementById('bfPayoutStatus').value;
      if (pt) params.set('payment_type', pt);
      if (partner) params.set('partner', partner);
      if (ps) params.set('payout_status', ps);
      const qs = '?' + params.toString();
      const res = await fetch('/api/partners/admin/bookings' + qs, { headers: { Authorization: basicAuth } });
      if (!res.ok) throw new Error(res.status);
      const arr = await res.json();
      renderBookings(arr || []);
    } catch (e) {
      bookingsTbody.innerHTML = '';
      if (bookingsMessage) bookingsMessage.textContent = 'Σφάλμα φόρτωσης κρατήσεων. Εμφανίζεται δείγμα.';
      bookingsDemoForce = true;
      renderBookings([]);
    }
  }

  function renderBookings(arr){
    if (!bookingsTbody) return;
    bookingsTbody.innerHTML = '';
    if (!arr || arr.length === 0 || bookingsDemoForce) {
      if (!bookingsDemoForce) {
        bookingsMessage.textContent = 'No bookings found. Showing a sample row for testing.';
      }
      const demo = document.createElement('tr');
      demo.id = 'demo-booking-row';
      const demoCreated = new Date();
      const demoPrice = formatAmount(32000, 'eur');
      const demoPartnerShare = formatAmount(25600, 'eur');
      const demoCommission = formatAmount(6400, 'eur');
      demo.innerHTML = `
        <td>bk_demo_1</td>
        <td>confirmed</td>
        <td></td>
        <td></td>
        <td>John Demo</td>
        <td></td>
        <td>Lefkada Experience</td>
        <td style="text-align:right">2</td>
        <td style="text-align:right">${escapeHtml(demoPrice)}</td>
        <td>${escapeHtml(formatDate(demoCreated.toISOString()))}</td>
        <td>stripe</td>
        <td class="editable-partner" contenteditable data-trip="" data-partnerid="">BlueWave Cruises</td>
        <td style="text-align:right">${escapeHtml(demoPartnerShare)}</td>
        <td style="text-align:right">${escapeHtml(demoCommission)}</td>
        <td class="payout-status" data-booking="bk_demo_1">sent</td>
        <td class="payout-date" data-booking="bk_demo_1">${escapeHtml(formatDate('2025-10-23T00:00:00Z'))}</td>
        <td></td>
      `;
      bookingsTbody.appendChild(demo);
      // Ensure hint exists and width-aligned even for demo
      ensureBookingsHint();
      queueUpdateBookingsHintWidths();
      bookingsDemoForce = false;
      return;
    }
    if (bookingsMessage) bookingsMessage.textContent = '';
    for (const b of arr) {
      const tr = document.createElement('tr');
      const when = formatDate(b.created_at);
      const price = formatAmount(b.price_cents || 0, 'eur');
      const partnerName = b.partner_name || b.partner_id || '';
      const partnerShare = formatAmount(b.partner_share_cents || 0, 'eur');
      const commission = formatAmount(b.commission_cents || 0, 'eur');
      tr.innerHTML = `
        <td>${escapeHtml(b.id||'')}</td>
        <td>${escapeHtml(b.status||'')}</td>
        <td>${escapeHtml(b.payment_intent_id||'')}</td>
        <td>${escapeHtml(b.event_id||'')}</td>
        <td>${escapeHtml(b.user_name||'')}</td>
        <td>${escapeHtml(b.user_email||'')}</td>
        <td>${escapeHtml(b.trip_id||'')}</td>
        <td style="text-align:right">${escapeHtml(String(b.seats||''))}</td>
        <td style="text-align:right">${escapeHtml(price)}</td>
        <td>${escapeHtml(when)}</td>
        <td>${escapeHtml(b.payment_type||'')}</td>
        <td class="editable-partner" contenteditable data-trip="${escapeHtml(b.trip_id||'')}" data-partnerid="${escapeHtml(b.partner_id||'')}">${escapeHtml(partnerName)}</td>
        <td style="text-align:right">${escapeHtml(partnerShare)}</td>
        <td style="text-align:right">${escapeHtml(commission)}</td>
        <td class="payout-status" data-booking="${escapeHtml(b.id||'')}">${escapeHtml(b.payout_status||'')}</td>
        <td class="payout-date" data-booking="${escapeHtml(b.id||'')}">${escapeHtml(formatDate(b.payout_date||''))}</td>
        <td>${renderBookingMetaButton(b.metadata||'', b.id, b.payment_intent_id)}</td>
      `;
      bookingsTbody.appendChild(tr);
    }
    // After rows rendered, build hint (if needed) and sync widths
    ensureBookingsHint();
    queueUpdateBookingsHintWidths();
  bookingsTbody.querySelectorAll('.editable-partner').forEach(td => {
      td.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); td.blur(); }
      });
      td.addEventListener('blur', async () => {
        const tripId = td.getAttribute('data-trip');
        const val = td.textContent.trim();
        if (!tripId) return;
        let partnerId = val;
        const opt = Array.from(document.querySelectorAll('#partnersList option')).find(o => o.label === val || o.value === val);
        if (opt) partnerId = opt.value;
        try {
          await fetch('/api/partners/admin/mapping', { method: 'POST', headers: { 'Content-Type':'application/json', Authorization: basicAuth }, body: JSON.stringify({ trip_id: tripId, partner_id: partnerId }) });
          fetchBookings();
        } catch (_) {}
      });
    });
  }

  if (bookingsTable) {
    bookingsTable.querySelectorAll('thead th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.getAttribute('data-sort');
        if (bookingsSortField === field) bookingsSortDir = bookingsSortDir === 'asc' ? 'desc' : 'asc';
        else bookingsSortField = field;
        fetchBookings();
      });
    });
  }

  function ensureBookingsHint(){
    try {
      const hintHost = document.getElementById('bookingsColumnsHint');
      if (!hintHost || !bookingsTable) return;
      if (!bookingsHintBuilt) {
        // Build scroll container and hint table structure
        hintHost.innerHTML = '';
        const scroller = document.createElement('div');
        scroller.className = 'hint-scroll';
        scroller.id = 'bookingsHintScroller';
        const tbl = document.createElement('table');
        tbl.id = 'bookingsHintTable';
        const thead = document.createElement('thead');
        const tr = document.createElement('tr');
        // Clone labels from the real header to stay in sync
        const headCells = bookingsTable.querySelectorAll('thead th');
        headCells.forEach(th => {
          const th2 = document.createElement('th');
          th2.textContent = (th.textContent || '').trim();
          tr.appendChild(th2);
        });
        thead.appendChild(tr);
        tbl.appendChild(thead);
        scroller.appendChild(tbl);
        hintHost.appendChild(scroller);
        setupBookingsScrollSync();
        bookingsHintBuilt = true;
      } else {
        // If already built but columns count changed, rebuild headers
        const headCells = bookingsTable.querySelectorAll('thead th');
        const hintHeadRow = document.querySelector('#bookingsHintTable thead tr');
        if (hintHeadRow && hintHeadRow.children.length !== headCells.length) {
          hintHeadRow.innerHTML = '';
          headCells.forEach(th => {
            const th2 = document.createElement('th');
            th2.textContent = (th.textContent || '').trim();
            hintHeadRow.appendChild(th2);
          });
        }
      }
    } catch(_) { /* ignore */ }
  }

  function setupBookingsScrollSync(){
    const scroller = document.getElementById('bookingsHintScroller');
    const container = document.getElementById('bookingsContainer');
    if (!scroller || !container) return;
    const sync = (from, to) => {
      if (isSyncingScroll) return; isSyncingScroll = true;
      to.scrollLeft = from.scrollLeft;
      // Use rAF to release the flag next frame
      requestAnimationFrame(() => { isSyncingScroll = false; });
    };
    scroller.addEventListener('scroll', () => sync(scroller, container));
    container.addEventListener('scroll', () => sync(container, scroller));
  }

  function updateBookingsHintColumnWidths(){
    try {
      const hintHeadRow = document.querySelector('#bookingsHintTable thead tr');
      if (!hintHeadRow || !bookingsTbody) return;
      // Measure from first visible data row for exact computed widths
      const firstRow = bookingsTbody.querySelector('tr');
      if (!firstRow) return;
      const dataCells = Array.from(firstRow.children);
      const hintCells = Array.from(hintHeadRow.children);
      if (dataCells.length !== hintCells.length) return;
      let total = 0;
      dataCells.forEach((td, i) => {
        const w = Math.ceil(td.getBoundingClientRect().width);
        hintCells[i].style.width = w + 'px';
        hintCells[i].style.minWidth = w + 'px';
        total += w;
      });
      const hintTable = document.getElementById('bookingsHintTable');
      if (hintTable && total > 0) hintTable.style.width = total + 'px';
    } catch(_) { /* ignore */ }
  }

  function queueUpdateBookingsHintWidths(){
    // Wait for layout to settle
    requestAnimationFrame(() => updateBookingsHintColumnWidths());
    // Also re-run a bit later for fonts/scrollbars changes
    setTimeout(updateBookingsHintColumnWidths, 100);
  }

  // Re-sync widths on resize
  window.addEventListener('resize', () => {
    queueUpdateBookingsHintWidths();
    queueUpdatePaymentsHintWidths();
  });

  async function exportBookings(){
    if (!basicAuth) return;
    const btn = document.getElementById('exportBookings'); btn.disabled = true; btn.textContent = 'Ετοιμάζεται...';
    try {
      const params = new URLSearchParams();
      const pt = document.getElementById('bfPaymentType').value;
      const partner = document.getElementById('bfPartner').value.trim();
      const ps = document.getElementById('bfPayoutStatus').value;
      if (pt) params.set('payment_type', pt);
      if (partner) params.set('partner', partner);
      if (ps) params.set('payout_status', ps);
      const res = await fetch('/api/partners/admin/bookings.csv?' + params.toString(), { headers: { Authorization: basicAuth } });
      if (!res.ok) throw new Error('Export failed: ' + res.status);
      const blob = await res.blob();
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      const cd = res.headers.get('Content-Disposition') || '';
      let filename = 'bookings.csv';
      const m = cd.match(/filename="?([^";]+)"?/);
      if (m && m[1]) filename = m[1];
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { alert('Export failed: ' + e); }
    finally { btn.disabled = false; btn.textContent = 'Εξαγωγή Κρατήσεων (CSV)'; }
  }

  function updatePayoutCells(bookingId, status, dateIso){
    if (!bookingsTbody) return;
    const rowStatus = bookingsTbody.querySelector(`.payout-status[data-booking="${CSS.escape(bookingId)}"]`);
    const rowDate = bookingsTbody.querySelector(`.payout-date[data-booking="${CSS.escape(bookingId)}"]`);
    if (rowStatus) rowStatus.textContent = status || '';
    if (rowDate) rowDate.textContent = dateIso ? formatDate(dateIso) : '';
  }

  function greekStatus(s){
    if (!s) return '';
    const map = {
      'succeeded': 'Επιτυχής',
      'failed': 'Αποτυχημένη',
      'processing': 'Σε επεξεργασία',
      'requires_payment_method': 'Χρειάζεται μέθοδο',
      'canceled': 'Ακυρώθηκε'
    };
    return map[s] || s;
  }

  function statusClassFor(s){
    if (!s) return '';
    const map = {
      'succeeded': 'status-succeeded',
      'failed': 'status-failed',
      'processing': 'status-processing',
      'requires_payment_method': 'status-requires_payment_method',
      'canceled': 'status-canceled'
    };
    return map[s] || '';
  }

  function formatAmount(amount, currency){
    if (amount == null || amount === '') return '';
    let num = Number(amount);
    if (!isFinite(num)) return String(amount);
    if (Math.abs(num) > 1000) num = num / 100;
    return num.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00A0€';
  }

  function formatDate(iso){
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2,'0');
    const min = String(d.getMinutes()).padStart(2,'0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  }

  function formatFileSize(bytes){
    try {
      let n = Number(bytes);
      if (!isFinite(n) || n < 0) return '';
      const units = ['B','KB','MB','GB','TB'];
      let i = 0;
      while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
      const val = Math.round(n);
      return val + ' ' + units[i];
    } catch (_) { return ''; }
  }

  function statusIconFor(s){
    const map = {
      'succeeded': '✔️',
      'failed': '❌',
      'processing': '⏳',
      'requires_payment_method': '⚠️',
      'canceled': '⛔'
    };
    return map[s] || '';
  }

  function renderMetaButton(meta){
    try {
      const j = typeof meta === 'string' && meta ? meta : (meta && typeof meta === 'object' ? JSON.stringify(meta) : '');
      if (!j) return '';
      return `<button class="view-meta" data-meta='${escapeHtml(j)}'>View</button>`;
    } catch (e) { return ''; }
  }

  function renderBookingMetaButton(meta, bookingId, paymentIntentId){
    try {
      const j = typeof meta === 'string' && meta ? meta : (meta && typeof meta === 'object' ? JSON.stringify(meta) : '');
      const dataMeta = escapeHtml(j);
      const dataB = escapeHtml(String(bookingId || ''));
      const dataPi = escapeHtml(String(paymentIntentId || ''));
      return `<button class="view-booking" data-meta='${dataMeta}' data-booking='${dataB}' data-pi='${dataPi}'>View</button>`;
    } catch (e) { return ''; }
  }

  document.addEventListener('click', (e) => {
    if (e.target && e.target.classList) {
      if (e.target.classList.contains('view-meta')) {
        const m = e.target.getAttribute('data-meta') || '';
        showMetadataModal(m);
      } else if (e.target.classList.contains('view-booking')) {
        const m = e.target.getAttribute('data-meta') || '';
        const bid = e.target.getAttribute('data-booking') || '';
        const pi = e.target.getAttribute('data-pi') || '';
        showMetadataModal(m, bid, pi);
      }
    }
  });

  const modalBackdrop = document.createElement('div'); modalBackdrop.className = 'modal-backdrop';
  modalBackdrop.innerHTML = `
    <div class="modal">
      <button id="closeModal" style="float:right">Close</button>
      <h3>Metadata</h3>
      <pre id="modalPre"></pre>
      <div style="margin-top:12px">
        <button id="refundBtn" style="background:#dc3545;color:#fff;margin-right:8px">Refund</button>
        <button id="cancelBtn" style="background:#6c757d;color:#fff">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modalBackdrop);
  document.getElementById('closeModal').addEventListener('click', () => { modalBackdrop.style.display = 'none'; clearModalState(); });
  async function showMetadataModal(text, bookingId, paymentIntentId){
    const pre = document.getElementById('modalPre');
    if (bookingId) {
      try {
        const res = await fetch('/api/bookings/' + encodeURIComponent(bookingId));
        if (res.ok) {
          const b = await res.json();
          const parts = [];
          parts.push('ID: ' + (b.id || ''));
          parts.push('Status: ' + (b.status || ''));
          parts.push('PaymentIntent: ' + (b.payment_intent_id || ''));
          parts.push('Event: ' + (b.event_id || ''));
          parts.push('Name: ' + (b.user_name || ''));
          parts.push('Email: ' + (b.user_email || ''));
          parts.push('Trip: ' + (b.trip_id || ''));
          parts.push('Seats: ' + (b.seats || ''));
          parts.push('Price: ' + (formatAmount(b.price_cents || 0, b.currency || 'eur')));
          parts.push('Created: ' + (formatDate(b.created_at || '') || ''));
          parts.push('\nMetadata:\n' + (typeof b.metadata === 'object' ? JSON.stringify(b.metadata, null, 2) : (b.metadata || '')));
          pre.textContent = parts.join('\n');
        } else {
          try { pre.textContent = JSON.stringify(JSON.parse(text), null, 2); } catch (e) { pre.textContent = text; }
        }
      } catch (e) {
        try { pre.textContent = JSON.stringify(JSON.parse(text), null, 2); } catch (err) { pre.textContent = text; }
      }
    } else {
      try { pre.textContent = JSON.stringify(JSON.parse(text), null, 2); } catch (e) { pre.textContent = text; }
    }
    modalBackdrop.dataset.booking = bookingId || '';
    modalBackdrop.dataset.pi = paymentIntentId || '';
    document.getElementById('refundBtn').disabled = !bookingId;
    document.getElementById('cancelBtn').disabled = !bookingId;
    modalBackdrop.style.display = 'flex';
  }

  function clearModalState(){
    delete modalBackdrop.dataset.booking;
    delete modalBackdrop.dataset.pi;
    document.getElementById('refundBtn').disabled = true;
    document.getElementById('cancelBtn').disabled = true;
  }

  document.getElementById('refundBtn').addEventListener('click', async () => {
    const bookingId = modalBackdrop.dataset.booking;
    if (!bookingId) return alert('No booking id');
    if (!confirm('Really refund booking ' + bookingId + '?')) return;
    try {
      const res = await fetch(`/admin/bookings/${encodeURIComponent(bookingId)}/refund`, { method: 'POST', headers: { Authorization: basicAuth } });
      if (!res.ok) throw new Error('Refund failed: ' + res.status);
      updateBookingRowStatus(bookingId, 'refunded');
      alert('Refund request accepted');
      modalBackdrop.style.display = 'none'; clearModalState();
      fetchBookings();
    } catch (e) { alert('Refund failed: ' + e); }
  });

  document.getElementById('cancelBtn').addEventListener('click', async () => {
    const bookingId = modalBackdrop.dataset.booking;
    if (!bookingId) return alert('No booking id');
    if (!confirm('Really cancel booking ' + bookingId + '?')) return;
    try {
      const res = await fetch(`/admin/bookings/${encodeURIComponent(bookingId)}/cancel`, { method: 'POST', headers: { Authorization: basicAuth } });
      if (!res.ok) throw new Error('Cancel failed: ' + res.status);
      updateBookingRowStatus(bookingId, 'canceled');
      alert('Booking canceled');
      modalBackdrop.style.display = 'none'; clearModalState();
      fetchBookings();
    } catch (e) { alert('Cancel failed: ' + e); }
  });

  function updateBookingRowStatus(bookingId, newStatus){
    if (!bookingsTbody) return;
    const trs = bookingsTbody.querySelectorAll('tr');
    for (const tr of trs) {
      const td = tr.querySelector('td');
      if (!td) continue;
      if (td.textContent.trim() === bookingId) {
        const statusCell = tr.querySelectorAll('td')[1];
        if (statusCell) {
          statusCell.textContent = newStatus;
        }
        return;
      }
    }
  }

  function escapeHtml(s){
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function formatMeta(m){
    if (!m) return '';
    try { return typeof m === 'string' ? m : JSON.stringify(m); } catch(e) { return String(m); }
  }

  // Export payments to CSV with server fallback
  async function exportPayments_v2(){
    if(!basicAuth) return;
    const btn = document.getElementById('exportPayments');
    btn.disabled = true;
    btn.textContent = 'Ετοιμάζεται...';
    try {
      const params = new URLSearchParams();
      const status = document.getElementById('filterStatus').value;
      const from = document.getElementById('filterFrom').value;
      const to = document.getElementById('filterTo').value;
      const min = document.getElementById('filterMin').value;
      const max = document.getElementById('filterMax').value;
      if (status) params.set('status', status);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (min) params.set('min', Math.round(Number(min)*100));
      if (max) params.set('max', Math.round(Number(max)*100));

      const url = '/admin/payments.csv?' + params.toString();
      const res = await fetch(url, { headers: { Authorization: basicAuth } });
      if (res.ok) {
        const blob = await res.blob();
        const a = document.createElement('a');
        const downloadUrl = URL.createObjectURL(blob);
        const cd = res.headers.get('Content-Disposition') || '';
        let filename = 'payments.csv';
        const m = cd.match(/filename="?([^";]+)"?/);
        if (m && m[1]) filename = m[1];
        a.href = downloadUrl; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(downloadUrl);
      } else {
        const rows = [];
        rows.push(['Κωδικός','Κατάσταση','Γεγονός','Ποσό (€)','Νόμισμα','Ημερομηνία','Μεταδεδομένα']);
        const trs = paymentsTbody.querySelectorAll('tr');
        trs.forEach(tr => {
          const cols = Array.from(tr.querySelectorAll('td')).map(td => '"'+td.textContent.replace(/"/g,'""')+'"');
          rows.push(cols);
        });
        const csv = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url2 = URL.createObjectURL(blob);
        const a2 = document.createElement('a'); a2.href = url2; a2.download = 'payments.csv'; document.body.appendChild(a2); a2.click(); a2.remove(); URL.revokeObjectURL(url2);
      }
    } catch (err) {
      alert('Εξαγωγή απέτυχε: '+err);
    } finally {
      btn.disabled = false; btn.textContent = 'Εξαγωγή σε CSV';
    }
  }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
