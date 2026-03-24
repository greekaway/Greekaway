/**
 * Driver Panel Admin — Tab 3: Οδηγοί
 * CRUD drivers with vehicle type checkboxes
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
    if (filter === 'active') list = list.filter(d => d.is_active !== false);
    if (filter === 'inactive') list = list.filter(d => d.is_active === false);

    if (!list.length) { wrap.innerHTML = '<div class="dp-empty">Δεν βρέθηκαν οδηγοί</div>'; return; }

    wrap.innerHTML = list.map(d => {
      let vts = [];
      try { vts = JSON.parse(d.vehicle_types || '[]'); } catch (_) {}
      const vtNames = vts.map(id => {
        const vt = state.vehicleTypes.find(v => v.id === id);
        return vt ? vt.name : id;
      }).join(', ');
      return `
        <div class="dp-driver-card ${d.is_active === false ? 'dp-driver-inactive' : ''}" data-id="${d.id}">
          <div class="dp-driver-info">
            <strong class="dp-driver-name">${d.name || '—'}</strong>
            <span class="dp-driver-phone">${d.phone || ''}</span>
            ${d.display_name ? `<span class="dp-driver-display-name">Εμφανίζεται: ${d.display_name}</span>` : ''}
            ${vtNames ? `<span class="dp-driver-vt">🚗 ${vtNames}</span>` : ''}
            ${d.notes ? `<span class="dp-driver-notes">📝 ${d.notes}</span>` : ''}
          </div>
          <div class="dp-driver-meta">
            <span class="dp-badge ${d.is_active !== false ? 'dp-badge-active' : 'dp-badge-inactive'}">${d.is_active !== false ? 'Ενεργός' : 'Ανενεργός'}</span>
          </div>
          <div class="dp-driver-actions">
            <button class="button dp-btn-sm dp-edit-btn" data-id="${d.id}">✏️</button>
            ${d.has_pin ? `<button class="button dp-btn-sm dp-pin-reset-btn" data-id="${d.id}" title="Διαγραφή PIN">🔓</button>` : ''}
            <button class="button dp-btn-sm dp-delete-btn" data-id="${d.id}">🗑️</button>
          </div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('.dp-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = state.drivers.find(dr => dr.id === btn.dataset.id);
        if (d) editDriver(d);
      });
    });
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

    return { render: renderList, renderVehicleCheckboxes };
  };

  window.DpAdmin.initDriversTab = init;
})();
