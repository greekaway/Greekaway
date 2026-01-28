/**
 * MoveAthens Transfers Admin Panel
 * Manages: Categories, Destinations, Vehicles, Zones, Pricing, Availability
 */
(() => {
  'use strict';

  // ========================================
  // UTILITIES
  // ========================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const toast = $('#ma-toast');

  const showToast = (msg) => {
    if (!toast) return;
    toast.textContent = msg || '';
    toast.setAttribute('data-open', 'true');
    setTimeout(() => toast.removeAttribute('data-open'), 2200);
  };

  const confirmModal = {
    root: $('#maConfirmModal'),
    title: $('#maConfirmTitle'),
    message: $('#maConfirmMessage'),
    okBtn: $('#maConfirmOk'),
    cancelBtn: $('#maConfirmCancel')
  };

  const openConfirm = (message, opts = {}) => new Promise((resolve) => {
    if (!confirmModal.root) { resolve(confirm(message)); return; }
    if (confirmModal.title) confirmModal.title.textContent = opts.title || 'Επιβεβαίωση';
    if (confirmModal.message) confirmModal.message.textContent = message || '';
    confirmModal.okBtn.textContent = opts.okLabel || 'OK';
    confirmModal.root.setAttribute('data-open', 'true');
    confirmModal.root.setAttribute('aria-hidden', 'false');

    const close = (result) => {
      confirmModal.root.removeAttribute('data-open');
      confirmModal.root.setAttribute('aria-hidden', 'true');
      confirmModal.okBtn.removeEventListener('click', onOk);
      confirmModal.cancelBtn.removeEventListener('click', onCancel);
      confirmModal.root.removeEventListener('click', onBackdrop);
      resolve(result);
    };
    const onOk = () => close(true);
    const onCancel = () => close(false);
    const onBackdrop = (e) => { if (e.target?.matches('[data-action="close"]')) close(false); };
    confirmModal.okBtn.addEventListener('click', onOk);
    confirmModal.cancelBtn.addEventListener('click', onCancel);
    confirmModal.root.addEventListener('click', onBackdrop);
  });

  const setStatus = (el, msg, kind) => {
    if (!el) return;
    el.textContent = msg || '';
    el.setAttribute('data-kind', kind || '');
  };

  const authRedirect = () => {
    const next = encodeURIComponent('/admin/moveathens-ui');
    window.location.href = `/admin-home.html?next=${next}`;
  };

  // ========================================
  // STATE
  // ========================================
  let CONFIG = {};
  let editingCategoryId = null;
  let editingDestinationId = null;
  let editingVehicleId = null;
  let editingZoneId = null;

  // ========================================
  // API HELPERS
  // ========================================
  const api = async (url, method = 'GET', body = null) => {
    const opts = { method, credentials: 'include' };
    if (body) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (res.status === 401 || res.status === 403) { authRedirect(); return null; }
    return res;
  };

  const loadConfig = async () => {
    const res = await api('/api/admin/moveathens/ui-config');
    if (!res) return;
    if (!res.ok) { showToast('Σφάλμα φόρτωσης'); return; }
    CONFIG = await res.json();
    return CONFIG;
  };

  // ========================================
  // TAB NAVIGATION
  // ========================================
  const initTabs = () => {
    $$('.bar-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.bar-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        $$('.tab-content').forEach(c => c.classList.remove('active'));
        $(`.tab-content[data-tab="${tabName}"]`)?.classList.add('active');
      });
    });
  };

  // ========================================
  // GENERAL TAB (UI Config)
  // ========================================
  const initGeneralTab = () => {
    const form = $('#ma-form');
    const status = $('#ma-status');
    const fields = {
      heroVideoFile: $('#heroVideoFile'),
      heroVideoUploadBtn: $('#heroVideoUploadBtn'),
      heroLogoFile: $('#heroLogoFile'),
      heroLogoUploadBtn: $('#heroLogoUploadBtn'),
      heroLogoUrl: $('#heroLogoUrl'),
      heroHeadline: $('#heroHeadline'),
      heroSubtext: $('#heroSubtext'),
      footerHome: $('#footerHome'),
      footerPrices: $('#footerPrices'),
      footerCta: $('#footerCta'),
      footerInfo: $('#footerInfo'),
      footerContext: $('#footerContext'),
      footerIconHomeFile: $('#footerIconHomeFile'),
      footerIconHomeUpload: $('#footerIconHomeUpload'),
      footerIconHomeUrl: $('#footerIconHomeUrl'),
      footerIconPricesFile: $('#footerIconPricesFile'),
      footerIconPricesUpload: $('#footerIconPricesUpload'),
      footerIconPricesUrl: $('#footerIconPricesUrl'),
      footerIconCtaFile: $('#footerIconCtaFile'),
      footerIconCtaUpload: $('#footerIconCtaUpload'),
      footerIconCtaUrl: $('#footerIconCtaUrl'),
      footerIconInfoFile: $('#footerIconInfoFile'),
      footerIconInfoUpload: $('#footerIconInfoUpload'),
      footerIconInfoUrl: $('#footerIconInfoUrl'),
      footerIconContextFile: $('#footerIconContextFile'),
      footerIconContextUpload: $('#footerIconContextUpload'),
      footerIconContextUrl: $('#footerIconContextUrl'),
      phoneNumber: $('#phoneNumber'),
      whatsappNumber: $('#whatsappNumber'),
      companyEmail: $('#companyEmail')
    };

    const populate = () => {
      if (fields.heroLogoUrl) fields.heroLogoUrl.value = CONFIG.heroLogoUrl || '';
      if (fields.heroHeadline) fields.heroHeadline.value = CONFIG.heroHeadline || '';
      if (fields.heroSubtext) fields.heroSubtext.value = CONFIG.heroSubtext || '';
      if (fields.footerHome) fields.footerHome.value = CONFIG.footerLabels?.home || '';
      if (fields.footerPrices) fields.footerPrices.value = CONFIG.footerLabels?.prices || '';
      if (fields.footerCta) fields.footerCta.value = CONFIG.footerLabels?.cta || '';
      if (fields.footerInfo) fields.footerInfo.value = CONFIG.footerLabels?.info || '';
      if (fields.footerContext) fields.footerContext.value = CONFIG.footerLabels?.context || '';
      if (fields.footerIconHomeUrl) fields.footerIconHomeUrl.value = CONFIG.footerIcons?.home || '';
      if (fields.footerIconPricesUrl) fields.footerIconPricesUrl.value = CONFIG.footerIcons?.prices || '';
      if (fields.footerIconCtaUrl) fields.footerIconCtaUrl.value = CONFIG.footerIcons?.cta || '';
      if (fields.footerIconInfoUrl) fields.footerIconInfoUrl.value = CONFIG.footerIcons?.info || '';
      if (fields.footerIconContextUrl) fields.footerIconContextUrl.value = CONFIG.footerIcons?.context || '';
      if (fields.phoneNumber) fields.phoneNumber.value = CONFIG.phoneNumber || '';
      if (fields.whatsappNumber) fields.whatsappNumber.value = CONFIG.whatsappNumber || '';
      if (fields.companyEmail) fields.companyEmail.value = CONFIG.companyEmail || '';
    };

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        setStatus(status, '', '');
        const payload = {
          heroLogoUrl: fields.heroLogoUrl?.value || '',
          heroHeadline: fields.heroHeadline?.value || '',
          heroSubtext: fields.heroSubtext?.value || '',
          footerLabels: {
            home: fields.footerHome?.value || '',
            prices: fields.footerPrices?.value || '',
            cta: fields.footerCta?.value || '',
            info: fields.footerInfo?.value || '',
            context: fields.footerContext?.value || ''
          },
          footerIcons: {
            home: fields.footerIconHomeUrl?.value || '',
            prices: fields.footerIconPricesUrl?.value || '',
            cta: fields.footerIconCtaUrl?.value || '',
            info: fields.footerIconInfoUrl?.value || '',
            context: fields.footerIconContextUrl?.value || ''
          },
          phoneNumber: fields.phoneNumber?.value || '',
          whatsappNumber: fields.whatsappNumber?.value || '',
          companyEmail: fields.companyEmail?.value || ''
        };
        const res = await api('/api/admin/moveathens/ui-config', 'POST', payload);
        if (!res) return;
        if (res.ok) {
          showToast('Αποθηκεύτηκε');
          setStatus(status, 'Saved', 'ok');
        } else {
          const err = await res.json().catch(() => ({}));
          setStatus(status, err.error || 'Σφάλμα', 'error');
        }
      });
    }

    // Upload handlers
    const uploadFile = async (endpoint, fileInput, fieldName, onSuccess) => {
      const file = fileInput?.files?.[0];
      if (!file) { showToast('Επίλεξε αρχείο'); return; }
      const fd = new FormData();
      fd.append(fieldName, file);
      const res = await fetch(endpoint, { method: 'POST', credentials: 'include', body: fd });
      if (res.status === 401 || res.status === 403) { authRedirect(); return; }
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        onSuccess(data.url);
        showToast('Upload OK');
      } else {
        showToast(data.error || 'Upload failed');
      }
    };

    fields.heroVideoUploadBtn?.addEventListener('click', () => {
      uploadFile('/api/admin/moveathens/upload-hero-video', fields.heroVideoFile, 'video', () => {});
    });

    fields.heroLogoUploadBtn?.addEventListener('click', () => {
      uploadFile('/api/admin/moveathens/upload-hero-logo', fields.heroLogoFile, 'logo', (url) => {
        if (fields.heroLogoUrl) fields.heroLogoUrl.value = url;
      });
    });

    ['Home', 'Prices', 'Cta', 'Info', 'Context'].forEach(key => {
      const uploadBtn = fields[`footerIcon${key}Upload`];
      const fileInput = fields[`footerIcon${key}File`];
      const urlField = fields[`footerIcon${key}Url`];
      const apiKey = key.toLowerCase();
      uploadBtn?.addEventListener('click', () => {
        uploadFile(`/api/admin/moveathens/upload-footer-icon?key=${apiKey}`, fileInput, 'icon', (url) => {
          if (urlField) urlField.value = url;
        });
      });
    });

    return { populate };
  };

  // ========================================
  // CATEGORIES TAB
  // ========================================
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

    const updateIconPreview = () => {
      const url = fIcon?.value;
      if (fIconPreview) {
        // If it's an emoji (short text), hide preview
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
      const cats = CONFIG.destinationCategories || [];
      if (!cats.length) {
        list.innerHTML = '<p class="ma-empty">Δεν υπάρχουν κατηγορίες.</p>';
        return;
      }
      list.innerHTML = cats.map(c => {
        const isIconUrl = c.icon && c.icon.length > 4 && (c.icon.startsWith('/') || c.icon.startsWith('http'));
        const iconDisplay = isIconUrl 
          ? `<img src="${c.icon}" alt="" class="ma-cat-icon-img">`
          : `<span class="ma-cat-icon">${c.icon || '📁'}</span>`;
        return `
          <div class="ma-zone-card" data-id="${c.id}">
            <div class="ma-zone-card__header">
              <div class="ma-zone-card__title">
                ${iconDisplay}
                <h4>${c.name}</h4>
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
      editingCategoryId = null;
      fName.value = '';
      fIcon.value = '';
      if (fIconFile) fIconFile.value = '';
      fOrder.value = '0';
      fActive.checked = true;
      updateIconPreview();
      setStatus(status, '', '');
    };

    const editCategory = (id) => {
      const cat = (CONFIG.destinationCategories || []).find(c => c.id === id);
      if (!cat) return;
      editingCategoryId = id;
      fName.value = cat.name || '';
      fIcon.value = cat.icon || '';
      fOrder.value = cat.display_order || 0;
      fActive.checked = cat.is_active !== false;
      updateIconPreview();
      form.hidden = false;
    };

    // Icon upload handler
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

    // Update preview when icon field changes
    fIcon?.addEventListener('input', updateIconPreview);

    const saveCategories = async (categories) => {
      const res = await api('/api/admin/moveathens/destination-categories', 'PUT', { categories });
      if (!res) return false;
      if (res.ok) {
        const data = await res.json();
        CONFIG.destinationCategories = data.categories || [];
        return true;
      }
      const err = await res.json().catch(() => ({}));
      setStatus(status, err.error || 'Σφάλμα', 'error');
      return false;
    };

    const deleteCategory = async (id) => {
      const cats = (CONFIG.destinationCategories || []).filter(c => c.id !== id);
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

      let cats = [...(CONFIG.destinationCategories || [])];
      const entry = {
        id: editingCategoryId || `dc_${Date.now()}`,
        name,
        icon: fIcon.value.trim(),
        display_order: parseInt(fOrder.value, 10) || 0,
        is_active: fActive.checked,
        created_at: new Date().toISOString()
      };

      if (editingCategoryId) {
        const idx = cats.findIndex(c => c.id === editingCategoryId);
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

  // ========================================
  // DESTINATIONS TAB
  // ========================================
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
    const fOrder = $('#maDestinationOrder');
    const fActive = $('#maDestinationActive');

    const populateDropdowns = () => {
      // Categories (only active ones)
      const activeCats = (CONFIG.destinationCategories || []).filter(c => c.is_active !== false);
      fCategory.innerHTML = '<option value="">-- Επιλογή Κατηγορίας --</option>' +
        activeCats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    };

    const getCategoryName = (id) => (CONFIG.destinationCategories || []).find(c => c.id === id)?.name || '—';

    const render = () => {
      populateDropdowns();
      const dests = CONFIG.destinations || [];
      if (!dests.length) {
        list.innerHTML = '<p class="ma-empty">Δεν υπάρχουν προορισμοί.</p>';
        return;
      }
      list.innerHTML = dests.map(d => `
        <div class="ma-zone-card" data-id="${d.id}">
          <div class="ma-zone-card__header">
            <div class="ma-zone-card__title">
              <h4>${d.name}</h4>
              <span class="ma-zone-status" data-active="${d.is_active}">${d.is_active ? 'Ενεργός' : 'Ανενεργός'}</span>
            </div>
          </div>
          <div class="ma-zone-meta">
            <span>Κατηγορία: ${getCategoryName(d.category_id)}</span>
            <span>Σειρά: ${d.display_order}</span>
          </div>
          ${d.description ? `<p class="ma-zone-desc">${d.description}</p>` : ''}
          <div class="ma-zone-actions">
            <button class="btn secondary btn-edit" type="button">Επεξεργασία</button>
            <button class="btn secondary btn-delete" type="button">Διαγραφή</button>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.closest('.ma-zone-card').dataset.id;
          editDestination(id);
        });
      });
      list.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.closest('.ma-zone-card').dataset.id;
          const dest = dests.find(d => d.id === id);
          if (await openConfirm(`Διαγραφή "${dest?.name}"?`, { title: 'Διαγραφή Προορισμού', okLabel: 'Διαγραφή' })) {
            deleteDestination(id);
          }
        });
      });
    };

    const resetForm = () => {
      form.hidden = true;
      editingDestinationId = null;
      fName.value = '';
      fDesc.value = '';
      fCategory.value = '';
      fOrder.value = '0';
      fActive.checked = true;
      setStatus(status, '', '');
    };

    const editDestination = (id) => {
      populateDropdowns();
      const dest = (CONFIG.destinations || []).find(d => d.id === id);
      if (!dest) return;
      editingDestinationId = id;
      fName.value = dest.name || '';
      fDesc.value = dest.description || '';
      fCategory.value = dest.category_id || '';
      fOrder.value = dest.display_order || 0;
      fActive.checked = dest.is_active !== false;
      form.hidden = false;
    };

    const saveDestinations = async (destinations) => {
      const res = await api('/api/admin/moveathens/destinations', 'PUT', { destinations });
      if (!res) return false;
      if (res.ok) {
        const data = await res.json();
        CONFIG.destinations = data.destinations || [];
        return true;
      }
      const err = await res.json().catch(() => ({}));
      setStatus(status, err.error || 'Σφάλμα', 'error');
      return false;
    };

    const deleteDestination = async (id) => {
      const dests = (CONFIG.destinations || []).filter(d => d.id !== id);
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

      let dests = [...(CONFIG.destinations || [])];
      const entry = {
        id: editingDestinationId || `dest_${Date.now()}`,
        name,
        description: fDesc.value.trim(),
        category_id: fCategory.value,
        display_order: parseInt(fOrder.value, 10) || 0,
        is_active: fActive.checked,
        created_at: new Date().toISOString()
      };

      if (editingDestinationId) {
        const idx = dests.findIndex(d => d.id === editingDestinationId);
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

  // ========================================
  // VEHICLES TAB
  // ========================================
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

    const updatePreview = () => {
      const url = fImageUrl?.value;
      if (fImagePreview) {
        fImagePreview.src = url || '';
        fImagePreview.setAttribute('data-visible', url ? 'true' : 'false');
      }
    };

    const render = () => {
      const vehicles = CONFIG.vehicleTypes || [];
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
      editingVehicleId = null;
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
      updatePreview();
      setStatus(status, '', '');
    };

    const editVehicle = (id) => {
      const v = (CONFIG.vehicleTypes || []).find(x => x.id === id);
      if (!v) return;
      editingVehicleId = id;
      fName.value = v.name || '';
      fDesc.value = v.description || '';
      if (fImageUrl) fImageUrl.value = v.imageUrl || '';
      fMaxPax.value = v.max_passengers || 4;
      fLuggageLarge.value = v.luggage_large || 0;
      fLuggageMedium.value = v.luggage_medium || 0;
      fLuggageCabin.value = v.luggage_cabin || 0;
      fOrder.value = v.display_order || 0;
      fActive.checked = v.is_active !== false;
      updatePreview();
      form.hidden = false;
    };

    const saveVehicles = async (vehicleTypes) => {
      const res = await api('/api/admin/moveathens/vehicle-types', 'PUT', { vehicleTypes });
      if (!res) return false;
      if (res.ok) {
        const data = await res.json();
        CONFIG.vehicleTypes = data.vehicleTypes || [];
        return true;
      }
      const err = await res.json().catch(() => ({}));
      setStatus(status, err.error || 'Σφάλμα', 'error');
      return false;
    };

    const deleteVehicle = async (id) => {
      const vehicles = (CONFIG.vehicleTypes || []).filter(v => v.id !== id);
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

      let vehicles = [...(CONFIG.vehicleTypes || [])];
      const entry = {
        id: editingVehicleId || `vt_${Date.now()}`,
        name,
        description: fDesc.value.trim(),
        imageUrl: fImageUrl?.value || '',
        max_passengers: parseInt(fMaxPax.value, 10) || 4,
        luggage_large: parseInt(fLuggageLarge.value, 10) || 0,
        luggage_medium: parseInt(fLuggageMedium.value, 10) || 0,
        luggage_cabin: parseInt(fLuggageCabin.value, 10) || 0,
        display_order: parseInt(fOrder.value, 10) || 0,
        is_active: fActive.checked,
        created_at: new Date().toISOString()
      };

      if (editingVehicleId) {
        const idx = vehicles.findIndex(v => v.id === editingVehicleId);
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

  // ========================================
  // ZONES TAB
  // ========================================
  const initZonesTab = () => {
    const form = $('#ma-zone-form');
    const list = $('#ma-zones-list');
    const addBtn = $('#maZoneAddBtn');
    const cancelBtn = $('#maZoneCancelBtn');
    const status = $('#maZoneStatus');
    const fName = $('#maZoneName');
    const fType = $('#maZoneType');
    const fDesc = $('#maZoneDescription');
    const fActive = $('#maZoneActive');

    // Zone type labels for display
    const zoneTypeLabels = {
      city_area: 'Κέντρο Πόλης',
      suburb: 'Προάστια',
      port: 'Λιμάνι',
      airport: 'Αεροδρόμιο'
    };

    const render = () => {
      const zones = CONFIG.transferZones || [];
      if (!zones.length) {
        list.innerHTML = '<p class="ma-empty">Δεν υπάρχουν ζώνες.</p>';
        return;
      }
      list.innerHTML = zones.map(z => `
        <div class="ma-zone-card" data-id="${z.id}">
          <div class="ma-zone-card__header">
            <div class="ma-zone-card__title">
              <h4>${z.name}</h4>
              <span class="ma-zone-type">${zoneTypeLabels[z.type] || z.type}</span>
              <span class="ma-zone-status" data-active="${z.is_active}">${z.is_active ? 'Ενεργή' : 'Ανενεργή'}</span>
            </div>
          </div>
          ${z.description ? `<p class="ma-zone-desc">${z.description}</p>` : ''}
          <div class="ma-zone-actions">
            <button class="btn secondary btn-edit" type="button">Επεξεργασία</button>
            <button class="btn secondary btn-delete" type="button">Διαγραφή</button>
          </div>
        </div>
      `).join('');

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
          if (await openConfirm(`Διαγραφή "${z?.name}"?`, { title: 'Διαγραφή Ζώνης', okLabel: 'Διαγραφή' })) {
            deleteZone(id);
          }
        });
      });
    };

    const resetForm = () => {
      form.hidden = true;
      editingZoneId = null;
      fName.value = '';
      fType.value = '';
      fDesc.value = '';
      fActive.checked = true;
      setStatus(status, '', '');
    };

    const editZone = (id) => {
      const z = (CONFIG.transferZones || []).find(x => x.id === id);
      if (!z) return;
      editingZoneId = id;
      fName.value = z.name || '';
      fType.value = z.type || '';
      fDesc.value = z.description || '';
      fActive.checked = z.is_active !== false;
      form.hidden = false;
    };

    const saveZones = async (zones) => {
      const res = await api('/api/admin/moveathens/transfer-zones', 'PUT', { zones });
      if (!res) return false;
      if (res.ok) {
        const data = await res.json();
        CONFIG.transferZones = data.zones || [];
        return true;
      }
      const err = await res.json().catch(() => ({}));
      setStatus(status, err.error || 'Σφάλμα', 'error');
      return false;
    };

    const deleteZone = async (id) => {
      const zones = (CONFIG.transferZones || []).filter(z => z.id !== id);
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
      if (!fType.value) { setStatus(status, 'Επιλέξτε τύπο', 'error'); return; }

      let zones = [...(CONFIG.transferZones || [])];
      const entry = {
        id: editingZoneId || `tz_${Date.now()}`,
        name,
        type: fType.value,
        description: fDesc.value.trim(),
        is_active: fActive.checked,
        created_at: new Date().toISOString()
      };

      if (editingZoneId) {
        const idx = zones.findIndex(z => z.id === editingZoneId);
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

    return { render };
  };

  // ========================================
  // PRICING TAB (Zone → Destination → Tariff → Vehicle)
  // ========================================
  const initPricingTab = () => {
    const originSelect = $('#maPriceOriginZone');
    const destSelect = $('#maPriceDestination');
    const tariffSelect = $('#maPriceTariff');
    const loadBtn = $('#maPriceLoadBtn');
    const form = $('#ma-pricing-form');
    const grid = $('#ma-pricing-grid');
    const status = $('#maPriceStatus');

    // Zone type labels for UI
    const zoneTypeLabels = {
      city_area: 'Κέντρο Πόλης',
      suburb: 'Προάστια',
      port: 'Λιμάνι',
      airport: 'Αεροδρόμιο'
    };

    // Tariff labels for UI
    const tariffLabels = {
      day: '☀️ Ημερήσια (05:00 - 00:00)',
      night: '🌙 Νυχτερινή (00:00 - 05:00)'
    };

    const populateDropdowns = () => {
      // Origin: ALL active zones
      const zones = (CONFIG.transferZones || []).filter(z => z.is_active !== false);
      const typeLabel = (type) => zoneTypeLabels[type] || type;
      originSelect.innerHTML = '<option value="">-- Επιλογή Ζώνης Ξενοδοχείου --</option>' +
        zones.map(z => `<option value="${z.id}">${z.name} (${typeLabel(z.type)})</option>`).join('');

      // Destination: ALL active destinations (grouped by category)
      const destinations = (CONFIG.destinations || []).filter(d => d.is_active !== false);
      const categories = CONFIG.destinationCategories || [];
      const getCatName = (catId) => categories.find(c => c.id === catId)?.name || 'Χωρίς κατηγορία';
      
      // Group by category
      const grouped = {};
      destinations.forEach(d => {
        const catName = getCatName(d.category_id);
        if (!grouped[catName]) grouped[catName] = [];
        grouped[catName].push(d);
      });

      let destOpts = '<option value="">-- Επιλογή Προορισμού --</option>';
      Object.keys(grouped).sort().forEach(catName => {
        destOpts += `<optgroup label="${catName}">`;
        grouped[catName].forEach(d => {
          destOpts += `<option value="${d.id}">${d.name}</option>`;
        });
        destOpts += '</optgroup>';
      });
      destSelect.innerHTML = destOpts;

      if (typeof console !== 'undefined' && console.log) {
        console.log('[Pricing] Zones:', zones.length, '| Destinations:', destinations.length);
      }
    };

    const render = () => {
      populateDropdowns();
      form.hidden = true;
    };

    const loadPrices = () => {
      const originZoneId = originSelect.value;
      const destinationId = destSelect.value;
      const tariff = tariffSelect?.value || 'day';
      if (!originZoneId || !destinationId) {
        showToast('Επιλέξτε ζώνη ξενοδοχείου και προορισμό');
        return;
      }
      const vehicles = (CONFIG.vehicleTypes || []).filter(v => v.is_active !== false);
      const prices = CONFIG.transferPrices || [];

      // Show current tariff in UI
      const tariffLabel = tariffLabels[tariff] || tariff;
      grid.innerHTML = `<div class="ma-tariff-indicator">Ταρίφα: ${tariffLabel}</div>` + 
        vehicles.map(v => {
        // Find price for this origin_zone + destination + vehicle + tariff
        const existing = prices.find(p =>
          p.origin_zone_id === originZoneId &&
          p.destination_id === destinationId &&
          p.vehicle_type_id === v.id &&
          (p.tariff || 'day') === tariff
        );
        const price = existing ? existing.price : '';
        return `
          <div class="ma-price-row">
            <div>
              <strong>${v.name}</strong>
              <span class="ma-muted">(👤${v.max_passengers})</span>
            </div>
            <input type="number" class="input price-input" data-vehicle="${v.id}" min="0" step="0.01" value="${price}" placeholder="€">
          </div>
        `;
      }).join('');

      form.hidden = false;
    };

    loadBtn?.addEventListener('click', loadPrices);

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setStatus(status, '', '');

      const originZoneId = originSelect.value;
      const destinationId = destSelect.value;
      const tariff = tariffSelect?.value || 'day';
      if (!originZoneId || !destinationId) return;

      // Collect all prices
      const inputs = grid.querySelectorAll('.price-input');
      let newPrices = [...(CONFIG.transferPrices || [])];

      // Remove existing prices for this origin_zone + destination + tariff combo
      newPrices = newPrices.filter(p =>
        !(p.origin_zone_id === originZoneId && p.destination_id === destinationId && (p.tariff || 'day') === tariff)
      );

      // Add new prices
      inputs.forEach(input => {
        const vehicleId = input.dataset.vehicle;
        const price = parseFloat(input.value);
        if (Number.isFinite(price) && price >= 0) {
          newPrices.push({
            id: `tp_${Date.now()}_${vehicleId}_${tariff}`,
            origin_zone_id: originZoneId,
            destination_id: destinationId,
            vehicle_type_id: vehicleId,
            tariff,
            price
          });
        }
      });

      const res = await api('/api/admin/moveathens/transfer-prices', 'PUT', { transferPrices: newPrices });
      if (!res) return;
      if (res.ok) {
        const data = await res.json();
        CONFIG.transferPrices = data.transferPrices || [];
        showToast('Τιμές αποθηκεύτηκαν');
        setStatus(status, 'Saved', 'ok');
      } else {
        const err = await res.json().catch(() => ({}));
        setStatus(status, err.error || 'Σφάλμα', 'error');
      }
    });

    return { render };
  };

  // ========================================
  // INFO PAGE TAB
  // ========================================
  const initInfoPageTab = () => {
    const form = $('#ma-infopage-form');
    const titleInput = $('#maInfoPageTitle');
    const contentInput = $('#maInfoPageContent');
    const saveBtn = $('#maInfoPageSaveBtn');
    const status = $('#maInfoPageStatus');
    const preview = $('#maInfoPagePreview');

    // Simple markdown-like parser
    const parseContent = (text) => {
      if (!text) return '';
      // Escape HTML
      let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      // Bold: **text**
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      // Italic: *text*
      html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      // Lists: lines starting with -
      html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
      html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
      // Paragraphs: double newlines
      html = html.split(/\n\n+/).map(p => {
        p = p.trim();
        if (!p) return '';
        if (p.startsWith('<ul>') || p.startsWith('<li>')) return p;
        return `<p>${p.replace(/\n/g, '<br>')}</p>`;
      }).join('');
      
      return html;
    };

    const updatePreview = () => {
      if (preview) {
        const title = titleInput?.value || '';
        const content = contentInput?.value || '';
        let html = '';
        if (title) html += `<h2 style="margin:0 0 12px;font-size:20px;">${title.replace(/</g,'&lt;')}</h2>`;
        html += parseContent(content);
        preview.innerHTML = html || '<span style="color:#999;">Η προεπισκόπηση θα εμφανιστεί εδώ...</span>';
      }
    };

    const populate = () => {
      if (titleInput) titleInput.value = CONFIG.infoPageTitle || '';
      if (contentInput) contentInput.value = CONFIG.infoPageContent || '';
      updatePreview();
    };

    // Live preview on input
    if (titleInput) titleInput.addEventListener('input', updatePreview);
    if (contentInput) contentInput.addEventListener('input', updatePreview);

    // Save
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        setStatus(status, 'Αποθήκευση...', '');

        const payload = {
          infoPageTitle: titleInput?.value || '',
          infoPageContent: contentInput?.value || ''
        };

        const res = await api('/api/admin/moveathens/ui-config', 'PUT', payload);
        if (!res) return;

        if (res.ok) {
          const data = await res.json();
          Object.assign(CONFIG, data);
          showToast('Αποθηκεύτηκε!');
          setStatus(status, '✓ Αποθηκεύτηκε', 'ok');
        } else {
          const err = await res.json().catch(() => ({}));
          setStatus(status, err.error || 'Σφάλμα', 'error');
        }
      });
    }

    return { populate };
  };

  // ========================================
  // INIT
  // ========================================
  const init = async () => {
    initTabs();
    const generalTab = initGeneralTab();
    const categoriesTab = initCategoriesTab();
    const destinationsTab = initDestinationsTab();
    const vehiclesTab = initVehiclesTab();
    const zonesTab = initZonesTab();
    const pricingTab = initPricingTab();
    const infoPageTab = initInfoPageTab();

    await loadConfig();

    generalTab.populate();
    categoriesTab.render();
    destinationsTab.render();
    vehiclesTab.render();
    zonesTab.render();
    pricingTab.render();
    infoPageTab.populate();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
