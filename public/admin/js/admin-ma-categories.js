/**
 * MoveAthens Admin — Categories Tab (Tab-based layout)
 * Shows horizontal category tabs + selected category details + inline subcategories.
 * Depends on: admin-ma-helpers.js (window.MaAdmin)
 */
(() => {
  'use strict';
  const { $, showToast, openConfirm, setStatus, authRedirect, state, api, ensureConfigLoaded } = window.MaAdmin;

  /* ── Global category style controls ── */
  const STYLE_DEFAULTS = { tileScale: 1 };

  const initCategoryStyleControls = () => {
    const slider    = $('#maCatTileScale');
    const sliderVal = $('#maCatTileScaleVal');
    const saveBtn   = $('#maCatStyleSaveBtn');
    const resetBtn  = $('#maCatStyleResetBtn');
    const statusEl  = $('#maCatStyleStatus');
    const preview   = $('#maCatStylePreview');
    if (!slider || !preview) return;

    const getStyle = () => ({
      tileScale: parseFloat(slider.value) || 1
    });

    const renderPreview = () => {
      const s = getStyle();
      const tileW = Math.round(88 * s.tileScale);
      const imgW  = Math.round(50 * s.tileScale);
      const nameSize = Math.round(11 * s.tileScale);
      const radius = Math.round(22 * s.tileScale);
      const cats = (state.CONFIG.destinationCategories || []).filter(c => c.is_active !== false).slice(0, 5);
      if (!cats.length) cats.push({ name: 'Παράδειγμα', icon: '', color: '#1a73e8' });

      preview.innerHTML = cats.map(c => {
        const bg = c.color || '#1a73e8';
        const isUrl = c.icon && c.icon.length > 4 && (c.icon.startsWith('/') || c.icon.startsWith('http'));
        const iconHtml = isUrl
          ? `<img src="${c.icon}" alt="" style="width:${imgW}px;height:${imgW}px;object-fit:contain;filter:${c.icon_color === 'black' ? 'brightness(0)' : 'brightness(0) invert(1)'}">`
          : `<span style="font-size:${imgW}px;line-height:1">${c.icon || '📍'}</span>`;
        return `
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;max-width:${tileW + 10}px">
            <div style="width:${tileW}px;height:${tileW}px;border-radius:${radius}px;background:${bg};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.15);border:1.5px solid rgba(255,255,255,.35);overflow:hidden">
              ${iconHtml}
            </div>
            <span style="font-size:${nameSize}px;font-weight:500;color:#1a1a2e;text-align:center;line-height:1.2;max-width:${tileW + 10}px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${c.name}</span>
          </div>`;
      }).join('');
    };

    const loadSaved = () => {
      const saved = state.CONFIG.categoryStyle || {};
      slider.value = saved.tileScale ?? STYLE_DEFAULTS.tileScale;
      sliderVal.textContent = parseFloat(slider.value).toFixed(2);
      renderPreview();
    };

    slider.addEventListener('input', () => { sliderVal.textContent = parseFloat(slider.value).toFixed(2); renderPreview(); });

    saveBtn?.addEventListener('click', async () => {
      if (!ensureConfigLoaded()) return;
      const s = getStyle();
      const res = await api('/api/admin/moveathens/ui-config', 'PUT', { categoryStyle: s });
      if (res && res.ok) {
        const data = await res.json();
        state.CONFIG = data;
        setStatus(statusEl, 'Αποθηκεύτηκε ✓', 'ok');
        showToast('Εμφάνιση κατηγοριών αποθηκεύτηκε');
      } else {
        setStatus(statusEl, 'Σφάλμα αποθήκευσης', 'error');
      }
    });

    resetBtn?.addEventListener('click', () => {
      slider.value = STYLE_DEFAULTS.tileScale;
      sliderVal.textContent = '1.00';
      renderPreview();
    });

    return { loadSaved, renderPreview };
  };

  /* ══════════════════════════════════════
     MAIN: initCategoriesTab
     ══════════════════════════════════════ */
  const initCategoriesTab = () => {
    const styleCtrl = initCategoryStyleControls();

    // Category form elements
    const catForm    = $('#ma-category-form');
    const catTabs    = $('#maCategoryTabs');
    const catContent = $('#maCategoryContent');
    const catInfo    = $('#maCategoryInfo');
    const addBtn     = $('#maCategoryAddBtn');
    const cancelBtn  = $('#maCategoryCancelBtn');
    const deleteBtn  = $('#maCategoryDeleteBtn');
    const status     = $('#maCategoryStatus');
    const fName      = $('#maCategoryName');
    const fIcon      = $('#maCategoryIcon');
    const fIconFile  = $('#maCategoryIconFile');
    const fIconUpload = $('#maCategoryIconUpload');
    const fIconPreview = $('#maCategoryIconPreview');
    const fOrder     = $('#maCategoryOrder');
    const fActive    = $('#maCategoryActive');
    const fArrival   = $('#maCategoryArrival');
    const fColor     = $('#maCategoryColor');
    const fColorHex  = $('#maCategoryColorHex');
    const fIconColor = $('#maCategoryIconColor');

    // Subcategory form elements
    const subForm    = $('#ma-subcategory-form');
    const subList    = $('#ma-subcategories-list');
    const subAddBtn  = $('#maSubcategoryAddBtn');
    const subCancelBtn = $('#maSubcategoryCancelBtn');
    const subStatus  = $('#maSubcategoryStatus');
    const fSubParent = $('#maSubcategoryParent');
    const fSubName   = $('#maSubcategoryName');
    const fSubDesc   = $('#maSubcategoryDescription');
    const fSubOrder  = $('#maSubcategoryOrder');
    const fSubActive = $('#maSubcategoryActive');

    let selectedCatId = null;

    // ── Icon preview ──
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
    fColor?.addEventListener('input', () => { if (fColorHex) fColorHex.textContent = fColor.value; });

    // ── Save/delete categories ──
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
      const cat = (state.CONFIG.destinationCategories || []).find(c => c.id === id);
      if (!cat) return;
      // Check if category has destinations assigned
      const destCount = (state.CONFIG.destinations || []).filter(d => d.category_id === id).length;
      const subCount = (state.CONFIG.destinationSubcategories || []).filter(s => s.category_id === id).length;
      let warnMsg = `Διαγραφή κατηγορίας "${cat.name}"?`;
      if (destCount > 0 || subCount > 0) {
        warnMsg += `\n\n⚠️ Περιέχει ${destCount} προορισμ${destCount === 1 ? 'ό' : 'ούς'} και ${subCount} υποκατηγορ${subCount === 1 ? 'ία' : 'ίες'}.`;
      }
      if (await openConfirm(warnMsg, { title: 'Διαγραφή Κατηγορίας', okLabel: 'Διαγραφή' })) {
        // Cascade: remove orphaned subcategories
        const orphanSubIds = (state.CONFIG.destinationSubcategories || []).filter(s => s.category_id === id).map(s => s.id);
        if (orphanSubIds.length > 0) {
          const cleanedSubs = (state.CONFIG.destinationSubcategories || []).filter(s => s.category_id !== id);
          await saveSubcategories(cleanedSubs);
        }
        // Cascade: clear category_id & subcategory_id on affected destinations
        const affectedDests = (state.CONFIG.destinations || []).filter(d => d.category_id === id);
        if (affectedDests.length > 0) {
          const allDests = (state.CONFIG.destinations || []).map(d => {
            if (d.category_id === id) return { ...d, category_id: null, subcategory_id: null };
            return d;
          });
          const destApi = await api('/api/admin/moveathens/destinations', 'PUT', { destinations: allDests });
          if (destApi && destApi.ok) {
            const destData = await destApi.json();
            state.CONFIG.destinations = destData.destinations || [];
          }
        }
        const cats = (state.CONFIG.destinationCategories || []).filter(c => c.id !== id);
        if (await saveCategories(cats)) {
          showToast('Η κατηγορία διαγράφηκε');
          selectedCatId = null;
          render();
        }
      }
    };

    // ── Save/delete subcategories ──
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
      setStatus(subStatus, err.error || 'Σφάλμα', 'error');
      return false;
    };

    const deleteSubcategory = async (id) => {
      const subs = (state.CONFIG.destinationSubcategories || []).filter(s => s.id !== id);
      if (await saveSubcategories(subs)) {
        showToast('Η υποκατηγορία διαγράφηκε');
        renderCategoryContent(selectedCatId);
      }
    };

    // ══════════════════════════════════════
    // RENDER: Horizontal category tabs
    // ══════════════════════════════════════
    const renderTabs = () => {
      if (!catTabs) return;
      const cats = state.CONFIG.destinationCategories || [];
      if (!cats.length) {
        catTabs.innerHTML = '<span style="font-size:13px;color:#999;padding:8px">Δεν υπάρχουν κατηγορίες ακόμα</span>';
        return;
      }
      catTabs.innerHTML = cats.map(c => {
        const isUrl = c.icon && c.icon.length > 4 && (c.icon.startsWith('/') || c.icon.startsWith('http'));
        const iconHtml = isUrl
          ? `<img src="${c.icon}" alt="" class="ma-cat-tab-icon" style="filter:${c.icon_color === 'black' ? 'brightness(0)' : 'none'}">`
          : `<span class="ma-cat-tab-emoji">${c.icon || '📁'}</span>`;
        const activeClass = c.id === selectedCatId ? ' ma-cat-tab--active' : '';
        const inactiveLabel = c.is_active === false ? ' <small style="opacity:.5">(off)</small>' : '';
        return `<button class="ma-cat-tab${activeClass}" data-id="${c.id}" type="button">
          ${iconHtml}<span class="ma-cat-tab-label">${c.name}${inactiveLabel}</span>
        </button>`;
      }).join('');

      catTabs.querySelectorAll('.ma-cat-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const id = tab.dataset.id;
          if (id === selectedCatId) return;
          selectedCatId = id;
          resetCatForm();
          resetSubForm();
          renderTabs();
          renderCategoryContent(id);
        });
      });
    };

    // ══════════════════════════════════════
    // RENDER: Selected category content
    // ══════════════════════════════════════
    const renderCategoryContent = (catId) => {
      const cat = (state.CONFIG.destinationCategories || []).find(c => c.id === catId);
      if (!cat) {
        if (catContent) catContent.hidden = true;
        return;
      }
      if (catContent) catContent.hidden = false;

      // Category info summary
      const isUrl = cat.icon && cat.icon.length > 4 && (cat.icon.startsWith('/') || cat.icon.startsWith('http'));
      const iconHtml = isUrl
        ? `<img src="${cat.icon}" alt="" style="width:32px;height:32px;object-fit:contain;filter:${cat.icon_color === 'black' ? 'brightness(0)' : 'brightness(0) invert(1)'}">`
        : `<span style="font-size:28px">${cat.icon || '📁'}</span>`;
      const arrBadge = cat.is_arrival ? '<span class="ma-badge ma-badge-arrival">↩ Άφιξη</span>' : '';
      const statusLabel = cat.is_active !== false
        ? '<span class="ma-zone-status" data-active="true">Ενεργή</span>'
        : '<span class="ma-zone-status" data-active="false">Ανενεργή</span>';
      const colorSwatch = `<span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:${cat.color || '#1a73e8'};vertical-align:middle;border:1px solid rgba(0,0,0,.15)"></span>`;

      if (catInfo) catInfo.innerHTML = `
        <div class="ma-cat-info-row">
          <div class="ma-cat-info-icon" style="background:${cat.color || '#1a73e8'}">${iconHtml}</div>
          <div class="ma-cat-info-details">
            <strong>${cat.name}</strong> ${colorSwatch} ${arrBadge} ${statusLabel}
            <span style="font-size:12px;color:#888;margin-left:8px">Σειρά: ${cat.display_order || 0}</span>
          </div>
          <div class="ma-cat-info-actions">
            <button class="btn secondary" id="maCatEditInline" type="button">✏️ Επεξεργασία</button>
            <button class="btn secondary" id="maCatDeleteInline" type="button" style="color:#dc2626">🗑️</button>
          </div>
        </div>`;

      // Wire edit/delete buttons
      $('#maCatEditInline')?.addEventListener('click', () => editCategory(catId));
      $('#maCatDeleteInline')?.addEventListener('click', () => deleteCategory(catId));

      // Render subcategories for this category
      renderSubcategories(catId);
    };

    // ══════════════════════════════════════
    // RENDER: Subcategories within category
    // ══════════════════════════════════════
    const renderSubcategories = (catId) => {
      if (!subList) return;
      const subs = (state.CONFIG.destinationSubcategories || []).filter(s => s.category_id === catId);
      if (!subs.length) {
        subList.innerHTML = '<p class="ma-empty" style="font-size:13px">Δεν υπάρχουν υποκατηγορίες σε αυτή την κατηγορία.</p>';
        return;
      }
      subList.innerHTML = subs.map(s => `
        <div class="ma-zone-card ma-subcat-card" data-id="${s.id}">
          <div class="ma-zone-card__header">
            <div class="ma-zone-card__title">
              <h4>${s.name}</h4>
              <span class="ma-zone-status" data-active="${s.is_active}">${s.is_active ? 'Ενεργή' : 'Ανενεργή'}</span>
            </div>
          </div>
          ${s.description ? `<p class="ma-zone-desc" style="font-size:12px">${s.description}</p>` : ''}
          <div class="ma-zone-meta"><span>Σειρά: ${s.display_order}</span></div>
          <div class="ma-zone-actions">
            <button class="btn secondary btn-edit-sub" type="button" style="font-size:12px">Επεξεργασία</button>
            <button class="btn secondary btn-delete-sub" type="button" style="font-size:12px">Διαγραφή</button>
          </div>
        </div>
      `).join('');

      subList.querySelectorAll('.btn-edit-sub').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.closest('.ma-subcat-card').dataset.id;
          editSubcategory(id);
        });
      });
      subList.querySelectorAll('.btn-delete-sub').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.closest('.ma-subcat-card').dataset.id;
          const sub = subs.find(s => s.id === id);
          if (await openConfirm(`Διαγραφή υποκατηγορίας "${sub?.name}"?`, { title: 'Διαγραφή', okLabel: 'Διαγραφή' })) {
            deleteSubcategory(id);
          }
        });
      });
    };

    // ── Category form reset/edit ──
    const resetCatForm = () => {
      if (catForm) catForm.hidden = true;
      state.editingCategoryId = null;
      if (fName) fName.value = '';
      if (fIcon) fIcon.value = '';
      if (fIconFile) fIconFile.value = '';
      if (fOrder) fOrder.value = '0';
      if (fActive) fActive.checked = true;
      if (fArrival) fArrival.checked = false;
      if (fColor) fColor.value = '#1a73e8';
      if (fColorHex) fColorHex.textContent = '#1a73e8';
      if (fIconColor) fIconColor.value = 'white';
      if (deleteBtn) deleteBtn.hidden = true;
      updateIconPreview();
      setStatus(status, '', '');
    };

    const editCategory = (id) => {
      const cat = (state.CONFIG.destinationCategories || []).find(c => c.id === id);
      if (!cat) return;
      state.editingCategoryId = id;
      if (fName) fName.value = cat.name || '';
      if (fIcon) fIcon.value = cat.icon || '';
      if (fOrder) fOrder.value = cat.display_order || 0;
      if (fActive) fActive.checked = cat.is_active !== false;
      if (fArrival) fArrival.checked = cat.is_arrival === true;
      if (fColor) fColor.value = cat.color || '#1a73e8';
      if (fColorHex) fColorHex.textContent = cat.color || '#1a73e8';
      if (fIconColor) fIconColor.value = cat.icon_color || 'white';
      if (deleteBtn) deleteBtn.hidden = false;
      updateIconPreview();
      if (catForm) catForm.hidden = false;
    };

    // ── Subcategory form reset/edit ──
    const resetSubForm = () => {
      if (subForm) subForm.hidden = true;
      state.editingSubcategoryId = null;
      if (fSubName) fSubName.value = '';
      if (fSubDesc) fSubDesc.value = '';
      if (fSubOrder) fSubOrder.value = '0';
      if (fSubActive) fSubActive.checked = true;
      setStatus(subStatus, '', '');
    };

    const editSubcategory = (id) => {
      const sub = (state.CONFIG.destinationSubcategories || []).find(s => s.id === id);
      if (!sub) return;
      state.editingSubcategoryId = id;
      if (fSubParent) fSubParent.value = sub.category_id || selectedCatId;
      if (fSubName) fSubName.value = sub.name || '';
      if (fSubDesc) fSubDesc.value = sub.description || '';
      if (fSubOrder) fSubOrder.value = sub.display_order || 0;
      if (fSubActive) fSubActive.checked = sub.is_active !== false;
      if (subForm) subForm.hidden = false;
    };

    // ── Event listeners ──
    addBtn?.addEventListener('click', () => {
      selectedCatId = null;
      if (catContent) catContent.hidden = true;
      resetCatForm();
      resetSubForm();
      if (deleteBtn) deleteBtn.hidden = true;
      if (catForm) catForm.hidden = false;
      renderTabs();
    });

    cancelBtn?.addEventListener('click', () => {
      resetCatForm();
      if (selectedCatId) {
        renderCategoryContent(selectedCatId);
      }
    });

    deleteBtn?.addEventListener('click', () => {
      if (state.editingCategoryId) deleteCategory(state.editingCategoryId);
    });

    catForm?.addEventListener('submit', async (e) => {
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
        color: fColor ? fColor.value : '#1a73e8',
        icon_color: fIconColor ? fIconColor.value : 'white'
      };

      if (state.editingCategoryId) {
        const idx = cats.findIndex(c => c.id === state.editingCategoryId);
        if (idx >= 0) {
          entry.created_at = cats[idx].created_at || new Date().toISOString();
          cats[idx] = { ...cats[idx], ...entry };
        }
      } else {
        entry.created_at = new Date().toISOString();
        cats.push(entry);
      }

      if (await saveCategories(cats)) {
        showToast('Αποθηκεύτηκε');
        selectedCatId = entry.id;
        resetCatForm();
        render();
      }
    });

    // Subcategory add
    subAddBtn?.addEventListener('click', () => {
      if (!selectedCatId) { showToast('Επιλέξτε πρώτα κατηγορία'); return; }
      resetSubForm();
      fSubParent.value = selectedCatId;
      subForm.hidden = false;
    });

    subCancelBtn?.addEventListener('click', resetSubForm);

    subForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setStatus(subStatus, '', '');
      const name = fSubName.value.trim();
      if (!name) { setStatus(subStatus, 'Το όνομα είναι υποχρεωτικό', 'error'); return; }
      const parentId = fSubParent.value || selectedCatId;
      if (!parentId) { setStatus(subStatus, 'Δεν βρέθηκε κατηγορία', 'error'); return; }

      let subs = [...(state.CONFIG.destinationSubcategories || [])];
      const entry = {
        id: state.editingSubcategoryId || `dsc_${Date.now()}`,
        category_id: parentId,
        name,
        description: fSubDesc.value.trim(),
        display_order: parseInt(fSubOrder.value, 10) || 0,
        is_active: fSubActive.checked
      };

      if (state.editingSubcategoryId) {
        const idx = subs.findIndex(s => s.id === state.editingSubcategoryId);
        if (idx >= 0) {
          entry.created_at = subs[idx].created_at || new Date().toISOString();
          subs[idx] = { ...subs[idx], ...entry };
        }
      } else {
        entry.created_at = new Date().toISOString();
        subs.push(entry);
      }

      if (await saveSubcategories(subs)) {
        showToast('Αποθηκεύτηκε');
        resetSubForm();
        renderCategoryContent(selectedCatId);
      }
    });

    // ══════════════════════════════════════
    // MAIN RENDER
    // ══════════════════════════════════════
    const render = () => {
      if (styleCtrl) styleCtrl.loadSaved();
      renderTabs();
      if (selectedCatId) {
        renderCategoryContent(selectedCatId);
      } else {
        if (catContent) catContent.hidden = true;
      }
      if (styleCtrl) styleCtrl.renderPreview();
    };

    return { render, styleCtrl };
  };

  window.MaAdmin.initCategoriesTab = initCategoriesTab;
})();
