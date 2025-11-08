// Greekaway Admin — Bookings page logic (moved from inline)
// Version badge
fetch('/version.json')
  .then(r => (r.ok ? r.json() : null))
  .then(v => {
    if (v) {
      const el = document.getElementById('ga-version');
      if (el) el.textContent = v.version || '—';
    }
  })
  .catch(() => {});

// Mobile filters toggle
(function(){
  document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('header.sticky-bar');
    const btn = document.getElementById('toggleFilters');
    if (header && btn) {
      btn.addEventListener('click', () => {
        const cur = header.getAttribute('data-collapsed') === 'true';
        header.setAttribute('data-collapsed', cur ? 'false' : 'true');
        btn.setAttribute('aria-expanded', cur ? 'true' : 'false');
        btn.textContent = cur ? '▲' : '▼';
      });
    }
  });
})();

// Session-based auth: server checks cookie adminSession; no Basic prompt
function requireAuth() { return true; }

// Populate partners dropdown
async function loadPartners() {
  if (!requireAuth()) return;
  try {
    const res = await fetch('/api/partners/list');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const arr = await res.json();
    const sel = document.getElementById('partner');
    if (!sel) return;
    sel.innerHTML = '<option value="">(όλοι)</option>';
    arr.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.partner_name || p.partner_email || p.id;
      sel.appendChild(o);
    });
  } catch (e) { /* ignore */ }
}

// State
let page = 1, limit = 50, loading = false, ended = false;
let items = []; // accumulated
let sortField = 'date', sortDir = 'desc';
let liveSearchTimer = null;

function $(id) { return document.getElementById(id); }
function showLoading(v){ const el=$('bk-loading'); if(el) el.style.display = v? 'block':'none'; }
function showError(v){ const el=$('bk-error'); if(el) el.style.display = v? 'block':'none'; }
function showLoadMore(v){ const el=$('bk-loadmore'); if(el) el.style.display = v? 'block':'none'; }

function applySort(arr){
  const out = arr.slice();
  out.sort((a,b)=>{
    const dir = sortDir==='asc'?1:-1;
    if (sortField==='date') {
      const ta = a.date? new Date(a.date).getTime():0; const tb = b.date? new Date(b.date).getTime():0; return (ta-tb)*dir;
    }
    if (sortField==='total_cents' || sortField==='pax') {
      const na = Number(a[sortField]||0), nb = Number(b[sortField]||0); return (na-nb)*dir;
    }
    const sa = String(a[sortField]||''); const sb = String(b[sortField]||''); return sa.localeCompare(sb)*dir;
  });
  return out;
}

function renderRows(){
  const tbody = $('bk-rows');
  if (!tbody) return;
  tbody.innerHTML = '';
  const arr = applySort(items);
  if (arr.length===0) {
    for(let i=0;i<5;i++){ const tr=document.createElement('tr'); tr.innerHTML='<td colspan="8">⏳ Φόρτωση...</td>'; tbody.appendChild(tr); }
    return;
  }
  for (const r of arr) {
    const tr=document.createElement('tr');
    const email = r.email || r.customer_email || r.user_email || r.contact_email || '';
    const pickup = r.pickup || r.pickup_location || r.from || r.start_location || '';
    const dropoff = r.dropoff || r.dropoff_location || r.to || r.end_location || '';
    // New structured fields (no metadata fallback — API provides them)
    const pickup_location = r.pickup_location || '';
    const luggage = r.luggage_text || (Array.isArray(r.suitcases) ? r.suitcases.join(', ') : (r.suitcases ? String(r.suitcases) : ''));
    const special_requests = r.special_requests || '';
    tr.innerHTML = `
      <td>${escapeHtml(r.id||'')}</td>
      <td>${escapeHtml(formatDate(r.date||r.created_at||''))}</td>
      <td>${escapeHtml(r.trip_title||r.trip_id||'')}</td>
      <td class="col-email">${escapeHtml(email)}</td>
      <td>${escapeHtml(String(r.pax||''))}</td>
      <td style="text-align:right">${escapeHtml(String(r.total_cents??''))}</td>
      <td>${escapeHtml((r.currency||'').toUpperCase())}</td>
      <td>${escapeHtml(r.status||'')}</td>
      <td class="col-pickup">${escapeHtml(pickup)}</td>
      <td class="col-dropoff">${escapeHtml(dropoff)}</td>
      <td class="col-pickuploc">${escapeHtml(pickup_location)}</td>
      <td class="col-luggage">${escapeHtml(luggage)}</td>
      <td class="col-requests">${escapeHtml(special_requests)}</td>
      <td>${escapeHtml(r.partner_id||'')}</td>`;
    tbody.appendChild(tr);
  }
}

