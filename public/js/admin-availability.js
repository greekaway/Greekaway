(function(){
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  let auth = null;
  // Keep the full dataset in memory to allow instant client-side filtering.
  let allRows = [];

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
      allRows = j.rows || [];
      applyFilters();
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

  // Map updated_at to an activity bucket: active (<=3d), idle (3-7d), inactive (>7d)
  function rowActivity(updated){
    const d = daysSince(updated || '');
    if (d <= 3) return 'active';
    if (d <= 7) return 'idle';
    return 'inactive';
  }

  function applyFilters(){
    const msg = $('#availabilityMessage');
    const activity = ($('#fActivity') && $('#fActivity').value) || 'all';
    let rows = allRows || [];
    if (activity !== 'all') {
      rows = rows.filter(r => rowActivity(r.updated_at) === activity);
    }
    renderRows(rows);
    if (msg) msg.textContent = rows.length ? '' : 'Δεν υπάρχουν εγγραφές για το επιλεγμένο φίλτρο.';
  }

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

    // Shared token: if present, auto-login and show content
    try {
      const token = localStorage.getItem('adminAuthToken');
      const logoutBtn = document.getElementById('adminLogout');
      if (logoutBtn && !logoutBtn.__gaBound) {
        logoutBtn.addEventListener('click', () => { try { localStorage.removeItem('adminAuthToken'); } catch(_){} window.location.reload(); });
        logoutBtn.__gaBound = true;
      }
      if (token) {
        auth = 'Basic ' + token;
        const f = $('#auth'); if (f) f.style.display = 'none';
        const m = $('#main'); if (m) m.style.display = '';
        setStickyOffset();
        fetchList();
        // Skip manual login wiring when token present
      } else {
        // Wire manual login
        const form = $('#auth'); if (form) form.addEventListener('submit', (e) => e.preventDefault());
        const loginBtn = $('#login');
        if (loginBtn) loginBtn.addEventListener('click', () => {
          const u = $('#user').value.trim(); const p = $('#pass').value.trim();
          try { localStorage.setItem('adminAuthToken', btoa(u + ':' + p)); } catch(_){}
          setAuth(u, p);
          const f2 = $('#auth'); if (f2) f2.style.display = 'none';
          const m2 = $('#main'); if (m2) m2.style.display = '';
          setStickyOffset();
          fetchList();
        });
      }
    } catch(_) {}
    // If no token and login not yet handled, ensure UI is in login state
    if (!auth) { show($('#auth')); hide($('#main')); }
    // Buttons
    $('#btnRefresh').addEventListener('click', (e) => { e.preventDefault(); fetchList(); });
    $('#btnExport').addEventListener('click', (e) => { e.preventDefault(); exportCsv(); });
    $('#btnAdd').addEventListener('click', (e) => { e.preventDefault(); openModal('add'); });
    $('#modalClose').addEventListener('click', closeModal);
    $('#modalSave').addEventListener('click', (e) => { e.preventDefault(); saveModal(); });
    $('#modalDelete').addEventListener('click', (e) => { e.preventDefault(); deleteCurrent(); });

    // Activity filter: instant client-side filtering, no reload
    const fActivity = $('#fActivity');
    if (fActivity) {
      fActivity.addEventListener('change', () => applyFilters());
    }

    // Mobile: collapse/expand filters + table via toggle button
    const toggle = document.getElementById('availabilityToggle');
    if (toggle) {
      const updateToggleIcon = () => {
        const collapsed = document.body.classList.contains('availability-collapsed');
        toggle.setAttribute('aria-expanded', String(!collapsed));
        toggle.textContent = collapsed ? '▸' : '▾';
      };
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        document.body.classList.toggle('availability-collapsed');
        updateToggleIcon();
        setStickyOffset();
      });
      updateToggleIcon();
    }
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
