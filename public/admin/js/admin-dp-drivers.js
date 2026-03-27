/**
 * Driver Panel Admin — Tab 3: Οδηγοί
 * CRUD drivers with vehicle type checkboxes, availability/block system
 */
(() => {
  'use strict';
  const { $, $$, setStatus, showToast, api, openConfirm, state } = window.DpAdmin;

  let editingDriverId = null;

  const renderVehicleCheckboxes = (selected = []) => {
    const wrap = $('#dpVehicleCheckboxes');
    if (!wrap) return;
    const vts = state.vehicleTypes.filter(vt => vt.is_active !== false);
    if (!vts.length) {
      wrap.innerHTML = '<em class="dp-muted">Δεν βρέθηκαν τύποι οχημάτων</em>';
      return;
    }
    wrap.innerHTML = vts.map(vt => `
      <label class="dp-vt-checkbox">
        <input type="checkbox" value="${vt.id}" ${selected.includes(vt.id) ? 'checked' : ''}>
        <span>${vt.name || vt.id}</span>
      </label>
    `).join('');
  };

  const getSelectedVT = () =>
    $$('#dpVehicleCheckboxes input[type="checkbox"]:checked').map(cb => cb.value);

  const resetForm = () => {
    editingDriverId = null;
    $('#dpDriverId').value = '';
    $('#dpDriverName').value = '';
    $('#dpDriverPhone').value = '';
    $('#dpDriverDisplayName').value = '';
    $('#dpDriverNotes').value = '';
    $('#dpDriverActive').checked = true;
    renderVehicleCheckboxes([]);
    $('#dpDriverFormTitle').textContent = 'Νέος Οδηγός';
    $('#dpDriverCancel').style.display = 'none';
    setStatus($('#dpDriverFormStatus'), '', '');
  };

  const editDriver = (d) => {
    editingDriverId = d.id;
    $('#dpDriverId').value = d.id;
    $('#dpDriverName').value = d.name || '';
    $('#dpDriverPhone').value = d.phone || '';
    $('#dpDriverDisplayName').value = d.display_name || '';
    $('#dpDriverNotes').value = d.notes || '';
    $('#dpDriverActive').checked = d.is_active !== false;
    let vts = [];
    try { vts = JSON.parse(d.vehicle_types || '[]'); } catch (_) {}
    renderVehicleCheckboxes(vts);
    $('#dpDriverFormTitle').textContent = 'Επεξεργασία: ' + (d.name || d.phone);
    $('#dpDriverCancel').style.display = '';
    $('#dp-driver-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── Stats block ──
  let _busyPhones = new Set();
  let _broadcastStats = {};

  const fetchBusyDrivers = async () => {
    try {
      const res = await api('/api/admin/driver-panel/driver-stats');
      if (res.busyPhones) _busyPhones = new Set(res.busyPhones);
    } catch { /* silent */ }
    try {
      const bRes = await api('/api/admin/driver-panel/broadcast-stats');
      if (bRes.stats) _broadcastStats = bRes.stats;
    } catch { /* silent */ }
  };

  const renderStats = () => {
    const wrap = $('#dpDriverStats');
    if (!wrap) return;
    const all = state.drivers;
    const total = all.length;
    const active = all.filter(d => d.is_available !== false && !d.is_blocked);
    const blocked = all.filter(d => d.is_blocked);
    const hired = active.filter(d => _busyPhones.has(d.phone));
    const hiredPct = active.length ? Math.round(hired.length / active.length * 100) : 0;
    const pct = (n) => total ? Math.round(n / total * 100) : 0;

    wrap.innerHTML = `
      <div class="dp-stats-grid">
        <div class="dp-stat-box">
          <span class="dp-stat-icon">👥</span>
          <span class="dp-stat-num">${total}</span>
          <span class="dp-stat-label">Σύνολο</span>
        </div>
        <div class="dp-stat-box dp-stat-green">
          <span class="dp-stat-icon">✅</span>
          <span class="dp-stat-num">${active.length} <small>(${pct(active.length)}%)</small></span>
          <span class="dp-stat-label">Ενεργοί</span>
        </div>
        <div class="dp-stat-box dp-stat-orange">
          <span class="dp-stat-icon">🚕</span>
          <span class="dp-stat-num">${hired.length} <small>(${hiredPct}%)</small></span>
          <span class="dp-stat-label">Μισθωμένοι</span>
        </div>
        <div class="dp-stat-box dp-stat-red">
          <span class="dp-stat-icon">🔒</span>
          <span class="dp-stat-num">${blocked.length}</span>
          <span class="dp-stat-label">Κλειδωμένοι</span>
        </div>
      </div>`;
  };

  // ── Driver availability & block badges ──
  const getBadgeHTML = (d) => {
    if (d.is_blocked) {
      const until = d.blocked_until ? new Date(d.blocked_until).toLocaleDateString('el-GR') : null;
      return `<span class="dp-badge dp-badge-blocked">🔒 Κλειδωμένος${until ? ' (ως ' + until + ')' : ' (Οριστικά)'}</span>`;
    }
    if (_busyPhones.has(d.phone)) {
      return `<span class="dp-badge dp-badge-busy">🚕 Μισθωμένος</span>`;
    }
    if (d.is_available === false) {
      return `<span class="dp-badge dp-badge-unavailable">⚪ Μη Διαθέσιμος</span>`;
    }
    return `<span class="dp-badge dp-badge-active">✅ Ενεργός</span>`;
  };

  // ── Block dropdown HTML ──
  const getBlockHTML = (d) => {
    if (d.is_blocked) {
      return `<button class="button dp-btn-sm dp-unblock-btn" data-id="${d.id}" title="Ξεκλείδωμα">🔓 Ξεκλείδωμα</button>`;
    }
    return `
      <div class="dp-block-wrap" data-id="${d.id}">
        <button class="button dp-btn-sm dp-block-trigger" data-id="${d.id}">🔒 Κλείδωμα ▼</button>
        <div class="dp-block-dropdown" style="display:none">
          <button class="dp-block-opt" data-id="${d.id}" data-dur="1">1 μέρα</button>
          <button class="dp-block-opt" data-id="${d.id}" data-dur="2">2 μέρες</button>
          <button class="dp-block-opt" data-id="${d.id}" data-dur="7">1 εβδομάδα</button>
          <button class="dp-block-opt" data-id="${d.id}" data-dur="30">1 μήνα</button>
          <button class="dp-block-opt" data-id="${d.id}" data-dur="permanent">Οριστικά</button>
        </div>
      </div>`;
  };

  const renderList = () => {
    const wrap = $('#dpDriversList');
    if (!wrap) return;
    const search = ($('#dpDriverSearch')?.value || '').toLowerCase();
    const filter = $('#dpDriverFilter')?.value || 'all';
    let list = [...state.drivers];
    if (search) list = list.filter(d =>
      (d.name || '').toLowerCase().includes(search) ||
      (d.phone || '').toLowerCase().includes(search) ||
      (d.display_name || '').toLowerCase().includes(search)
    );
    if (filter === 'active') list = list.filter(d => d.is_available !== false && !d.is_blocked);
    if (filter === 'unavailable') list = list.filter(d => d.is_available === false && !d.is_blocked);
    if (filter === 'blocked') list = list.filter(d => d.is_blocked);

    renderStats();

    if (!list.length) { wrap.innerHTML = '<div class="dp-empty">Δεν βρέθηκαν οδηγοί</div>'; return; }

    wrap.innerHTML = list.map(d => {
      let vts = [];
      try { vts = JSON.parse(d.vehicle_types || '[]'); } catch (_) {}
      const vtNames = vts.map(id => {
        const vt = state.vehicleTypes.find(v => v.id === id);
        return vt ? vt.name : id;
      }).join(', ');
      const bs = _broadcastStats[d.phone] || null;
      const bsLine = bs && bs.sent > 0
        ? `<span class="dp-driver-broadcast">📡 Λήφθηκαν: <strong>${bs.sent}</strong> · Αποδέχτηκε: <strong style="color:#4caf50">${bs.accepted}</strong> · Αγνόησε: <strong style="color:#ff9800">${bs.missed}</strong></span>`
        : '';
      return `
        <div class="dp-driver-card ${d.is_blocked ? 'dp-driver-blocked' : d.is_available === false ? 'dp-driver-inactive' : ''}" data-id="${d.id}">
          <div class="dp-driver-info">
            <strong class="dp-driver-name">${d.name || '—'}</strong>
            <span class="dp-driver-phone">${d.phone || ''}</span>
            ${d.display_name ? `<span class="dp-driver-display-name">Εμφανίζεται: ${d.display_name}</span>` : ''}
            ${vtNames ? `<span class="dp-driver-vt">🚗 ${vtNames}</span>` : ''}
            ${bsLine}
            ${d.notes ? `<span class="dp-driver-notes">📝 ${d.notes}</span>` : ''}
          </div>
          <div class="dp-driver-meta">
            ${getBadgeHTML(d)}
          </div>
          <div class="dp-driver-actions">
            <button class="button dp-btn-sm dp-edit-btn" data-id="${d.id}">✏️</button>
            ${d.has_pin ? `<button class="button dp-btn-sm dp-pin-reset-btn" data-id="${d.id}" title="Διαγραφή PIN">🔓</button>` : ''}
            ${getBlockHTML(d)}
            <button class="button dp-btn-sm dp-delete-btn" data-id="${d.id}">🗑️</button>
          </div>
        </div>`;
    }).join('');

    // ── Edit ──
    wrap.querySelectorAll('.dp-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = state.drivers.find(dr => dr.id === btn.dataset.id);
        if (d) editDriver(d);
      });
    });

    // ── Delete ──
    wrap.querySelectorAll('.dp-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const d = state.drivers.find(dr => dr.id === btn.dataset.id);
        if (!d) return;
        if (!await openConfirm(`Διαγραφή οδηγού "${d.name || d.phone}";`)) return;
        try {
          const res = await api(`/api/admin/driver-panel/drivers/${d.id}`, 'DELETE');
          if (!res) return;
          if (res.ok) {
            state.drivers = state.drivers.filter(dr => dr.id !== d.id);
            renderList();
            showToast('Διαγράφηκε');
            if (editingDriverId === d.id) resetForm();
          } else {
            const data = await res.json().catch(() => ({}));
            showToast(data.message || data.error || 'Σφάλμα');
          }
        } catch (err) { showToast('Σφάλμα: ' + err.message); }
      });
    });

    // ── PIN reset ──
    wrap.querySelectorAll('.dp-pin-reset-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const d = state.drivers.find(dr => dr.id === btn.dataset.id);
        if (!d) return;
        if (!await openConfirm(`Διαγραφή PIN οδηγού "${d.name || d.phone}";`)) return;
        try {
          const res = await api('/api/admin/driver-panel/driver-pin', 'DELETE', { driverId: d.id });
          if (!res) return;
          if (res.ok) {
            d.has_pin = false;
            renderList();
            showToast('PIN διαγράφηκε');
          } else {
            const data = await res.json().catch(() => ({}));
            showToast(data.message || data.error || 'Σφάλμα');
          }
        } catch (err) { showToast('Σφάλμα: ' + err.message); }
      });
    });

    // ── Block dropdown toggle ──
    wrap.querySelectorAll('.dp-block-trigger').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = btn.nextElementSibling;
        if (!dd) return;
        // Close all others first
        wrap.querySelectorAll('.dp-block-dropdown').forEach(d => { if (d !== dd) d.style.display = 'none'; });
        dd.style.display = dd.style.display === 'none' ? 'flex' : 'none';
      });
    });

    // ── Block option click ──
    wrap.querySelectorAll('.dp-block-opt').forEach(btn => {
      btn.addEventListener('click', async () => {
        const d = state.drivers.find(dr => dr.id === btn.dataset.id);
        if (!d) return;
        const dur = btn.dataset.dur;
        const label = dur === 'permanent' ? 'Οριστικά' : btn.textContent;
        if (!await openConfirm(`Κλείδωμα οδηγού "${d.name || d.phone}" — ${label};`)) return;
        try {
          const res = await api(`/api/admin/driver-panel/drivers/${d.id}/block`, 'POST', { duration: dur });
          if (!res) return;
          const data = await res.json();
          if (data.ok) {
            d.is_blocked = true;
            d.blocked_until = data.blocked_until || null;
            renderList();
            showToast('Κλειδώθηκε');
          } else {
            showToast(data.error || 'Σφάλμα');
          }
        } catch (err) { showToast('Σφάλμα: ' + err.message); }
      });
    });

    // ── Unblock ──
    wrap.querySelectorAll('.dp-unblock-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const d = state.drivers.find(dr => dr.id === btn.dataset.id);
        if (!d) return;
        if (!await openConfirm(`Ξεκλείδωμα οδηγού "${d.name || d.phone}";`)) return;
        try {
          const res = await api(`/api/admin/driver-panel/drivers/${d.id}/unblock`, 'POST', {});
          if (!res) return;
          const data = await res.json();
          if (data.ok) {
            d.is_blocked = false;
            d.blocked_until = null;
            renderList();
            showToast('Ξεκλειδώθηκε');
          } else {
            showToast(data.error || 'Σφάλμα');
          }
        } catch (err) { showToast('Σφάλμα: ' + err.message); }
      });
    });

    // Close block dropdowns on outside click
    document.addEventListener('click', () => {
      wrap.querySelectorAll('.dp-block-dropdown').forEach(d => d.style.display = 'none');
    });
  };

  const init = () => {
    $('#dp-driver-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = $('#dpDriverFormStatus');
      let phone = ($('#dpDriverPhone').value || '').replace(/[\s\-\(\)\.]/g, '').trim();
      if (/^69\d{8}$/.test(phone)) phone = '+30' + phone;
      if (/^30\d{10}$/.test(phone)) phone = '+' + phone;
      if (!phone) { setStatus(status, 'Απαιτείται τηλέφωνο', 'err'); return; }
      const payload = {
        name: $('#dpDriverName').value.trim(),
        phone,
        display_name: $('#dpDriverDisplayName').value.trim() || null,
        notes: $('#dpDriverNotes').value.trim(),
        is_active: $('#dpDriverActive').checked,
        vehicle_types: getSelectedVT()
      };
      setStatus(status, 'Αποθήκευση…', 'info');
      try {
        const url = editingDriverId
          ? `/api/admin/driver-panel/drivers/${editingDriverId}`
          : '/api/admin/driver-panel/drivers';
        const method = editingDriverId ? 'PUT' : 'POST';
        const res = await api(url, method, payload);
        if (!res) return;
        if (res.ok) {
          const saved = await res.json();
          if (editingDriverId) {
            const idx = state.drivers.findIndex(d => d.id === editingDriverId);
            if (idx >= 0) state.drivers[idx] = saved;
          } else {
            state.drivers.push(saved);
          }
          resetForm();
          renderList();
          setStatus(status, '✅ Αποθηκεύτηκε', 'ok');
          showToast('Οδηγός αποθηκεύτηκε');
        } else {
          const data = await res.json().catch(() => ({}));
          setStatus(status, '❌ ' + (data.error || 'Σφάλμα'), 'err');
        }
      } catch (err) { setStatus(status, '❌ ' + err.message, 'err'); }
    });
    $('#dpDriverCancel')?.addEventListener('click', resetForm);
    $('#dpDriverSearch')?.addEventListener('input', renderList);
    $('#dpDriverFilter')?.addEventListener('change', renderList);

    return { render: renderList, renderVehicleCheckboxes, fetchBusyDrivers };
  };

  window.DpAdmin.initDriversTab = init;
})();
