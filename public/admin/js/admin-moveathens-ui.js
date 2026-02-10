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
  let configLoaded = false;
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
    if (!res) { console.error('[admin-ma] loadConfig: no response (auth redirect?)'); return; }
    if (!res.ok) { console.error('[admin-ma] loadConfig: status', res.status); showToast('Σφάλμα φόρτωσης'); return; }
    CONFIG = await res.json();
    configLoaded = true;
    console.log('[admin-ma] Config loaded OK — zones:', (CONFIG.transferZones||[]).length,
      'vehicles:', (CONFIG.vehicleTypes||[]).length,
      'prices:', (CONFIG.transferPrices||[]).length);
    return CONFIG;
  };

  /** Guard: prevent saves if config never loaded (would wipe data) */
  const ensureConfigLoaded = () => {
    if (!configLoaded) {
      showToast('⚠️ Config δεν φορτώθηκε — δεν επιτρέπεται αποθήκευση. Ξαναφόρτωσε τη σελίδα.');
      console.error('[admin-ma] Save blocked: configLoaded =', configLoaded);
      return false;
    }
    return true;
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

      // Price visibility toggle
      const priceToggle = document.getElementById('showPriceToggle');
      if (priceToggle) {
        priceToggle.checked = CONFIG.showPriceInMessage !== false; // default ON
      }
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
          companyEmail: fields.companyEmail?.value || '',
          showPriceInMessage: document.getElementById('showPriceToggle')?.checked !== false
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
      uploadFile('/api/admin/moveathens/upload-hero-video', fields.heroVideoFile, 'video', (url) => {
        // Update CONFIG with new video URL
        CONFIG.heroVideoUrl = url;
        showToast('Video uploaded! URL: ' + url);
      });
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
      if (!ensureConfigLoaded()) return false;
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
    const fRouteType = $('#maDestinationRouteType');

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
            <span>Τύπος: ${{airport:'✈️ Αεροδρόμιο',port:'⚓ Λιμάνι',city:'🏙️ Πόλη',travel:'🚗 Ταξίδια'}[d.route_type] || '— Δεν έχει οριστεί'}</span>
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
      if (fRouteType) fRouteType.value = '';
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
      if (fRouteType) fRouteType.value = dest.route_type || '';
      form.hidden = false;
    };

    const saveDestinations = async (destinations) => {
      if (!ensureConfigLoaded()) return false;
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
        route_type: fRouteType ? fRouteType.value || null : null,
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
      if (fAllowInstant) fAllowInstant.checked = true;
      if (fMinAdvance) fMinAdvance.value = '0';
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
        allow_instant: fAllowInstant?.checked ?? true,
        min_advance_minutes: parseInt(fMinAdvance?.value, 10) || 0,
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
  // HOTELS TAB (was ZONES)
  // ========================================
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
    const fAccommodationType = $('#maZoneAccommodationType');
    const fActive = $('#maZoneActive');

    const accommodationLabels = {
      hotel: 'Ξενοδοχείο',
      rental_rooms: 'Ενοικιαζόμενα Δωμάτια'
    };

    const render = () => {
      const zones = CONFIG.transferZones || [];
      if (!zones.length) {
        list.innerHTML = '<p class="ma-empty">Δεν υπάρχουν ξενοδοχεία.</p>';
        return;
      }
      list.innerHTML = zones.map(z => `
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
            ${z.phone ? `<span>📞 ${z.phone}</span>` : ''}
            ${z.email ? `<span>✉️ ${z.email}</span>` : ''}
          </div>
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
          if (await openConfirm(`Διαγραφή "${z?.name}"?`, { title: 'Διαγραφή Ξενοδοχείου', okLabel: 'Διαγραφή' })) {
            deleteZone(id);
          }
        });
      });
    };

    const resetForm = () => {
      form.hidden = true;
      editingZoneId = null;
      fName.value = '';
      if (fMunicipality) fMunicipality.value = '';
      if (fAddress) fAddress.value = '';
      if (fPhone) fPhone.value = '';
      if (fEmail) fEmail.value = '';
      if (fAccommodationType) fAccommodationType.value = 'hotel';
      fActive.checked = true;
      setStatus(status, '', '');
    };

    const editZone = (id) => {
      const z = (CONFIG.transferZones || []).find(x => x.id === id);
      if (!z) return;
      editingZoneId = id;
      fName.value = z.name || '';
      if (fMunicipality) fMunicipality.value = z.municipality || '';
      if (fAddress) fAddress.value = z.address || '';
      if (fPhone) fPhone.value = z.phone || '';
      if (fEmail) fEmail.value = z.email || '';
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

      let zones = [...(CONFIG.transferZones || [])];
      const entry = {
        id: editingZoneId || `tz_${Date.now()}`,
        name,
        type: 'suburb',
        description: '',
        municipality: (fMunicipality?.value || '').trim(),
        address: (fAddress?.value || '').trim(),
        phone: (fPhone?.value || '').trim(),
        email: (fEmail?.value || '').trim(),
        accommodation_type: fAccommodationType?.value || 'hotel',
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
  // PRICING TAB (Hotel → Destination → Tariff → Vehicle + Commissions)
  // ========================================
  const initPricingTab = () => {
    const originHidden = $('#maPriceOriginZone');
    const hotelSearch = $('#maPriceHotelSearch');
    const hotelDropdown = $('#maPriceHotelDropdown');
    const destSelect = $('#maPriceDestination');
    const tariffSelect = $('#maPriceTariff');
    const loadBtn = $('#maPriceLoadBtn');
    const form = $('#ma-pricing-form');
    const grid = $('#ma-pricing-grid');
    const status = $('#maPriceStatus');

    // Tariff labels for UI
    const tariffLabels = {
      day: '☀️ Ημερήσια (05:00 - 00:00)',
      night: '🌙 Νυχτερινή (00:00 - 05:00)'
    };

    // ---- Hotel autocomplete ----
    let allHotels = [];
    let selectedHotelName = '';

    const populateHotelList = () => {
      allHotels = (CONFIG.transferZones || []).filter(z => z.is_active !== false);
    };

    const showDropdown = (matches) => {
      if (!matches.length) { hotelDropdown.hidden = true; return; }
      hotelDropdown.innerHTML = matches.map(h =>
        `<div class="ma-ac-item" data-id="${h.id}">${h.name}${h.municipality ? ' <span class="ma-muted">(' + h.municipality + ')</span>' : ''}</div>`
      ).join('');
      hotelDropdown.hidden = false;

      hotelDropdown.querySelectorAll('.ma-ac-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const id = item.dataset.id;
          const hotel = allHotels.find(h => h.id === id);
          if (hotel) {
            originHidden.value = hotel.id;
            hotelSearch.value = hotel.name;
            selectedHotelName = hotel.name;
          }
          hotelDropdown.hidden = true;
          // Auto-load if destination also selected
          if (originHidden.value && destSelect.value) loadPrices();
        });
      });
    };

    hotelSearch?.addEventListener('input', () => {
      const q = hotelSearch.value.trim().toLowerCase();
      if (q.length < 2) { hotelDropdown.hidden = true; return; }
      const matches = allHotels.filter(h =>
        h.name.toLowerCase().includes(q) ||
        (h.municipality || '').toLowerCase().includes(q)
      );
      showDropdown(matches);
    });

    hotelSearch?.addEventListener('focus', () => {
      const q = hotelSearch.value.trim().toLowerCase();
      if (q.length >= 2) {
        const matches = allHotels.filter(h =>
          h.name.toLowerCase().includes(q) ||
          (h.municipality || '').toLowerCase().includes(q)
        );
        showDropdown(matches);
      }
    });

    hotelSearch?.addEventListener('blur', () => {
      setTimeout(() => { hotelDropdown.hidden = true; }, 200);
    });

    // ---- Destination dropdown ----
    const populateDestinations = () => {
      const destinations = (CONFIG.destinations || []).filter(d => d.is_active !== false);
      const categories = CONFIG.destinationCategories || [];
      const getCatName = (catId) => categories.find(c => c.id === catId)?.name || 'Χωρίς κατηγορία';
      
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
    };

    const render = () => {
      populateHotelList();
      populateDestinations();
      form.hidden = true;
      // Restore search text if hotel already selected
      if (originHidden.value && selectedHotelName) {
        hotelSearch.value = selectedHotelName;
      }
    };

    // ---- Commission validation ----
    const validateCommissions = () => {
      const rows = grid.querySelectorAll('.ma-price-row');
      let allOk = true;
      rows.forEach(row => {
        const priceInput = row.querySelector('.price-input');
        const driverInput = row.querySelector('.comm-driver');
        const hotelInput = row.querySelector('.comm-hotel');
        const serviceInput = row.querySelector('.comm-service');
        if (!priceInput) return;

        const total = parseFloat(priceInput.value) || 0;
        const driver = parseFloat(driverInput?.value) || 0;
        const hotel = parseFloat(hotelInput?.value) || 0;
        const service = parseFloat(serviceInput?.value) || 0;
        const sumComm = driver + hotel + service;

        const errorEl = row.querySelector('.ma-comm-error');
        if (sumComm > total && total > 0) {
          if (errorEl) {
            errorEl.textContent = `⚠️ Σύνολο προμηθειών (${sumComm.toFixed(2)}€) > τιμή (${total.toFixed(2)}€)`;
            errorEl.hidden = false;
          }
          allOk = false;
        } else {
          if (errorEl) errorEl.hidden = true;
        }
      });
      return allOk;
    };

    const loadPrices = () => {
      const originZoneId = originHidden.value;
      const destinationId = destSelect.value;
      const tariff = tariffSelect?.value || 'day';
      if (!originZoneId || !destinationId) {
        showToast('Επιλέξτε ξενοδοχείο και προορισμό');
        return;
      }
      const vehicles = (CONFIG.vehicleTypes || []).filter(v => v.is_active !== false);
      const prices = CONFIG.transferPrices || [];

      const tariffLabel = tariffLabels[tariff] || tariff;
      grid.innerHTML = `
        <div class="ma-tariff-indicator">Ταρίφα: ${tariffLabel}</div>
        <div class="ma-price-header">
          <span>Όχημα</span>
          <span>Συνολικό Κόστος (€)</span>
          <span>Προμήθεια Οδηγού (€)</span>
          <span>Προμήθεια Ξενοδοχείου (€)</span>
          <span>Προμήθεια Υπηρεσίας (€)</span>
        </div>
      ` + vehicles.map(v => {
        const existing = prices.find(p =>
          p.origin_zone_id === originZoneId &&
          p.destination_id === destinationId &&
          p.vehicle_type_id === v.id &&
          (p.tariff || 'day') === tariff
        );
        const price = existing ? existing.price : '';
        const commDriver = existing ? (existing.commission_driver || '') : '';
        const commHotel = existing ? (existing.commission_hotel || '') : '';
        const commService = existing ? (existing.commission_service || '') : '';
        return `
          <div class="ma-price-row" data-vehicle="${v.id}">
            <div class="ma-price-vehicle">
              <strong>${v.name}</strong>
              <span class="ma-muted">(👤${v.max_passengers})</span>
            </div>
            <input type="number" class="input price-input" data-vehicle="${v.id}" min="0" step="0.01" value="${price}" placeholder="€" title="Συνολικό κόστος">
            <input type="number" class="input comm-driver" min="0" step="0.01" value="${commDriver}" placeholder="€" title="Προμήθεια οδηγού">
            <input type="number" class="input comm-hotel" min="0" step="0.01" value="${commHotel}" placeholder="€" title="Προμήθεια ξενοδοχείου">
            <input type="number" class="input comm-service" min="0" step="0.01" value="${commService}" placeholder="€" title="Προμήθεια υπηρεσίας">
            <div class="ma-comm-error" hidden></div>
          </div>
        `;
      }).join('');

      // Live validation on input
      grid.querySelectorAll('input[type="number"]').forEach(inp => {
        inp.addEventListener('input', validateCommissions);
      });

      form.hidden = false;
    };

    loadBtn?.addEventListener('click', loadPrices);

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!ensureConfigLoaded()) return;
      setStatus(status, '', '');

      if (!validateCommissions()) {
        setStatus(status, 'Οι προμήθειες δεν μπορούν να υπερβαίνουν το συνολικό κόστος', 'error');
        return;
      }

      const originZoneId = originHidden.value;
      const destinationId = destSelect.value;
      const tariff = tariffSelect?.value || 'day';
      if (!originZoneId || !destinationId) return;

      // Collect all prices
      const rows = grid.querySelectorAll('.ma-price-row');
      let newPrices = [...(CONFIG.transferPrices || [])];

      // Remove existing prices for this combo
      newPrices = newPrices.filter(p =>
        !(p.origin_zone_id === originZoneId && p.destination_id === destinationId && (p.tariff || 'day') === tariff)
      );

      // Add new prices
      rows.forEach(row => {
        const vehicleId = row.dataset.vehicle;
        if (!vehicleId) return;
        const priceInput = row.querySelector('.price-input');
        const price = parseFloat(priceInput?.value);
        if (!Number.isFinite(price) || price < 0) return;

        const commDriver = parseFloat(row.querySelector('.comm-driver')?.value) || 0;
        const commHotel = parseFloat(row.querySelector('.comm-hotel')?.value) || 0;
        const commService = parseFloat(row.querySelector('.comm-service')?.value) || 0;

        newPrices.push({
          id: `tp_${Date.now()}_${vehicleId}_${tariff}`,
          origin_zone_id: originZoneId,
          destination_id: destinationId,
          vehicle_type_id: vehicleId,
          tariff,
          price,
          commission_driver: commDriver,
          commission_hotel: commHotel,
          commission_service: commService
        });
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

    // Auto-load on destination/tariff change
    destSelect?.addEventListener('change', () => {
      if (originHidden.value && destSelect.value) loadPrices();
      else { form.hidden = true; grid.innerHTML = ''; }
    });

    tariffSelect?.addEventListener('change', () => {
      if (originHidden.value && destSelect.value) loadPrices();
    });

    return { render };
  };

  // ========================================
  // INFO PAGE TAB
  // ========================================
  const initInfoPageTab = () => {
    const form = $('#ma-infopage-form');
    // General info
    const titleInput = $('#maInfoPageTitle');
    const contentInput = $('#maInfoPageContent');
    // Cancellation policy
    const cancellationTitleInput = $('#maInfoCancellationTitle');
    const cancellationContentInput = $('#maInfoCancellationContent');
    // Compliance policy
    const complianceTitleInput = $('#maInfoComplianceTitle');
    const complianceContentInput = $('#maInfoComplianceContent');
    // FAQ
    const faqTitleInput = $('#maInfoFaqTitle');
    const faqContentInput = $('#maInfoFaqContent');
    
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

    // Render a single section for preview
    const renderSection = (title, content, icon) => {
      if (!title && !content) return '';
      let html = '<div class="ma-preview-section-divider"></div>';
      if (title) {
        html += `<h3>${icon ? icon + ' ' : ''}${title.replace(/</g,'&lt;')}</h3>`;
      }
      html += parseContent(content);
      return html;
    };

    const updatePreview = () => {
      if (preview) {
        let html = '';
        
        // Section 1: General info (first section - no divider)
        const title1 = titleInput?.value || '';
        const content1 = contentInput?.value || '';
        if (title1 || content1) {
          if (title1) html += `<h3>📍 ${title1.replace(/</g,'&lt;')}</h3>`;
          html += parseContent(content1);
        }
        
        // Section 2: Cancellation
        html += renderSection(
          cancellationTitleInput?.value,
          cancellationContentInput?.value,
          '🚫'
        );
        
        // Section 3: Compliance
        html += renderSection(
          complianceTitleInput?.value,
          complianceContentInput?.value,
          '📋'
        );
        
        // Section 4: FAQ
        html += renderSection(
          faqTitleInput?.value,
          faqContentInput?.value,
          '❓'
        );
        
        preview.innerHTML = html || '<span style="color:#999;">Η προεπισκόπηση θα εμφανιστεί εδώ...</span>';
      }
    };

    const populate = () => {
      // General info
      if (titleInput) titleInput.value = CONFIG.infoPageTitle || '';
      if (contentInput) contentInput.value = CONFIG.infoPageContent || '';
      // Cancellation
      if (cancellationTitleInput) cancellationTitleInput.value = CONFIG.infoCancellationTitle || '';
      if (cancellationContentInput) cancellationContentInput.value = CONFIG.infoCancellationContent || '';
      // Compliance
      if (complianceTitleInput) complianceTitleInput.value = CONFIG.infoComplianceTitle || '';
      if (complianceContentInput) complianceContentInput.value = CONFIG.infoComplianceContent || '';
      // FAQ
      if (faqTitleInput) faqTitleInput.value = CONFIG.infoFaqTitle || '';
      if (faqContentInput) faqContentInput.value = CONFIG.infoFaqContent || '';
      
      updatePreview();
    };

    // Live preview on input - all fields
    const allInputs = [
      titleInput, contentInput,
      cancellationTitleInput, cancellationContentInput,
      complianceTitleInput, complianceContentInput,
      faqTitleInput, faqContentInput
    ];
    allInputs.forEach(input => {
      if (input) input.addEventListener('input', updatePreview);
    });

    // Save
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        setStatus(status, 'Αποθήκευση...', '');

        const payload = {
          infoPageTitle: titleInput?.value || '',
          infoPageContent: contentInput?.value || '',
          infoCancellationTitle: cancellationTitleInput?.value || '',
          infoCancellationContent: cancellationContentInput?.value || '',
          infoComplianceTitle: complianceTitleInput?.value || '',
          infoComplianceContent: complianceContentInput?.value || '',
          infoFaqTitle: faqTitleInput?.value || '',
          infoFaqContent: faqContentInput?.value || ''
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
    try {
      console.log('[admin-ma] Initializing tabs…');
      initTabs();
      const generalTab = initGeneralTab();
      const categoriesTab = initCategoriesTab();
      const destinationsTab = initDestinationsTab();
      const vehiclesTab = initVehiclesTab();
      const zonesTab = initZonesTab();
      const pricingTab = initPricingTab();
      const infoPageTab = initInfoPageTab();

      console.log('[admin-ma] Loading config from server…');
      await loadConfig();

      if (!configLoaded) {
        console.error('[admin-ma] Config failed to load — tabs will be empty.');
        return;
      }

      generalTab.populate();
      categoriesTab.render();
      destinationsTab.render();
      vehiclesTab.render();
      zonesTab.render();
      pricingTab.render();
      infoPageTab.populate();
      console.log('[admin-ma] Init complete ✔');

      // Price toggle — auto-save on change
      const priceToggle = document.getElementById('showPriceToggle');
      if (priceToggle) {
        priceToggle.addEventListener('change', async () => {
          const val = priceToggle.checked;
          const res = await api('/api/admin/moveathens/ui-config', 'PUT', { showPriceInMessage: val });
          if (res && res.ok) {
            showToast(val ? '✅ Τιμή ενεργή στο μήνυμα' : '❌ Τιμή κρυφή από το μήνυμα');
          } else {
            showToast('⚠️ Σφάλμα αποθήκευσης');
          }
        });
      }
    } catch (err) {
      console.error('[admin-ma] INIT CRASHED:', err);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
