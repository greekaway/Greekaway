/** MoveAthens Driver Panel — Menu Hub + Sub-views */
(() => {
  'use strict';

  const LS_KEY = 'moveathens_driver';
  let VERSION = '—';

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
        <h3 class="ma-dp-profile-section-title">🔐 Κωδικός Ασφαλείας (PIN)</h3>
        <p class="ma-dp-profile-hint">${driver.has_pin ? 'Ορίστε ένα PIN για επιπλέον ασφάλεια κατά τη σύνδεση' : 'Ορίστε ένα PIN για επιπλέον ασφάλεια κατά τη σύνδεση'}</p>
        ${driver.has_pin ? `
        <div class="ma-dp-pin-status">
          <span>🔒 Ο κωδικός ασφαλείας είναι ενεργός</span>
        </div>
        <div class="ma-dp-pin-actions" id="dpPinActions">
          <button class="ma-dp-btn ma-dp-btn-outline" id="dpPinChange">Αλλαγή PIN</button>
          <button class="ma-dp-btn ma-dp-btn-danger-outline" id="dpPinRemove">Αφαίρεση PIN</button>
        </div>` : `
        <div class="ma-dp-pin-status inactive">
          <span>Δεν έχετε ορίσει PIN.</span>
        </div>
        <div class="ma-dp-pin-actions" id="dpPinActions">
          <a class="ma-dp-pin-link" id="dpPinSet">Ορισμός PIN</a>
        </div>`}
        <div id="dpPinForm" class="ma-dp-pin-form" style="display:none">
          ${driver.has_pin ? '<input type="password" id="dpPinCurrent" class="ma-dp-profile-input" placeholder="Τρέχον PIN" inputmode="numeric">' : ''}
          <input type="password" id="dpPinNew" class="ma-dp-profile-input" placeholder="Νέο PIN (4+ ψηφία)" inputmode="numeric">
          <input type="password" id="dpPinConfirm" class="ma-dp-profile-input" placeholder="Επιβεβαίωση PIN" inputmode="numeric">
          <button class="ma-dp-btn" id="dpPinSave">Αποθήκευση</button>
          <button class="ma-dp-btn ma-dp-btn-outline" id="dpPinCancel">Ακύρωση</button>
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

    // Back
    document.getElementById('dpBackToHub')?.addEventListener('click', () => renderHub(driver));

    // PIN logic
    const pinForm = document.getElementById('dpPinForm');
    const pinActions = document.getElementById('dpPinActions');
    const showPinForm = () => { if (pinForm) pinForm.style.display = ''; if (pinActions) pinActions.style.display = 'none'; };
    const hidePinForm = () => { if (pinForm) pinForm.style.display = 'none'; if (pinActions) pinActions.style.display = ''; };

    document.getElementById('dpPinSet')?.addEventListener('click', showPinForm);
    document.getElementById('dpPinChange')?.addEventListener('click', showPinForm);
    document.getElementById('dpPinCancel')?.addEventListener('click', hidePinForm);

    document.getElementById('dpPinRemove')?.addEventListener('click', async () => {
      const currentPin = prompt('Εισάγετε το τρέχον PIN:');
      if (!currentPin) return;
      const res = await api('/api/driver-panel/pin', {
        method: 'POST', body: JSON.stringify({ phone: driver.phone, current_pin: currentPin, remove: true })
      });
      if (res.ok) { driver.has_pin = false; localStorage.setItem(LS_KEY, JSON.stringify(driver)); showToast('PIN αφαιρέθηκε'); renderSettingsView(driver); }
      else { const err = await res.json().catch(() => ({})); showToast(err.error || 'Σφάλμα'); }
    });

    document.getElementById('dpPinSave')?.addEventListener('click', async () => {
      const currentPin = document.getElementById('dpPinCurrent')?.value || '';
      const newPin = document.getElementById('dpPinNew')?.value || '';
      const confirmPin = document.getElementById('dpPinConfirm')?.value || '';
      if (!newPin || newPin.length < 4) { showToast('Ελάχιστο 4 ψηφία'); return; }
      if (newPin !== confirmPin) { showToast('Τα PIN δεν ταιριάζουν'); return; }
      const res = await api('/api/driver-panel/pin', {
        method: 'POST', body: JSON.stringify({ phone: driver.phone, current_pin: currentPin || undefined, new_pin: newPin })
      });
      if (res.ok) { driver.has_pin = true; localStorage.setItem(LS_KEY, JSON.stringify(driver)); showToast('PIN ορίστηκε'); renderSettingsView(driver); }
      else { const err = await res.json().catch(() => ({})); showToast(err.error || 'Σφάλμα'); }
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
