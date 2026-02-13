/**
 * DriversSystem Admin Panel
 * Manages: General config (hero, footer, contact)
 */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const toast = $('#ds-toast');

  const showToast = (msg) => {
    if (!toast) return;
    toast.textContent = msg || '';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  };

  const setStatus = (el, msg, kind) => {
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'ds-status' + (kind ? ` ${kind}` : '');
  };

  const authRedirect = () => {
    const next = encodeURIComponent('/admin/driverssystem-ui');
    window.location.href = `/admin-home.html?next=${next}`;
  };

  let CONFIG = {};
  let configLoaded = false;


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
    const res = await api('/api/admin/driverssystem/ui-config');
    if (!res) return;
    if (!res.ok) { showToast('Σφάλμα φόρτωσης'); return; }
    CONFIG = await res.json();
    configLoaded = true;
    return CONFIG;
  };

  const ensureConfigLoaded = () => {
    if (!configLoaded) {
      showToast('⚠️ Config δεν φορτώθηκε. Ξαναφόρτωσε τη σελίδα.');
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
        const target = $(`.tab-content[data-tab="${tabName}"]`);
        if (target) target.classList.add('active');
      });
    });
  };

  // ========================================
  // GENERAL TAB - Populate & Save
  // ========================================
  const populateGeneral = () => {
    const c = CONFIG;
    const v = (id, val) => { const el = $(`#${id}`); if (el) el.value = val || ''; };
    v('heroHeadline', c.heroHeadline);
    v('heroSubtext', c.heroSubtext);
    v('heroLogoUrl', c.heroLogoUrl);

    const fl = c.footerLabels || {};
    v('footerHome', fl.home);
    v('footerListings', fl.listings);
    v('footerAssistant', fl.assistant);
    v('footerInfo', fl.info);
    v('footerProfile', fl.profile);

    const fi = c.footerIcons || {};
    v('footerIconHomeUrl', fi.home);
    v('footerIconListingsUrl', fi.listings);
    v('footerIconAssistantUrl', fi.assistant);
    v('footerIconInfoUrl', fi.info);
    v('footerIconProfileUrl', fi.profile);

    v('phoneNumber', c.phoneNumber);
    v('whatsappNumber', c.whatsappNumber);
    v('companyEmail', c.companyEmail);
  };

  const saveGeneral = async () => {
    if (!ensureConfigLoaded()) return;
    const val = (id) => ($(`#${id}`) || {}).value || '';
    const payload = Object.assign({}, CONFIG, {
      heroHeadline: val('heroHeadline'),
      heroSubtext: val('heroSubtext'),
      heroLogoUrl: val('heroLogoUrl'),
      footerLabels: {
        home: val('footerHome'),
        listings: val('footerListings'),
        assistant: val('footerAssistant'),
        info: val('footerInfo'),
        profile: val('footerProfile')
      },
      footerIcons: {
        home: val('footerIconHomeUrl'),
        listings: val('footerIconListingsUrl'),
        assistant: val('footerIconAssistantUrl'),
        info: val('footerIconInfoUrl'),
        profile: val('footerIconProfileUrl')
      },
      phoneNumber: val('phoneNumber'),
      whatsappNumber: val('whatsappNumber'),
      companyEmail: val('companyEmail')
    });

    const status = $('#ds-status');
    setStatus(status, 'Αποθήκευση…');
    const res = await api('/api/admin/driverssystem/ui-config', 'PUT', payload);
    if (!res) return;
    if (res.ok) {
      CONFIG = await res.json();
      setStatus(status, '✓ Αποθηκεύτηκε', 'ok');
      showToast('Αποθηκεύτηκε ✓');
    } else {
      const errData = await res.json().catch(() => ({}));
      setStatus(status, `Σφάλμα: ${errData.error || res.status}`, 'err');
    }
  };

  // ── Hero Logo Upload ──
  const initLogoUpload = () => {
    const btn = $('#heroLogoUploadBtn');
    const fileInput = $('#heroLogoFile');
    if (!btn || !fileInput) return;
    btn.addEventListener('click', async () => {
      if (!fileInput.files.length) { showToast('Επέλεξε αρχείο'); return; }
      const fd = new FormData();
      fd.append('file', fileInput.files[0]);
      const res = await fetch('/api/admin/driverssystem/upload-hero-logo', {
        method: 'POST', body: fd, credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        $('#heroLogoUrl').value = data.url;
        showToast('Logo uploaded ✓');
      } else {
        showToast('Upload error');
      }
    });
  };

  // ── Footer Icon Uploads ──
  const initFooterIconUploads = () => {
    const slots = ['Home', 'Listings', 'Assistant', 'Info', 'Profile'];
    const slotKeys = ['home', 'listings', 'assistant', 'info', 'profile'];
    slots.forEach((name, i) => {
      const btn = $(`#footerIcon${name}Upload`);
      const fileInput = $(`#footerIcon${name}File`);
      const urlInput = $(`#footerIcon${name}Url`);
      if (!btn || !fileInput) return;
      btn.addEventListener('click', async () => {
        if (!fileInput.files.length) { showToast('Επέλεξε αρχείο'); return; }
        const fd = new FormData();
        fd.append('file', fileInput.files[0]);
        fd.append('slot', slotKeys[i]);
        const res = await fetch('/api/admin/driverssystem/upload-footer-icon', {
          method: 'POST', body: fd, credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          if (urlInput) urlInput.value = data.url;
          showToast(`Icon ${name} uploaded ✓`);
        } else {
          showToast('Upload error');
        }
      });
    });
  };

  // ========================================
  // TRIP SOURCES TAB
  // ========================================
  let tripSources = [];
  let editingSrcIdx = -1;

  const loadTripSources = async () => {
    const res = await api('/api/admin/driverssystem/trip-sources');
    if (!res) return;
    if (res.ok) tripSources = await res.json();
  };

  const renderTripSources = () => {
    const list = $('#dsSrcList');
    if (!list) return;
    if (!tripSources.length) {
      list.innerHTML = '<p style="color:var(--ga-muted);font-size:14px;">Δεν υπάρχουν πηγές</p>';
      return;
    }
    list.innerHTML = tripSources.map((item, idx) => {
      const statusText = item.active !== false ? 'Ενεργή' : 'Ανενεργή';
      const statusClass = item.active !== false ? 'positive' : 'negative';
      return `
        <div class="ds-src-item">
          <span class="ds-src-item__dot" style="background:${item.color || '#999'}"></span>
          <span class="ds-src-item__name">${item.name || ''}</span>
          <span class="ds-src-item__commission">${item.commission || 0}%</span>
          <span class="ds-src-item__status ${statusClass}">${statusText}</span>
          <div class="ds-src-item__actions">
            <button class="btn secondary" onclick="window._dsEditSrc(${idx})">✏️</button>
            <button class="btn secondary" onclick="window._dsDeleteSrc(${idx})">🗑️</button>
          </div>
        </div>`;
    }).join('');
  };

  const initTripSources = () => {
    const addBtn = $('#dsSrcAddBtn');
    const form = $('#ds-src-form');
    const cancelBtn = $('#dsSrcCancelBtn');
    if (!addBtn || !form) return;

    addBtn.addEventListener('click', () => {
      editingSrcIdx = -1;
      $('#dsSrcName').value = '';
      $('#dsSrcCommission').value = '';
      $('#dsSrcColor').value = '#059669';
      $('#dsSrcActive').checked = true;
      form.hidden = false;
    });

    cancelBtn.addEventListener('click', () => {
      form.hidden = true;
      editingSrcIdx = -1;
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = ($('#dsSrcName') || {}).value || '';
      const commission = parseFloat(($('#dsSrcCommission') || {}).value) || 0;
      const color = ($('#dsSrcColor') || {}).value || '#059669';
      const active = $('#dsSrcActive') ? $('#dsSrcActive').checked : true;
      if (!name.trim()) { showToast('Συμπλήρωσε όνομα'); return; }

      const id = editingSrcIdx >= 0
        ? tripSources[editingSrcIdx].id
        : name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');

      const item = { id, name: name.trim(), commission, color, active };

      if (editingSrcIdx >= 0) {
        tripSources[editingSrcIdx] = item;
      } else {
        tripSources.push(item);
      }

      const res = await api('/api/admin/driverssystem/trip-sources', 'PUT', tripSources);
      if (res && res.ok) {
        tripSources = await res.json();
        showToast('Αποθηκεύτηκε ✓');
      } else {
        showToast('Σφάλμα αποθήκευσης');
      }
      form.hidden = true;
      editingSrcIdx = -1;
      renderTripSources();
    });

    window._dsEditSrc = (idx) => {
      const item = tripSources[idx];
      if (!item) return;
      editingSrcIdx = idx;
      $('#dsSrcName').value = item.name || '';
      $('#dsSrcCommission').value = item.commission || 0;
      $('#dsSrcColor').value = item.color || '#059669';
      $('#dsSrcActive').checked = item.active !== false;
      form.hidden = false;
    };

    window._dsDeleteSrc = async (idx) => {
      if (!confirm('Διαγραφή αυτής της πηγής;')) return;
      tripSources.splice(idx, 1);
      const res = await api('/api/admin/driverssystem/trip-sources', 'PUT', tripSources);
      if (res && res.ok) {
        tripSources = await res.json();
        showToast('Διαγράφηκε');
      }
      renderTripSources();
    };
  };

  // ========================================
  // CAR EXPENSE CATEGORIES TAB
  // ========================================
  let carExpCats = [];
  let editingGroupIdx = -1;
  let editingItemGroupIdx = -1;
  let editingItemIdx = -1;

  const loadCarExpCats = async () => {
    const res = await api('/api/admin/driverssystem/car-expense-categories');
    if (!res) return;
    if (res.ok) carExpCats = await res.json();
  };

  const saveCarExpCats = async () => {
    const res = await api('/api/admin/driverssystem/car-expense-categories', 'PUT', carExpCats);
    if (res && res.ok) {
      carExpCats = await res.json();
      showToast('Αποθηκεύτηκε ✓');
    } else {
      showToast('Σφάλμα αποθήκευσης');
    }
  };

  const renderCarExpCats = () => {
    const list = $('#dsCecList');
    if (!list) return;
    if (!carExpCats.length) {
      list.innerHTML = '<p style="color:var(--ga-muted);font-size:14px;">Δεν υπάρχουν ομάδες</p>';
      return;
    }
    list.innerHTML = carExpCats.map((group, gi) => {
      const statusText = group.active !== false ? 'Ενεργή' : 'Ανενεργή';
      const statusClass = group.active !== false ? 'positive' : 'negative';
      const items = Array.isArray(group.items) ? group.items : [];
      const itemsHtml = items.map((item, ii) => {
        const iStatus = item.active !== false ? 'Ενεργό' : 'Ανενεργό';
        const iClass = item.active !== false ? 'positive' : 'negative';
        return `
          <div class="ds-cec-item">
            <span class="ds-cec-item__name">${item.name || ''}</span>
            <span class="ds-cec-item__status ${iClass}">${iStatus}</span>
            <div class="ds-cec-item__actions">
              <button class="btn secondary" onclick="window._dsCecEditItem(${gi},${ii})">✏️</button>
              <button class="btn secondary" onclick="window._dsCecDeleteItem(${gi},${ii})">🗑️</button>
            </div>
          </div>`;
      }).join('');

      return `
        <div class="ds-cec-group">
          <div class="ds-cec-group__header">
            <span class="ds-cec-group__name">${group.name || ''}</span>
            <span class="ds-cec-group__count">${items.length} είδη</span>
            <span class="ds-cec-group__status ${statusClass}">${statusText}</span>
            <div class="ds-cec-group__actions">
              <button class="btn secondary" onclick="window._dsCecAddItem(${gi})" title="Νέο Είδος">➕</button>
              <button class="btn secondary" onclick="window._dsCecEditGroup(${gi})">✏️</button>
              <button class="btn secondary" onclick="window._dsCecDeleteGroup(${gi})">🗑️</button>
            </div>
          </div>
          <div class="ds-cec-group__items">
            ${itemsHtml || '<p style="color:var(--ga-muted);font-size:13px;margin:4px 0;">Κανένα είδος</p>'}
          </div>
        </div>`;
    }).join('');
  };

  const initCarExpCats = () => {
    const addGroupBtn = $('#dsCecAddGroupBtn');
    const groupForm = $('#ds-cec-group-form');
    const groupCancelBtn = $('#dsCecGroupCancelBtn');
    const itemForm = $('#ds-cec-item-form');
    const itemCancelBtn = $('#dsCecItemCancelBtn');
    if (!addGroupBtn || !groupForm) return;

    // --- Group form ---
    addGroupBtn.addEventListener('click', () => {
      editingGroupIdx = -1;
      $('#dsCecGroupName').value = '';
      $('#dsCecGroupActive').checked = true;
      groupForm.hidden = false;
      itemForm.hidden = true;
    });

    groupCancelBtn.addEventListener('click', () => {
      groupForm.hidden = true;
      editingGroupIdx = -1;
    });

    groupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = ($('#dsCecGroupName') || {}).value || '';
      const active = $('#dsCecGroupActive') ? $('#dsCecGroupActive').checked : true;
      if (!name.trim()) { showToast('Συμπλήρωσε όνομα ομάδας'); return; }

      if (editingGroupIdx >= 0) {
        carExpCats[editingGroupIdx].name = name.trim();
        carExpCats[editingGroupIdx].active = active;
      } else {
        const id = name.toLowerCase().replace(/[^a-zα-ωά-ώ0-9]/gi, '_').replace(/_+/g, '_');
        carExpCats.push({ id, name: name.trim(), active, items: [] });
      }

      await saveCarExpCats();
      groupForm.hidden = true;
      editingGroupIdx = -1;
      renderCarExpCats();
    });

    // --- Item form ---
    itemCancelBtn.addEventListener('click', () => {
      itemForm.hidden = true;
      editingItemGroupIdx = -1;
      editingItemIdx = -1;
    });

    itemForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = ($('#dsCecItemName') || {}).value || '';
      const active = $('#dsCecItemActive') ? $('#dsCecItemActive').checked : true;
      if (!name.trim()) { showToast('Συμπλήρωσε όνομα εξόδου'); return; }

      const group = carExpCats[editingItemGroupIdx];
      if (!group) return;
      if (!Array.isArray(group.items)) group.items = [];

      if (editingItemIdx >= 0) {
        group.items[editingItemIdx].name = name.trim();
        group.items[editingItemIdx].active = active;
      } else {
        const id = name.toLowerCase().replace(/[^a-zα-ωά-ώ0-9]/gi, '_').replace(/_+/g, '_');
        group.items.push({ id, name: name.trim(), active });
      }

      await saveCarExpCats();
      itemForm.hidden = true;
      editingItemGroupIdx = -1;
      editingItemIdx = -1;
      renderCarExpCats();
    });

    // --- Global handlers ---
    window._dsCecEditGroup = (gi) => {
      const group = carExpCats[gi];
      if (!group) return;
      editingGroupIdx = gi;
      $('#dsCecGroupName').value = group.name || '';
      $('#dsCecGroupActive').checked = group.active !== false;
      groupForm.hidden = false;
      itemForm.hidden = true;
    };

    window._dsCecDeleteGroup = async (gi) => {
      if (!confirm('Διαγραφή αυτής της ομάδας και όλων των ειδών της;')) return;
      carExpCats.splice(gi, 1);
      await saveCarExpCats();
      renderCarExpCats();
    };

    window._dsCecAddItem = (gi) => {
      const group = carExpCats[gi];
      if (!group) return;
      editingItemGroupIdx = gi;
      editingItemIdx = -1;
      $('#dsCecItemGroupLabel').value = group.name || '';
      $('#dsCecItemName').value = '';
      $('#dsCecItemActive').checked = true;
      itemForm.hidden = false;
      groupForm.hidden = true;
    };

    window._dsCecEditItem = (gi, ii) => {
      const group = carExpCats[gi];
      if (!group || !group.items || !group.items[ii]) return;
      editingItemGroupIdx = gi;
      editingItemIdx = ii;
      $('#dsCecItemGroupLabel').value = group.name || '';
      $('#dsCecItemName').value = group.items[ii].name || '';
      $('#dsCecItemActive').checked = group.items[ii].active !== false;
      itemForm.hidden = false;
      groupForm.hidden = true;
    };

    window._dsCecDeleteItem = async (gi, ii) => {
      if (!confirm('Διαγραφή αυτού του εξόδου;')) return;
      carExpCats[gi].items.splice(ii, 1);
      await saveCarExpCats();
      renderCarExpCats();
    };
  };

  // ========================================
  // PERSONAL EXPENSE CATEGORIES TAB
  // ========================================
  let persExpCats = [];
  let editingPersGroupIdx = -1;
  let editingPersItemGroupIdx = -1;
  let editingPersItemIdx = -1;

  const loadPersExpCats = async () => {
    const res = await api('/api/admin/driverssystem/personal-expense-categories');
    if (!res) return;
    if (res.ok) persExpCats = await res.json();
  };

  const savePersExpCats = async () => {
    const res = await api('/api/admin/driverssystem/personal-expense-categories', 'PUT', persExpCats);
    if (res && res.ok) {
      persExpCats = await res.json();
      showToast('Αποθηκεύτηκε ✓');
    } else {
      showToast('Σφάλμα αποθήκευσης');
    }
  };

  const renderPersExpCats = () => {
    const list = $('#dsPecList');
    if (!list) return;
    if (!persExpCats.length) {
      list.innerHTML = '<p style="color:var(--ga-muted);font-size:14px;">Δεν υπάρχουν ομάδες</p>';
      return;
    }
    list.innerHTML = persExpCats.map((group, gi) => {
      const statusText = group.active !== false ? 'Ενεργή' : 'Ανενεργή';
      const statusClass = group.active !== false ? 'positive' : 'negative';
      const items = Array.isArray(group.items) ? group.items : [];
      const itemsHtml = items.map((item, ii) => {
        const iStatus = item.active !== false ? 'Ενεργό' : 'Ανενεργό';
        const iClass = item.active !== false ? 'positive' : 'negative';
        return `
          <div class="ds-cec-item">
            <span class="ds-cec-item__name">${item.name || ''}</span>
            <span class="ds-cec-item__status ${iClass}">${iStatus}</span>
            <div class="ds-cec-item__actions">
              <button class="btn secondary" onclick="window._dsPecEditItem(${gi},${ii})">✏️</button>
              <button class="btn secondary" onclick="window._dsPecDeleteItem(${gi},${ii})">🗑️</button>
            </div>
          </div>`;
      }).join('');

      return `
        <div class="ds-cec-group">
          <div class="ds-cec-group__header">
            <span class="ds-cec-group__name">${group.name || ''}</span>
            <span class="ds-cec-group__count">${items.length} είδη</span>
            <span class="ds-cec-group__status ${statusClass}">${statusText}</span>
            <div class="ds-cec-group__actions">
              <button class="btn secondary" onclick="window._dsPecAddItem(${gi})" title="Νέο Είδος">➕</button>
              <button class="btn secondary" onclick="window._dsPecEditGroup(${gi})">✏️</button>
              <button class="btn secondary" onclick="window._dsPecDeleteGroup(${gi})">🗑️</button>
            </div>
          </div>
          <div class="ds-cec-group__items">
            ${itemsHtml || '<p style="color:var(--ga-muted);font-size:13px;margin:4px 0;">Κανένα είδος</p>'}
          </div>
        </div>`;
    }).join('');
  };

  const initPersExpCats = () => {
    const addGroupBtn = $('#dsPecAddGroupBtn');
    const groupForm = $('#ds-pec-group-form');
    const groupCancelBtn = $('#dsPecGroupCancelBtn');
    const itemForm = $('#ds-pec-item-form');
    const itemCancelBtn = $('#dsPecItemCancelBtn');
    if (!addGroupBtn || !groupForm) return;

    addGroupBtn.addEventListener('click', () => {
      editingPersGroupIdx = -1;
      $('#dsPecGroupName').value = '';
      $('#dsPecGroupActive').checked = true;
      groupForm.hidden = false;
      itemForm.hidden = true;
    });

    groupCancelBtn.addEventListener('click', () => {
      groupForm.hidden = true;
      editingPersGroupIdx = -1;
    });

    groupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = ($('#dsPecGroupName') || {}).value || '';
      const active = $('#dsPecGroupActive') ? $('#dsPecGroupActive').checked : true;
      if (!name.trim()) { showToast('Συμπλήρωσε όνομα ομάδας'); return; }

      if (editingPersGroupIdx >= 0) {
        persExpCats[editingPersGroupIdx].name = name.trim();
        persExpCats[editingPersGroupIdx].active = active;
      } else {
        const id = name.toLowerCase().replace(/[^a-zα-ωά-ώ0-9]/gi, '_').replace(/_+/g, '_');
        persExpCats.push({ id, name: name.trim(), active, items: [] });
      }

      await savePersExpCats();
      groupForm.hidden = true;
      editingPersGroupIdx = -1;
      renderPersExpCats();
    });

    itemCancelBtn.addEventListener('click', () => {
      itemForm.hidden = true;
      editingPersItemGroupIdx = -1;
      editingPersItemIdx = -1;
    });

    itemForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = ($('#dsPecItemName') || {}).value || '';
      const active = $('#dsPecItemActive') ? $('#dsPecItemActive').checked : true;
      if (!name.trim()) { showToast('Συμπλήρωσε όνομα εξόδου'); return; }

      const group = persExpCats[editingPersItemGroupIdx];
      if (!group) return;
      if (!Array.isArray(group.items)) group.items = [];

      if (editingPersItemIdx >= 0) {
        group.items[editingPersItemIdx].name = name.trim();
        group.items[editingPersItemIdx].active = active;
      } else {
        const id = name.toLowerCase().replace(/[^a-zα-ωά-ώ0-9]/gi, '_').replace(/_+/g, '_');
        group.items.push({ id, name: name.trim(), active });
      }

      await savePersExpCats();
      itemForm.hidden = true;
      editingPersItemGroupIdx = -1;
      editingPersItemIdx = -1;
      renderPersExpCats();
    });

    window._dsPecEditGroup = (gi) => {
      const group = persExpCats[gi];
      if (!group) return;
      editingPersGroupIdx = gi;
      $('#dsPecGroupName').value = group.name || '';
      $('#dsPecGroupActive').checked = group.active !== false;
      groupForm.hidden = false;
      itemForm.hidden = true;
    };

    window._dsPecDeleteGroup = async (gi) => {
      if (!confirm('Διαγραφή αυτής της ομάδας και όλων των ειδών της;')) return;
      persExpCats.splice(gi, 1);
      await savePersExpCats();
      renderPersExpCats();
    };

    window._dsPecAddItem = (gi) => {
      const group = persExpCats[gi];
      if (!group) return;
      editingPersItemGroupIdx = gi;
      editingPersItemIdx = -1;
      $('#dsPecItemGroupLabel').value = group.name || '';
      $('#dsPecItemName').value = '';
      $('#dsPecItemActive').checked = true;
      itemForm.hidden = false;
      groupForm.hidden = true;
    };

    window._dsPecEditItem = (gi, ii) => {
      const group = persExpCats[gi];
      if (!group || !group.items || !group.items[ii]) return;
      editingPersItemGroupIdx = gi;
      editingPersItemIdx = ii;
      $('#dsPecItemGroupLabel').value = group.name || '';
      $('#dsPecItemName').value = group.items[ii].name || '';
      $('#dsPecItemActive').checked = group.items[ii].active !== false;
      itemForm.hidden = false;
      groupForm.hidden = true;
    };

    window._dsPecDeleteItem = async (gi, ii) => {
      if (!confirm('Διαγραφή αυτού του εξόδου;')) return;
      persExpCats[gi].items.splice(ii, 1);
      await savePersExpCats();
      renderPersExpCats();
    };
  };

  // ========================================
  // TAX / INSURANCE EXPENSE CATEGORIES TAB
  // ========================================
  let taxExpCats = [];
  let editingTaxGroupIdx = -1;
  let editingTaxItemGroupIdx = -1;
  let editingTaxItemIdx = -1;

  const loadTaxExpCats = async () => {
    const res = await api('/api/admin/driverssystem/tax-expense-categories');
    if (!res) return;
    if (res.ok) taxExpCats = await res.json();
  };

  const saveTaxExpCats = async () => {
    const res = await api('/api/admin/driverssystem/tax-expense-categories', 'PUT', taxExpCats);
    if (res && res.ok) {
      taxExpCats = await res.json();
      showToast('Αποθηκεύτηκε ✓');
    } else {
      showToast('Σφάλμα αποθήκευσης');
    }
  };

  const renderTaxExpCats = () => {
    const list = $('#dsTecList');
    if (!list) return;
    if (!taxExpCats.length) {
      list.innerHTML = '<p style="color:var(--ga-muted);font-size:14px;">Δεν υπάρχουν ομάδες</p>';
      return;
    }
    list.innerHTML = taxExpCats.map((group, gi) => {
      const statusText = group.active !== false ? 'Ενεργή' : 'Ανενεργή';
      const statusClass = group.active !== false ? 'positive' : 'negative';
      const items = Array.isArray(group.items) ? group.items : [];
      const itemsHtml = items.map((item, ii) => {
        const iStatus = item.active !== false ? 'Ενεργό' : 'Ανενεργό';
        const iClass = item.active !== false ? 'positive' : 'negative';
        return `
          <div class="ds-cec-item">
            <span class="ds-cec-item__name">${item.name || ''}</span>
            <span class="ds-cec-item__status ${iClass}">${iStatus}</span>
            <div class="ds-cec-item__actions">
              <button class="btn secondary" onclick="window._dsTecEditItem(${gi},${ii})">✏️</button>
              <button class="btn secondary" onclick="window._dsTecDeleteItem(${gi},${ii})">🗑️</button>
            </div>
          </div>`;
      }).join('');

      return `
        <div class="ds-cec-group">
          <div class="ds-cec-group__header">
            <span class="ds-cec-group__name">${group.name || ''}</span>
            <span class="ds-cec-group__count">${items.length} είδη</span>
            <span class="ds-cec-group__status ${statusClass}">${statusText}</span>
            <div class="ds-cec-group__actions">
              <button class="btn secondary" onclick="window._dsTecAddItem(${gi})" title="Νέο Είδος">➕</button>
              <button class="btn secondary" onclick="window._dsTecEditGroup(${gi})">✏️</button>
              <button class="btn secondary" onclick="window._dsTecDeleteGroup(${gi})">🗑️</button>
            </div>
          </div>
          <div class="ds-cec-group__items">
            ${itemsHtml || '<p style="color:var(--ga-muted);font-size:13px;margin:4px 0;">Κανένα είδος</p>'}
          </div>
        </div>`;
    }).join('');
  };

  const initTaxExpCats = () => {
    const addGroupBtn = $('#dsTecAddGroupBtn');
    const groupForm = $('#ds-tec-group-form');
    const groupCancelBtn = $('#dsTecGroupCancelBtn');
    const itemForm = $('#ds-tec-item-form');
    const itemCancelBtn = $('#dsTecItemCancelBtn');
    if (!addGroupBtn || !groupForm) return;

    addGroupBtn.addEventListener('click', () => {
      editingTaxGroupIdx = -1;
      $('#dsTecGroupName').value = '';
      $('#dsTecGroupActive').checked = true;
      groupForm.hidden = false;
      itemForm.hidden = true;
    });

    groupCancelBtn.addEventListener('click', () => {
      groupForm.hidden = true;
      editingTaxGroupIdx = -1;
    });

    groupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = ($('#dsTecGroupName') || {}).value || '';
      const active = $('#dsTecGroupActive') ? $('#dsTecGroupActive').checked : true;
      if (!name.trim()) { showToast('Συμπλήρωσε όνομα ομάδας'); return; }

      if (editingTaxGroupIdx >= 0) {
        taxExpCats[editingTaxGroupIdx].name = name.trim();
        taxExpCats[editingTaxGroupIdx].active = active;
      } else {
        const id = name.toLowerCase().replace(/[^a-zα-ωά-ώ0-9]/gi, '_').replace(/_+/g, '_');
        taxExpCats.push({ id, name: name.trim(), active, items: [] });
      }

      await saveTaxExpCats();
      groupForm.hidden = true;
      editingTaxGroupIdx = -1;
      renderTaxExpCats();
    });

    itemCancelBtn.addEventListener('click', () => {
      itemForm.hidden = true;
      editingTaxItemGroupIdx = -1;
      editingTaxItemIdx = -1;
    });

    itemForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = ($('#dsTecItemName') || {}).value || '';
      const active = $('#dsTecItemActive') ? $('#dsTecItemActive').checked : true;
      if (!name.trim()) { showToast('Συμπλήρωσε όνομα εξόδου'); return; }

      const group = taxExpCats[editingTaxItemGroupIdx];
      if (!group) return;
      if (!Array.isArray(group.items)) group.items = [];

      if (editingTaxItemIdx >= 0) {
        group.items[editingTaxItemIdx].name = name.trim();
        group.items[editingTaxItemIdx].active = active;
      } else {
        const id = name.toLowerCase().replace(/[^a-zα-ωά-ώ0-9]/gi, '_').replace(/_+/g, '_');
        group.items.push({ id, name: name.trim(), active });
      }

      await saveTaxExpCats();
      itemForm.hidden = true;
      editingTaxItemGroupIdx = -1;
      editingTaxItemIdx = -1;
      renderTaxExpCats();
    });

    window._dsTecEditGroup = (gi) => {
      const group = taxExpCats[gi];
      if (!group) return;
      editingTaxGroupIdx = gi;
      $('#dsTecGroupName').value = group.name || '';
      $('#dsTecGroupActive').checked = group.active !== false;
      groupForm.hidden = false;
      itemForm.hidden = true;
    };

    window._dsTecDeleteGroup = async (gi) => {
      if (!confirm('Διαγραφή αυτής της ομάδας και όλων των ειδών της;')) return;
      taxExpCats.splice(gi, 1);
      await saveTaxExpCats();
      renderTaxExpCats();
    };

    window._dsTecAddItem = (gi) => {
      const group = taxExpCats[gi];
      if (!group) return;
      editingTaxItemGroupIdx = gi;
      editingTaxItemIdx = -1;
      $('#dsTecItemGroupLabel').value = group.name || '';
      $('#dsTecItemName').value = '';
      $('#dsTecItemActive').checked = true;
      itemForm.hidden = false;
      groupForm.hidden = true;
    };

    window._dsTecEditItem = (gi, ii) => {
      const group = taxExpCats[gi];
      if (!group || !group.items || !group.items[ii]) return;
      editingTaxItemGroupIdx = gi;
      editingTaxItemIdx = ii;
      $('#dsTecItemGroupLabel').value = group.name || '';
      $('#dsTecItemName').value = group.items[ii].name || '';
      $('#dsTecItemActive').checked = group.items[ii].active !== false;
      itemForm.hidden = false;
      groupForm.hidden = true;
    };

    window._dsTecDeleteItem = async (gi, ii) => {
      if (!confirm('Διαγραφή αυτού του εξόδου;')) return;
      taxExpCats[gi].items.splice(ii, 1);
      await saveTaxExpCats();
      renderTaxExpCats();
    };
  };

  // ========================================
  // INIT
  // ========================================
  const init = async () => {
    initTabs();
    initLogoUpload();
    initFooterIconUploads();
    initTripSources();
    initCarExpCats();
    initPersExpCats();
    initTaxExpCats();

    await loadConfig();
    await loadTripSources();
    await loadCarExpCats();
    await loadPersExpCats();
    await loadTaxExpCats();
    populateGeneral();
    renderTripSources();
    renderCarExpCats();
    renderPersExpCats();
    renderTaxExpCats();

    // General form save
    const form = $('#ds-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveGeneral();
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
