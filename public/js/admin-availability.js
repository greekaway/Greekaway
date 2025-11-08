(function(){
  // If this page has the legacy availability admin table, run legacy code.
  if (document.getElementById('availabilityTable')) {
    (function(){
      const $ = (s, r=document) => r.querySelector(s);
      const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
      let auth = null;
      let allRows = [];
      function setAuth(u, p){ auth = 'Basic ' + btoa((u||'') + ':' + (p||'')); }
      function show(el){ if (el) el.style.display = ''; }
      function hide(el){ if (el) el.style.display = 'none'; }
      function daysSince(iso){ try { const t = new Date(iso).getTime(); const now = Date.now(); const d = Math.floor((now - t)/(864e5)); return isFinite(d) ? d : 9999; } catch(_){ return 9999; } }
      function dotClass(updated){ const d = daysSince(updated); if (d <= 3) return 'green'; if (d <= 7) return 'yellow'; return 'red'; }
      async function fetchList(){
        const tbody = $('#availabilityTable tbody'); const msg = $('#availabilityMessage');
        if (tbody) tbody.innerHTML = '';
        if (msg) msg.textContent = 'Φόρτωση…';
        const params = new URLSearchParams();
        const date = $('#fDate') && $('#fDate').value.trim(); if (date) params.set('date', date);
        const provider = $('#fProvider') && $('#fProvider').value.trim(); if (provider) params.set('provider_id', provider);
        const from = $('#fFrom') && $('#fFrom').value.trim(); if (from) params.set('from', from);
        const to = $('#fTo') && $('#fTo').value.trim(); if (to) params.set('to', to);
        const url = '/api/provider-availability/list' + (params.toString() ? ('?' + params.toString()) : '');
        try {
          const r = await fetch(url, { headers: { Authorization: auth } });
          const j = await r.json().catch(()=>({}));
          if (!r.ok || !j || !Array.isArray(j.rows)) throw new Error(j && j.error ? j.error : ('HTTP '+r.status));
          allRows = j.rows || [];
          applyFilters();
        } catch (e) { if (msg) msg.textContent = 'Σφάλμα: ' + (e && e.message ? e.message : '—'); }
      }
      function renderRows(rows){
        const tbody = $('#availabilityTable tbody'); if (!tbody) return; tbody.innerHTML = '';
        rows.forEach(r => {
          const tr = document.createElement('tr');
          const updated = r.updated_at || '';
          const dot = `<span class="dot ${dotClass(updated)}" title="${updated ? ('Τελευταία ενημέρωση: '+updated) : ''}"></span>`;
          tr.innerHTML = `
            <td>${escapeHtml(r.id||'')}</td>
            <td>${escapeHtml(r.provider_id||'')}</td>
            <td>${escapeHtml(r.available_date||'')}</td>
            <td>${escapeHtml(r.start_time||'')}</td>
            <td>${escapeHtml(r.end_time||'')}</td>
            <td>${escapeHtml(r.notes||'')}</td>
            <td>${dot}${escapeHtml(updated||'')}</td>
            <td>${escapeHtml(r.admin_user||'')}</td>
            <td>
              <div class="actions">
                <button class="btn" data-act="edit" data-id="${encodeURIComponent(r.id)}">✏️ Επεξεργασία</button>
                <button class="btn danger" data-act="del" data-id="${encodeURIComponent(r.id)}">🗑️ Διαγραφή</button>
              </div>
            </td>`;
          tbody.appendChild(tr);
        });
      }
      function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
      function rowActivity(updated){ const d = (function(iso){ try { const t = new Date(iso).getTime(); const now = Date.now(); const dd = Math.floor((now - t)/(864e5)); return isFinite(dd) ? dd : 9999; } catch(_){ return 9999; } })(updated||''); if (d <= 3) return 'active'; if (d <= 7) return 'idle'; return 'inactive'; }
      function applyFilters(){
        const msg = $('#availabilityMessage');
        const activity = ($('#fActivity') && $('#fActivity').value) || 'all';
        let rows = allRows || [];
        if (activity !== 'all') rows = rows.filter(r => rowActivity(r.updated_at) === activity);
        renderRows(rows);
        if (msg) msg.textContent = rows.length ? '' : 'Δεν υπάρχουν εγγραφές για το επιλεγμένο φίλτρο.';
      }
      function wire(){
        function setStickyOffset(){ try { const bar = document.getElementById('availabilityStickyBar'); const h = bar ? (bar.offsetHeight || 0) : 0; document.documentElement.style.setProperty('--availability-sticky-offset', (h || 56) + 'px'); } catch(_) {} }
        setStickyOffset(); window.addEventListener('resize', setStickyOffset);
        try {
          const token = localStorage.getItem('adminAuthToken');
          if (token) { auth = 'Basic ' + token; const f=$('#auth'); if (f) f.style.display='none'; const m=$('#main'); if (m) m.style.display=''; setStickyOffset(); fetchList(); }
        } catch(_) {}
        const btnR = $('#btnRefresh'); if (btnR) btnR.addEventListener('click', (e)=>{e.preventDefault(); fetchList();});
        const btnE = $('#btnExport'); if (btnE) btnE.addEventListener('click', (e)=>{e.preventDefault(); /* exportCsv(); */});
        const tbl = $('#availabilityTable'); if (tbl) tbl.addEventListener('click', (e) => { const btn = e.target.closest('button'); if (!btn) return; alert('Legacy actions are disabled in this build.'); });
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
    })();
    return;
  }

  // Lite demo-only availability for the new standalone page
  function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"]/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m])); }
  function dotClassByDate(last){
    try{ const d = Math.floor((Date.now() - new Date(last).getTime())/86400000);
      if (d <= 7) return 'green'; if (d <= 21) return 'orange'; return 'red'; }catch(_){ return 'red'; }
  }
  function buildTable(){
    const main = document.querySelector('main.content-wrap'); if (!main) return;
    // Insert table scaffold if not present
    let wrap = document.getElementById('availability-lite');
    if (!wrap) {
      wrap = document.createElement('div'); wrap.id = 'availability-lite'; wrap.className = 'table-wrap';
      wrap.innerHTML = '<table class="table" aria-label="Availability"><thead><tr>'+
        '<th>Πάροχος</th><th>Τηλέφωνο</th><th>Email</th><th>Trip</th><th>Ημ/νία</th><th data-align="right">Χωρητ.</th><th data-align="right">Κρατ.</th><th data-align="right">Διαθέσιμα</th><th>Last Update</th><th>Ενέργειες</th>'+
        '</tr></thead><tbody id="avail-rows"></tbody></table>';
      main.appendChild(wrap);
    }
  }
  function render(){
    const tbody = document.getElementById('avail-rows'); if (!tbody) return;
    const statusFilter = document.getElementById('statusFilter'); const want = statusFilter ? statusFilter.value : '';
    const from = document.getElementById('from')?.value || '';
    const to = document.getElementById('to')?.value || '';
    const tripQ = (document.getElementById('trip')?.value || '').trim().toLowerCase();
  const rows = (window.ADMIN_SEEDS && window.ADMIN_SEEDS.availability) || [];
    const providers = (window.ADMIN_SEEDS && window.ADMIN_SEEDS.providers) || [];
    const provById = Object.fromEntries(providers.map(p=>[p.id, p]));
    tbody.innerHTML = '';
    rows.forEach(r => {
      const cls = dotClassByDate(r.last_update);
      if (want && want !== 'all' && want !== cls) return;
      const d = String(r.date||'');
      if (from && d < from) return;
      if (to && d > to) return;
      if (tripQ){
        const trip = (r.trip_name || r.trip || '').toLowerCase();
        if (!trip.includes(tripQ)) return;
      }
      const remaining = Math.max(0, (Number(r.capacity)||0) - (Number(r.booked)||0));
      const dot = '<span class="status-dot '+cls+'" title="Last availability update: '+escapeHtml(r.last_update||'-')+'"></span>';
      const badge = r.is_demo ? ' <span class="badge-demo" title="'+escapeHtml(r.demo_note||'Demo')+'"><span class="dot"></span>Demo</span>' : '';
      const tr = document.createElement('tr'); if (r.is_demo) tr.setAttribute('data-is-demo','true');
      const provider = provById[r.provider_id] || {};
      tr.innerHTML = ''+
        '<td>'+dot+escapeHtml(r.provider_name||r.provider_id||'-')+badge+'</td>'+
        '<td>'+escapeHtml(provider.phone||'-')+'</td>'+
        '<td>'+escapeHtml(provider.email||'-')+'</td>'+
        '<td>'+escapeHtml(r.trip_name || r.trip || '-')+'</td>'+
        '<td class="mono">'+escapeHtml(r.date||'-')+'</td>'+
        // Spinner input for capacity
        '<td class="num"><input type="number" class="capacity-input" min="1" max="10" step="1" value="'+escapeHtml(r.capacity)+'" data-field="capacity" data-row-index="'+rows.indexOf(r)+'" /></td>'+
        '<td class="num">'+escapeHtml(r.booked)+'</td>'+
        '<td class="num">'+escapeHtml(remaining)+'</td>'+
        '<td class="mono">'+escapeHtml(r.last_update||'-')+'</td>'+
        '<td><button class="btn small" data-act="notify">Notify Provider / Ειδοποίηση Πάροχου</button></td>';
      tbody.appendChild(tr);
      // Wire change handler for capacity spinner
      const capInput = tr.querySelector('input.capacity-input');
      if (capInput){
        capInput.addEventListener('change', (e) => {
          let v = parseInt(e.target.value,10);
          if (!Number.isFinite(v) || v < 1) v = 1; if (v > 10) v = 10; e.target.value = String(v);
          const idx = parseInt(e.target.getAttribute('data-row-index'),10);
          if (Number.isFinite(idx) && rows[idx]){
            const row = rows[idx];
            row.capacity = v;
            const booked = Number(rows[idx].booked)||0;
            const remainingCell = tr.children[7]; // after capacity (5), booked (6)
            if (remainingCell){ remainingCell.textContent = String(Math.max(0, v - booked)); }
            // Persist only for non-demo rows if admin API is available
            if (row && row.is_demo){
              if (window.DEMO) window.DEMO.openModal('Demo', 'Η αλλαγή capacity ισχύει μόνο οπτικά στο demo.');
              if (window.console) console.log('[admin-availability] capacity updated (demo only)', { idx, newCapacity: v });
            } else if (row && row.id) {
              updateCapacityAdmin(row.id, v).catch(err => {
                console.error('Failed to update capacity', err);
              });
            }
          }
        });
      }
    });
    tbody.querySelectorAll('button[data-act="notify"]').forEach(btn => btn.addEventListener('click', (e) => {
      const tr = e.currentTarget.closest('tr'); const provider = tr ? tr.children[0].textContent.trim() : 'Provider';
      const body = '<div style="white-space:pre-wrap">'+
`Πρότυπο μήνυμα προς πάροχο / Notify template

Αγαπητέ συνεργάτη,
Θα μπορούσες να ενημερώσεις τη διαθεσιμότητά σου στο Greekaway;
(Παρακαλούμε απάντησε σε αυτό το email ή ενημέρωσε το panel σου.)

Ευχαριστούμε,
Greekaway Admin`+
      '</div>';
      if (window.DEMO) window.DEMO.openModal('Notify Provider / Ειδοποίηση: '+escapeHtml(provider), body);
    }));
  }
  async function updateCapacityAdmin(id, capacity){
    try {
      const token = localStorage.getItem('adminAuthToken') || null;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Basic ' + token;
      const r = await fetch('/api/provider-availability/update/'+encodeURIComponent(id), {
        method: 'POST',
        headers,
        body: JSON.stringify({ capacity })
      });
      if (!r.ok){ throw new Error('HTTP '+r.status); }
      return true;
    } catch (e) { throw e; }
  }
  function wireLite(){
    buildTable(); render();
    const sel = document.getElementById('statusFilter'); if (sel) sel.addEventListener('change', render);
    ['from','to','trip'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('input', render); });
    const reset = document.getElementById('resetFilters'); if (reset) reset.addEventListener('click', ()=>{ ['from','to','trip','statusFilter'].forEach(id=>{ const el=document.getElementById(id); if(!el) return; if (el.tagName==='SELECT') el.value='all'; else el.value=''; }); render(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireLite); else wireLite();
})();
