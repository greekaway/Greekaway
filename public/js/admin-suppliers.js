/* Clean reimplementation: Suppliers admin page controller */
(function(){
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const state = { sort: 'last_active', dir: 'desc', limit: 50, offset: 0, total: 0 };

  // --- Filters/query helpers ---
  function getFilters(){
    return {
      q: ($('#q')?.value || '').trim(),
      type: $('#type')?.value || '',
      from: $('#from')?.value || '',
      to: $('#to')?.value || '',
      payoutStatus: $('#payoutStatus')?.value || ''
    };
  }

  function normalizeDate(input){
    if (!input) return '';
    const m = input.match(/^([0-3]?\d)[\/\.-]([0-1]?\d)[\/\.-](\d{4})$/);
    if (m){ const d = m[1], mo = m[2], y = m[3]; return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
    return input; // already yyyy-mm-dd or another acceptable format
  }

  function buildQuery(){
    const f = getFilters();
    if (f.from) f.from = normalizeDate(f.from);
    if (f.to) f.to = normalizeDate(f.to);
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k,v])=>{ if(v) p.set(k,v); });
    p.set('sort', state.sort);
    p.set('dir', state.dir);
    p.set('limit', String(state.limit));
    p.set('offset', String(state.offset));
    return p.toString();
  }

  // --- Formatting helpers ---
  function fmtMoney(n){ if(n==null||isNaN(n)) return '—'; return new Intl.NumberFormat('el-GR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n); }
  function fmtDate(s){ if(!s) return '—'; try{ const d=new Date(s); if(isNaN(d.getTime())) return s; return d.toISOString().slice(0,10);}catch(_){return s;} }

  function adminHeader(){
    try{ const u = new URL(window.location.href); const a = u.searchParams.get('auth'); return a ? { 'X-Forward-Admin-Auth': a } : {}; }catch(_){ return {}; }
  }

  // --- Data fetching ---
  async function fetchSuppliers(){
    const qs = buildQuery();
    const r = await fetch('/api/admin/suppliers?' + qs, { headers: adminHeader() });
    const j = await r.json().catch(()=>({ rows:[], total:0 }));
    if(!r.ok) throw new Error(j && j.error || ('HTTP '+r.status));
    state.total = j.total || 0;
    return j.rows || [];
  }

  async function fetchDetails(id){
    const r = await fetch(`/api/admin/suppliers/${encodeURIComponent(id)}/details`, { headers: adminHeader() });
    const j = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j && j.error || ('HTTP '+r.status));
    return j;
  }

  async function saveNotes(id, text){
    const r = await fetch(`/api/admin/suppliers/${encodeURIComponent(id)}/notes`, { method:'PATCH', headers: { 'Content-Type':'application/json', ...adminHeader() }, body: JSON.stringify({ notes: text||'' }) });
    const j = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j && j.error || ('HTTP '+r.status));
    return true;
  }

  // --- Rendering ---
  function clearTbody(){ const tb = $('#tbody'); if (tb) tb.innerHTML=''; }

  function renderRows(rows){
    const tb = $('#tbody'); const tmpl = $('#rowTmpl'); if(!tb || !tmpl) return;
    tb.innerHTML = '';
    if (!rows.length){ $('#emptyState').style.display='block'; return; }
    $('#emptyState').style.display='none';
    rows.forEach(row => {
      const frag = tmpl.content.cloneNode(true);
      const tds = frag.querySelectorAll('tr:first-child td');
      const [tdId, tdName, tdType, tdTrips, tdRevenue, tdComm, tdPay, tdFirst, tdLast] = tds;
      tdId.textContent = row.id || '—';
      tdName.textContent = row.name || row.partner_name || '—';
      tdType.textContent = row.type || '—';
      tdTrips.textContent = (typeof row.total_trips === 'number') ? row.total_trips : '—';
      tdRevenue.textContent = (typeof row.total_revenue === 'number') ? fmtMoney(row.total_revenue) : '—';
      tdComm.textContent = (row.commission_percent != null) ? (Math.round(row.commission_percent*10)/10 + ' %') : '—';
  // Display a single payment type instead of counts
  const stripeCnt = row.payout_breakdown?.stripe || 0;
  const manualCnt = row.payout_breakdown?.manual || 0;
  let payLabel = '—';
  if (stripeCnt > 0 && manualCnt === 0) payLabel = 'Stripe';
  else if (manualCnt > 0 && stripeCnt === 0) payLabel = 'Manual';
  else if (stripeCnt === 0 && manualCnt === 0) payLabel = '—';
  else payLabel = (stripeCnt >= manualCnt) ? 'Stripe' : 'Manual';
  tdPay.textContent = payLabel;
      tdFirst.textContent = fmtDate(row.first_seen);
      tdLast.textContent  = fmtDate(row.last_active);

      const btn = frag.querySelector('button.details');
      const detailsRow = frag.querySelector('tr.details-row');
      btn.addEventListener('click', async () => {
        const open = detailsRow.style.display !== 'none';
        if (open){ detailsRow.style.display='none'; return; }
        detailsRow.style.display='';
        try {
          const d = await fetchDetails(row.id);
          const tripsArea = detailsRow.querySelector('[data-area="trips"]');
          const monthlyArea = detailsRow.querySelector('[data-area="monthly"]');
          const payoutsArea = detailsRow.querySelector('[data-area="payouts"]');
          const trips = d.trips || [];
          tripsArea.innerHTML = trips.length ? trips.map(t=>`${t.date||'—'} · ${t.trip_id||''} · seats:${t.seats||'—'} · ${fmtMoney(t.amount||0)} · ${t.status||''}`).join('<br/>') : '<span class="hint">—</span>';
          const months = d.monthly || [];
          monthlyArea.innerHTML = months.length ? months.map(m=>`${m.month}: ${fmtMoney(m.revenue||0)}`).join('<br/>') : '<span class="hint">—</span>';
          const payouts = d.payouts || [];
          payoutsArea.innerHTML = payouts.length ? payouts.map(p=>`${p.type||''} · ${p.status||''} · ${fmtMoney(p.amount||0)} · ${fmtDate(p.date)}`).join('<br/>') : '<span class="hint">—</span>';
          const notesEl = detailsRow.querySelector('.admin-notes'); if (notesEl) notesEl.value = d.notes || '';
        } catch(_){ /* ignore */ }
      });

      const saveBtn = frag.querySelector('.save-notes');
      const notesEl = frag.querySelector('.admin-notes');
      const saveStatus = frag.querySelector('.saveStatus');
      saveBtn.addEventListener('click', async () => {
        try { await saveNotes(row.id, notesEl.value||''); saveStatus.textContent='Αποθηκεύτηκε'; setTimeout(()=>saveStatus.textContent='',2000); }
        catch(_){ saveStatus.textContent='Σφάλμα'; setTimeout(()=>saveStatus.textContent='',2000); }
      });

      tb.appendChild(frag);
    });
  }

  // --- Paging/sorting/refresh ---
  function updatePager(){
    const from = state.total ? (state.offset + 1) : 0;
    const to = Math.min(state.offset + state.limit, state.total || 0);
    $('#pageInfo').textContent = state.total ? `${from}–${to} από ${state.total}` : '—';
    $('#prevPage').disabled = state.offset <= 0;
    $('#nextPage').disabled = (state.offset + state.limit) >= (state.total || 0);
  }

  async function refresh(){
    try {
      showLoading(true);
      clearTbody();
      const rows = await fetchSuppliers();
      renderRows(rows);
      updatePager();
    } catch(_){
      $('#tbody').innerHTML='';
      $('#emptyState').style.display='block';
    } finally {
      showLoading(false);
      updateFiltersBadge();
    }
  }

  // --- UI wiring ---
  function wire(){
    ensureOverlay();

    // Sorting
    $$('#suppliersTable thead .sortable').forEach(th => {
      th.addEventListener('click', () => {
        const s = th.dataset.sort;
        if (state.sort === s) state.dir = (state.dir === 'asc') ? 'desc' : 'asc';
        else { state.sort = s; state.dir = (s === 'name' || s === 'id') ? 'asc' : 'desc'; }
        state.offset = 0; refresh();
      });
    });

    // (no sticky header offset required)

    // Filters: auto-apply with debounce
    const debouncedApply = debounce(() => { state.offset = 0; refresh(); }, 350);
    ['#q','#type','#from','#to','#payoutStatus']
      .map(sel => $(sel)).filter(Boolean)
      .forEach(el => {
        const ev = (el.tagName === 'INPUT' && el.type === 'text') ? 'input' : 'change';
        el.addEventListener(ev, debouncedApply);
      });

    // Reset button + badge
    const filtersForm = $('#filters');
    if (filtersForm && !$('#resetFilters')){
      const resetBtn = document.createElement('button');
      resetBtn.id = 'resetFilters';
      resetBtn.type = 'button';
      resetBtn.className = 'btn reset-btn';
      resetBtn.textContent = 'Καθαρισμός';
      resetBtn.addEventListener('click', ()=>{
        ['#q','#type','#from','#to','#payoutStatus'].forEach(sel=>{
          const el=$(sel); if(!el) return; if(el.tagName==='SELECT') el.selectedIndex=0; else el.value='';
        });
        state.offset = 0; refresh();
      });
      filtersForm.appendChild(resetBtn);
      const badge = document.createElement('span');
      badge.id = 'filtersBadge';
      badge.className = 'filters-badge';
      badge.textContent = '';
      filtersForm.appendChild(badge);
    }

    // CSV export (respects current filters)
    $('#exportCsv')?.addEventListener('click', async () => {
      const qs = buildQuery();
      const r = await fetch('/api/admin/suppliers/csv?' + qs, { headers: adminHeader() });
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'suppliers.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    // Pagination
    $('#prevPage')?.addEventListener('click', ()=>{ state.offset = Math.max(0, state.offset - state.limit); refresh(); });
    $('#nextPage')?.addEventListener('click', ()=>{ state.offset = state.offset + state.limit; refresh(); });

    // Mobile filters toggle
    const toggle = $('#toggleFilters'); const filters = $('#filters');
    toggle?.addEventListener('click', ()=>{
      const visible = getComputedStyle(filters).display !== 'none';
      filters.style.display = visible ? 'none' : 'flex';
      toggle.setAttribute('aria-expanded', String(!visible));
      toggle.innerHTML = visible ? '<i class="fa fa-chevron-down"></i>' : '<i class="fa fa-chevron-up"></i>';
    });

    // Horizontal scroll sync hook (header/body share the same scroller currently)
    try { const bodyEl = document.querySelector('.table-wrap'); const headerEl = bodyEl; if (bodyEl && headerEl) bodyEl.addEventListener('scroll', ()=>{ headerEl.scrollLeft = bodyEl.scrollLeft; }, { passive:true }); } catch(_){ }

    // Optional: highlight footer link if present
    try { $$('footer a').forEach(a=>{ const t=(a.textContent||'').toLowerCase(); if (t.includes('προμηθευτ') || t.includes('suppliers')) a.classList.add('active'); }); } catch(_){ }
  }

  function init(){ wire(); refresh(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  // --- Utilities ---
  function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; }
  function ensureOverlay(){ const wrap = document.querySelector('.table-wrap'); if (!wrap) return; if (!wrap.querySelector('.loading-overlay')){ const o = document.createElement('div'); o.className = 'loading-overlay'; o.innerHTML = '<div class="spinner"></div>'; wrap.appendChild(o); } }
  function showLoading(on){ const o = document.querySelector('.table-wrap .loading-overlay'); if (o) o.style.display = on ? 'flex' : 'none'; }
  function updateFiltersBadge(){ const b = document.getElementById('filtersBadge'); if (!b) return; const f = getFilters(); const count = ['q','type','from','to','payoutStatus'].reduce((n,k)=> n + (f[k] ? 1 : 0), 0); b.textContent = count ? `Εφαρμόστηκαν ${count} φίλτρα` : ''; }
  })();
