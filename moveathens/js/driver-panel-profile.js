/** MoveAthens Driver Panel — Menu Hub + Sub-views */
(() => {
  'use strict';

  const LS_KEY = 'moveathens_driver';
  let VERSION = '—';
  let cachedConfig = {};

  fetch('/version.json').then(r => r.json()).then(d => {
    VERSION = d.version || '—';
    const el = document.getElementById('dpVersionValue');
    if (el) el.textContent = VERSION;
  }).catch(() => {});

  const api = async (url, opts = {}) => {
    return fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  };

  const showToast = (msg) => {
    let t = document.getElementById('dpToast');
    if (!t) { t = document.createElement('div'); t.id = 'dpToast'; t.className = 'ma-dp-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  };

  const esc = (s) => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

  // ── SVG Icons ──
  const ICONS = {
    profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0112 0v1"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
  };

  // ══════════ HUB VIEW ══════════
  function renderHub(driver) {
    const wrap = document.getElementById('dpProfile');
    if (!wrap) return;

    const initials = (driver.display_name || driver.name || 'O').substring(0, 2).toUpperCase();

    wrap.innerHTML = `
      <section class="ma-dp-hub-header">
        <div class="ma-dp-hub-avatar">${esc(initials)}</div>
        <h2 class="ma-dp-hub-name">${esc(driver.display_name || driver.name || 'Οδηγός')}</h2>
        <p class="ma-dp-hub-detail">${esc(driver.phone || '')}</p>
      </section>

      <nav class="ma-dp-hub-menu">
        <button class="ma-dp-hub-card" data-view="profile">
          <span class="ma-dp-hub-card__icon">${ICONS.profile}</span>
          <div class="ma-dp-hub-card__text">
            <span class="ma-dp-hub-card__title">Προφίλ Οδηγού</span>
            <span class="ma-dp-hub-card__desc">Στοιχεία, όχημα & διαθεσιμότητα</span>
          </div>
          <span class="ma-dp-hub-card__arrow">›</span>
        </button>
        <button class="ma-dp-hub-card" data-view="settings">
          <span class="ma-dp-hub-card__icon">${ICONS.settings}</span>
          <div class="ma-dp-hub-card__text">
            <span class="ma-dp-hub-card__title">Ρυθμίσεις Εφαρμογής</span>
            <span class="ma-dp-hub-card__desc">Εμφάνιση & κωδικός ασφαλείας</span>
          </div>
          <span class="ma-dp-hub-card__arrow">›</span>
        </button>
      </nav>

      <div class="ma-dp-hub-logout">
        <button class="ma-dp-hub-logout-btn" id="dpLogout"><svg class="ma-dp-logout-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Αποσύνδεση</button>
      </div>
      <div class="ma-dp-hub-version">
        Έκδοση: <span id="dpVersionValue">${VERSION}</span>
      </div>`;

    wrap.querySelector('.ma-dp-hub-menu')?.addEventListener('click', (e) => {
      const card = e.target.closest('[data-view]');
      if (!card) return;
      if (card.dataset.view === 'profile') renderProfileView(driver);
      if (card.dataset.view === 'settings') renderSettingsView(driver);
    });

    document.getElementById('dpLogout')?.addEventListener('click', () => {
      if (typeof window.DpAuth?.logout === 'function') window.DpAuth.logout();
    });
  }

  // ══════════ PROFILE VIEW ══════════
  function renderProfileView(driver) {
    const wrap = document.getElementById('dpProfile');
    if (!wrap) return;

    const vehicleTypes = driver.vehicle_types || [];
    const currentVehicle = driver.current_vehicle_type || '';

    wrap.innerHTML = `
      <button class="ma-dp-back-btn" id="dpBackToHub">← Μενού</button>

      <div class="ma-dp-profile-section">
        <h3 class="ma-dp-profile-section-title">👤 Προφίλ Χρήστη</h3>
        <p class="ma-dp-profile-hint">Το όνομά σας — εμφανίζεται στις αναφορές</p>
        <div class="ma-dp-input-row">
          <input type="text" id="dpDisplayName" class="ma-dp-profile-input" value="${esc(driver.display_name || driver.name || '')}" placeholder="Εμφανιζόμενο όνομα">
          <button class="ma-dp-edit-icon" id="dpNameSave" title="Αποθήκευση">✏️</button>
        </div>
      </div>

      <div class="ma-dp-profile-section">
        <h3 class="ma-dp-profile-section-title">📱 Τηλέφωνο</h3>
        <p class="ma-dp-profile-detail">${esc(driver.phone || '')}</p>
      </div>

      ${vehicleTypes.length > 0 ? (() => {
        const vtOptions = vehicleTypes.map(v => {
          const vId = typeof v === 'string' ? v : (v.id || v);
          const avt = (cachedConfig.availableVehicleTypes || []).find(a => a.id === vId);
          const vLabel = avt ? avt.name : (typeof v === 'string' ? v : (v.name || v.label || v.id || v));
          return { id: vId, label: vLabel };
        });
        const selOpt = vtOptions.find(o => o.id === currentVehicle);
        const selLabel = selOpt ? selOpt.label : '— Επιλέξτε —';
        return `
      <div class="ma-dp-profile-section">
        <h3 class="ma-dp-profile-section-title">🚗 Τρέχον Όχημα</h3>
        <div class="ma-dp-custom-select" id="dpProfileVehicleWrap">
          <input type="hidden" id="dpProfileVehicle" value="${esc(currentVehicle || '')}">
          <button type="button" class="ma-dp-custom-select__trigger" id="dpVehicleTrigger">
            <span class="ma-dp-custom-select__label" id="dpVehicleLabel">${esc(selLabel)}</span>
            <span class="ma-dp-custom-select__arrow">▼</span>
          </button>
          <div class="ma-dp-custom-select__dropdown" id="dpVehicleDropdown">
            <div class="ma-dp-custom-select__option ${!currentVehicle ? 'active' : ''}" data-value="">— Επιλέξτε —</div>
            ${vtOptions.map(o => `<div class="ma-dp-custom-select__option ${o.id === currentVehicle ? 'active' : ''}" data-value="${esc(o.id)}">${esc(o.label)}</div>`).join('')}
          </div>
        </div>
      </div>`;
      })() : ''}

      <div class="ma-dp-profile-section">
        <h3 class="ma-dp-profile-section-title">🚘 Τύποι Οχημάτων</h3>
        <p class="ma-dp-profile-hint">Επιλέξτε τα οχήματα που διαθέτετε</p>
        <div id="dpVehicleTypesChecklist" class="ma-dp-vt-checklist">
          ${(cachedConfig.availableVehicleTypes || []).map(vt => {
            const checked = vehicleTypes.some(v => (typeof v === 'string' ? v : v.id) === vt.id);
            return `<label class="ma-dp-vt-item">
              <input type="checkbox" value="${esc(vt.id)}" ${checked ? 'checked' : ''}>
              <span>${esc(vt.name)}</span>
            </label>`;
          }).join('') || '<em class="ma-dp-profile-hint">Δεν υπάρχουν διαθέσιμοι τύποι</em>'}
        </div>
      </div>

      <div class="ma-dp-profile-section">
        <h3 class="ma-dp-profile-section-title">📡 Διαθεσιμότητα</h3>
        <label class="ma-dp-profile-toggle">
          <input type="checkbox" id="dpProfileAvail" ${driver.is_active ? 'checked' : ''}>
          <span id="dpAvailLabel">${driver.is_active ? 'Ενεργός' : 'Ανενεργός'}</span>
        </label>
      </div>`;

    // Event listeners
    document.getElementById('dpBackToHub')?.addEventListener('click', () => renderHub(driver));

    document.getElementById('dpNameSave')?.addEventListener('click', async () => {
      const name = document.getElementById('dpDisplayName')?.value?.trim();
      if (!name) return;
      const res = await api('/api/driver-panel/profile', {
        method: 'POST',
        body: JSON.stringify({ phone: driver.phone, display_name: name })
      });
      if (res.ok) {
        driver.display_name = name;
        localStorage.setItem(LS_KEY, JSON.stringify(driver));
        showToast('Όνομα ενημερώθηκε');
      }
    });

    // Custom vehicle dropdown
    const vehTrigger = document.getElementById('dpVehicleTrigger');
    const vehDropdown = document.getElementById('dpVehicleDropdown');
    if (vehTrigger && vehDropdown) {
      vehTrigger.addEventListener('click', () => {
        const wrap = document.getElementById('dpProfileVehicleWrap');
        wrap?.classList.toggle('open');
      });
      // Close on outside click
      document.addEventListener('click', (e) => {
        const wrap = document.getElementById('dpProfileVehicleWrap');
        if (wrap && !wrap.contains(e.target)) wrap.classList.remove('open');
      });
      vehDropdown.addEventListener('click', async (e) => {
        const opt = e.target.closest('.ma-dp-custom-select__option');
        if (!opt) return;
        const val = opt.dataset.value;
        const label = opt.textContent;
        // Update UI
        document.getElementById('dpProfileVehicle').value = val;
        document.getElementById('dpVehicleLabel').textContent = label;
        vehDropdown.querySelectorAll('.ma-dp-custom-select__option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        document.getElementById('dpProfileVehicleWrap')?.classList.remove('open');
        // Save to server
        const res = await api('/api/driver-panel/vehicle', {
          method: 'POST',
          body: JSON.stringify({ phone: driver.phone, current_vehicle_type: val })
        });
        if (res.ok) {
          driver.current_vehicle_type = val;
          localStorage.setItem(LS_KEY, JSON.stringify(driver));
          showToast('Όχημα ενημερώθηκε');
        }
      });
    }

    // Vehicle types checklist
    document.getElementById('dpVehicleTypesChecklist')?.addEventListener('change', async (e) => {
      if (e.target.type !== 'checkbox') return;
      const boxes = document.querySelectorAll('#dpVehicleTypesChecklist input[type="checkbox"]');
      const selected = [...boxes].filter(b => b.checked).map(b => b.value);
      const res = await api('/api/driver-panel/vehicle-types', {
        method: 'POST',
        body: JSON.stringify({ phone: driver.phone, vehicle_types: selected })
      });
      if (res.ok) {
        driver.vehicle_types = selected;
        localStorage.setItem(LS_KEY, JSON.stringify(driver));
        // Update the custom vehicle dropdown options
        const vehHidden = document.getElementById('dpProfileVehicle');
        const vehDd = document.getElementById('dpVehicleDropdown');
        if (vehHidden && vehDd) {
          const cur = vehHidden.value;
          const avail = (cachedConfig.availableVehicleTypes || []).filter(vt => selected.includes(vt.id));
          vehDd.innerHTML = `<div class="ma-dp-custom-select__option ${!cur ? 'active' : ''}" data-value="">— Επιλέξτε —</div>` +
            avail.map(vt => `<div class="ma-dp-custom-select__option ${vt.id === cur ? 'active' : ''}" data-value="${esc(vt.id)}">${esc(vt.name)}</div>`).join('');
          // If current vehicle was removed, reset
          if (cur && !avail.some(vt => vt.id === cur)) {
            vehHidden.value = '';
            document.getElementById('dpVehicleLabel').textContent = '— Επιλέξτε —';
          }
        }
        showToast('Τύποι οχημάτων ενημερώθηκαν');
      }
    });

    document.getElementById('dpProfileAvail')?.addEventListener('change', async (e) => {
      const isActive = e.target.checked;
      const res = await api('/api/driver-panel/availability', {
        method: 'POST',
        body: JSON.stringify({ phone: driver.phone, is_active: isActive })
      });
      if (res.ok) {
        driver.is_active = isActive;
        localStorage.setItem(LS_KEY, JSON.stringify(driver));
        document.getElementById('dpAvailLabel').textContent = isActive ? 'Ενεργός' : 'Ανενεργός';
        // Sync home toggle
        const goCheck = document.getElementById('dpGoCheck');
        if (goCheck) goCheck.checked = isActive;
        const goLabel = document.getElementById('dpGoLabel');
        if (goLabel) goLabel.textContent = isActive ? 'Ενεργός' : 'Εκτός σύνδεσης';
      }
    });
  }

  // ══════════ SETTINGS VIEW ══════════
  function renderSettingsView(driver) {
    const wrap = document.getElementById('dpProfile');
    if (!wrap) return;

    const currentTheme = localStorage.getItem('ma_dp_theme') || 'auto';

    wrap.innerHTML = `
      <button class="ma-dp-back-btn" id="dpBackToHub">← Μενού</button>

      <div class="ma-dp-profile-section">
        <h3 class="ma-dp-profile-section-title">Εμφάνιση</h3>
        <p class="ma-dp-profile-hint">Επιλέξτε τη λειτουργία εμφάνισης της εφαρμογής</p>
        <div class="ma-dp-theme-selector" id="dpThemeSelector">
          <button class="ma-dp-theme-btn ${currentTheme === 'auto' ? 'active' : ''}" data-theme="auto">
            <span class="ma-dp-theme-btn__icon">🔄</span>
            <span class="ma-dp-theme-btn__label">Αυτόματο</span>
          </button>
          <button class="ma-dp-theme-btn ${currentTheme === 'light' ? 'active' : ''}" data-theme="light">
            <span class="ma-dp-theme-btn__icon">☀️</span>
            <span class="ma-dp-theme-btn__label">Φωτεινό</span>
          </button>
          <button class="ma-dp-theme-btn ${currentTheme === 'dark' ? 'active' : ''}" data-theme="dark">
            <span class="ma-dp-theme-btn__icon">🌙</span>
            <span class="ma-dp-theme-btn__label">Σκοτεινό</span>
          </button>
        </div>
      </div>

      <div class="ma-dp-profile-section">
        <h3 class="ma-dp-profile-section-title">🔊 Ήχος Νέας Διαδρομής</h3>
        <p class="ma-dp-profile-hint">Επιλέξτε τον ήχο για νέες διαδρομές</p>
        <button type="button" class="ma-dp-sound-toggle" id="dpSoundToggle">
          <span>${(() => {
            const sel = localStorage.getItem('ma_dp_alert_sound') || cachedConfig.sounds?.defaults?.new_ride || '';
            if (!sel) return '🔇 Κανένας';
            const mp3 = (cachedConfig.sounds?.files || []).find(f => f.id === sel);
            return mp3 ? '🎵 ' + mp3.label : '🔇 Κανένας';
          })()}</span>
          <span class="ma-dp-sound-toggle__arrow">▼</span>
        </button>
        <div class="ma-dp-sound-picker ma-dp-sound-picker--collapsed" id="dpDriverSoundPicker">
          ${(() => {
            const driverSound = localStorage.getItem('ma_dp_alert_sound') || cachedConfig.sounds?.defaults?.new_ride || '';
            const mp3Files = (cachedConfig.sounds?.files || []).filter(f => f.event === 'new_ride');
            let html = '<div class="ma-dp-sound-option ' + (!driverSound ? 'ma-dp-sound-active' : '') + '" data-sound=""><span class="ma-dp-sound-name">🔇 Κανένας</span></div>';
            if (mp3Files.length) {
              const cats = {};
              mp3Files.forEach(f => { const c = f.category || 'Γενικοί'; if (!cats[c]) cats[c] = []; cats[c].push(f); });
              Object.entries(cats).forEach(([cat, files]) => {
                html += '<div class="ma-dp-sound-group-label">' + esc(cat) + '</div>';
                html += files.map(f => '<div class="ma-dp-sound-option ' + (f.id === driverSound ? 'ma-dp-sound-active' : '') + '" data-sound="' + f.id + '" data-url="' + esc(f.url) + '">' +
                  '<span class="ma-dp-sound-name">🎵 ' + esc(f.label) + '</span>' +
                  '<button type="button" class="ma-dp-sound-preview-mp3" data-url="' + esc(f.url) + '">▶️</button>' +
                '</div>').join('');
              });
            }
            return html;
          })()}
        </div>
      </div>

      <div class="ma-dp-profile-section">
        <h3 class="ma-dp-profile-section-title">📱 Ήχος Ανοίγματος</h3>
        <p class="ma-dp-profile-hint">Ήχος κατά το άνοιγμα της εφαρμογής</p>
        <button type="button" class="ma-dp-sound-toggle" id="dpAppOpenSoundToggle">
          <span>${(() => {
            const sel = localStorage.getItem('ma_dp_app_open_sound') || cachedConfig.sounds?.defaults?.app_open || '';
            if (!sel) return '🔇 Κανένας';
            const mp3 = (cachedConfig.sounds?.files || []).find(f => f.id === sel);
            return mp3 ? '🎵 ' + mp3.label : '🔇 Κανένας';
          })()}</span>
          <span class="ma-dp-sound-toggle__arrow">▼</span>
        </button>
        <div class="ma-dp-sound-picker ma-dp-sound-picker--collapsed" id="dpAppOpenSoundPicker">
          ${(() => {
            const sel = localStorage.getItem('ma_dp_app_open_sound') || cachedConfig.sounds?.defaults?.app_open || '';
            const mp3Files = (cachedConfig.sounds?.files || []).filter(f => f.event === 'app_open');
            let html = '<div class="ma-dp-sound-option ' + (!sel ? 'ma-dp-sound-active' : '') + '" data-sound=""><span class="ma-dp-sound-name">🔇 Κανένας</span></div>';
            if (mp3Files.length) {
              const cats = {};
              mp3Files.forEach(f => { const c = f.category || 'Γενικοί'; if (!cats[c]) cats[c] = []; cats[c].push(f); });
              Object.entries(cats).forEach(([cat, files]) => {
                html += '<div class="ma-dp-sound-group-label">' + esc(cat) + '</div>';
                html += files.map(f => '<div class="ma-dp-sound-option ' + (f.id === sel ? 'ma-dp-sound-active' : '') + '" data-sound="' + f.id + '" data-url="' + esc(f.url) + '">' +
                  '<span class="ma-dp-sound-name">🎵 ' + esc(f.label) + '</span>' +
                  '<button type="button" class="ma-dp-sound-preview-mp3" data-url="' + esc(f.url) + '">▶️</button>' +
                '</div>').join('');
              });
            }
            return html;
          })()}
        </div>
      </div>

      <div class="ma-dp-profile-section">        <h3 class="ma-dp-profile-section-title">🚪 Ήχος Κλεισίματος</h3>
        <p class="ma-dp-profile-hint">Ήχος κατά το κλείσιμο της εφαρμογής</p>
        <button type="button" class="ma-dp-sound-toggle" id="dpAppCloseSoundToggle">
          <span>${(() => {
            const sel = localStorage.getItem('ma_dp_app_close_sound') || cachedConfig.sounds?.defaults?.app_close || '';
            if (!sel) return '🔇 Κανένας';
            const mp3 = (cachedConfig.sounds?.files || []).find(f => f.id === sel);
            return mp3 ? '🎵 ' + mp3.label : '🔇 Κανένας';
          })()}</span>
          <span class="ma-dp-sound-toggle__arrow">▼</span>
        </button>
        <div class="ma-dp-sound-picker ma-dp-sound-picker--collapsed" id="dpAppCloseSoundPicker">
          ${(() => {
            const sel = localStorage.getItem('ma_dp_app_close_sound') || cachedConfig.sounds?.defaults?.app_close || '';
            const mp3Files = (cachedConfig.sounds?.files || []).filter(f => f.event === 'app_close');
            let html = '<div class="ma-dp-sound-option ' + (!sel ? 'ma-dp-sound-active' : '') + '" data-sound=""><span class="ma-dp-sound-name">🔇 Κανένας</span></div>';
            if (mp3Files.length) {
              const cats = {};
              mp3Files.forEach(f => { const c = f.category || 'Γενικοί'; if (!cats[c]) cats[c] = []; cats[c].push(f); });
              Object.entries(cats).forEach(([cat, files]) => {
                html += '<div class="ma-dp-sound-group-label">' + esc(cat) + '</div>';
                html += files.map(f => '<div class="ma-dp-sound-option ' + (f.id === sel ? 'ma-dp-sound-active' : '') + '" data-sound="' + f.id + '" data-url="' + esc(f.url) + '">' +
                  '<span class="ma-dp-sound-name">🎵 ' + esc(f.label) + '</span>' +
                  '<button type="button" class="ma-dp-sound-preview-mp3" data-url="' + esc(f.url) + '">▶️</button>' +
                '</div>').join('');
              });
            }
            return html;
          })()}
        </div>
      </div>

      <div class="ma-dp-profile-section">        <h3 class="ma-dp-profile-section-title">�🔐 Κωδικός Ασφαλείας (PIN)</h3>
        <p class="ma-dp-profile-hint">Ορίστε ένα PIN για επιπλέον ασφάλεια κατά τη σύνδεση</p>

        <div class="ma-dp-pin-status-bar">
          <span class="ma-dp-pin-status-icon">${driver.has_pin ? '🔒' : '🔓'}</span>
          <span class="ma-dp-pin-status-text">${driver.has_pin ? 'Ο κωδικός ασφαλείας είναι ενεργός' : 'Δεν έχετε ορίσει κωδικό ασφαλείας'}</span>
        </div>

        <div id="dpPinForm" class="ma-dp-pin-form" style="display:none">
          <label class="ma-dp-profile-hint" id="dpPinFormLabel">Νέος κωδικός (τουλάχιστον 4 χαρακτήρες)</label>
          <input type="password" id="dpPinNew" class="ma-dp-pin-input" placeholder="Εισάγετε κωδικό" inputmode="numeric" minlength="4" maxlength="20">
          <input type="password" id="dpPinConfirm" class="ma-dp-pin-input" placeholder="Επιβεβαίωση κωδικού" inputmode="numeric" minlength="4" maxlength="20">
          <div class="ma-dp-pin-btn-row">
            <button class="ma-dp-pin-btn ma-dp-pin-btn--save" id="dpPinSave">Αποθήκευση</button>
            <button class="ma-dp-pin-btn ma-dp-pin-btn--cancel" id="dpPinCancel">Ακύρωση</button>
          </div>
          <p class="ma-dp-pin-error" id="dpPinError"></p>
        </div>

        <div class="ma-dp-pin-btn-row" id="dpPinActions">
          ${driver.has_pin ? `
            <button class="ma-dp-pin-btn ma-dp-pin-btn--change" id="dpPinChange">Αλλαγή PIN</button>
            <button class="ma-dp-pin-btn ma-dp-pin-btn--remove" id="dpPinRemove">Αφαίρεση PIN</button>
          ` : `
            <button class="ma-dp-pin-btn ma-dp-pin-btn--set" id="dpPinSet">Ορισμός PIN</button>
          `}
        </div>
      </div>`;

    // Theme selector
    document.getElementById('dpThemeSelector')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-theme]');
      if (!btn) return;
      const theme = btn.dataset.theme;
      document.querySelectorAll('.ma-dp-theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      localStorage.setItem('ma_dp_theme', theme);
      if (typeof window.DpApp?._applyTheme === 'function') window.DpApp._applyTheme(theme);
    });

    // Sound picker toggle (accordion)
    document.getElementById('dpSoundToggle')?.addEventListener('click', () => {
      const picker = document.getElementById('dpDriverSoundPicker');
      if (picker) picker.classList.toggle('ma-dp-sound-picker--collapsed');
      const arrow = document.querySelector('#dpSoundToggle .ma-dp-sound-toggle__arrow');
      if (arrow) arrow.textContent = picker?.classList.contains('ma-dp-sound-picker--collapsed') ? '▼' : '▲';
    });

    // App-open sound picker toggle
    document.getElementById('dpAppOpenSoundToggle')?.addEventListener('click', () => {
      const picker = document.getElementById('dpAppOpenSoundPicker');
      if (picker) picker.classList.toggle('ma-dp-sound-picker--collapsed');
      const arrow = document.querySelector('#dpAppOpenSoundToggle .ma-dp-sound-toggle__arrow');
      if (arrow) arrow.textContent = picker?.classList.contains('ma-dp-sound-picker--collapsed') ? '▼' : '▲';
    });

    // Sound picker — new ride
    document.getElementById('dpDriverSoundPicker')?.addEventListener('click', (e) => {
      const previewMp3 = e.target.closest('.ma-dp-sound-preview-mp3');
      if (previewMp3 && window.DpSounds) { window.DpSounds.playUrl(previewMp3.dataset.url); return; }
      const opt = e.target.closest('.ma-dp-sound-option');
      if (!opt) return;
      document.querySelectorAll('#dpDriverSoundPicker .ma-dp-sound-option').forEach(o => o.classList.remove('ma-dp-sound-active'));
      opt.classList.add('ma-dp-sound-active');
      const soundId = opt.dataset.sound;
      localStorage.setItem('ma_dp_alert_sound', soundId);
      if (soundId && window.DpSounds) window.DpSounds.playUrl(opt.dataset.url);
      // Update toggle label
      const mp3 = (cachedConfig.sounds?.files || []).find(f => f.id === soundId);
      const toggleLabel = document.querySelector('#dpSoundToggle > span:first-child');
      if (toggleLabel) toggleLabel.textContent = !soundId ? '🔇 Κανένας' : (mp3 ? '🎵 ' + mp3.label : soundId);
      showToast('Ήχος ενημερώθηκε');
    });

    // Sound picker — app open
    document.getElementById('dpAppOpenSoundPicker')?.addEventListener('click', (e) => {
      const previewMp3 = e.target.closest('.ma-dp-sound-preview-mp3');
      if (previewMp3 && window.DpSounds) { window.DpSounds.playUrl(previewMp3.dataset.url); return; }
      const opt = e.target.closest('.ma-dp-sound-option');
      if (!opt) return;
      document.querySelectorAll('#dpAppOpenSoundPicker .ma-dp-sound-option').forEach(o => o.classList.remove('ma-dp-sound-active'));
      opt.classList.add('ma-dp-sound-active');
      const soundId = opt.dataset.sound;
      localStorage.setItem('ma_dp_app_open_sound', soundId);
      if (soundId && window.DpSounds) window.DpSounds.playUrl(opt.dataset.url);
      const mp3 = (cachedConfig.sounds?.files || []).find(f => f.id === soundId);
      const toggleLabel = document.querySelector('#dpAppOpenSoundToggle > span:first-child');
      if (toggleLabel) toggleLabel.textContent = !soundId ? '🔇 Κανένας' : (mp3 ? '🎵 ' + mp3.label : soundId);
      showToast('Ήχος ανοίγματος ενημερώθηκε');
    });

    // App-close sound picker toggle
    document.getElementById('dpAppCloseSoundToggle')?.addEventListener('click', () => {
      const picker = document.getElementById('dpAppCloseSoundPicker');
      if (picker) picker.classList.toggle('ma-dp-sound-picker--collapsed');
      const arrow = document.querySelector('#dpAppCloseSoundToggle .ma-dp-sound-toggle__arrow');
      if (arrow) arrow.textContent = picker?.classList.contains('ma-dp-sound-picker--collapsed') ? '▼' : '▲';
    });

    // Sound picker — app close
    document.getElementById('dpAppCloseSoundPicker')?.addEventListener('click', (e) => {
      const previewMp3 = e.target.closest('.ma-dp-sound-preview-mp3');
      if (previewMp3 && window.DpSounds) { window.DpSounds.playUrl(previewMp3.dataset.url); return; }
      const opt = e.target.closest('.ma-dp-sound-option');
      if (!opt) return;
      document.querySelectorAll('#dpAppCloseSoundPicker .ma-dp-sound-option').forEach(o => o.classList.remove('ma-dp-sound-active'));
      opt.classList.add('ma-dp-sound-active');
      const soundId = opt.dataset.sound;
      localStorage.setItem('ma_dp_app_close_sound', soundId);
      if (soundId && window.DpSounds) window.DpSounds.playUrl(opt.dataset.url);
      const mp3 = (cachedConfig.sounds?.files || []).find(f => f.id === soundId);
      const toggleLabel = document.querySelector('#dpAppCloseSoundToggle > span:first-child');
      if (toggleLabel) toggleLabel.textContent = !soundId ? '🔇 Κανένας' : (mp3 ? '🎵 ' + mp3.label : soundId);
      showToast('Ήχος κλεισίματος ενημερώθηκε');
    });

    // Back
    document.getElementById('dpBackToHub')?.addEventListener('click', () => renderHub(driver));

    // PIN logic
    const pinForm = document.getElementById('dpPinForm');
    const pinActions = document.getElementById('dpPinActions');
    const pinError = document.getElementById('dpPinError');
    const showPinError = (msg) => { if (pinError) pinError.textContent = msg; };
    const showPinForm = (isChange) => {
      const label = document.getElementById('dpPinFormLabel');
      if (label) label.textContent = isChange ? 'Νέος κωδικός (τουλάχιστον 4 χαρακτήρες)' : 'Ορίστε κωδικό (τουλάχιστον 4 χαρακτήρες)';
      if (pinForm) pinForm.style.display = '';
      if (pinActions) pinActions.style.display = 'none';
      showPinError('');
      document.getElementById('dpPinNew')?.focus();
    };
    const hidePinForm = () => {
      if (pinForm) { pinForm.style.display = 'none'; }
      if (pinActions) pinActions.style.display = '';
      showPinError('');
      const n = document.getElementById('dpPinNew'); if (n) n.value = '';
      const c = document.getElementById('dpPinConfirm'); if (c) c.value = '';
    };

    document.getElementById('dpPinSet')?.addEventListener('click', () => showPinForm(false));
    document.getElementById('dpPinChange')?.addEventListener('click', () => showPinForm(true));
    document.getElementById('dpPinCancel')?.addEventListener('click', hidePinForm);

    document.getElementById('dpPinRemove')?.addEventListener('click', async () => {
      if (!confirm('Θέλετε σίγουρα να αφαιρέσετε το PIN;')) return;
      const res = await api('/api/driver-panel/pin', {
        method: 'POST', body: JSON.stringify({ phone: driver.phone, remove: true })
      });
      if (res.ok) { driver.has_pin = false; localStorage.setItem(LS_KEY, JSON.stringify(driver)); showToast('PIN αφαιρέθηκε'); renderSettingsView(driver); }
      else { const err = await res.json().catch(() => ({})); showToast(err.error || 'Σφάλμα'); }
    });

    document.getElementById('dpPinSave')?.addEventListener('click', async () => {
      const newPin = document.getElementById('dpPinNew')?.value || '';
      const confirmPin = document.getElementById('dpPinConfirm')?.value || '';
      if (!newPin || newPin.length < 4) { showPinError('Ο κωδικός πρέπει να έχει τουλάχιστον 4 χαρακτήρες'); return; }
      if (newPin !== confirmPin) { showPinError('Οι κωδικοί δεν ταιριάζουν'); return; }
      showPinError('');
      const res = await api('/api/driver-panel/pin', {
        method: 'POST', body: JSON.stringify({ phone: driver.phone, new_pin: newPin })
      });
      if (res.ok) { driver.has_pin = true; localStorage.setItem(LS_KEY, JSON.stringify(driver)); showToast('PIN ορίστηκε'); renderSettingsView(driver); }
      else { const err = await res.json().catch(() => ({})); showPinError(err.error || 'Σφάλμα αποθήκευσης'); }
    });
  }

  // ══════════ INIT ══════════
  const init = (driver, config) => {
    cachedConfig = config;
    (async () => {
      try {
        const res = await api(`/api/driver-panel/profile?phone=${encodeURIComponent(driver.phone)}`);
        if (res.ok) { const fresh = await res.json(); localStorage.setItem(LS_KEY, JSON.stringify(fresh)); renderHub(fresh); return; }
      } catch { /* use cached */ }
      renderHub(driver);
    })();
  };

  window.DpProfile = { init, _config: {} };
})();
