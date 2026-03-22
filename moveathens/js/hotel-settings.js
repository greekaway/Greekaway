/**
 * MoveAthens Hotel Settings — Client-side logic
 * Theme toggle (auto/light/dark) + PIN management
 */
(() => {
  const THEME_KEY = 'ma_theme_preference';

  // ── Theme logic ──
  const currentTheme = localStorage.getItem(THEME_KEY) || 'auto';

  function applyTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
    const html = document.documentElement;

    // Remove any forced class
    html.classList.remove('ma-force-light', 'ma-force-dark');

    if (theme === 'light') {
      html.classList.add('ma-force-light');
    } else if (theme === 'dark') {
      html.classList.add('ma-force-dark');
    }
    // 'auto' = no forced class, CSS media query handles it
  }

  // Apply stored preference on load
  applyTheme(currentTheme);

  // Theme buttons
  const themeSelector = document.getElementById('theme-selector');
  if (themeSelector) {
    const btns = themeSelector.querySelectorAll('.ma-theme-btn');

    // Highlight active
    btns.forEach(btn => {
      if (btn.dataset.theme === currentTheme) btn.classList.add('active');
    });

    themeSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.ma-theme-btn');
      if (!btn) return;
      const theme = btn.dataset.theme;
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyTheme(theme);
    });
  }

  // Clean up any leftover scale preference from previous version
  localStorage.removeItem('ma_tile_scale');

  // ═══════════════════════════════════════
  // PIN Management
  // ═══════════════════════════════════════
  const stored = (() => {
    try { return JSON.parse(localStorage.getItem('moveathens_hotel') || 'null'); } catch { return null; }
  })();
  const myPhone = stored && stored.orderer_phone ? stored.orderer_phone : null;

  const pinSection = document.getElementById('pin-section');
  if (!pinSection || !myPhone) return;

  const pinStatusIcon = document.getElementById('pin-status-icon');
  const pinStatusText = document.getElementById('pin-status-text');
  const pinFormWrap   = document.getElementById('pin-form-wrap');
  const pinActionsWrap = document.getElementById('pin-actions-wrap');
  const pinInput      = document.getElementById('pin-input');
  const pinConfirm    = document.getElementById('pin-input-confirm');
  const pinSaveBtn    = document.getElementById('pin-save-btn');
  const pinCancelBtn  = document.getElementById('pin-cancel-btn');
  const pinSetBtn     = document.getElementById('pin-set-btn');
  const pinChangeBtn  = document.getElementById('pin-change-btn');
  const pinRemoveBtn  = document.getElementById('pin-remove-btn');
  const pinError      = document.getElementById('pin-error');
  const pinFormLabel  = document.getElementById('pin-form-label');

  let hasPin = false;

  function showPinError(msg) {
    if (pinError) pinError.textContent = msg;
  }

  function updatePinUI() {
    if (hasPin) {
      pinStatusIcon.textContent = '🔒';
      pinStatusText.textContent = 'Ο κωδικός ασφαλείας είναι ενεργός';
      pinSetBtn.style.display = 'none';
      pinChangeBtn.style.display = '';
      pinRemoveBtn.style.display = '';
    } else {
      pinStatusIcon.textContent = '🔓';
      pinStatusText.textContent = 'Δεν έχετε ορίσει κωδικό ασφαλείας';
      pinSetBtn.style.display = '';
      pinChangeBtn.style.display = 'none';
      pinRemoveBtn.style.display = 'none';
    }
    pinActionsWrap.style.display = '';
    pinFormWrap.style.display = 'none';
    pinInput.value = '';
    pinConfirm.value = '';
    showPinError('');
  }

  function showPinForm(isChange) {
    pinFormLabel.textContent = isChange
      ? 'Νέος κωδικός (τουλάχιστον 4 χαρακτήρες)'
      : 'Ορίστε κωδικό (τουλάχιστον 4 χαρακτήρες)';
    pinActionsWrap.style.display = 'none';
    pinFormWrap.style.display = '';
    pinInput.value = '';
    pinConfirm.value = '';
    showPinError('');
    pinInput.focus();
  }

  // Check current PIN status
  async function checkPinStatus() {
    try {
      const res = await fetch(`/api/moveathens/check-pin?phone=${encodeURIComponent(myPhone)}`);
      if (res.ok) {
        const data = await res.json();
        hasPin = !!data.has_pin;
      }
    } catch (_) { /* ignore */ }
    updatePinUI();
  }

  // Save PIN
  pinSaveBtn.addEventListener('click', async () => {
    const pin = (pinInput.value || '').trim();
    const confirm = (pinConfirm.value || '').trim();

    if (!pin || pin.length < 4) {
      showPinError('Ο κωδικός πρέπει να έχει τουλάχιστον 4 χαρακτήρες');
      return;
    }
    if (pin !== confirm) {
      showPinError('Οι κωδικοί δεν ταιριάζουν');
      return;
    }

    pinSaveBtn.disabled = true;
    showPinError('');

    try {
      const res = await fetch('/api/moveathens/set-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: myPhone, pin })
      });

      if (res.ok) {
        hasPin = true;
        updatePinUI();
      } else {
        const err = await res.json().catch(() => ({}));
        showPinError(err.error || 'Σφάλμα αποθήκευσης');
      }
    } catch (_) {
      showPinError('Σφάλμα δικτύου');
    }
    pinSaveBtn.disabled = false;
  });

  // Cancel
  pinCancelBtn.addEventListener('click', () => {
    updatePinUI();
  });

  // Set PIN button
  pinSetBtn.addEventListener('click', () => showPinForm(false));

  // Change PIN button
  pinChangeBtn.addEventListener('click', () => showPinForm(true));

  // Remove PIN button
  pinRemoveBtn.addEventListener('click', async () => {
    pinRemoveBtn.disabled = true;
    try {
      const res = await fetch('/api/moveathens/remove-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: myPhone })
      });
      if (res.ok) {
        hasPin = false;
        updatePinUI();
      }
    } catch (_) { /* ignore */ }
    pinRemoveBtn.disabled = false;
  });

  // Initial load
  checkPinStatus();
})();
