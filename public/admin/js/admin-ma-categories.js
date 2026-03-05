/**
 * MoveAthens Admin — Categories Tab
 * Depends on: admin-ma-helpers.js (window.MaAdmin)
 */
(() => {
  'use strict';
  const { $, showToast, openConfirm, setStatus, authRedirect, state, api, ensureConfigLoaded } = window.MaAdmin;

  const initCategoriesTab = () => {
    const form = $('#ma-category-form');
    const list = $('#ma-categories-list');
    const addBtn = $('#maCategoryAddBtn');
    const saveBtn = $('#maCategorySaveBtn');
    const cancelBtn = $('#maCategoryCancelBtn');
    const status = $('#maCategoryStatus');
    const fName = $('#maCategoryName');
    const fIcon = $('#maCategoryIcon');
    const fIconFile = $('#maCategoryIconFile');
    const fIconUpload = $('#maCategoryIconUpload');
    const fIconPreview = $('#maCategoryIconPreview');
    const fOrder = $('#maCategoryOrder');
    const fActive = $('#maCategoryActive');
    const fArrival = $('#maCategoryArrival');

    const updateIconPreview = () => {
      const url = fIcon?.value;
      if (fIconPreview) {
        if (!url || url.length <= 4) {
          fIconPreview.setAttribute('data-visible', 'false');
          fIconPreview.src = '';
        } else {
          fIconPreview.src = url;
          fIconPreview.setAttribute('data-visible', 'true');
        }
      }
    };

    const render = () => {
      const cats = state.CONFIG.destinationCategories || [];
      if (!cats.length) {
        list.innerHTML = '<p class="ma-empty">Δεν υπάρχουν κατηγορίες.</p>';
        return;
      }
      list.innerHTML = cats.map(c => {
        const isIconUrl = c.icon && c.icon.length > 4 && (c.icon.startsWith('/') || c.icon.startsWith('http'));
        const iconDisplay = isIconUrl 
          ? `<img src="${c.icon}" alt="" class="ma-cat-icon-img">`
          : `<span class="ma-cat-icon">${c.icon || '📁'}</span>`;
        const arrivalBadge = c.is_arrival ? '<span class="ma-badge ma-badge-arrival">↩ Άφιξη</span>' : '';
        return `
          <div class="ma-zone-card" data-id="${c.id}">
            <div class="ma-zone-card__header">
              <div class="ma-zone-card__title">
                ${iconDisplay}
                <h4>${c.name}</h4>
                ${arrivalBadge}
                <span class="ma-zone-status" data-active="${c.is_active}">${c.is_active ? 'Ενεργή' : 'Ανενεργή'}</span>
              </div>
            </div>
            <div class="ma-zone-meta">
              <span>Order: ${c.display_order}</span>
            </div>
            <div class="ma-zone-actions">
              <button class="btn secondary btn-edit" type="button">Επεξεργασία</button>
              <button class="btn secondary btn-delete" type="button">Διαγραφή</button>
            </div>
          </div>
        `;
      }).join('');

      list.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.closest('.ma-zone-card').dataset.id;
          editCategory(id);
        });
      });
      list.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.closest('.ma-zone-card').dataset.id;
          const cat = cats.find(c => c.id === id);
          if (await openConfirm(`Διαγραφή "${cat?.name}"?`, { title: 'Διαγραφή Κατηγορίας', okLabel: 'Διαγραφή' })) {
            deleteCategory(id);
          }
        });
      });
    };

    const resetForm = () => {
      form.hidden = true;
      state.editingCategoryId = null;
      fName.value = '';
      fIcon.value = '';
      if (fIconFile) fIconFile.value = '';
      fOrder.value = '0';
      fActive.checked = true;
      if (fArrival) fArrival.checked = false;
      updateIconPreview();
      setStatus(status, '', '');
    };

    const editCategory = (id) => {
      const cat = (state.CONFIG.destinationCategories || []).find(c => c.id === id);
      if (!cat) return;
      state.editingCategoryId = id;
      fName.value = cat.name || '';
      fIcon.value = cat.icon || '';
      fOrder.value = cat.display_order || 0;
      fActive.checked = cat.is_active !== false;
      if (fArrival) fArrival.checked = cat.is_arrival === true;
      updateIconPreview();
      form.hidden = false;
    };

    fIconUpload?.addEventListener('click', async () => {
      const file = fIconFile?.files?.[0];
      if (!file) { showToast('Επίλεξε αρχείο'); return; }
      const fd = new FormData();
      fd.append('icon', file);
      const res = await fetch('/api/admin/moveathens/upload-category-icon', { method: 'POST', credentials: 'include', body: fd });
      if (res.status === 401 || res.status === 403) { authRedirect(); return; }
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        if (fIcon) fIcon.value = data.url;
        updateIconPreview();
        showToast('Upload OK');
      } else {
        showToast(data.error || 'Upload failed');
      }
    });

    fIcon?.addEventListener('input', updateIconPreview);

    const saveCategories = async (categories) => {
      if (!ensureConfigLoaded()) return false;
      const res = await api('/api/admin/moveathens/destination-categories', 'PUT', { categories });
      if (!res) return false;
      if (res.ok) {
        const data = await res.json();
        state.CONFIG.destinationCategories = data.categories || [];
        return true;
      }
      const err = await res.json().catch(() => ({}));
      setStatus(status, err.error || 'Σφάλμα', 'error');
      return false;
    };

    const deleteCategory = async (id) => {
      const cats = (state.CONFIG.destinationCategories || []).filter(c => c.id !== id);
      if (await saveCategories(cats)) {
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

      let cats = [...(state.CONFIG.destinationCategories || [])];
      const entry = {
        id: state.editingCategoryId || `dc_${Date.now()}`,
        name,
        icon: fIcon.value.trim(),
        display_order: parseInt(fOrder.value, 10) || 0,
        is_active: fActive.checked,
        is_arrival: fArrival ? fArrival.checked : false,
        created_at: new Date().toISOString()
      };

      if (state.editingCategoryId) {
        const idx = cats.findIndex(c => c.id === state.editingCategoryId);
        if (idx >= 0) cats[idx] = { ...cats[idx], ...entry };
      } else {
        cats.push(entry);
      }

      if (await saveCategories(cats)) {
        showToast('Αποθηκεύτηκε');
        resetForm();
        render();
      }
    });

    return { render };
  };

  window.MaAdmin.initCategoriesTab = initCategoriesTab;
})();
