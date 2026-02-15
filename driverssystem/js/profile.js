/**
 * DriversSystem — Menu Hub (Freedom24-style)
 * Profile hero + Settings modal (app prefs) + Expense Review
 * Phone-based driver identification with localStorage persistence.
 */
(async () => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const STORAGE_KEY = 'ds_driver_phone';

  // ── Config ──
  const cfg = await window.DriversSystemConfig.load();

  window.DriversSystemConfig.applyPageTitles(document, cfg);

  // ── Formatting ──
  const fmtDate = (dateStr) => {
    if (!dateStr) return '—';
    const parts = dateStr.slice(0, 10).split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  const fmtAmount = (n) => (n || 0).toFixed(2).replace('.', ',') + ' €';

  const MONTH_NAMES = [
    'Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος',
    'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος',
    'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'
  ];

  const CAT_ICONS = { car: '', personal: '', tax: '' };
  const CAT_LABELS = { car: 'Αυτοκίνητο', personal: 'Προσωπικά', tax: 'Φόροι' };

  // ── DOM References ──
  const loginSection = $('[data-ds-profile-login]');
  const loginForm = $('[data-ds-profile-login-form]');
  const phoneInput = $('[data-ds-phone-input]');
  const errorEl = $('[data-ds-profile-error]');
  const menuContent = $('[data-ds-menu-content]');
  const logoutBtn = $('[data-ds-profile-logout]');

  // Settings modal
  const settingsOverlay = $('[data-ds-settings-overlay]');
  const settingsClose = $('[data-ds-settings-close]');
  const settingsApps = $('[data-ds-settings-apps]');
  const settingsDefault = $('[data-ds-settings-default]');

  // Review panel
  const reviewPanel = $('[data-ds-review-panel]');
  const reviewBack = $('[data-ds-review-back]');
  const reviewList = $('[data-ds-review-list]');
  const reviewTotalEl = $('[data-ds-review-total]');
  const reviewCountEl = $('[data-ds-review-count]');
  const reviewMonthLabel = $('[data-ds-review-month-label]');

  // Edit modal
  const editOverlay = $('[data-ds-edit-overlay]');
  const editForm = $('[data-ds-edit-form]');

  // ── State ──
  let currentPhone = null;
  let currentDriver = null;
  let reviewMonth = null;
  let reviewCategory = 'all';
  let allExpenses = [];
  let allTripSources = [];
  let driverPrefs = { activeSources: [], defaultSource: '' };

  // ── Show/Hide ──
  const showLogin = () => {
    loginSection.style.display = '';
    menuContent.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';
  };

  const showMenu = () => {
    loginSection.style.display = 'none';
    menuContent.style.display = '';
  };

  const showError = (msg) => {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.style.display = '';
  };

  // ═══════════════════════════════════════════
  // LOAD DRIVER
  // ═══════════════════════════════════════════

  const loadDriver = async (phone) => {
    try {
      const res = await fetch(`/api/driverssystem/drivers/me?phone=${encodeURIComponent(phone)}`);
      if (!res.ok) {
        if (res.status === 404) {
          showError('Δεν βρέθηκε οδηγός με αυτό το τηλέφωνο. Επικοινωνήστε με τον διαχειριστή.');
        } else {
          showError('Σφάλμα σύνδεσης. Δοκιμάστε ξανά.');
        }
        return false;
      }

      const driver = await res.json();
      currentPhone = phone;
      currentDriver = driver;
      localStorage.setItem(STORAGE_KEY, phone);

      // Populate profile hero
      const avatarEl = $('[data-ds-profile-avatar]');
      const nameEl = $('[data-ds-profile-name]');
      const phoneDisplayEl = $('[data-ds-profile-phone-display]');
      const emailEl = $('[data-ds-profile-email]');

      const initials = (driver.fullName || '?').split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
      if (avatarEl) avatarEl.textContent = initials;
      if (nameEl) nameEl.textContent = driver.fullName || '—';
      if (phoneDisplayEl) phoneDisplayEl.textContent = driver.phone || '';
      if (emailEl) {
        if (driver.email) {
          emailEl.textContent = driver.email;
          emailEl.style.display = '';
        } else {
          emailEl.style.display = 'none';
        }
      }

      // Populate settings modal read-only fields
      const sName = $('[data-ds-settings-name]');
      const sPhone = $('[data-ds-settings-phone]');
      const sEmail = $('[data-ds-settings-email]');
      if (sName) sName.textContent = driver.fullName || '—';
      if (sPhone) sPhone.textContent = driver.phone || '—';
      if (sEmail) sEmail.textContent = driver.email || '—';

      showMenu();

      // Feature flags — hide disabled modules from menu
      const applyFeatureFlags = async () => {
        try {
          const featRes = await fetch('/api/driverssystem/features');
          if (featRes.ok) {
            const features = await featRes.json();
            Object.entries(features).forEach(([key, enabled]) => {
              const el = $(`[data-ds-menu-item="${key}"]`);
              if (el) el.style.display = enabled === false ? 'none' : '';
            });
          }
        } catch (_) {}
      };
      await applyFeatureFlags();

      // Re-check features when user returns to tab (admin may have toggled)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') applyFeatureFlags();
      });

      // Load app preferences & trip sources
      await Promise.all([loadTripSources(), loadDriverPreferences(phone)]);
      renderSettingsApps();
      renderSettingsDefault();

      return true;
    } catch (err) {
      console.error('[profile] load error:', err);
      showError('Σφάλμα σύνδεσης. Δοκιμάστε ξανά.');
      return false;
    }
  };

  // ═══════════════════════════════════════════
  // APP PREFERENCES
  // ═══════════════════════════════════════════

  const loadTripSources = async () => {
    try {
      const res = await fetch('/api/driverssystem/trip-sources');
      if (res.ok) allTripSources = await res.json();
    } catch (_) {}
  };

  const loadDriverPreferences = async (phone) => {
    try {
      const res = await fetch(`/api/driverssystem/drivers/me/preferences?phone=${encodeURIComponent(phone)}`);
      if (res.ok) driverPrefs = await res.json();
    } catch (_) {}
  };

  const saveDriverPreferences = async () => {
    if (!currentPhone) return;
    try {
      await fetch(`/api/driverssystem/drivers/me/preferences?phone=${encodeURIComponent(currentPhone)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(driverPrefs)
      });
    } catch (err) {
      console.error('[profile] save prefs error:', err);
    }
  };

  // ── Render checkbox rows for active apps ──
  const renderSettingsApps = () => {
    if (!settingsApps || !allTripSources.length) return;

    const activeSources = driverPrefs.activeSources.length
      ? driverPrefs.activeSources
      : allTripSources.map(s => s.id);

    settingsApps.innerHTML = '';

    allTripSources.forEach(src => {
      const isActive = activeSources.includes(src.id);
      const row = document.createElement('div');
      row.className = 'ds-settings-app-row' + (isActive ? ' active' : '');
      row.innerHTML = `
        <span class="ds-settings-app-row__check">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
        <span class="ds-settings-app-row__dot" style="background:${src.color || '#00c896'}"></span>
        <span class="ds-settings-app-row__name">${src.name}</span>
      `;

      row.addEventListener('click', () => {
        const wasActive = row.classList.contains('active');

        if (wasActive) {
          // Don't allow deactivating all
          const activeCount = settingsApps.querySelectorAll('.ds-settings-app-row.active').length;
          if (activeCount <= 1) return;

          row.classList.remove('active');
          driverPrefs.activeSources = driverPrefs.activeSources.filter(id => id !== src.id);

          // If removing the default, clear it
          if (driverPrefs.defaultSource === src.id) {
            driverPrefs.defaultSource = '';
          }
        } else {
          row.classList.add('active');
          if (!driverPrefs.activeSources.includes(src.id)) {
            driverPrefs.activeSources.push(src.id);
          }
        }

        if (navigator.vibrate) navigator.vibrate(30);
        saveDriverPreferences();
        renderSettingsDefault(); // re-render default options
      });

      settingsApps.appendChild(row);
    });
  };

  // ── Render radio rows for default app ──
  const renderSettingsDefault = () => {
    if (!settingsDefault || !allTripSources.length) return;

    const activeSources = driverPrefs.activeSources.length
      ? driverPrefs.activeSources
      : allTripSources.map(s => s.id);

    settingsDefault.innerHTML = '';

    // "None" option
    const noneRow = document.createElement('div');
    noneRow.className = 'ds-settings-default-row enabled' + (!driverPrefs.defaultSource ? ' selected' : '');
    noneRow.innerHTML = `
      <span class="ds-settings-default-row__radio"><span class="ds-settings-default-row__radio-dot"></span></span>
      <span class="ds-settings-default-row__name" style="color:#9ca3af;font-style:italic">Καμία</span>
    `;
    noneRow.addEventListener('click', () => {
      driverPrefs.defaultSource = '';
      if (navigator.vibrate) navigator.vibrate(30);
      saveDriverPreferences();
      renderSettingsDefault();
    });
    settingsDefault.appendChild(noneRow);

    allTripSources.forEach(src => {
      const isEnabled = activeSources.includes(src.id);
      const isSelected = driverPrefs.defaultSource === src.id;

      const row = document.createElement('div');
      row.className = 'ds-settings-default-row'
        + (isEnabled ? ' enabled' : '')
        + (isSelected ? ' selected' : '');

      row.innerHTML = `
        <span class="ds-settings-default-row__radio"><span class="ds-settings-default-row__radio-dot"></span></span>
        <span class="ds-settings-default-row__dot" style="background:${src.color || '#00c896'}"></span>
        <span class="ds-settings-default-row__name">${src.name}</span>
        <span class="ds-settings-default-row__lock">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </span>
      `;

      if (isEnabled) {
        row.addEventListener('click', () => {
          driverPrefs.defaultSource = src.id;
          if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
          saveDriverPreferences();
          renderSettingsDefault();
        });
      }

      settingsDefault.appendChild(row);
    });
  };

  // ═══════════════════════════════════════════
  // SETTINGS MODAL
  // ═══════════════════════════════════════════

  const openSettings = () => {
    if (!settingsOverlay) return;
    renderSettingsApps();
    renderSettingsDefault();
    // Hide menu sections
    const hero = $('[data-ds-profile-hero]');
    const menuList = document.querySelector('.ds-menu-list');
    const logoutRow = document.querySelector('.ds-menu-logout');
    if (hero) hero.style.display = 'none';
    if (menuList) menuList.style.display = 'none';
    if (logoutRow) logoutRow.style.display = 'none';
    const vBadge = $('[data-ds-version-badge]');
    if (vBadge) vBadge.style.display = 'none';
    // Change page title
    const titleEl = $('[data-ds-page-title]');
    if (titleEl) titleEl.textContent = 'Ρυθμίσεις';
    settingsOverlay.style.display = '';
  };

  const closeSettings = () => {
    if (settingsOverlay) settingsOverlay.style.display = 'none';
    // Restore menu sections
    const hero = $('[data-ds-profile-hero]');
    const menuList = document.querySelector('.ds-menu-list');
    const logoutRow = document.querySelector('.ds-menu-logout');
    if (hero) hero.style.display = '';
    if (menuList) menuList.style.display = '';
    if (logoutRow) logoutRow.style.display = '';
    const vBadge = $('[data-ds-version-badge]');
    if (vBadge) vBadge.style.display = '';
    // Restore page title
    const titleEl = $('[data-ds-page-title]');
    if (titleEl) titleEl.textContent = 'Μενού';
  };

  // Open settings from menu row
  const settingsBtn = $('[data-ds-open-settings]');
  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);

  // Close settings
  if (settingsClose) settingsClose.addEventListener('click', closeSettings);
  if (settingsOverlay) {
    settingsOverlay.addEventListener('click', (e) => {
      if (e.target === settingsOverlay) closeSettings();
    });
  }

  // ═══════════════════════════════════════════
  // DELETE CONFIRMATION (entries-style)
  // ═══════════════════════════════════════════

  const showDeleteConfirm = (label) => {
    return new Promise((resolve) => {
      const existing = document.getElementById('dsDeleteConfirm');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'dsDeleteConfirm';
      overlay.className = 'ds-confirm-overlay';
      overlay.innerHTML = `
        <div class="ds-confirm-dialog" role="dialog" aria-modal="true">
          <div class="ds-confirm-dialog__icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </div>
          <h3 class="ds-confirm-dialog__title">Διαγραφή Εξόδου</h3>
          <p class="ds-confirm-dialog__body">${
            label
              ? `<strong>${label}</strong><br>Είσαι σίγουρος ότι θέλεις να διαγράψεις αυτό το έξοδο;`
              : 'Είσαι σίγουρος ότι θέλεις να διαγράψεις αυτό το έξοδο;'
          }</p>
          <div class="ds-confirm-dialog__actions">
            <button class="ds-confirm-btn ds-confirm-btn--cancel" data-ds-confirm-cancel>Άκυρο</button>
            <button class="ds-confirm-btn ds-confirm-btn--danger" data-ds-confirm-ok>Διαγραφή</button>
          </div>
        </div>`;

      document.body.appendChild(overlay);

      const okBtn = overlay.querySelector('[data-ds-confirm-ok]');
      const cancelBtn = overlay.querySelector('[data-ds-confirm-cancel]');

      const close = (result) => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        resolve(result);
      };

      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(false); }
      };

      okBtn.addEventListener('click', () => close(true));
      cancelBtn.addEventListener('click', () => close(false));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(false);
      });
      document.addEventListener('keydown', onKey);

      setTimeout(() => { try { okBtn.focus(); } catch (_) {} }, 30);
    });
  };

  // ═══════════════════════════════════════════
  // EXPENSE REVIEW PANEL
  // ═══════════════════════════════════════════

  // ── Debts menu item → navigate to debts page ──
  const debtsMenuItem = $('[data-ds-menu-item="debts"]');
  if (debtsMenuItem) {
    debtsMenuItem.addEventListener('click', () => {
      const prefix = window.DriversSystemConfig ? window.DriversSystemConfig.getRoutePrefix() : '/driverssystem';
      window.location.href = prefix + '/debts';
    });
  }

  // ── Appointments menu item → navigate to appointments page ──
  const appointmentsMenuItem = $('[data-ds-menu-item="appointments"]');
  if (appointmentsMenuItem) {
    appointmentsMenuItem.addEventListener('click', () => {
      const prefix = window.DriversSystemConfig ? window.DriversSystemConfig.getRoutePrefix() : '/driverssystem';
      window.location.href = prefix + '/appointments';
    });
  }

  const now = new Date();
  reviewMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Open review panel
  const menuItem = $('[data-ds-menu-item="review"]');
  if (menuItem) {
    menuItem.addEventListener('click', () => {
      // Hide menu sections, show review
      const hero = $('[data-ds-profile-hero]');
      const menuList = document.querySelector('.ds-menu-list');
      const logoutRow = document.querySelector('.ds-menu-logout');

      if (hero) hero.style.display = 'none';
      if (menuList) menuList.style.display = 'none';
      if (logoutRow) logoutRow.style.display = 'none';
      const vBadge = $('[data-ds-version-badge]');
      if (vBadge) vBadge.style.display = 'none';
      if (reviewPanel) reviewPanel.style.display = '';

      // Change page title
      const titleEl = $('[data-ds-page-title]');
      if (titleEl) titleEl.textContent = 'Πίνακας Ελέγχου';

      loadExpenses();
    });
  }

  // Back from review
  if (reviewBack) {
    reviewBack.addEventListener('click', () => {
      const hero = $('[data-ds-profile-hero]');
      const menuList = document.querySelector('.ds-menu-list');
      const logoutRow = document.querySelector('.ds-menu-logout');

      if (reviewPanel) reviewPanel.style.display = 'none';
      if (hero) hero.style.display = '';
      if (menuList) menuList.style.display = '';
      if (logoutRow) logoutRow.style.display = '';
      const vBadge = $('[data-ds-version-badge]');
      if (vBadge) vBadge.style.display = '';

      // Restore page title
      const titleEl = $('[data-ds-page-title]');
      if (titleEl) titleEl.textContent = 'Μενού';
    });
  }

  // Category filter
  $$('[data-ds-review-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-ds-review-cat]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      reviewCategory = btn.getAttribute('data-ds-review-cat');
      renderExpenses();
    });
  });

  // Month nav
  const monthPrev = $('[data-ds-review-month-prev]');
  const monthNext = $('[data-ds-review-month-next]');

  if (monthPrev) {
    monthPrev.addEventListener('click', () => {
      const [y, m] = reviewMonth.split('-').map(Number);
      const d = new Date(y, m - 2, 1);
      reviewMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      loadExpenses();
    });
  }

  if (monthNext) {
    monthNext.addEventListener('click', () => {
      const [y, m] = reviewMonth.split('-').map(Number);
      const d = new Date(y, m, 1);
      const maxMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const nextMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (nextMonth > maxMonth) return;
      reviewMonth = nextMonth;
      loadExpenses();
    });
  }

  const loadExpenses = async () => {
    if (!currentPhone) return;

    const [y, m] = reviewMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const from = `${reviewMonth}-01`;
    const to = `${reviewMonth}-${String(daysInMonth).padStart(2, '0')}`;

    try {
      const res = await fetch(`/api/driverssystem/expenses?driverId=${encodeURIComponent(currentPhone)}&from=${from}&to=${to}`);
      if (res.ok) {
        allExpenses = await res.json();
      } else {
        allExpenses = [];
      }
    } catch (_) {
      allExpenses = [];
    }

    renderMonthLabel();
    renderExpenses();
  };

  const renderMonthLabel = () => {
    if (!reviewMonthLabel) return;
    const [y, m] = reviewMonth.split('-').map(Number);
    reviewMonthLabel.textContent = `${MONTH_NAMES[m - 1]} ${y}`;
  };

  const renderExpenses = () => {
    if (!reviewList) return;

    let filtered = allExpenses;
    if (reviewCategory !== 'all') {
      filtered = allExpenses.filter(e => e.category === reviewCategory);
    }

    const total = filtered.reduce((s, e) => s + (e.amount || 0), 0);
    if (reviewTotalEl) reviewTotalEl.textContent = fmtAmount(total);
    if (reviewCountEl) reviewCountEl.textContent = String(filtered.length);

    reviewList.innerHTML = '';

    if (filtered.length === 0) {
      reviewList.innerHTML = '<div class="ds-review-empty">Δεν βρέθηκαν έξοδα</div>';
      return;
    }

    filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    filtered.forEach(exp => {
      const item = document.createElement('div');
      item.className = 'ds-review-item';
      item.setAttribute('data-expense-id', exp.id);

      const catIcon = CAT_ICONS[exp.category] || '📦';
      const itemLabel = exp.itemName || exp.description || '—';
      const groupLabel = exp.groupName || CAT_LABELS[exp.category] || exp.category;

      item.innerHTML = `
        <span class="ds-review-item__cat-icon">${catIcon}</span>
        <div class="ds-review-item__info">
          <span class="ds-review-item__name">${itemLabel}</span>
          <span class="ds-review-item__meta">${groupLabel} · ${fmtDate(exp.date)}</span>
        </div>
        <span class="ds-review-item__amount">-${fmtAmount(exp.amount)}</span>
        <span class="ds-review-item__arrow">›</span>
      `;

      item.addEventListener('click', () => openEditModal(exp));
      reviewList.appendChild(item);
    });
  };

  // ═══════════════════════════════════════════
  // EDIT EXPENSE MODAL
  // ═══════════════════════════════════════════

  const openEditModal = (expense) => {
    if (!editOverlay || !editForm) return;

    editForm.querySelector('[data-ds-edit-id]').value = expense.id;
    editForm.querySelector('[data-ds-edit-amount]').value = expense.amount;
    editForm.querySelector('[data-ds-edit-date]').value = expense.date || '';
    editForm.querySelector('[data-ds-edit-category]').value = expense.category || 'car';
    editForm.querySelector('[data-ds-edit-desc]').value = expense.description || '';

    editOverlay.style.display = 'flex';
  };

  const closeEditModal = () => {
    if (editOverlay) editOverlay.style.display = 'none';
  };

  const editCancel = $('[data-ds-edit-cancel]');
  if (editCancel) editCancel.addEventListener('click', closeEditModal);

  if (editOverlay) {
    editOverlay.addEventListener('click', (e) => {
      if (e.target === editOverlay) closeEditModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeEditModal();
      closeSettings();
    }
  });

  // Save expense
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = editForm.querySelector('[data-ds-edit-id]').value;
      const amount = parseFloat(editForm.querySelector('[data-ds-edit-amount]').value) || 0;
      const date = editForm.querySelector('[data-ds-edit-date]').value;
      const category = editForm.querySelector('[data-ds-edit-category]').value;
      const description = editForm.querySelector('[data-ds-edit-desc]').value;

      try {
        const res = await fetch(`/api/driverssystem/expenses/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, date, category, description })
        });
        if (res.ok) {
          if (navigator.vibrate) navigator.vibrate(30);
          closeEditModal();
          await loadExpenses();
        } else {
          alert('Σφάλμα αποθήκευσης');
        }
      } catch (err) {
        alert('Σφάλμα σύνδεσης');
      }
    });
  }

  // Delete expense (with entries-style confirmation)
  const editDelete = $('[data-ds-edit-delete]');
  if (editDelete) {
    editDelete.addEventListener('click', async () => {
      const id = editForm.querySelector('[data-ds-edit-id]').value;
      const desc = editForm.querySelector('[data-ds-edit-desc]').value;

      const confirmed = await showDeleteConfirm(desc || null);
      if (!confirmed) return;

      try {
        const res = await fetch(`/api/driverssystem/expenses/${id}`, { method: 'DELETE' });
        if (res.ok) {
          if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
          closeEditModal();
          await loadExpenses();
        } else {
          alert('Σφάλμα διαγραφής');
        }
      } catch (err) {
        alert('Σφάλμα σύνδεσης');
      }
    });
  }

  // ═══════════════════════════════════════════
  // LOGIN / LOGOUT
  // ═══════════════════════════════════════════

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const phone = (phoneInput.value || '').trim();
      if (!phone) {
        showError('Εισάγετε τον αριθμό τηλεφώνου σας');
        return;
      }
      if (errorEl) errorEl.style.display = 'none';

      const btn = loginForm.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Αναζήτηση…';
      }

      await loadDriver(phone);

      if (btn) {
        btn.disabled = false;
        btn.textContent = '🔒 Σύνδεση';
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      currentPhone = null;
      currentDriver = null;
      showLogin();
      if (phoneInput) phoneInput.value = '';

      // Reset review panel
      if (reviewPanel) reviewPanel.style.display = 'none';
      const hero = $('[data-ds-profile-hero]');
      const menuList = document.querySelector('.ds-menu-list');
      const logoutRow = document.querySelector('.ds-menu-logout');
      if (hero) hero.style.display = '';
      if (menuList) menuList.style.display = '';
      if (logoutRow) logoutRow.style.display = '';
    });
  }

  // ── Auto-login ──
  const savedPhone = localStorage.getItem(STORAGE_KEY);
  if (savedPhone) {
    const ok = await loadDriver(savedPhone);
    if (!ok) {
      localStorage.removeItem(STORAGE_KEY);
      showLogin();
    }
  } else {
    showLogin();
  }

  // ── Version badge ──
  try {
    const vRes = await fetch('/version.json');
    if (vRes.ok) {
      const vData = await vRes.json();
      const verEl = $('[data-ds-version]');
      const buildEl = $('[data-ds-version-build]');
      if (verEl && vData.version) verEl.textContent = vData.version;
      if (buildEl && vData.build) buildEl.textContent = `(${vData.build})`;
    }
  } catch (_) {}

})();