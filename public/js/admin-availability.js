(function(){
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  let auth = null;

  function setAuth(u, p){ auth = 'Basic ' + btoa((u||'') + ':' + (p||'')); }

  function show(el){ if (el) el.style.display = ''; }
  function hide(el){ if (el) el.style.display = 'none'; }

  function fmtDateIso(d){
    try { const t = new Date(d); if (!isFinite(t)) return ''; const y=t.getFullYear(), m=String(t.getMonth()+1).padStart(2,'0'), da=String(t.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; } catch(_){ return String(d||''); }
  }

  function daysSince(iso){
    try { const t = new Date(iso).getTime(); const now = Date.now(); const d = Math.floor((now - t)/(864e5)); return isFinite(d) ? d : 9999; } catch(_){ return 9999; }
  }

  function dotClass(updated){
    const d = daysSince(updated);
    if (d <= 3) return 'green';
    if (d <= 7) return 'yellow';
    return 'red';
  }

  async function fetchList(){
    const tbody = $('#availabilityTable tbody'); const msg = $('#availabilityMessage');
    if (tbody) tbody.innerHTML = '';
    if (msg) msg.textContent = 'Φόρτωση…';
    const params = new URLSearchParams();
    const date = $('#fDate').value.trim(); if (date) params.set('date', date);
    const provider = $('#fProvider').value.trim(); if (provider) params.set('provider_id', provider);
    const from = $('#fFrom').value.trim(); if (from) params.set('from', from);
    const to = $('#fTo').value.trim(); if (to) params.set('to', to);
    const url = '/api/provider-availability/list' + (params.toString() ? ('?' + params.toString()) : '');
    try {
      const r = await fetch(url, { headers: { Authorization: auth } });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || !j || !Array.isArray(j.rows)) throw new Error(j && j.error ? j.error : ('HTTP '+r.status));
      renderRows(j.rows);
      if (msg) msg.textContent = j.rows.length ? '' : 'Δεν υπάρχουν εγγραφές.';
    } catch (e) {
      if (msg) msg.textContent = 'Σφάλμα: ' + (e && e.message ? e.message : '—');
    }
  }

  function renderRows(rows){
    const tbody = $('#availabilityTable tbody'); if (!tbody) return;
    tbody.innerHTML = '';
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

  function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function openModal(mode, row){
    const m = $('#modal'); const title = $('#modalTitle'); const del = $('#modalDelete');
    const p = $('#mProvider'), d=$('#mDate'), s=$('#mStart'), e=$('#mEnd'), n=$('#mNotes');
    if (mode === 'edit') {
      title.textContent = 'Επεξεργασία Διαθεσιμότητας';
      show(del);
      m.dataset.id = row && row.id || '';
      p.value = row && row.provider_id || '';
      d.value = row && row.available_date || '';
      s.value = row && row.start_time || '';
      e.value = row && row.end_time || '';
      n.value = row && row.notes || '';
    } else {
      title.textContent = 'Νέα Διαθεσιμότητα';
      hide(del);
      m.dataset.id = '';
      p.value = ''; d.value = ''; s.value = ''; e.value = ''; n.value = '';
    }
    show(m);
  }

  function closeModal(){ hide($('#modal')); }

  async function saveModal(){
    const id = $('#modal').dataset.id || '';
    const payload = {
      provider_id: $('#mProvider').value.trim(),
      available_date: $('#mDate').value.trim(),
      start_time: $('#mStart').value.trim(),
      end_time: $('#mEnd').value.trim(),
      notes: $('#mNotes').value
    };
    try {
      const url = id ? `/api/provider-availability/update/${encodeURIComponent(id)}` : '/api/provider-availability/create';
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify(payload)
      });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || !j || j.error) throw new Error(j && j.error ? j.error : ('HTTP '+r.status));
      closeModal(); await fetchList();
    } catch (e) {
      alert('Αποτυχία αποθήκευσης: ' + (e && e.message ? e.message : '—'));
    }
  }

  async function deleteCurrent(){
    const id = $('#modal').dataset.id || '';
    if (!id) return closeModal();
    if (!confirm('Οριστική διαγραφή;')) return;
    try {
      const r = await fetch(`/api/provider-availability/${encodeURIComponent(id)}`, { method:'DELETE', headers: { Authorization: auth } });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || !j || j.error) throw new Error(j && j.error ? j.error : ('HTTP '+r.status));
      closeModal(); await fetchList();
    } catch (e) { alert('Αποτυχία διαγραφής: ' + (e && e.message ? e.message : '—')); }
  }

  async function exportCsv(){
    const params = new URLSearchParams();
    const date = $('#fDate').value.trim(); if (date) params.set('date', date);
    const provider = $('#fProvider').value.trim(); if (provider) params.set('provider_id', provider);
    const from = $('#fFrom').value.trim(); if (from) params.set('from', from);
    const to = $('#fTo').value.trim(); if (to) params.set('to', to);
    const url = '/api/provider-availability/export' + (params.toString() ? ('?' + params.toString()) : '');
    try {
      const r = await fetch(url, { headers: { Authorization: auth } });
      if (!r.ok) throw new Error('HTTP '+r.status);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'provider_availability.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    } catch (e) { alert('Αποτυχία εξαγωγής: ' + (e && e.message ? e.message : '—')); }
  }

  function wire(){
    // Compute sticky offset so header sticks below the filters bar
    function setStickyOffset(){
      try {
        const bar = document.getElementById('availabilityStickyBar');
        const h = bar ? (bar.offsetHeight || 0) : 0;
        document.documentElement.style.setProperty('--availability-sticky-offset', (h || 56) + 'px');
      } catch(_) {}
    }
    setStickyOffset();
    window.addEventListener('resize', setStickyOffset);

    // Login form
    const form = $('#auth'); if (!form) return;
    form.addEventListener('submit', (e) => e.preventDefault());
    $('#login').addEventListener('click', () => {
      const u = $('#user').value.trim(); const p = $('#pass').value.trim();
      setAuth(u, p);
      hide($('#auth')); show($('#main'));
      setStickyOffset();
      fetchList();
    });
    // Buttons
    $('#btnRefresh').addEventListener('click', (e) => { e.preventDefault(); fetchList(); });
    $('#btnExport').addEventListener('click', (e) => { e.preventDefault(); exportCsv(); });
    $('#btnAdd').addEventListener('click', (e) => { e.preventDefault(); openModal('add'); });
    $('#modalClose').addEventListener('click', closeModal);
    $('#modalSave').addEventListener('click', (e) => { e.preventDefault(); saveModal(); });
    $('#modalDelete').addEventListener('click', (e) => { e.preventDefault(); deleteCurrent(); });
    // Row actions (edit/delete)
    $('#availabilityTable').addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      const id = btn.getAttribute('data-id'); const act = btn.getAttribute('data-act');
      if (act === 'edit') {
        // find row data
        const tr = btn.closest('tr'); const cells = tr ? Array.from(tr.children).map(td => td.textContent) : [];
        const row = { id: cells[0], provider_id: cells[1], available_date: cells[2], start_time: cells[3], end_time: cells[4], notes: cells[5] };
        openModal('edit', row);
      } else if (act === 'del') {
        const tr = btn.closest('tr'); const idCell = tr ? tr.children[0] : null; const rid = id || (idCell && idCell.textContent) || '';
        $('#modal').dataset.id = rid; deleteCurrent();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
