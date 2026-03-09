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
    const fOperatingDays = $('#maDestOperatingDays');
    const fOpeningTime = $('#maDestOpeningTime');
    const fClosingTime = $('#maDestClosingTime');

    const populateDropdowns = () => {
      const activeCats = (state.CONFIG.destinationCategories || []).filter(c => c.is_active !== false);
      fCategory.innerHTML = '<option value="">-- Επιλογή Κατηγορίας --</option>' +
        activeCats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    };

    // Show/hide subcategory dropdown based on selected category
    const updateSubcategoryDropdown = () => {
      const catId = fCategory.value;
      const subs = (state.CONFIG.destinationSubcategories || []).filter(s => s.category_id === catId && s.is_active !== false);
      if (subs.length > 0) {
        fSubcatLabel.hidden = false;
        fSubcategory.innerHTML = '<option value="">-- Χωρίς Υποκατηγορία --</option>' +
          subs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
      } else {
        fSubcatLabel.hidden = true;
        fSubcategory.innerHTML = '<option value="">-- Χωρίς Υποκατηγορία --</option>';
        fSubcategory.value = '';
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
        fFilterSubcategory.innerHTML = '<option value="">Όλες</option>' +
          subs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
      } else if (fFilterSubcatWrap) {
        fFilterSubcatWrap.hidden = true;
        if (fFilterSubcategory) fFilterSubcategory.value = '';
      }
    };

    fFilterCategory?.addEventListener('change', () => {
      updateFilterSubcategory();
      applySearchFilter();
    });
    fFilterSubcategory?.addEventListener('change', applySearchFilter);

    const applySearchFilter = () => {
      const q = (fSearch?.value || '').trim().toLowerCase();
      const filterCat = fFilterCategory?.value || '';
      const filterSub = fFilterSubcategory?.value || '';

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

    fSearch?.addEventListener('input', applySearchFilter);

    const render = () => {
      populateDropdowns();
      populateFilterDropdowns();
      const dests = state.CONFIG.destinations || [];
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
      form.hidden = true;
      state.editingDestinationId = null;
      fName.value = '';
      fDesc.value = '';
      fCategory.value = '';
      fSubcategory.value = '';
      fSubcatLabel.hidden = true;
      fOrder.value = '0';
      fActive.checked = true;
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
      if (fOperatingDays) fOperatingDays.value = '';
      if (fOpeningTime) fOpeningTime.value = '';
      if (fClosingTime) fClosingTime.value = '';
      setStatus(status, '', '');
    };

    const editDestination = (id) => {
      populateDropdowns();
      const dest = (state.CONFIG.destinations || []).find(d => d.id === id);
      if (!dest) return;
      state.editingDestinationId = id;
      fName.value = dest.name || '';
      fDesc.value = dest.description || '';
      fCategory.value = dest.category_id || '';
      updateSubcategoryDropdown();
      fSubcategory.value = dest.subcategory_id || '';
      fOrder.value = dest.display_order || 0;
      fActive.checked = dest.is_active !== false;
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
      if (fOperatingDays) fOperatingDays.value = dest.operating_days || '';
      if (fOpeningTime) fOpeningTime.value = dest.opening_time || '';
      if (fClosingTime) fClosingTime.value = dest.closing_time || '';
      form.hidden = false;
    };

    const saveDestinations = async (destinations) => {
      if (!ensureConfigLoaded()) return false;
      const res = await api('/api/admin/moveathens/destinations', 'PUT', { destinations });
      if (!res) return false;
      if (res.ok) {
        const data = await res.json();
        state.CONFIG.destinations = data.destinations || [];
        return true;
      }
      const err = await res.json().catch(() => ({}));
      setStatus(status, err.error || 'Σφάλμα', 'error');
      return false;
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
      form.hidden = false;
    });

    cancelBtn?.addEventListener('click', resetForm);

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setStatus(status, '', '');
      const name = fName.value.trim();
      if (!name) { setStatus(status, 'Το όνομα είναι υποχρεωτικό', 'error'); return; }
      if (!fCategory.value) { setStatus(status, 'Επιλέξτε κατηγορία', 'error'); return; }

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

      const entry = {
        id: state.editingDestinationId || `dest_${Date.now()}`,
        name,
        description: fDesc.value.trim(),
        category_id: fCategory.value,
        subcategory_id: fSubcategory?.value || null,
        route_type: fRouteType ? fRouteType.value || null : null,
        lat,
        lng,
        display_order: parseInt(fOrder.value, 10) || 0,
        is_active: fActive.checked,
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
        operating_days: fOperatingDays?.value?.trim() || '',
        opening_time: fOpeningTime?.value || '',
        closing_time: fClosingTime?.value || '',
        created_at: new Date().toISOString()
      };

      if (state.editingDestinationId) {
        const idx = dests.findIndex(d => d.id === state.editingDestinationId);
        if (idx >= 0) dests[idx] = { ...dests[idx], ...entry };
      } else {
        dests.push(entry);
      }

      if (await saveDestinations(dests)) {
        showToast('Αποθηκεύτηκε');
        resetForm();
        render();
      }
    });

    return { render };
  };

  window.MaAdmin.initDestinationsTab = initDestinationsTab;
})();
