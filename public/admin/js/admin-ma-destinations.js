/**
 * MoveAthens Admin — Destinations Tab
 * Depends on: admin-ma-helpers.js (window.MaAdmin)
 */
(() => {
  'use strict';
  const { $, showToast, openConfirm, setStatus, state, api, ensureConfigLoaded } = window.MaAdmin;

  const initDestinationsTab = () => {
    const form = $('#ma-destination-form');
    const list = $('#ma-destinations-list');
    const addBtn = $('#maDestinationAddBtn');
    const saveBtn = $('#maDestinationSaveBtn');
    const cancelBtn = $('#maDestinationCancelBtn');
    const status = $('#maDestinationStatus');
    const fName = $('#maDestinationName');
    const fDesc = $('#maDestinationDescription');
    const fCategory = $('#maDestinationCategory');
    const fSubcategory = $('#maDestinationSubcategory');
    const fSubcatLabel = $('#maDestSubcatLabel');
    const fOrder = $('#maDestinationOrder');
    const fActive = $('#maDestinationActive');
    const fRouteType = $('#maDestinationRouteType');
    const fLatLng = $('#maDestinationLatLng');
    const fSearch = $('#maDestinationSearch');
    const fFilterCategory = $('#maDestFilterCategory');
    const fFilterSubcategory = $('#maDestFilterSubcategory');
    const fFilterSubcatWrap = $('#maDestFilterSubcatWrap');
    // Extended fields
    const fVenueType = $('#maDestVenueType');
    const fVibe = $('#maDestVibe');
    const fArea = $('#maDestArea');
    const fIndicativePrice = $('#maDestIndicativePrice');
    const fSuitableFor = $('#maDestSuitableFor');
    const fRating = $('#maDestRating');
    const fMichelin = $('#maDestMichelin');
    const fDetails = $('#maDestDetails');
    const fMainArtist = $('#maDestMainArtist');
    const fParticipatingArtists = $('#maDestParticipatingArtists');
    const fProgramInfo = $('#maDestProgramInfo');
    const fScheduleWrap = $('#maDestScheduleWrap');

    // Helper: get operating_schedule from per-day rows as JSON string
    // Format: {"mon":{"open":"09:00","close":"23:00"},"tue":null,...}
    const getOperatingSchedule = () => {
      if (!fScheduleWrap) return '';
      const schedule = {};
      let hasAny = false;
      fScheduleWrap.querySelectorAll('.ma-schedule-row').forEach(row => {
        const day = row.dataset.day;
        const cb = row.querySelector('input[type=checkbox]');
        if (cb && cb.checked) {
          const open = row.querySelector('.ma-sched-open')?.value || '';
          const close = row.querySelector('.ma-sched-close')?.value || '';
          schedule[day] = { open, close };
          hasAny = true;
        } else {
          schedule[day] = null;
        }
      });
      return hasAny ? JSON.stringify(schedule) : '';
    };

    // Helper: set schedule rows from JSON string (new format) or legacy fields
    const setOperatingSchedule = (scheduleStr, legacyDays, legacyOpen, legacyClose) => {
      if (!fScheduleWrap) return;
      const rows = fScheduleWrap.querySelectorAll('.ma-schedule-row');
      // Try new format first
      let schedule = null;
      if (scheduleStr) {
        try { schedule = JSON.parse(scheduleStr); } catch (_) {}
      }
      if (schedule && typeof schedule === 'object' && !Array.isArray(schedule)) {
        rows.forEach(row => {
          const day = row.dataset.day;
          const cb = row.querySelector('input[type=checkbox]');
          const openInp = row.querySelector('.ma-sched-open');
          const closeInp = row.querySelector('.ma-sched-close');
          const entry = schedule[day];
          if (entry && typeof entry === 'object') {
            if (cb) cb.checked = true;
            if (openInp) openInp.value = entry.open || '';
            if (closeInp) closeInp.value = entry.close || '';
          } else {
            if (cb) cb.checked = false;
            if (openInp) openInp.value = '';
            if (closeInp) closeInp.value = '';
          }
          row.classList.toggle('ma-schedule-row--disabled', !(cb && cb.checked));
        });
        return;
      }
      // Fallback: legacy format (operating_days + single opening/closing time)
      let legacyArr = null;
      if (legacyDays) {
        try { legacyArr = JSON.parse(legacyDays); } catch (_) {}
      }
      rows.forEach(row => {
        const day = row.dataset.day;
        const cb = row.querySelector('input[type=checkbox]');
        const openInp = row.querySelector('.ma-sched-open');
        const closeInp = row.querySelector('.ma-sched-close');
        const isActive = !legacyArr || legacyArr.includes(day);
        if (cb) cb.checked = isActive;
        if (openInp) openInp.value = isActive ? (legacyOpen || '') : '';
        if (closeInp) closeInp.value = isActive ? (legacyClose || '') : '';
        row.classList.toggle('ma-schedule-row--disabled', !isActive);
      });
    };

    // Toggle visual state when day checkbox changes
    fScheduleWrap?.addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') {
        const row = e.target.closest('.ma-schedule-row');
        if (row) row.classList.toggle('ma-schedule-row--disabled', !e.target.checked);
      }
    });

    const populateDropdowns = () => {
      const activeCats = (state.CONFIG.destinationCategories || []).filter(c => c.is_active !== false);
      if (fCategory) fCategory.innerHTML = '<option value="">-- Επιλογή Κατηγορίας --</option>' +
        activeCats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    };

    // Show/hide subcategory dropdown based on selected category
    const updateSubcategoryDropdown = () => {
      const catId = fCategory?.value || '';
      const subs = (state.CONFIG.destinationSubcategories || []).filter(s => s.category_id === catId && s.is_active !== false);
      if (subs.length > 0) {
        if (fSubcatLabel) fSubcatLabel.hidden = false;
        if (fSubcategory) {
          const prevVal = fSubcategory.value;
          fSubcategory.innerHTML = '<option value="">-- Χωρίς Υποκατηγορία --</option>' +
            subs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
          // Keep previous value only if it belongs to the new filtered list
          const validIds = new Set(subs.map(s => s.id));
          fSubcategory.value = validIds.has(prevVal) ? prevVal : '';
        }
      } else {
        if (fSubcatLabel) fSubcatLabel.hidden = true;
        if (fSubcategory) {
          fSubcategory.innerHTML = '<option value="">-- Χωρίς Υποκατηγορία --</option>';
          fSubcategory.value = '';
        }
      }
    };

    fCategory?.addEventListener('change', updateSubcategoryDropdown);

    const getCategoryName = (id) => (state.CONFIG.destinationCategories || []).find(c => c.id === id)?.name || '—';
    const getSubcategoryName = (id) => (state.CONFIG.destinationSubcategories || []).find(s => s.id === id)?.name || '';

    /* ── Filter dropdown population ── */
    const populateFilterDropdowns = () => {
      const activeCats = (state.CONFIG.destinationCategories || []).filter(c => c.is_active !== false);
      if (fFilterCategory) {
        fFilterCategory.innerHTML = '<option value="">Όλες</option>' +
          activeCats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      }
      updateFilterSubcategory();
    };

    const updateFilterSubcategory = () => {
      const catId = fFilterCategory?.value || '';
      const subs = (state.CONFIG.destinationSubcategories || []).filter(s => s.category_id === catId && s.is_active !== false);
      if (subs.length > 0 && fFilterSubcatWrap) {
        fFilterSubcatWrap.hidden = false;
        if (fFilterSubcategory) fFilterSubcategory.innerHTML = '<option value="">Όλες</option>' +
          subs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
      } else if (fFilterSubcatWrap) {
        fFilterSubcatWrap.hidden = true;
        if (fFilterSubcategory) fFilterSubcategory.value = '';
      }
    };

    const applySearchFilter = () => {
      const q = (fSearch?.value || '').trim().toLowerCase();
      const filterCat = fFilterCategory?.value || '';
      const filterSub = fFilterSubcategory?.value || '';

      if (!list) return;
      list.querySelectorAll('.ma-zone-card').forEach(card => {
        let show = true;

        // Text search
        if (q) {
          const name = (card.querySelector('h4')?.textContent || '').toLowerCase();
          const meta = (card.querySelector('.ma-acc-cat')?.textContent || '').toLowerCase();
          const body = (card.querySelector('.ma-accordion-body')?.textContent || '').toLowerCase();
          if (!name.includes(q) && !meta.includes(q) && !body.includes(q)) show = false;
        }

        // Category filter
        if (show && filterCat) {
          if (card.dataset.category !== filterCat) show = false;
        }

        // Subcategory filter
        if (show && filterSub) {
          if (card.dataset.subcategory !== filterSub) show = false;
        }

        card.style.display = show ? '' : 'none';
      });

      const visible = list.querySelectorAll('.ma-zone-card:not([style*="display: none"])');
      let hint = list.querySelector('.ma-search-empty');
      if ((q || filterCat || filterSub) && visible.length === 0) {
        if (!hint) {
          hint = document.createElement('p');
          hint.className = 'ma-empty ma-search-empty';
          list.appendChild(hint);
        }
        hint.textContent = 'Δεν βρέθηκαν προορισμοί με αυτά τα φίλτρα.';
        hint.style.display = '';
      } else if (hint) {
        hint.style.display = 'none';
      }
    };

    fFilterCategory?.addEventListener('change', () => {
      updateFilterSubcategory();
      applySearchFilter();
    });
    fFilterSubcategory?.addEventListener('change', applySearchFilter);
    fSearch?.addEventListener('input', applySearchFilter);

    const render = () => {
      populateDropdowns();
      populateFilterDropdowns();
      const dests = state.CONFIG.destinations || [];
      if (!list) return;
      if (!dests.length) {
        list.innerHTML = '<p class="ma-empty">Δεν υπάρχουν προορισμοί.</p>';
        return;
      }
      list.innerHTML = dests.map(d => {
        const subcatName = getSubcategoryName(d.subcategory_id);
        const catName = getCategoryName(d.category_id);
        return `
        <div class="ma-zone-card ma-accordion-item" data-id="${d.id}" data-category="${d.category_id || ''}" data-subcategory="${d.subcategory_id || ''}">
          <div class="ma-accordion-header">
            <span class="ma-accordion-arrow">▶</span>
            <div class="ma-accordion-summary">
              <h4>${d.main_artist ? d.name + ' — ' + d.main_artist : d.name}</h4>
              <span class="ma-acc-cat">${catName}${subcatName ? ' / ' + subcatName : ''}</span>
              <span class="ma-zone-status" data-active="${d.is_active}">${d.is_active ? 'Ενεργός' : 'Ανενεργός'}</span>
            </div>
          </div>
          <div class="ma-accordion-body">
            <div class="ma-zone-meta" style="margin-top:10px">
              <span>Σειρά: ${d.display_order}</span>
              <span>Τύπος: ${{airport:'✈️ Αεροδρόμιο',port:'⚓ Λιμάνι',city:'🏙️ Πόλη',travel:'🚗 Ταξίδια'}[d.route_type] || '— Δεν έχει οριστεί'}</span>
            </div>
            ${d.description ? `<p class="ma-zone-desc">${d.description}</p>` : ''}
            <div class="ma-zone-actions" style="margin-top:10px">
              <button class="btn secondary btn-edit" type="button">Επεξεργασία</button>
              <button class="btn secondary btn-delete" type="button">Διαγραφή</button>
            </div>
          </div>
        </div>
      `}).join('');

      /* Accordion toggle – only one open at a time */
      list.querySelectorAll('.ma-accordion-header').forEach(header => {
        header.addEventListener('click', () => {
          const card = header.closest('.ma-zone-card');
          const wasOpen = card.classList.contains('open');
          // close all
          list.querySelectorAll('.ma-zone-card.open').forEach(c => c.classList.remove('open'));
          // toggle this one
          if (!wasOpen) card.classList.add('open');
        });
      });

      list.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.closest('.ma-zone-card').dataset.id;
          editDestination(id);
          if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
      list.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.closest('.ma-zone-card').dataset.id;
          const dest = dests.find(d => d.id === id);
          if (await openConfirm(`Διαγραφή "${dest?.name}"?`, { title: 'Διαγραφή Προορισμού', okLabel: 'Διαγραφή' })) {
            deleteDestination(id);
          }
        });
      });

      applySearchFilter();
    };

    const resetForm = () => {
      if (form) form.hidden = true;
      state.editingDestinationId = null;
      if (fName) fName.value = '';
      if (fDesc) fDesc.value = '';
      if (fCategory) fCategory.value = '';
      if (fSubcategory) fSubcategory.value = '';
      if (fSubcatLabel) fSubcatLabel.hidden = true;
      if (fOrder) fOrder.value = '0';
      if (fActive) fActive.checked = true;
      if (fRouteType) fRouteType.value = '';
      if (fLatLng) fLatLng.value = '';
      // Reset extended fields
      if (fVenueType) fVenueType.value = '';
      if (fVibe) fVibe.value = '';
      if (fArea) fArea.value = '';
      if (fIndicativePrice) fIndicativePrice.value = '';
      if (fSuitableFor) fSuitableFor.value = '';
      if (fRating) fRating.value = '';
      if (fMichelin) fMichelin.value = '';
      if (fDetails) fDetails.value = '';
      if (fMainArtist) fMainArtist.value = '';
      if (fParticipatingArtists) fParticipatingArtists.value = '';
      if (fProgramInfo) fProgramInfo.value = '';
      setOperatingSchedule('', null, '', '');
      setStatus(status, '', '');
    };

    const editDestination = (id) => {
      populateDropdowns();
      const dest = (state.CONFIG.destinations || []).find(d => d.id === id);
      if (!dest) return;
      state.editingDestinationId = id;
      if (fName) fName.value = dest.name || '';
      if (fDesc) fDesc.value = dest.description || '';
      if (fCategory) fCategory.value = dest.category_id || '';
      updateSubcategoryDropdown();
      if (fSubcategory) fSubcategory.value = dest.subcategory_id || '';
      if (fOrder) fOrder.value = dest.display_order || 0;
      if (fActive) fActive.checked = dest.is_active !== false;
      if (fRouteType) fRouteType.value = dest.route_type || '';
      if (fLatLng) {
        if (dest.lat != null && dest.lng != null) {
          fLatLng.value = `${dest.lat},${dest.lng}`;
        } else {
          fLatLng.value = '';
        }
      }
      // Extended fields
      if (fVenueType) fVenueType.value = dest.venue_type || '';
      if (fVibe) fVibe.value = dest.vibe || '';
      if (fArea) fArea.value = dest.area || '';
      if (fIndicativePrice) fIndicativePrice.value = dest.indicative_price || '';
      if (fSuitableFor) fSuitableFor.value = dest.suitable_for || '';
      if (fRating) fRating.value = dest.rating || '';
      if (fMichelin) fMichelin.value = dest.michelin || '';
      if (fDetails) fDetails.value = dest.details || '';
      if (fMainArtist) fMainArtist.value = dest.main_artist || '';
      if (fParticipatingArtists) fParticipatingArtists.value = dest.participating_artists || '';
      if (fProgramInfo) fProgramInfo.value = dest.program_info || '';
      setOperatingSchedule(dest.operating_schedule || '', dest.operating_days || '', dest.opening_time || '', dest.closing_time || '');
      if (form) form.hidden = false;
    };

    const saveDestinations = async (destinations) => {
      if (!ensureConfigLoaded()) return false;
      try {
        const res = await api('/api/admin/moveathens/destinations', 'PUT', { destinations });
        if (!res) return false;
        if (res.ok) {
          const data = await res.json();
          state.CONFIG.destinations = data.destinations || [];
          return true;
        }
        const err = await res.json().catch(() => ({}));
        setStatus(status, err.error || 'Σφάλμα αποθήκευσης', 'error');
        return false;
      } catch (err) {
        console.error('[admin-ma] saveDestinations network/parse error:', err);
        setStatus(status, 'Σφάλμα δικτύου: ' + (err.message || err), 'error');
        return false;
      }
    };

    const deleteDestination = async (id) => {
      const dests = (state.CONFIG.destinations || []).filter(d => d.id !== id);
      if (await saveDestinations(dests)) {
        showToast('Διαγράφηκε');
        render();
      }
    };

    addBtn?.addEventListener('click', () => {
      resetForm();
      populateDropdowns();
      if (form) form.hidden = false;
    });

    cancelBtn?.addEventListener('click', resetForm);

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setStatus(status, '', '');
      try {
        const name = (fName?.value || '').trim();
        if (!name) { setStatus(status, 'Το όνομα είναι υποχρεωτικό', 'error'); return; }
        if (!fCategory?.value) { setStatus(status, 'Επιλέξτε κατηγορία', 'error'); return; }

        let dests = [...(state.CONFIG.destinations || [])];

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

        const subcatVal = fSubcategory ? fSubcategory.value : '';
        const entry = {
          id: state.editingDestinationId || `dest_${Date.now()}`,
          _edited: true,
          name,
          description: fDesc?.value?.trim() || '',
          category_id: fCategory.value,
          subcategory_id: subcatVal || null,
          route_type: fRouteType ? fRouteType.value || null : null,
          lat,
          lng,
          display_order: parseInt(fOrder?.value, 10) || 0,
          is_active: fActive?.checked !== false,
          // Extended fields
          venue_type: fVenueType?.value?.trim() || '',
          vibe: fVibe?.value?.trim() || '',
          area: fArea?.value?.trim() || '',
          indicative_price: fIndicativePrice?.value?.trim() || '',
          suitable_for: fSuitableFor?.value?.trim() || '',
          rating: fRating?.value?.trim() || '',
          michelin: fMichelin?.value?.trim() || '',
          details: fDetails?.value?.trim() || '',
          main_artist: fMainArtist?.value?.trim() || '',
          participating_artists: fParticipatingArtists?.value?.trim() || '',
          program_info: fProgramInfo?.value?.trim() || '',
          operating_schedule: getOperatingSchedule(),
          operating_days: '',
          opening_time: '',
          closing_time: ''
        };

        if (state.editingDestinationId) {
          const idx = dests.findIndex(d => d.id === state.editingDestinationId);
          if (idx >= 0) {
            entry.created_at = dests[idx].created_at || new Date().toISOString();
            dests[idx] = { ...dests[idx], ...entry };
          }
        } else {
          entry.created_at = new Date().toISOString();
          dests.push(entry);
        }

        if (await saveDestinations(dests)) {
          showToast('Αποθηκεύτηκε');
          resetForm();
          render();
        }
      } catch (err) {
        console.error('[admin-ma] Destination save error:', err);
        setStatus(status, 'Σφάλμα αποθήκευσης: ' + (err.message || err), 'error');
        showToast('⚠️ Σφάλμα κατά την αποθήκευση');
      }
    });

    return { render };
  };

  window.MaAdmin.initDestinationsTab = initDestinationsTab;
})();
