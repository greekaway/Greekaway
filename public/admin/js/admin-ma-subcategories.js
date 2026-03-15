/**
 * MoveAthens Admin — Subcategories Tab
 * Depends on: admin-ma-helpers.js (window.MaAdmin)
 */
(() => {
  'use strict';
  const { $, showToast, openConfirm, setStatus, state, api, ensureConfigLoaded } = window.MaAdmin;

  const initSubcategoriesTab = () => {
    const form = $('#ma-subcategory-form');
    const list = $('#ma-subcategories-list');
    const addBtn = $('#maSubcategoryAddBtn');
    const saveBtn = $('#maSubcategorySaveBtn');
    const cancelBtn = $('#maSubcategoryCancelBtn');
    const status = $('#maSubcategoryStatus');
    const fParent = $('#maSubcategoryParent');
    const fName = $('#maSubcategoryName');
    const fDesc = $('#maSubcategoryDescription');
    const fOrder = $('#maSubcategoryOrder');
    const fActive = $('#maSubcategoryActive');
    const fArrival = $('#maSubcategoryArrival');
    const filterCat = $('#maSubcategoryFilterCat');

    const getCategoryName = (id) => (state.CONFIG.destinationCategories || []).find(c => c.id === id)?.name || '—';

    const populateParentDropdown = () => {
      const cats = (state.CONFIG.destinationCategories || []).filter(c => c.is_active !== false);
      fParent.innerHTML = '<option value="">-- Επιλογή Κατηγορίας --</option>' +
        cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    };

    const populateFilterDropdown = () => {
      const cats = (state.CONFIG.destinationCategories || []).filter(c => c.is_active !== false);
      filterCat.innerHTML = '<option value="">Όλες</option>' +
        cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    };

    const render = () => {
      populateParentDropdown();
      populateFilterDropdown();
      const subs = state.CONFIG.destinationSubcategories || [];
      const filterVal = filterCat?.value || '';
      const filtered = filterVal ? subs.filter(s => s.category_id === filterVal) : subs;

      if (!filtered.length) {
        list.innerHTML = '<p class="ma-empty">Δεν υπάρχουν υποκατηγορίες.' + (filterVal ? ' (Αλλάξτε φίλτρο)' : '') + '</p>';
        return;
      }
      list.innerHTML = filtered.map(s => `
        <div class="ma-zone-card" data-id="${s.id}">
          <div class="ma-zone-card__header">
            <div class="ma-zone-card__title">
              <h4>${s.name}</h4>
              <span class="ma-zone-status" data-active="${s.is_active}">${s.is_active ? 'Ενεργή' : 'Ανενεργή'}</span>
            </div>
          </div>
          <div class="ma-zone-meta">
            <span>Κατηγορία: ${getCategoryName(s.category_id)}</span>
            <span>Σειρά: ${s.display_order}</span>
            ${s.is_arrival ? '<span style="color:#f59e0b">✈️ Άφιξη</span>' : ''}
          </div>
          ${s.description ? `<p class="ma-zone-desc">${s.description}</p>` : ''}
          <div class="ma-zone-actions">
            <button class="btn secondary btn-edit" type="button">Επεξεργασία</button>
            <button class="btn secondary btn-delete" type="button">Διαγραφή</button>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.closest('.ma-zone-card').dataset.id;
          editSubcategory(id);
        });
      });
      list.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.closest('.ma-zone-card').dataset.id;
          const sub = subs.find(s => s.id === id);
          if (await openConfirm(`Διαγραφή "${sub?.name}"?`, { title: 'Διαγραφή Υποκατηγορίας', okLabel: 'Διαγραφή' })) {
            deleteSubcategory(id);
          }
        });
      });
    };

    filterCat?.addEventListener('change', render);

    const resetForm = () => {
      form.hidden = true;
      state.editingSubcategoryId = null;
      fParent.value = '';
      fName.value = '';
      fDesc.value = '';
      fOrder.value = '0';
      fActive.checked = true;
      if (fArrival) fArrival.checked = false;
      setStatus(status, '', '');
    };

    const editSubcategory = (id) => {
      populateParentDropdown();
      const sub = (state.CONFIG.destinationSubcategories || []).find(s => s.id === id);
      if (!sub) return;
      state.editingSubcategoryId = id;
      fParent.value = sub.category_id || '';
      fName.value = sub.name || '';
      fDesc.value = sub.description || '';
      fOrder.value = sub.display_order || 0;
      fActive.checked = sub.is_active !== false;
      if (fArrival) fArrival.checked = sub.is_arrival === true;
      form.hidden = false;
    };

    const saveSubcategories = async (subcategories) => {
      if (!ensureConfigLoaded()) return false;
      const res = await api('/api/admin/moveathens/destination-subcategories', 'PUT', { subcategories });
      if (!res) return false;
      if (res.ok) {
        const data = await res.json();
        state.CONFIG.destinationSubcategories = data.subcategories || [];
        return true;
      }
      const err = await res.json().catch(() => ({}));
      setStatus(status, err.error || 'Σφάλμα', 'error');
      return false;
    };

    const deleteSubcategory = async (id) => {
      const subs = (state.CONFIG.destinationSubcategories || []).filter(s => s.id !== id);
      if (await saveSubcategories(subs)) {
        showToast('Διαγράφηκε');
        render();
      }
    };

    addBtn?.addEventListener('click', () => {
      resetForm();
      populateParentDropdown();
      form.hidden = false;
    });

    cancelBtn?.addEventListener('click', resetForm);

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setStatus(status, '', '');
      const name = fName.value.trim();
      if (!name) { setStatus(status, 'Το όνομα είναι υποχρεωτικό', 'error'); return; }
      if (!fParent.value) { setStatus(status, 'Επιλέξτε κατηγορία', 'error'); return; }

      let subs = [...(state.CONFIG.destinationSubcategories || [])];
      const entry = {
        id: state.editingSubcategoryId || `dsc_${Date.now()}`,
        category_id: fParent.value,
        name,
        description: fDesc.value.trim(),
        display_order: parseInt(fOrder.value, 10) || 0,
        is_active: fActive.checked,
        is_arrival: fArrival ? fArrival.checked : false,
        created_at: new Date().toISOString()
      };

      if (state.editingSubcategoryId) {
        const idx = subs.findIndex(s => s.id === state.editingSubcategoryId);
        if (idx >= 0) subs[idx] = { ...subs[idx], ...entry };
      } else {
        subs.push(entry);
      }

      if (await saveSubcategories(subs)) {
        showToast('Αποθηκεύτηκε');
        resetForm();
        render();
      }
    });

    return { render };
  };

  window.MaAdmin.initSubcategoriesTab = initSubcategoriesTab;
})();
