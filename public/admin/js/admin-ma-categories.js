/**
 * MoveAthens Admin — Categories Tab
 * Depends on: admin-ma-helpers.js (window.MaAdmin)
 */
(() => {
  'use strict';
  const { $, showToast, openConfirm, setStatus, authRedirect, state, api, ensureConfigLoaded } = window.MaAdmin;

  /* ── Global category style controls ── */
  const STYLE_DEFAULTS = { tileScale: 1, iconColor: '#ffffff', textColor: '#1a1a2e' };

  const initCategoryStyleControls = () => {
    const slider    = $('#maCatTileScale');
    const sliderVal = $('#maCatTileScaleVal');
    const iconColor = $('#maCatIconColor');
    const iconHex   = $('#maCatIconColorHex');
    const textColor = $('#maCatTextColor');
    const textHex   = $('#maCatTextColorHex');
    const saveBtn   = $('#maCatStyleSaveBtn');
    const resetBtn  = $('#maCatStyleResetBtn');
    const statusEl  = $('#maCatStyleStatus');
    const preview   = $('#maCatStylePreview');
    if (!slider || !preview) return;

    const getStyle = () => ({
      tileScale: parseFloat(slider.value) || 1,
      iconColor: iconColor ? iconColor.value : '#ffffff',
      textColor: textColor ? textColor.value : '#1a1a2e'
    });

    const hexToFilter = (hex) => {
      // white = default brightness(0) invert(1)
      if (hex.toLowerCase() === '#ffffff' || hex.toLowerCase() === '#fff') return 'brightness(0) invert(1)';
      // black
      if (hex.toLowerCase() === '#000000' || hex.toLowerCase() === '#000') return 'brightness(0)';
      // For arbitrary colors: use SVG approach with CSS filter approximation
      // Use sepia + hue-rotate + saturate. Simple, works in all browsers.
      const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      const max = Math.max(r,g,b)/255, min = Math.min(r,g,b)/255;
      const l = (max+min)/2;
      let s = 0, h = 0;
      if (max !== min) {
        s = l > 0.5 ? (max-min)/(2-max-min) : (max-min)/(max+min);
        if (max === r/255) h = ((g/255)-(b/255))/(max-min)+(g<b?6:0);
        else if (max === g/255) h = ((b/255)-(r/255))/(max-min)+2;
        else h = ((r/255)-(g/255))/(max-min)+4;
        h *= 60;
      }
      return `brightness(0) sepia(1) hue-rotate(${Math.round(h)}deg) saturate(${Math.round(s*10*100)/100}%) brightness(${Math.round(l*200)/100}%)`;
    };

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
          ? `<img src="${c.icon}" alt="" style="width:${imgW}px;height:${imgW}px;object-fit:contain;filter:${hexToFilter(s.iconColor)}">`
          : `<span style="font-size:${imgW}px;line-height:1">${c.icon || '📍'}</span>`;
        return `
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;max-width:${tileW + 10}px">
            <div style="width:${tileW}px;height:${tileW}px;border-radius:${radius}px;background:${bg};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.15);border:1.5px solid rgba(255,255,255,.35);overflow:hidden">
              ${iconHtml}
            </div>
            <span style="font-size:${nameSize}px;font-weight:500;color:${s.textColor};text-align:center;line-height:1.2;max-width:${tileW + 10}px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${c.name}</span>
          </div>`;
      }).join('');
    };

    const loadSaved = () => {
      const saved = state.CONFIG.categoryStyle || {};
      slider.value = saved.tileScale ?? STYLE_DEFAULTS.tileScale;
      sliderVal.textContent = parseFloat(slider.value).toFixed(2);
      if (iconColor) { iconColor.value = saved.iconColor || STYLE_DEFAULTS.iconColor; iconHex.textContent = iconColor.value; }
      if (textColor) { textColor.value = saved.textColor || STYLE_DEFAULTS.textColor; textHex.textContent = textColor.value; }
      renderPreview();
    };

    slider.addEventListener('input', () => { sliderVal.textContent = parseFloat(slider.value).toFixed(2); renderPreview(); });
    if (iconColor) iconColor.addEventListener('input', () => { iconHex.textContent = iconColor.value; renderPreview(); });
    if (textColor) textColor.addEventListener('input', () => { textHex.textContent = textColor.value; renderPreview(); });

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
      if (iconColor) { iconColor.value = STYLE_DEFAULTS.iconColor; iconHex.textContent = STYLE_DEFAULTS.iconColor; }
      if (textColor) { textColor.value = STYLE_DEFAULTS.textColor; textHex.textContent = STYLE_DEFAULTS.textColor; }
      renderPreview();
    });

    return { loadSaved, renderPreview };
  };

  const initCategoriesTab = () => {
    const styleCtrl = initCategoryStyleControls();
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
    const fColor = $('#maCategoryColor');
    const fColorHex = $('#maCategoryColorHex');

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
      // Load saved style settings (config is ready at this point)
      if (styleCtrl) styleCtrl.loadSaved();

      const cats = state.CONFIG.destinationCategories || [];
      if (!cats.length) {
        list.innerHTML = '<p class="ma-empty">Δεν υπάρχουν κατηγορίες.</p>';
        if (styleCtrl) styleCtrl.renderPreview();
        return;
      }
      list.innerHTML = cats.map(c => {
        const isIconUrl = c.icon && c.icon.length > 4 && (c.icon.startsWith('/') || c.icon.startsWith('http'));
        const iconDisplay = isIconUrl 
          ? `<img src="${c.icon}" alt="" class="ma-cat-icon-img">`
          : `<span class="ma-cat-icon">${c.icon || '📁'}</span>`;
        const arrivalBadge = c.is_arrival ? '<span class="ma-badge ma-badge-arrival">↩ Άφιξη</span>' : '';
        const colorSwatch = `<span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:${c.color || '#1a73e8'};vertical-align:middle;margin-left:6px;border:1px solid rgba(0,0,0,0.15)"></span>`;
        return `
          <div class="ma-zone-card" data-id="${c.id}">
            <div class="ma-zone-card__header">
              <div class="ma-zone-card__title">
                ${iconDisplay}
                <h4>${c.name}</h4>
                ${colorSwatch}
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

      // Refresh style preview with current categories
      if (styleCtrl) styleCtrl.renderPreview();
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
      if (fColor) fColor.value = '#1a73e8';
      if (fColorHex) fColorHex.textContent = '#1a73e8';
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
      if (fColor) fColor.value = cat.color || '#1a73e8';
      if (fColorHex) fColorHex.textContent = cat.color || '#1a73e8';
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

    fColor?.addEventListener('input', () => {
      if (fColorHex) fColorHex.textContent = fColor.value;
    });

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
        color: fColor ? fColor.value : '#1a73e8',
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

    return { render, styleCtrl };
  };

  window.MaAdmin.initCategoriesTab = initCategoriesTab;
})();
