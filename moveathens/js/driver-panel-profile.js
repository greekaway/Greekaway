/**
 * MoveAthens Driver Panel — Profile Tab
 * Driver info, vehicle change, availability, theme, PIN, version.
 */
(() => {
  'use strict';

  const LS_KEY = 'moveathens_driver';
  const VERSION = '3.0.0';

  const getDriver = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
  };

  const api = async (url, opts = {}) => {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts
    });
    return res;
  };

  const showToast = (msg) => {
    let toast = document.getElementById('dpToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'dpToast';
      toast.className = 'ma-dp-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  };

  const render = (driver, config) => {
    const wrap = document.getElementById('dpProfile');
    if (!wrap) return;

    const vehicleTypes = driver.vehicle_types || [];
    const currentVehicle = driver.current_vehicle_type || '';
    const financeConfig = config.finance || {};
    const currentTheme = localStorage.getItem('ma_dp_theme') || 'dark';

    wrap.innerHTML = `
      <!-- Driver Info -->
      <div class="ma-dp-profile-card">
        <div class="ma-dp-profile-avatar">👤</div>
        <h2 class="ma-dp-profile-name">${driver.display_name || driver.name || 'Οδηγός'}</h2>
        <p class="ma-dp-profile-phone">${driver.phone || ''}</p>
      </div>

      <!-- Current Vehicle -->
      ${vehicleTypes.length > 0 ? `
      <div class="ma-dp-profile-section">
        <h3 class="ma-dp-profile-section-title">🚗 Τρέχον Όχημα</h3>
        <select id="dpProfileVehicle" class="ma-dp-profile-select">
          <option value="">— Επιλέξτε —</option>
          ${vehicleTypes.map(v => {
            const vId = typeof v === 'string' ? v : (v.id || v);
            const vLabel = typeof v === 'string' ? v : (v.name || v.label || v.id || v);
            return `<option value="${vId}" ${vId === currentVehicle ? 'selected' : ''}>${vLabel}</option>`;
          }).join('')}
        </select>
      </div>
      ` : ''}

      <!-- Availability -->
      <div class="ma-dp-profile-section">
        <h3 class="ma-dp-profile-section-title">📡 Διαθεσιμότητα</h3>
        <label class="ma-dp-profile-toggle">
          <input type="checkbox" id="dpProfileAvail" ${driver.is_active ? 'checked' : ''}>
          <span class="ma-dp-profile-toggle-slider"></span>
          <span id="dpAvailLabel">${driver.is_active ? 'Ενεργός' : 'Ανενεργός'}</span>
        </label>
      </div>

      <!-- Settings -->
      <div class="ma-dp-profile-section">
        <h3 class="ma-dp-profile-section-title">⚙️ Ρυθμίσεις</h3>
        <div class="ma-dp-profile-settings">
          <label class="ma-dp-profile-toggle">
            <span>Θέμα: </span>
            <select id="dpProfileTheme" class="ma-dp-profile-select ma-dp-profile-select-sm">
              <option value="dark" ${currentTheme === 'dark' ? 'selected' : ''}>Σκούρο</option>
              <option value="light" ${currentTheme === 'light' ? 'selected' : ''}>Φωτεινό</option>
            </select>
          </label>
        </div>
      </div>

      <!-- PIN -->
      <div class="ma-dp-profile-section">
        <h3 class="ma-dp-profile-section-title">🔐 Κωδικός PIN</h3>
        <p class="ma-dp-profile-hint">${driver.has_pin ? 'Έχετε ορίσει PIN.' : 'Δεν έχετε ορίσει PIN.'}</p>
        <div id="dpPinActions">
          ${driver.has_pin ? `
            <button class="ma-dp-btn ma-dp-btn-outline" id="dpPinChange">Αλλαγή PIN</button>
            <button class="ma-dp-btn ma-dp-btn-danger" id="dpPinRemove">Αφαίρεση PIN</button>
          ` : `
            <button class="ma-dp-btn ma-dp-btn-outline" id="dpPinSet">Ορισμός PIN</button>
          `}
        </div>
        <div id="dpPinForm" class="ma-dp-pin-form" style="display:none">
          ${driver.has_pin ? `
            <input type="password" id="dpPinCurrent" class="ma-dp-profile-input" placeholder="Τρέχον PIN" inputmode="numeric">
          ` : ''}
          <input type="password" id="dpPinNew" class="ma-dp-profile-input" placeholder="Νέο PIN (4+ ψηφία)" inputmode="numeric">
          <input type="password" id="dpPinConfirm" class="ma-dp-profile-input" placeholder="Επιβεβαίωση PIN" inputmode="numeric">
          <button class="ma-dp-btn" id="dpPinSave">Αποθήκευση</button>
          <button class="ma-dp-btn ma-dp-btn-outline" id="dpPinCancel">Ακύρωση</button>
        </div>
      </div>

      <!-- Version -->
      <div class="ma-dp-profile-section ma-dp-profile-version">
        <p>MoveAthens Driver v${VERSION}</p>
      </div>

      <!-- Logout -->
      <button class="ma-dp-btn ma-dp-btn-danger ma-dp-logout-btn" id="dpLogout">Αποσύνδεση</button>
    `;

    // Attach event listeners
    attachListeners(driver);
  };

  const attachListeners = (driver) => {
    // Vehicle change
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

    // Availability toggle
    document.getElementById('dpProfileAvail')?.addEventListener('change', async (e) => {
      const isActive = e.target.checked;
      const res = await api('/api/driver-panel/availability', {
        method: 'POST',
        body: JSON.stringify({ phone: driver.phone, is_active: isActive })
      });
      if (res.ok) {
        driver.is_active = isActive;
        localStorage.setItem(LS_KEY, JSON.stringify(driver));
        const label = document.getElementById('dpAvailLabel');
        if (label) label.textContent = isActive ? 'Ενεργός' : 'Ανενεργός';
        showToast(isActive ? 'Ενεργός' : 'Ανενεργός');
      }
    });

    // Theme
    document.getElementById('dpProfileTheme')?.addEventListener('change', (e) => {
      const theme = e.target.value;
      localStorage.setItem('ma_dp_theme', theme);
      if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
      else document.documentElement.removeAttribute('data-theme');
      showToast(theme === 'light' ? 'Φωτεινό θέμα' : 'Σκούρο θέμα');
    });

    // PIN set/change/remove
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
        method: 'POST',
        body: JSON.stringify({ phone: driver.phone, current_pin: currentPin, remove: true })
      });
      if (res.ok) {
        driver.has_pin = false;
        localStorage.setItem(LS_KEY, JSON.stringify(driver));
        showToast('PIN αφαιρέθηκε');
        render(driver, window.DpProfile._config || {});
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Σφάλμα');
      }
    });

    document.getElementById('dpPinSave')?.addEventListener('click', async () => {
      const currentPin = document.getElementById('dpPinCurrent')?.value || '';
      const newPin = document.getElementById('dpPinNew')?.value || '';
      const confirm = document.getElementById('dpPinConfirm')?.value || '';

      if (!newPin || newPin.length < 4) { showToast('Ελάχιστο 4 ψηφία'); return; }
      if (newPin !== confirm) { showToast('Τα PIN δεν ταιριάζουν'); return; }

      const res = await api('/api/driver-panel/pin', {
        method: 'POST',
        body: JSON.stringify({ phone: driver.phone, current_pin: currentPin || undefined, new_pin: newPin })
      });
      if (res.ok) {
        driver.has_pin = true;
        localStorage.setItem(LS_KEY, JSON.stringify(driver));
        showToast('PIN ορίστηκε');
        render(driver, window.DpProfile._config || {});
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Σφάλμα');
      }
    });

    // Logout
    document.getElementById('dpLogout')?.addEventListener('click', () => {
      if (typeof window.DpAuth?.logout === 'function') window.DpAuth.logout();
    });
  };

  const init = (driver, config) => {
    window.DpProfile._config = config;
    // Fetch fresh profile from server
    (async () => {
      try {
        const res = await api(`/api/driver-panel/profile?phone=${encodeURIComponent(driver.phone)}`);
        if (res.ok) {
          const fresh = await res.json();
          localStorage.setItem(LS_KEY, JSON.stringify(fresh));
          render(fresh, config);
          return;
        }
      } catch { /* use cached */ }
      render(driver, config);
    })();
  };

  window.DpProfile = { init, _config: {} };
})();
