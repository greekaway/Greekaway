/**
 * MoveAthens Admin — Hotels (Zones) Tab
 * Depends on: admin-ma-helpers.js (window.MaAdmin)
 */
(() => {
  'use strict';
  const { $, showToast, openConfirm, setStatus, state, api, ensureConfigLoaded } = window.MaAdmin;

  const initZonesTab = () => {
    const form = $('#ma-zone-form');
    const list = $('#ma-zones-list');
    const addBtn = $('#maZoneAddBtn');
    const cancelBtn = $('#maZoneCancelBtn');
    const status = $('#maZoneStatus');
    const fName = $('#maZoneName');
    const fMunicipality = $('#maZoneMunicipality');
    const fAddress = $('#maZoneAddress');
    const fPhone = $('#maZonePhone');
    const fEmail = $('#maZoneEmail');
    const fLatLng = $('#maZoneLatLng');
    const fAccommodationType = $('#maZoneAccommodationType');
    const fActive = $('#maZoneActive');
    const fSearch = $('#maZoneSearch');

    // Hotel phones cache: { zoneId: [{ id, phone, label }] }
    const phonesCache = {};

    const loadPhones = async (zoneId) => {
      try {
        const res = await api(`/api/admin/moveathens/hotel-phones?zone_id=${zoneId}`);
        if (res && res.ok) {
          const data = await res.json();
          phonesCache[zoneId] = data.phones || [];
        }
      } catch (e) { console.warn('loadPhones error', e); }
      return phonesCache[zoneId] || [];
    };

    const loadAllPhones = async () => {
      try {
        const res = await api('/api/admin/moveathens/hotel-phones-with-pin');
        if (res && res.ok) {
          const data = await res.json();
          // Reset cache to get fresh pin status
          const freshCache = {};
          (data.phones || []).forEach(p => {
            if (!freshCache[p.zone_id]) freshCache[p.zone_id] = [];
            freshCache[p.zone_id].push(p);
          });
          Object.assign(phonesCache, freshCache);
        }
      } catch (e) { console.warn('loadAllPhones error', e); }
    };

    const clearPhonePin = async (phone) => {
      try {
        const res = await api('/api/admin/moveathens/phone-pin', 'DELETE', { phone });
        if (res && res.ok) return true;
      } catch (e) { /* ignore */ }
      return false;
    };

    const addPhone = async (zoneId, phone, label, displayName) => {
      try {
        const res = await api('/api/admin/moveathens/hotel-phones', 'POST', { zone_id: zoneId, phone, label, display_name: displayName });
        if (res && res.ok) {
          const data = await res.json();
          if (!phonesCache[zoneId]) phonesCache[zoneId] = [];
          phonesCache[zoneId].push(data.phone);
          return { ok: true };
        }
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.error || 'Failed', hotel_name: err.hotel_name };
      } catch (e) { return { ok: false, error: e.message }; }
    };

    const removePhone = async (zoneId, phoneId) => {
      try {
        const res = await api(`/api/admin/moveathens/hotel-phones/${phoneId}`, 'DELETE');
        if (res && res.ok) {
          phonesCache[zoneId] = (phonesCache[zoneId] || []).filter(p => p.id !== phoneId);
          return true;
        }
      } catch (e) { /* ignore */ }
      return false;
    };

    const applySearchFilter = () => {
      const q = (fSearch?.value || '').trim().toLowerCase();
      list.querySelectorAll('.ma-zone-card').forEach(card => {
        if (!q) { card.style.display = ''; return; }
        const name = (card.querySelector('h4')?.textContent || '').toLowerCase();
        const details = (card.querySelector('.ma-hotel-details')?.textContent || '').toLowerCase();
        card.style.display = (name.includes(q) || details.includes(q)) ? '' : 'none';
      });
      const visible = list.querySelectorAll('.ma-zone-card:not([style*="display: none"])');
      let hint = list.querySelector('.ma-search-empty');
      if (q && visible.length === 0) {
        if (!hint) {
          hint = document.createElement('p');
          hint.className = 'ma-empty ma-search-empty';
          list.appendChild(hint);
        }
        hint.textContent = `Δεν βρέθηκε ξενοδοχείο για «${fSearch.value.trim()}»`;
        hint.style.display = '';
      } else if (hint) {
        hint.style.display = 'none';
      }
    };

    fSearch?.addEventListener('input', applySearchFilter);

    const accommodationLabels = {
      hotel: 'Ξενοδοχείο',
      rental_rooms: 'Ενοικιαζόμενα Δωμάτια'
    };

    const render = () => {
      const zones = state.CONFIG.transferZones || [];
      if (!zones.length) {
        list.innerHTML = '<p class="ma-empty">Δεν υπάρχουν ξενοδοχεία.</p>';
        return;
      }
      list.innerHTML = zones.map(z => {
        const phones = phonesCache[z.id] || [];
        const mainPhone = (z.phone || '').trim();
        const mainAlreadyInList = mainPhone && phones.some(p => p.phone.replace(/\s+/g,'') === mainPhone.replace(/\s+/g,''));
        let allBadges = '';
        if (mainPhone && !mainAlreadyInList) {
          allBadges += `<div class="ma-phone-row ma-phone-row--main"><span class="ma-phone-row__phone">📞 ${mainPhone}</span><span class="ma-phone-row__name ma-muted-text">Κύριο τηλέφωνο</span></div>`;
        }
        allBadges += phones.map(p => {
          const nameDisplay = p.display_name ? `<span class="ma-phone-row__name">${p.display_name}</span>` : '<span class="ma-phone-row__name ma-muted-text">—</span>';
          const pinStatus = p.has_pin
            ? `<span class="ma-phone-row__pin ma-phone-row__pin--active">🔒 <button class="ma-phone-pin-reset" data-phone="${p.phone}" data-zone-id="${z.id}">Διαγραφή PIN</button></span>`
            : '<span class="ma-phone-row__pin ma-phone-row__pin--off">—</span>';
          return `<div class="ma-phone-row">
            <span class="ma-phone-row__phone">${p.phone}</span>
            ${nameDisplay}
            ${pinStatus}
            <button class="ma-phone-remove" data-phone-id="${p.id}" data-zone-id="${z.id}">Διαγραφή</button>
          </div>`;
        }).join('');
        if (!allBadges) allBadges = '<span class="ma-muted-text">Δεν έχουν οριστεί τηλέφωνα</span>';
        return `
        <div class="ma-zone-card" data-id="${z.id}">
          <div class="ma-zone-card__header">
            <div class="ma-zone-card__title">
              <h4>${z.name}</h4>
              <span class="ma-zone-type">${accommodationLabels[z.accommodation_type] || 'Ξενοδοχείο'}</span>
              <span class="ma-zone-status" data-active="${z.is_active}">${z.is_active ? 'Ενεργό' : 'Ανενεργό'}</span>
            </div>
          </div>
          <div class="ma-hotel-details">
            ${z.municipality ? `<span>📍 ${z.municipality}</span>` : ''}
            ${z.address ? `<span>🏠 ${z.address}</span>` : ''}
            ${z.email ? `<span>✉️ ${z.email}</span>` : ''}
          </div>
          <div class="ma-hotel-phones">
            <div class="ma-hotel-phones__header">
              <span class="ma-hotel-phones__label">📱 Χρήστες</span>
              <button class="btn secondary ma-phone-toggle-add" type="button" data-zone-id="${z.id}" title="Προσθήκη χρήστη">＋</button>
            </div>
            ${phones.length > 0 ? `<div class="ma-phone-row ma-phone-row--header"><span class="ma-phone-row__phone">Τηλέφωνο</span><span class="ma-phone-row__name">Όνομα</span><span class="ma-phone-row__pin">PIN</span><span class="ma-phone-row__actions"></span></div>` : ''}
            <div class="ma-hotel-phones__list">${allBadges}</div>
            <div class="ma-hotel-phones__add" data-zone-id="${z.id}" hidden>
              <input class="input ma-phone-input" type="text" placeholder="6912345678" maxlength="30" data-zone-id="${z.id}">
              <input class="input ma-phone-name-input" type="text" placeholder="Όνομα" maxlength="100" data-zone-id="${z.id}">
              <button class="btn secondary ma-phone-add-btn" type="button" data-zone-id="${z.id}">Προσθήκη</button>
            </div>
          </div>
          <div class="ma-zone-actions">
            <button class="btn secondary btn-edit" type="button">Επεξεργασία</button>
            <button class="btn secondary btn-delete" type="button">Διαγραφή</button>
          </div>
        </div>
      `}).join('');

      list.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.closest('.ma-zone-card').dataset.id;
          editZone(id);
        });
      });
      list.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.closest('.ma-zone-card').dataset.id;
          const z = zones.find(x => x.id === id);
          if (await openConfirm(`Διαγραφή "${z?.name}"?`, { title: 'Διαγραφή Ξενοδοχείου', okLabel: 'Διαγραφή' })) {
            deleteZone(id);
          }
        });
      });

      // Toggle "+" button to reveal inline add form
      list.querySelectorAll('.ma-phone-toggle-add').forEach(btn => {
        btn.addEventListener('click', () => {
          const zoneId = btn.dataset.zoneId;
          const card = btn.closest('.ma-zone-card');
          const addRow = card.querySelector(`.ma-hotel-phones__add[data-zone-id="${zoneId}"]`);
          if (addRow) {
            const show = addRow.hidden;
            addRow.hidden = !show;
            btn.textContent = show ? '✕' : '＋';
            if (show) addRow.querySelector('.ma-phone-input')?.focus();
          }
        });
      });

      // Phone add buttons
      list.querySelectorAll('.ma-phone-add-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const zoneId = btn.dataset.zoneId;
          const card = btn.closest('.ma-zone-card');
          const phoneInput = card.querySelector(`.ma-phone-input[data-zone-id="${zoneId}"]`);
          const nameInput = card.querySelector(`.ma-phone-name-input[data-zone-id="${zoneId}"]`);
          const phone = (phoneInput?.value || '').trim();
          const displayName = (nameInput?.value || '').trim();
          if (!phone || phone.length < 5) { showToast('Εισάγετε έγκυρο τηλέφωνο', 'error'); return; }
          btn.disabled = true;
          const result = await addPhone(zoneId, phone, '', displayName);
          btn.disabled = false;
          if (result.ok) {
            showToast('Χρήστης προστέθηκε');
            if (phoneInput) phoneInput.value = '';
            if (nameInput) nameInput.value = '';
            render();
          } else {
            const msg = result.hotel_name
              ? `Το τηλέφωνο υπάρχει ήδη στο "${result.hotel_name}"`
              : (result.error || 'Σφάλμα');
            showToast(msg, 'error');
          }
        });
      });

      // Phone remove buttons
      list.querySelectorAll('.ma-phone-remove').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const phoneId = btn.dataset.phoneId;
          const zoneId = btn.dataset.zoneId;
          if (await openConfirm('Αφαίρεση αυτού του τηλεφώνου;', { title: 'Αφαίρεση Τηλεφώνου', okLabel: 'Αφαίρεση' })) {
            const ok = await removePhone(zoneId, phoneId);
            if (ok) { showToast('Αφαιρέθηκε'); render(); }
            else { showToast('Σφάλμα', 'error'); }
          }
        });
      });

      // PIN reset buttons
      list.querySelectorAll('.ma-phone-pin-reset').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const phone = btn.dataset.phone;
          const zoneId = btn.dataset.zoneId;
          if (await openConfirm(`Διαγραφή PIN για ${phone};`, { title: 'Διαγραφή PIN', okLabel: 'Διαγραφή' })) {
            const ok = await clearPhonePin(phone);
            if (ok) {
              // Update cache
              const cached = phonesCache[zoneId] || [];
              const p = cached.find(x => x.phone === phone);
              if (p) p.has_pin = false;
              showToast('Το PIN διαγράφηκε');
              render();
            } else {
              showToast('Σφάλμα', 'error');
            }
          }
        });
      });

      applySearchFilter();
    };

    const resetForm = () => {
      form.hidden = true;
      state.editingZoneId = null;
      fName.value = '';
      if (fMunicipality) fMunicipality.value = '';
      if (fAddress) fAddress.value = '';
      if (fPhone) fPhone.value = '';
      if (fEmail) fEmail.value = '';
      if (fLatLng) fLatLng.value = '';
      if (fAccommodationType) fAccommodationType.value = 'hotel';
      fActive.checked = true;
      setStatus(status, '', '');
    };

    const editZone = (id) => {
      const z = (state.CONFIG.transferZones || []).find(x => x.id === id);
      if (!z) return;
      state.editingZoneId = id;
      fName.value = z.name || '';
      if (fMunicipality) fMunicipality.value = z.municipality || '';
      if (fAddress) fAddress.value = z.address || '';
      if (fPhone) fPhone.value = z.phone || '';
      if (fEmail) fEmail.value = z.email || '';
      if (fLatLng) {
        fLatLng.value = (z.lat != null && z.lng != null) ? `${z.lat}, ${z.lng}` : '';
      }
      if (fAccommodationType) fAccommodationType.value = z.accommodation_type || 'hotel';
      fActive.checked = z.is_active !== false;
      form.hidden = false;
    };

    const saveZones = async (zones) => {
      if (!ensureConfigLoaded()) return false;
      const res = await api('/api/admin/moveathens/transfer-zones', 'PUT', { zones });
      if (!res) return false;
      if (res.ok) {
        const data = await res.json();
        state.CONFIG.transferZones = data.zones || [];
        return true;
      }
      const err = await res.json().catch(() => ({}));
      setStatus(status, err.error || 'Σφάλμα', 'error');
      return false;
    };

    const deleteZone = async (id) => {
      const zones = (state.CONFIG.transferZones || []).filter(z => z.id !== id);
      if (await saveZones(zones)) {
        showToast('Διαγράφηκε');
        render();
      }
    };

    addBtn?.addEventListener('click', () => {
      resetForm();
      form.hidden = false;
    });

    cancelBtn?.addEventListener('click', resetForm);

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setStatus(status, '', '');
      const name = fName.value.trim();
      if (!name) { setStatus(status, 'Το όνομα είναι υποχρεωτικό', 'error'); return; }

      let lat = null, lng = null;
      if (fLatLng && fLatLng.value.trim()) {
        const parts = fLatLng.value.trim().split(',');
        if (parts.length === 2) {
          lat = parseFloat(parts[0].trim());
          lng = parseFloat(parts[1].trim());
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            setStatus(status, 'Μη έγκυρες συντεταγμένες (lat,lng)', 'error');
            return;
          }
        } else {
          setStatus(status, 'Οι συντεταγμένες πρέπει να είναι lat,lng', 'error');
          return;
        }
      }

      let zones = [...(state.CONFIG.transferZones || [])];
      const entry = {
        id: state.editingZoneId || `tz_${Date.now()}`,
        name,
        type: 'suburb',
        description: '',
        municipality: (fMunicipality?.value || '').trim(),
        address: (fAddress?.value || '').trim(),
        phone: (fPhone?.value || '').trim(),
        email: (fEmail?.value || '').trim(),
        lat,
        lng,
        accommodation_type: fAccommodationType?.value || 'hotel',
        is_active: fActive.checked,
        created_at: new Date().toISOString()
      };

      if (state.editingZoneId) {
        const idx = zones.findIndex(z => z.id === state.editingZoneId);
        if (idx >= 0) zones[idx] = { ...zones[idx], ...entry };
      } else {
        zones.push(entry);
      }

      if (await saveZones(zones)) {
        showToast('Αποθηκεύτηκε');
        resetForm();
        render();
      }
    });

    // Render with async phone loading
    const renderWithPhones = async () => {
      await loadAllPhones();
      render();
    };

    return { render: renderWithPhones };
  };

  window.MaAdmin.initZonesTab = initZonesTab;
})();
