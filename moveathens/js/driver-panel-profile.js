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
        <button class="ma-dp-hub-logout-btn" id="dpLogout">🚪 Αποσύνδεση</button>
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

      ${vehicleTypes.length > 0 ? `
      <div class="ma-dp-profile-section">
        <h3 class="ma-dp-profile-section-title">🚗 Τρέχον Όχημα</h3>
        <select id="dpProfileVehicle" class="ma-dp-profile-select">
          <option value="">— Επιλέξτε —</option>
          ${vehicleTypes.map(v => {
            const vId = typeof v === 'string' ? v : (v.id || v);
            const vLabel = typeof v === 'string' ? v : (v.name || v.label || v.id || v);
            return `<option value="${vId}" ${vId === currentVehicle ? 'selected' : ''}>${esc(vLabel)}</option>`;
          }).join('')}
        </select>
      </div>` : ''}

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

    document.getElementById('dpProfileVehicle')?.addEventListener('change', async (e) => {
      const res = await api('/api/driver-panel/vehicle', {
        method: 'POST',
        body: JSON.stringify({ phone: driver.phone, current_vehicle_type: e.target.value })
      });
      if (res.ok) {
        driver.current_vehicle_type = e.target.value;
        localStorage.setItem(LS_KEY, JSON.stringify(driver));
        showToast('Όχημα ενημερώθηκε');
      }
    });

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
        // Update the current vehicle dropdown options
        const sel = document.getElementById('dpProfileVehicle');
        if (sel) {
          const cur = sel.value;
          const avail = (cachedConfig.availableVehicleTypes || []).filter(vt => selected.includes(vt.id));
          sel.innerHTML = '<option value="">— Επιλέξτε —</option>' +
            avail.map(vt => `<option value="${vt.id}" ${vt.id === cur ? 'selected' : ''}>${esc(vt.name)}</option>`).join('');
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
        <h3 class="ma-dp-profile-section-title">� Ήχος Ειδοποίησης</h3>
        <p class="ma-dp-profile-hint">Επιλέξτε τον ήχο για νέες διαδρομές</p>
        <button type="button" class="ma-dp-sound-toggle" id="dpSoundToggle">
          <span>${(() => {
            const sel = localStorage.getItem('ma_dp_alert_sound') || cachedConfig.notifications?.alertSound || 'chime';
            const s = window.DpSounds?.SOUNDS?.[sel];
            return s ? s.name : '🔔 Chime';
          })()}</span>
          <span class="ma-dp-sound-toggle__arrow">▼</span>
        </button>
        <div class="ma-dp-sound-picker ma-dp-sound-picker--collapsed" id="dpDriverSoundPicker">
          ${window.DpSounds?.GROUPS ? window.DpSounds.GROUPS.map(group => {
            const driverSound = localStorage.getItem('ma_dp_alert_sound') || cachedConfig.notifications?.alertSound || 'chime';
            return `<div class="ma-dp-sound-group-label">${group.label}</div>` +
              group.ids.map(id => {
                const s = window.DpSounds.SOUNDS[id];
                if (!s) return '';
                return `<div class="ma-dp-sound-option ${id === driverSound ? 'ma-dp-sound-active' : ''}" data-sound="${id}">
                  <span class="ma-dp-sound-name">${s.name}</span>
                  <button type="button" class="ma-dp-sound-preview" data-sound="${id}">▶️</button>
                </div>`;
              }).join('');
          }).join('') : ''}
        </div>
      </div>

      <div class="ma-dp-profile-section">
        <h3 class="ma-dp-profile-section-title">�🔐 Κωδικός Ασφαλείας (PIN)</h3>
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
      const arrow = document.querySelector('.ma-dp-sound-toggle__arrow');
      if (arrow) arrow.textContent = picker?.classList.contains('ma-dp-sound-picker--collapsed') ? '▼' : '▲';
    });

    // Sound picker
    document.getElementById('dpDriverSoundPicker')?.addEventListener('click', (e) => {
      const preview = e.target.closest('.ma-dp-sound-preview');
      if (preview && window.DpSounds) { window.DpSounds.play(preview.dataset.sound); return; }
      const opt = e.target.closest('.ma-dp-sound-option');
      if (!opt) return;
      document.querySelectorAll('.ma-dp-sound-option').forEach(o => o.classList.remove('ma-dp-sound-active'));
      opt.classList.add('ma-dp-sound-active');
      localStorage.setItem('ma_dp_alert_sound', opt.dataset.sound);
      if (window.DpSounds) window.DpSounds.play(opt.dataset.sound);
      // Update toggle label
      const s = window.DpSounds?.SOUNDS?.[opt.dataset.sound];
      const toggleLabel = document.querySelector('#dpSoundToggle > span:first-child');
      if (toggleLabel && s) toggleLabel.textContent = s.name;
      showToast('Ήχος ενημερώθηκε');
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
