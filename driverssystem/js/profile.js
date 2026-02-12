/**
 * DriversSystem — Profile Page
 * Phone-based driver identification with localStorage persistence
 */
(async () => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const STORAGE_KEY = 'ds_driver_phone';

  // ── Config ──
  const cfg = await window.DriversSystemConfig.load();

  // Apply logo
  const logo = $('[data-ds-hero-logo]');
  if (logo && cfg.heroLogoUrl) {
    logo.src = cfg.heroLogoUrl;
    logo.style.display = 'block';
  }

  // Home link
  const homeLink = $('[data-ds-home-link]');
  if (homeLink) {
    homeLink.href = window.DriversSystemConfig.buildRoute('/');
  }

  // ── Formatting ──
  const fmtEur = (v) => {
    const num = (v || 0).toFixed(2);
    return num.replace('.', ',') + ' \u20AC';
  };

  const fmtDate = (dateStr) => {
    if (!dateStr) return '—';
    const parts = dateStr.slice(0, 10).split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  // ── DOM References ──
  const loginSection = $('[data-ds-profile-login]');
  const loginForm = $('[data-ds-profile-login-form]');
  const phoneInput = $('[data-ds-phone-input]');
  const errorEl = $('[data-ds-profile-error]');
  const profileCard = $('[data-ds-profile-card]');
  const financialsSection = $('[data-ds-profile-financials]');
  const actionsSection = $('[data-ds-profile-actions]');
  const goStatsBtn = $('[data-ds-go-stats]');
  const logoutBtn = $('[data-ds-profile-logout]');

  // ── Show/Hide States ──
  const showLogin = () => {
    loginSection.style.display = '';
    profileCard.style.display = 'none';
    financialsSection.style.display = 'none';
    actionsSection.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';
  };

  const showProfile = () => {
    loginSection.style.display = 'none';
    profileCard.style.display = '';
    financialsSection.style.display = '';
    actionsSection.style.display = '';
  };

  const showError = (msg) => {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.style.display = '';
  };

  // ── Load Driver Profile ──
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

      // Save phone to localStorage
      localStorage.setItem(STORAGE_KEY, phone);

      // Populate profile card
      const avatarEl = $('[data-ds-profile-avatar]');
      const nameEl = $('[data-ds-profile-name]');
      const emailEl = $('[data-ds-profile-email]');
      const phoneDisplayEl = $('[data-ds-profile-phone-display]');
      const sinceEl = $('[data-ds-profile-since]');

      const initials = (driver.fullName || '?').split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
      if (avatarEl) avatarEl.textContent = initials;
      if (nameEl) nameEl.textContent = driver.fullName || '—';
      if (emailEl) emailEl.textContent = driver.email ? `✉️ ${driver.email}` : '';
      if (phoneDisplayEl) phoneDisplayEl.textContent = `📱 ${driver.phone}`;
      if (sinceEl) sinceEl.textContent = fmtDate(driver.createdAt);

      // Load financial stats
      await loadFinancials(driver.phone);

      showProfile();
      return true;
    } catch (err) {
      console.error('[profile] load error:', err);
      showError('Σφάλμα σύνδεσης. Δοκιμάστε ξανά.');
      return false;
    }
  };

  // ── Load Financial Summary ──
  const loadFinancials = async (driverId) => {
    try {
      const res = await fetch(`/api/driverssystem/stats?driverId=${encodeURIComponent(driverId)}`);
      if (!res.ok) return;
      const stats = await res.json();

      const grossEl = $('[data-ds-profile-gross]');
      const netEl = $('[data-ds-profile-net]');
      const tripsEl = $('[data-ds-profile-trips]');
      const commissionEl = $('[data-ds-profile-commission]');

      if (grossEl) grossEl.textContent = fmtEur(stats.totalGross);
      if (netEl) netEl.textContent = fmtEur(stats.totalNet);
      if (tripsEl) tripsEl.textContent = stats.count || 0;
      if (commissionEl) commissionEl.textContent = fmtEur(stats.totalCommission);
    } catch (err) {
      console.error('[profile] financials error:', err);
    }
  };

  // ── Login Form Submit ──
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const phone = (phoneInput.value || '').trim();
      if (!phone) {
        showError('Εισάγετε τον αριθμό τηλεφώνου σας');
        return;
      }
      if (errorEl) errorEl.style.display = 'none';

      // Disable button while loading
      const btn = loginForm.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Αναζήτηση…';
      }

      await loadDriver(phone);

      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Αναζήτηση';
      }
    });
  }

  // ── Go to Stats ──
  if (goStatsBtn) {
    goStatsBtn.addEventListener('click', () => {
      window.location.href = window.DriversSystemConfig.buildRoute('/info');
    });
  }

  // ── Logout ──
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      showLogin();
      if (phoneInput) phoneInput.value = '';
    });
  }

  // ── Auto-login if saved phone exists ──
  const savedPhone = localStorage.getItem(STORAGE_KEY);
  if (savedPhone) {
    const ok = await loadDriver(savedPhone);
    if (!ok) {
      // Saved phone no longer valid
      localStorage.removeItem(STORAGE_KEY);
      showLogin();
    }
  } else {
    showLogin();
  }

})();