async function fetchPage(reset=false){
  if(!requireAuth()) return;
  if (loading) return; loading=true; showError(false); showLoading(true);
  if (reset){ page=1; ended=false; items=[]; }
  try{
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('page', String(page));
    const q = ($('q')?.value || '').trim(); if(q) params.set('search', q);
    const s = $('status')?.value; if(s) params.set('status', s);
    const p = $('partner')?.value; if(p) params.set('partner_id', p);
    const f = $('from')?.value; const t = $('to')?.value; if(f) params.set('date_from', f); if(t) params.set('date_to', t);
    const res = await fetch('/api/bookings?'+params.toString());
    if (!res.ok) throw new Error('HTTP '+res.status);
    const j = await res.json();
    const arr = (j && j.items) || [];
    if (reset) items = arr; else items = items.concat(arr);
    if (!arr.length || arr.length<limit) { ended = true; }
    renderRows();
    showLoadMore(!ended);
    page++;
  }catch(e){ console.error(e); showError(true); }
  finally{ loading=false; showLoading(false); }
}

// CSV export using server endpoint that relies on admin session
async function exportBookingsCsv(){
  const btn = $('exportBookings');
  try {
    if (btn){ btn.disabled = true; btn.textContent = 'Εξαγωγή...'; }
    const params = new URLSearchParams();
    // Respect status/date filters which the server-side CSV supports
    const s = $('status')?.value; if(s) params.set('status', s);
    const f = $('from')?.value; const t = $('to')?.value; if(f) params.set('date_from', f); if(t) params.set('date_to', t);
    // Note: free-text search/partner filter not supported by /admin/bookings.csv
    const url = '/admin/bookings.csv' + (params.toString() ? ('?'+params.toString()) : '');
    const r = await fetch(url);
    if (!r.ok) throw new Error('Export failed: ' + r.status);
    const blob = await r.blob();
    const a = document.createElement('a');
    const dlUrl = URL.createObjectURL(blob);
    a.href = dlUrl; a.download = inferCsvFilename(r) || 'bookings.csv';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(dlUrl);
  } catch (e) {
    alert(String(e));
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = 'Export CSV (κρατήσεις)'; }
  }
}

function inferCsvFilename(res){
  try {
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="?([^";]+)"?/i);
    return m ? m[1] : null;
  } catch(_) { return null; }
}

function clearFilters(){
  ['q','from','to','status','partner'].forEach(id=>{
    const el = $(id); if(!el) return;
    if (el.tagName === 'SELECT') el.value = '';
    else el.value = '';
  });
  fetchPage(true);
}

// Initialize
(function(){
  document.addEventListener('DOMContentLoaded', () => {
    requireAuth();
    loadPartners();
    fetchPage(true);
    // Filters: change + Enter
    ;['from','to','status','partner'].forEach(id => {
      const el = $(id); if (!el) return;
      el.addEventListener('change', () => fetchPage(true));
      el.addEventListener('keyup', (e) => { if (e.key === 'Enter') fetchPage(true); });
    });
    // Live search on input with small debounce
    const q = $('q');
    if (q){
      q.addEventListener('input', () => {
        if (liveSearchTimer) clearTimeout(liveSearchTimer);
        liveSearchTimer = setTimeout(() => { fetchPage(true); }, 200);
      });
      q.addEventListener('keyup', (e) => { if (e.key === 'Enter') fetchPage(true); });
    }
    // Sorting
    document.querySelectorAll('.table thead th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const f = th.getAttribute('data-sort');
        if (sortField === f) sortDir = (sortDir === 'asc' ? 'desc' : 'asc'); else { sortField = f; sortDir = 'desc'; }
        renderRows();
      });
    });
    // Load more / infinite scroll
    $('bk-loadmore')?.addEventListener('click', () => fetchPage(false));
    window.addEventListener('scroll', () => {
      if (ended || loading) return;
      const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 200);
      if (nearBottom) fetchPage(false);
    });
    // Retry
    $('bk-retry')?.addEventListener('click', () => fetchPage(false));
    // Export CSV
    $('exportBookings')?.addEventListener('click', exportBookingsCsv);
    // Reset Filters
    $('resetFilters')?.addEventListener('click', clearFilters);
  });
})();

function escapeHtml(s){ return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function formatDate(iso){ if(!iso) return ''; const d=new Date(iso); if(isNaN(d)) return iso; const dd=String(d.getDate()).padStart(2,'0'); const mm=String(d.getMonth()+1).padStart(2,'0'); const yyyy=d.getFullYear(); const hh=String(d.getHours()).padStart(2,'0'); const mi=String(d.getMinutes()).padStart(2,'0'); return `${dd}/${mm}/${yyyy} ${hh}:${mi}`; }
