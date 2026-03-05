/**
 * MoveAthens Admin — Vehicles Tab
 * Depends on: admin-ma-helpers.js (window.MaAdmin)
 */
(() => {
  'use strict';
  const { $, showToast, openConfirm, setStatus, authRedirect, state, api, ensureConfigLoaded } = window.MaAdmin;

  const initVehiclesTab = () => {
    const form = $('#ma-vehicle-form');
    const list = $('#ma-vehicles-list');
    const addBtn = $('#maVehicleAddBtn');
    const cancelBtn = $('#maVehicleCancelBtn');
    const status = $('#maVehicleStatus');
    const fName = $('#maVehicleName');
    const fDesc = $('#maVehicleDescription');
    const fImageFile = $('#maVehicleImageFile');
    const fImageUpload = $('#maVehicleImageUploadBtn');
    const fImageClear = $('#maVehicleImageClearBtn');
    const fImageUrl = $('#maVehicleImageUrl');
    const fImagePreview = $('#maVehicleImagePreview');
    const fMaxPax = $('#maVehicleMaxPax');
    const fLuggageLarge = $('#maVehicleLuggageLarge');
    const fLuggageMedium = $('#maVehicleLuggageMedium');
    const fLuggageCabin = $('#maVehicleLuggageCabin');
    const fOrder = $('#maVehicleOrder');
    const fActive = $('#maVehicleActive');
    const fAllowInstant = $('#maVehicleAllowInstant');
    const fMinAdvance = $('#maVehicleMinAdvance');

    const updatePreview = () => {
      const url = fImageUrl?.value;
      if (fImagePreview) {
        fImagePreview.src = url || '';
        fImagePreview.setAttribute('data-visible', url ? 'true' : 'false');
      }
    };

    const render = () => {
      const vehicles = state.CONFIG.vehicleTypes || [];
      if (!vehicles.length) {
        list.innerHTML = '<p class="ma-empty">Δεν υπάρχουν τύποι οχημάτων.</p>';
        return;
      }
      list.innerHTML = vehicles.map(v => `
        <div class="ma-zone-card" data-id="${v.id}">
          <div class="ma-zone-card__header">
            <div class="ma-zone-card__title">
              ${v.imageUrl ? `<img src="${v.imageUrl}" alt="" class="ma-vehicle-thumb">` : ''}
              <h4>${v.name}</h4>
              <span class="ma-zone-status" data-active="${v.is_active}">${v.is_active ? 'Ενεργός' : 'Ανενεργός'}</span>
            </div>
          </div>
          <div class="ma-zone-meta">
            <span>👤 ${v.max_passengers} pax</span>
            <span>🧳L ${v.luggage_large}</span>
            <span>🧳M ${v.luggage_medium}</span>
            <span>🎒 ${v.luggage_cabin}</span>
            <span>Order: ${v.display_order}</span>
            <span>${v.allow_instant !== false ? '⚡ Άμεση' : '📅 ' + (v.min_advance_minutes || 0) + '′ πριν'}</span>
          </div>
          ${v.description ? `<p class="ma-zone-desc">${v.description}</p>` : ''}
          <div class="ma-zone-actions">
            <button class="btn secondary btn-edit" type="button">Επεξεργασία</button>
            <button class="btn secondary btn-delete" type="button">Διαγραφή</button>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.closest('.ma-zone-card').dataset.id;
          editVehicle(id);
        });
      });
      list.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.closest('.ma-zone-card').dataset.id;
          const v = vehicles.find(x => x.id === id);
          if (await openConfirm(`Διαγραφή "${v?.name}"?`, { title: 'Διαγραφή Οχήματος', okLabel: 'Διαγραφή' })) {
            deleteVehicle(id);
          }
        });
      });
    };

    const resetForm = () => {
      form.hidden = true;
      state.editingVehicleId = null;
      fName.value = '';
      fDesc.value = '';
      if (fImageUrl) fImageUrl.value = '';
      if (fImageFile) fImageFile.value = '';
      fMaxPax.value = '4';
      fLuggageLarge.value = '0';
      fLuggageMedium.value = '0';
      fLuggageCabin.value = '0';
      fOrder.value = '0';
      fActive.checked = true;
      if (fAllowInstant) fAllowInstant.checked = true;
      if (fMinAdvance) fMinAdvance.value = '0';
      updatePreview();
      setStatus(status, '', '');
    };

    const editVehicle = (id) => {
      const v = (state.CONFIG.vehicleTypes || []).find(x => x.id === id);
      if (!v) return;
      state.editingVehicleId = id;
      fName.value = v.name || '';
      fDesc.value = v.description || '';
      if (fImageUrl) fImageUrl.value = v.imageUrl || '';
      fMaxPax.value = v.max_passengers || 4;
      fLuggageLarge.value = v.luggage_large || 0;
      fLuggageMedium.value = v.luggage_medium || 0;
      fLuggageCabin.value = v.luggage_cabin || 0;
      fOrder.value = v.display_order || 0;
      fActive.checked = v.is_active !== false;
      if (fAllowInstant) fAllowInstant.checked = v.allow_instant !== false;
      if (fMinAdvance) fMinAdvance.value = v.min_advance_minutes || 0;
      updatePreview();
      form.hidden = false;
    };

    const saveVehicles = async (vehicleTypes) => {
      if (!ensureConfigLoaded()) return false;
      const res = await api('/api/admin/moveathens/vehicle-types', 'PUT', { vehicleTypes });
      if (!res) return false;
      if (res.ok) {
        const data = await res.json();
        state.CONFIG.vehicleTypes = data.vehicleTypes || [];
        return true;
      }
      const err = await res.json().catch(() => ({}));
      setStatus(status, err.error || 'Σφάλμα', 'error');
      return false;
    };

    const deleteVehicle = async (id) => {
      const vehicles = (state.CONFIG.vehicleTypes || []).filter(v => v.id !== id);
      if (await saveVehicles(vehicles)) {
        showToast('Διαγράφηκε');
        render();
      }
    };

    addBtn?.addEventListener('click', () => {
      resetForm();
      form.hidden = false;
    });

    cancelBtn?.addEventListener('click', resetForm);

    fImageUpload?.addEventListener('click', async () => {
      const file = fImageFile?.files?.[0];
      if (!file) { showToast('Επίλεξε αρχείο'); return; }
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch('/api/admin/moveathens/upload-vehicle-image', { method: 'POST', credentials: 'include', body: fd });
      if (res.status === 401 || res.status === 403) { authRedirect(); return; }
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        if (fImageUrl) fImageUrl.value = data.url;
        updatePreview();
        showToast('Upload OK');
      } else {
        showToast(data.error || 'Upload failed');
      }
    });

    fImageClear?.addEventListener('click', () => {
      if (fImageUrl) fImageUrl.value = '';
      updatePreview();
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setStatus(status, '', '');
      const name = fName.value.trim();
      if (!name) { setStatus(status, 'Το όνομα είναι υποχρεωτικό', 'error'); return; }

      let vehicles = [...(state.CONFIG.vehicleTypes || [])];
      const entry = {
        id: state.editingVehicleId || `vt_${Date.now()}`,
        name,
        description: fDesc.value.trim(),
        imageUrl: fImageUrl?.value || '',
        max_passengers: parseInt(fMaxPax.value, 10) || 4,
        luggage_large: parseInt(fLuggageLarge.value, 10) || 0,
        luggage_medium: parseInt(fLuggageMedium.value, 10) || 0,
        luggage_cabin: parseInt(fLuggageCabin.value, 10) || 0,
        display_order: parseInt(fOrder.value, 10) || 0,
        is_active: fActive.checked,
        allow_instant: fAllowInstant?.checked ?? true,
        min_advance_minutes: parseInt(fMinAdvance?.value, 10) || 0,
        created_at: new Date().toISOString()
      };

      if (state.editingVehicleId) {
        const idx = vehicles.findIndex(v => v.id === state.editingVehicleId);
        if (idx >= 0) vehicles[idx] = { ...vehicles[idx], ...entry };
      } else {
        vehicles.push(entry);
      }

      if (await saveVehicles(vehicles)) {
        showToast('Αποθηκεύτηκε');
        resetForm();
        render();
      }
    });

    return { render };
  };

  window.MaAdmin.initVehiclesTab = initVehiclesTab;
})();
