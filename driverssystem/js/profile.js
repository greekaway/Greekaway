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

      // Populate category row preview
      const namePreview = $('[data-ds-settings-name-preview]');
      if (namePreview) {
        const parts = [driver.fullName, driver.phone, driver.email].filter(Boolean);
        namePreview.textContent = parts.join(' · ') || 'Ονοματεπώνυμο · Τηλέφωνο · Email';
      }

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
  // SETTINGS PANEL (Freedom24-style navigation)
  // ═══════════════════════════════════════════

  const settingsHub = $('[data-ds-settings-hub]');
  const settingsBackBtn = $('[data-ds-settings-back]');
  const settingsTitleEl = $('[data-ds-settings-title]');
  let currentSubpanel = null; // null = hub

  const SUB_TITLES = {
    apps: 'Εφαρμογές',
    savings: 'Αποταμίευση',
    'driver-info': 'Στοιχεία Οδηγού'
  };

  const showSettingsHub = () => {
    currentSubpanel = null;
    if (settingsHub) settingsHub.style.display = '';
    document.querySelectorAll('[data-ds-settings-subpanel]').forEach(p => p.style.display = 'none');
    if (settingsTitleEl) settingsTitleEl.textContent = 'Ρυθμίσεις';
    // Hub has few items — center it vertically
    if (settingsOverlay) settingsOverlay.classList.remove('ds-settings--subpanel-open');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const openSubpanel = (name) => {
    const panel = $(`[data-ds-settings-subpanel="${name}"]`);
    if (!panel) return;
    currentSubpanel = name;
    if (settingsHub) settingsHub.style.display = 'none';
    document.querySelectorAll('[data-ds-settings-subpanel]').forEach(p => p.style.display = 'none');
    panel.style.display = '';
    if (settingsTitleEl) settingsTitleEl.textContent = SUB_TITLES[name] || 'Ρυθμίσεις';
    // Sub-panels may have more content — allow natural scroll
    if (settingsOverlay) settingsOverlay.classList.add('ds-settings--subpanel-open');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const openSettings = () => {
    if (!settingsOverlay) return;
    renderSettingsApps();
    renderSettingsDefault();
    renderSavingsGoals();
    showSettingsHub();
    // Hide menu sections
    const hero = $('[data-ds-profile-hero]');
    const menuList = document.querySelector('.ds-menu-list');
    const logoutRow = document.querySelector('.ds-menu-logout');
    if (hero) hero.style.display = 'none';
    if (menuList) menuList.style.display = 'none';
    if (logoutRow) logoutRow.style.display = 'none';
    const vBadge = $('[data-ds-version-badge]');
    if (vBadge) vBadge.style.display = 'none';
    const titleEl = $('[data-ds-page-title]');
    if (titleEl) titleEl.textContent = 'Ρυθμίσεις';
    settingsOverlay.style.display = '';
    settingsOverlay.classList.remove('ds-settings--subpanel-open');
    // Reduce padding so hub fits without scrolling
    const mainEl = document.querySelector('.ds-profile-main');
    if (mainEl) mainEl.classList.add('ds-settings-active');
    // Scroll to top so content is centered
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const closeSettings = () => {
    if (settingsOverlay) settingsOverlay.style.display = 'none';
    currentSubpanel = null;
    const mainEl = document.querySelector('.ds-profile-main');
    if (mainEl) mainEl.classList.remove('ds-settings-active');
    const hero = $('[data-ds-profile-hero]');
    const menuList = document.querySelector('.ds-menu-list');
    const logoutRow = document.querySelector('.ds-menu-logout');
    if (hero) hero.style.display = '';
    if (menuList) menuList.style.display = '';
    if (logoutRow) logoutRow.style.display = '';
    const vBadge = $('[data-ds-version-badge]');
    if (vBadge) vBadge.style.display = '';
    const titleEl = $('[data-ds-page-title]');
    if (titleEl) titleEl.textContent = 'Μενού';
  };

  // Single back button: if in sub-panel → go to hub, if in hub → close settings
  if (settingsBackBtn) {
    settingsBackBtn.addEventListener('click', () => {
      if (currentSubpanel) {
        showSettingsHub();
      } else {
        closeSettings();
      }
    });
  }

  // Open settings from menu row
  const settingsBtn = $('[data-ds-open-settings]');
  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);

  // Category row clicks → open sub-panel
  document.querySelectorAll('[data-ds-settings-goto]').forEach(row => {
    row.addEventListener('click', () => {
      const target = row.getAttribute('data-ds-settings-goto');
      openSubpanel(target);
    });
  });

  // ═══════════════════════════════════════════
  // SAVINGS — MULTI-GOAL (Αποταμίευση)
  // ═══════════════════════════════════════════

  const GOAL_ICON_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9.5a3.5 3.5 0 0 0-3-1.5c-1.93 0-3.5 1.34-3.5 3s1.57 3 3.5 3c1.93 0 3.5 1.34 3.5 3s-1.57 3-3.5 3a3.5 3.5 0 0 1-3-1.5"/><line x1="12" y1="6" x2="12" y2="8"/><line x1="12" y1="17" x2="12" y2="19"/></svg>';
  const goalsContainer = $('[data-ds-savings-goals]');
  const addGoalBtn = $('[data-ds-savings-add]');

  const MONTH_NAMES_SHORT = [
    'Ιαν', 'Φεβ', 'Μάρ', 'Απρ', 'Μάι', 'Ιούν',
    'Ιούλ', 'Αύγ', 'Σεπ', 'Οκτ', 'Νοέ', 'Δεκ'
  ];

  // Calculate months remaining until deadline from today
  const calcMonthsRemaining = (deadlineStr) => {
    if (!deadlineStr) return 0;
    const now = new Date();
    const [dy, dm] = deadlineStr.split('-').map(Number);
    const nowY = now.getFullYear();
    const nowM = now.getMonth() + 1;
    const months = (dy - nowY) * 12 + (dm - nowM);
    return Math.max(months, 0);
  };

  // Calculate the effective monthly amount for a goal
  const calcGoalMonthly = (goal) => {
    if (!goal.deadline) return goal.amount || 0; // legacy: flat monthly
    const months = calcMonthsRemaining(goal.deadline);
    if (months <= 0) return goal.amount || 0; // deadline passed → full amount this month
    return (goal.amount || 0) / months;
  };

  // Format deadline as "Δεκ 2026"
  const fmtDeadline = (deadlineStr) => {
    if (!deadlineStr) return '';
    const [y, m] = deadlineStr.split('-').map(Number);
    return `${MONTH_NAMES_SHORT[m - 1]} ${y}`;
  };

  // Migrate old single-field savings → savingsGoals array
  const ensureSavingsGoals = () => {
    if (!driverPrefs.savingsGoals) {
      driverPrefs.savingsGoals = [];
      // Migrate old monthlySavings if exists
      if (driverPrefs.monthlySavings > 0) {
        driverPrefs.savingsGoals.push({
          id: Date.now().toString(36),
          title: driverPrefs.savingsNote || 'Αποταμίευση',
          amount: driverPrefs.monthlySavings
        });
      }
    }
  };

  // Delete confirmation for savings (same style as entries)
  const showSavingsDeleteConfirm = (goalTitle) => {
    return new Promise((resolve) => {
      const existing = document.getElementById('dsSavingsDeleteConfirm');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'dsSavingsDeleteConfirm';
      overlay.className = 'ds-confirm-overlay';
      overlay.innerHTML = `
        <div class="ds-confirm-dialog" role="dialog" aria-modal="true">
          <div class="ds-confirm-dialog__icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </div>
          <h3 class="ds-confirm-dialog__title">Διαγραφή Αποταμίευσης</h3>
          <p class="ds-confirm-dialog__body">${
            goalTitle
              ? `<strong>${goalTitle}</strong><br>Είσαι σίγουρος ότι θέλεις να διαγράψεις αυτή την αποταμίευση;`
              : 'Είσαι σίγουρος ότι θέλεις να διαγράψεις αυτή την αποταμίευση;'
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

  const renderSavingsGoals = () => {
    if (!goalsContainer) return;
    ensureSavingsGoals();

    const goals = driverPrefs.savingsGoals;
    goalsContainer.innerHTML = '';

    if (goals.length === 0) {
      goalsContainer.innerHTML = '<div class="ds-savings-empty">Δεν έχεις στόχους αποταμίευσης ακόμα.<br>Πάτησε το κουμπί παρακάτω για να προσθέσεις.</div>';
      return;
    }

    goals.forEach((goal, i) => {
      const card = document.createElement('div');
      card.className = 'ds-savings-goal-card';
      // single professional icon for all goals
      const monthlyAmount = calcGoalMonthly(goal);
      const monthsLeft = goal.deadline ? calcMonthsRemaining(goal.deadline) : 0;
      const deadlineLabel = goal.deadline ? fmtDeadline(goal.deadline) : '';

      let infoHtml = '';
      if (goal.deadline) {
        infoHtml = `
          <span class="ds-savings-goal-card__amount">${(goal.amount || 0).toFixed(0)} €</span>
          <span class="ds-savings-goal-card__deadline">Στόχος: ${deadlineLabel} · ${monthsLeft > 0 ? monthsLeft + ' μήνες' : 'Τώρα'}</span>
          <span class="ds-savings-goal-card__permonth">${monthlyAmount.toFixed(0)} € / μήνα</span>
        `;
      } else {
        infoHtml = `<span class="ds-savings-goal-card__amount">${(goal.amount || 0).toFixed(0)} € / μήνα</span>`;
      }

      card.innerHTML = `
        <span class="ds-savings-goal-card__icon">${GOAL_ICON_SVG}</span>
        <div class="ds-savings-goal-card__body">
          <span class="ds-savings-goal-card__title">${goal.title}</span>
          ${infoHtml}
        </div>
        <button class="ds-savings-goal-card__delete" data-goal-id="${goal.id}" title="Διαγραφή">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      `;

      // Delete handler — with confirmation dialog
      card.querySelector('.ds-savings-goal-card__delete').addEventListener('click', async () => {
        const confirmed = await showSavingsDeleteConfirm(goal.title);
        if (!confirmed) return;
        driverPrefs.savingsGoals = driverPrefs.savingsGoals.filter(g => g.id !== goal.id);
        syncSavingsToLegacy();
        await saveDriverPreferences();
        renderSavingsGoals();
        if (navigator.vibrate) navigator.vibrate(50);
      });

      goalsContainer.appendChild(card);
    });

    // Total row — show calculated monthly total
    const totalMonthly = goals.reduce((s, g) => s + calcGoalMonthly(g), 0);
    if (goals.length > 0) {
      const totalEl = document.createElement('div');
      totalEl.className = 'ds-savings-total';
      totalEl.innerHTML = `
        <span class="ds-savings-total__label">Σύνολο / μήνα</span>
        <span class="ds-savings-total__value">${totalMonthly.toFixed(0)} €</span>
      `;
      goalsContainer.appendChild(totalEl);
    }
  };

  // Keep legacy monthlySavings in sync (backend target calc uses it)
  // Now calculates dynamically based on deadline-aware monthly amounts
  const syncSavingsToLegacy = () => {
    ensureSavingsGoals();
    const total = driverPrefs.savingsGoals.reduce((s, g) => s + calcGoalMonthly(g), 0);
    driverPrefs.monthlySavings = Math.round(total * 100) / 100;
    driverPrefs.savingsNote = driverPrefs.savingsGoals.map(g => g.title).join(', ').slice(0, 60);
  };

  // Show bottom-sheet modal to add a new goal
  const showAddGoalModal = () => {
    return new Promise((resolve) => {
      const existingModal = document.getElementById('dsSavingsModal');
      if (existingModal) existingModal.remove();

      // Default deadline = next December (or Dec this year if we're before Dec)
      const now = new Date();
      const defYear = now.getMonth() < 11 ? now.getFullYear() : now.getFullYear() + 1;
      const defDeadline = `${defYear}-12`;

      const overlay = document.createElement('div');
      overlay.id = 'dsSavingsModal';
      overlay.className = 'ds-savings-modal';
      overlay.innerHTML = `
        <div class="ds-savings-modal__dialog">
          <h3 class="ds-savings-modal__title">Νέος Στόχος Αποταμίευσης</h3>
          <div class="ds-savings-modal__field">
            <label class="ds-savings-modal__label" for="ds-goal-title">Τίτλος</label>
            <input class="ds-savings-modal__input" id="ds-goal-title" type="text" maxlength="40" placeholder="π.χ. Διακοπές Αύγουστος" />
          </div>
          <div class="ds-savings-modal__field">
            <label class="ds-savings-modal__label" for="ds-goal-amount">Συνολικό ποσό (€)</label>
            <input class="ds-savings-modal__input" id="ds-goal-amount" type="number" inputmode="decimal" min="0" step="10" placeholder="2000" />
          </div>
          <div class="ds-savings-modal__field">
            <label class="ds-savings-modal__label" for="ds-goal-deadline">Πότε τα χρειάζεσαι;</label>
            <input class="ds-savings-modal__input" id="ds-goal-deadline" type="month" value="${defDeadline}" min="${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}" />
          </div>
          <div class="ds-savings-modal__preview" id="ds-goal-preview" style="text-align:center;padding:8px 0 0;font-size:14px;font-weight:600;color:#00c896;min-height:22px;"></div>
          <div class="ds-savings-modal__actions">
            <button class="ds-savings-modal__btn ds-savings-modal__btn--cancel" data-modal-cancel>Άκυρο</button>
            <button class="ds-savings-modal__btn ds-savings-modal__btn--save" data-modal-save>Αποθήκευση</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const titleInput = overlay.querySelector('#ds-goal-title');
      const amountInput = overlay.querySelector('#ds-goal-amount');
      const deadlineInput = overlay.querySelector('#ds-goal-deadline');
      const previewEl = overlay.querySelector('#ds-goal-preview');
      const saveBtn = overlay.querySelector('[data-modal-save]');
      const cancelBtn = overlay.querySelector('[data-modal-cancel]');

      // Live preview of monthly amount
      const updatePreview = () => {
        const amt = parseFloat(amountInput.value) || 0;
        const dl = deadlineInput.value;
        if (amt > 0 && dl) {
          const months = calcMonthsRemaining(dl);
          if (months > 0) {
            const perMonth = Math.ceil(amt / months);
            previewEl.textContent = `≈ ${perMonth} € / μήνα · ${months} μήνες`;
          } else {
            previewEl.textContent = `Χρειάζεται όλο τώρα (${amt} € αυτό τον μήνα)`;
          }
        } else {
          previewEl.textContent = '';
        }
      };
      amountInput.addEventListener('input', updatePreview);
      deadlineInput.addEventListener('input', updatePreview);
      updatePreview();

      const close = (result) => {
        overlay.remove();
        resolve(result);
      };

      saveBtn.addEventListener('click', () => {
        const title = (titleInput.value || '').trim();
        const amount = parseFloat(amountInput.value) || 0;
        const deadline = deadlineInput.value || '';
        if (!title || amount <= 0) {
          titleInput.style.borderColor = !title ? '#ef4444' : '';
          amountInput.style.borderColor = amount <= 0 ? '#ef4444' : '';
          return;
        }
        close({ title, amount, deadline });
      });

      cancelBtn.addEventListener('click', () => close(null));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(null);
      });

      setTimeout(() => { try { titleInput.focus(); } catch (_) {} }, 50);
    });
  };

  if (addGoalBtn) {
    addGoalBtn.addEventListener('click', async () => {
      ensureSavingsGoals();
      if (driverPrefs.savingsGoals.length >= 3) {
        // Max 3 goals
        return;
      }
      const result = await showAddGoalModal();
      if (!result) return;

      driverPrefs.savingsGoals.push({
        id: Date.now().toString(36),
        title: result.title,
        amount: result.amount,
        deadline: result.deadline || ''
      });
      syncSavingsToLegacy();
      await saveDriverPreferences();
      renderSavingsGoals();
      // Scroll to top so back button is visible
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
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

  // ── Partners menu item → navigate to partners page ──
  const partnersMenuItem = $('[data-ds-menu-item="partners"]');
  if (partnersMenuItem) {
    partnersMenuItem.addEventListener('click', () => {
      const prefix = window.DriversSystemConfig ? window.DriversSystemConfig.getRoutePrefix() : '/driverssystem';
      window.location.href = prefix + '/partners';
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
      // Reload page — auth-gate will handle the login wall
      window.location.reload();
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