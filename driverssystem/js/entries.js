/**
 * DriversSystem — Entries Page
 * Quick-entry UI for drivers to log trip earnings
 */
(async () => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ── Auth Guard — check if driver is logged in ──
  const STORAGE_KEY = 'ds_driver_phone';
  const savedPhone = localStorage.getItem(STORAGE_KEY);

  if (!savedPhone) {
    const profileUrl = window.DriversSystemConfig
      ? window.DriversSystemConfig.buildRoute('/profile')
      : '/driverssystem/profile';

    const guard = document.createElement('div');
    guard.className = 'ds-auth-guard';
    guard.innerHTML = `
      <div class="ds-auth-guard__inner">
        <div class="ds-auth-guard__icon">🔒</div>
        <h2 class="ds-auth-guard__title">Απαιτείται Σύνδεση</h2>
        <p class="ds-auth-guard__desc">Για να καταχωρήσετε διαδρομές, πρέπει πρώτα να συνδεθείτε με τον αριθμό τηλεφώνου σας.</p>
        <a class="ds-auth-guard__btn" href="${profileUrl}">Σύνδεση στο Προφίλ</a>
      </div>`;
    document.body.appendChild(guard);
    const cfg = await window.DriversSystemConfig.load();
    return;
  }

  // ── Config ──
  const cfg = await window.DriversSystemConfig.load();
  window.DriversSystemConfig.applyPageTitles(document, cfg);

  // ── Greece timezone helper ──
  const greeceNow = () => {
    const now = new Date();
    return new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Athens' }));
  };
  const greeceToday = () => {
    const gr = greeceNow();
    return gr.getFullYear() + '-' + String(gr.getMonth() + 1).padStart(2, '0') + '-' + String(gr.getDate()).padStart(2, '0');
  };
  const greeceTimeStr = () => {
    const gr = greeceNow();
    return String(gr.getHours()).padStart(2, '0') + ':' + String(gr.getMinutes()).padStart(2, '0');
  };

  // ── State ──
  let sources = [];
  let selectedSource = null;
  let currentDate = greeceToday();
  let amountCents = 0; // ATM-style: store amount as integer cents

  const fmtEur = (v) => {
    const num = (v || 0).toFixed(2);
    return num.replace('.', ',') + ' \u20AC';
  };

  // Format cents to display string with comma (e.g. 555 → "5,55")
  const centsToDisplay = (cents) => {
    const str = (cents / 100).toFixed(2);
    return str.replace('.', ',');
  };

  // Cents to float for API
  const centsToFloat = (cents) => cents / 100;

  // ── API helpers ──
  const api = async (url, method = 'GET', body = null) => {
    const opts = { method };
    if (body) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    return res;
  };

  // ── Load sources ──
  const loadSources = async () => {
    try {
      const res = await api('/api/driverssystem/trip-sources');
      if (res.ok) sources = await res.json();
    } catch (_) {
      sources = [];
    }
  };

  // ── Load driver preferences & filter sources ──
  let driverDefaultSource = '';
  const loadDriverPrefs = async () => {
    const phone = localStorage.getItem('ds_driver_phone');
    if (!phone) return;
    try {
      const res = await api(`/api/driverssystem/drivers/me/preferences?phone=${encodeURIComponent(phone)}`);
      if (res.ok) {
        const prefs = await res.json();
        // Filter sources to only active ones if driver has preferences
        if (prefs.activeSources && prefs.activeSources.length > 0) {
          sources = sources.filter(s => prefs.activeSources.includes(s.id));
        }
        driverDefaultSource = prefs.defaultSource || '';
      }
    } catch (_) {}
  };

  // ── Render source pills ──
  const renderSourcePills = () => {
    const container = $('[data-ds-source-pills]');
    if (!container) return;

    container.innerHTML = sources.map((s) => `
      <button type="button" class="ds-source-pill${driverDefaultSource === s.id ? ' selected' : ''}" 
              data-source-id="${s.id}" 
              style="--pill-color: ${s.color || '#059669'}">
        <span class="ds-source-pill__dot" style="background: ${s.color || '#059669'}"></span>
        <span class="ds-source-pill__name">${s.name}</span>
        ${s.commission > 0 ? `<span class="ds-source-pill__commission">${s.commission}%</span>` : ''}
      </button>
    `).join('');

    // Auto-select default source on first render
    if (driverDefaultSource && !selectedSource) {
      selectedSource = sources.find(s => s.id === driverDefaultSource) || null;
    }

    // Bind pill clicks
    container.querySelectorAll('.ds-source-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        const id = pill.dataset.sourceId;
        const wasSelected = pill.classList.contains('selected');

        container.querySelectorAll('.ds-source-pill').forEach(p => p.classList.remove('selected'));

        if (wasSelected) {
          selectedSource = null;
        } else {
          pill.classList.add('selected');
          selectedSource = sources.find(s => s.id === id) || null;
          // Focus amount input after selecting source
          const amountInput = $('[data-ds-amount]');
          if (amountInput) amountInput.focus();
        }
        updateNetPreview();
        updateSaveBtn();
      });
    });
  };

  // ── Net preview ──
  const updateNetPreview = () => {
    const netValue = $('[data-ds-net-value]');
    if (!netValue) return;

    const amount = centsToFloat(amountCents);
    const commission = selectedSource ? (selectedSource.commission || 0) : 0;

    if (amount > 0 && selectedSource) {
      const net = amount * (1 - commission / 100);
      netValue.textContent = fmtEur(net);
    } else {
      netValue.textContent = '—';
    }
  };

  // ── Save button state ──
  const updateSaveBtn = () => {
    const btn = $('[data-ds-save-btn]');
    if (!btn) return;
    btn.disabled = !selectedSource || amountCents <= 0;
  };

  // ── Save entry ──
  const saveEntry = async () => {
    const btn = $('[data-ds-save-btn]');
    const amountInput = $('[data-ds-amount]');
    const noteInput = $('[data-ds-note]');
    if (!btn || !selectedSource) return;

    const amount = centsToFloat(amountCents);
    if (amount <= 0) return;

    const commission = selectedSource.commission || 0;
    const netAmount = amount * (1 - commission / 100);

    btn.classList.add('saving');
    btn.querySelector('.ds-save-btn__text').textContent = 'Αποθήκευση…';

    try {
      const driverPhone = localStorage.getItem('ds_driver_phone') || '';
      const res = await api('/api/driverssystem/entries', 'POST', {
        driverId: driverPhone,
        sourceId: selectedSource.id,
        sourceName: selectedSource.name,
        amount,
        commission,
        netAmount: Math.round(netAmount * 100) / 100,
        date: currentDate,
        time: greeceTimeStr(),
        note: noteInput?.value || ''
      });

      if (res.ok) {
        // Reset form
        if (amountInput) amountInput.value = '0,00';
        amountCents = 0;
        if (noteInput) noteInput.value = '';

        // Reset source back to default (if set), otherwise clear
        const pills = $('[data-ds-source-pills]');
        if (pills) pills.querySelectorAll('.ds-source-pill').forEach(p => p.classList.remove('selected'));
        if (driverDefaultSource) {
          selectedSource = sources.find(s => s.id === driverDefaultSource) || null;
          if (selectedSource && pills) {
            const defPill = pills.querySelector(`[data-source-id="${driverDefaultSource}"]`);
            if (defPill) defPill.classList.add('selected');
          }
        } else {
          selectedSource = null;
        }
        updateNetPreview();
        updateSaveBtn();

        // Haptic feedback (if available)
        if (navigator.vibrate) navigator.vibrate(50);

        // Reload list & summary & target, auto-start shift
        await Promise.all([loadEntries(), loadDailyTarget()]);
        // Auto-start shift if not active
        if (typeof window._dsShiftAutoStart === 'function') {
          window._dsShiftAutoStart();
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Σφάλμα αποθήκευσης');
      }
    } catch (_) {
      alert('Σφάλμα σύνδεσης');
    }

    btn.classList.remove('saving');
    btn.querySelector('.ds-save-btn__text').textContent = 'Αποθήκευση';
  };

  // ── Delete confirmation modal ──
  const showDeleteConfirm = (label) => {
    return new Promise((resolve) => {
      // Remove any existing modal
      const existing = document.getElementById('dsDeleteConfirm');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'dsDeleteConfirm';
      overlay.className = 'ds-confirm-overlay';
      overlay.innerHTML = `
        <div class="ds-confirm-dialog" role="dialog" aria-modal="true">
          <div class="ds-confirm-dialog__icon">🗑️</div>
          <h3 class="ds-confirm-dialog__title">Διαγραφή Καταχώρησης</h3>
          <p class="ds-confirm-dialog__body">${
            label
              ? `<strong>${label}</strong><br>Είσαι σίγουρος ότι θέλεις να διαγράψεις αυτή την καταχώρηση;`
              : 'Είσαι σίγουρος ότι θέλεις να διαγράψεις αυτή την καταχώρηση;'
          }</p>
          <div class="ds-confirm-dialog__actions">
            <button class="ds-confirm-btn ds-confirm-btn--cancel" data-ds-confirm-cancel>Άκυρο</button>
            <button class="ds-confirm-btn ds-confirm-btn--danger" data-ds-confirm-ok>Διαγραφή</button>
          </div>
        </div>`;

      document.body.appendChild(overlay);

      const okBtn     = overlay.querySelector('[data-ds-confirm-ok]');
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

      // Focus danger button after paint
      setTimeout(() => { try { okBtn.focus(); } catch (_) {} }, 30);
    });
  };

  // ── Load entries ──
  const loadEntries = async () => {
    const list = $('[data-ds-entries-list]');
    const empty = $('[data-ds-entries-empty]');
    if (!list) return;

    try {
      const driverPhone = localStorage.getItem('ds_driver_phone') || '';
      const res = await api(`/api/driverssystem/entries?date=${currentDate}&driverId=${encodeURIComponent(driverPhone)}`);
      if (!res.ok) return;
      const entries = await res.json();

      if (!entries.length) {
        list.innerHTML = '';
        if (empty) {
          empty.style.display = 'block';
          list.appendChild(empty);
        }
        return;
      }

      if (empty) empty.style.display = 'none';

      list.innerHTML = entries.map((e) => {
        const source = sources.find(s => s.id === e.sourceId);
        const color = source?.color || '#9ca3af';
        return `
          <div class="ds-entry-item" data-entry-id="${e.id}">
            <span class="ds-entry-item__source-dot" style="background: ${color}"></span>
            <div class="ds-entry-item__info">
              <span class="ds-entry-item__source-name">${e.sourceName || e.sourceId}</span>
              <span class="ds-entry-item__time">${e.time || ''}</span>
              ${e.note ? `<span class="ds-entry-item__note">${e.note}</span>` : ''}
            </div>
            <div class="ds-entry-item__amounts">
              <span class="ds-entry-item__gross">${fmtEur(e.amount)}</span>
              <span class="ds-entry-item__net">καθ. ${fmtEur(e.netAmount)}</span>
            </div>
            <button class="ds-entry-item__delete" data-delete-id="${e.id}" aria-label="Διαγραφή">&times;</button>
          </div>`;
      }).join('');

      // Bind delete buttons
      list.querySelectorAll('[data-delete-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.deleteId;
          const entry = entries.find(e => e.id === id);
          const label = entry
            ? `${entry.sourceName || entry.sourceId} — ${fmtEur(entry.amount)}`
            : '';
          const confirmed = await showDeleteConfirm(label);
          if (!confirmed) return;
          const res = await api(`/api/driverssystem/entries/${id}`, 'DELETE');
          if (res.ok) {
            if (navigator.vibrate) navigator.vibrate(30);
            await Promise.all([loadEntries(), loadDailyTarget()]);
          }
        });
      });
    } catch (_) { /* silent */ }
  };

  // ── Load daily target ──
  const loadDailyTarget = async () => {
    const targetValueEl = $('[data-ds-target-value]');
    const targetRemainingEl = $('[data-ds-target-remaining]');
    if (!targetValueEl) return;

    try {
      const driverPhone = localStorage.getItem('ds_driver_phone') || '';
      const params = new URLSearchParams({ driverId: driverPhone });
      const res = await api(`/api/driverssystem/daily-target?${params}`);
      if (!res.ok) return;
      const t = await res.json();

      targetValueEl.textContent = fmtEur(t.dailyTarget || 0);

      if (targetRemainingEl) {
        const todayNet = t.earnedThisMonth || 0;
        const needed = t.monthlyExpenses || 0;
        const remaining = needed - todayNet;
        if (remaining <= 0) {
          targetRemainingEl.textContent = 'Στόχος επιτεύχθηκε';
          targetRemainingEl.classList.add('ds-target--reached');
        } else {
          targetRemainingEl.textContent = `Υπόλοιπο μήνα: ${fmtEur(remaining)}`;
          targetRemainingEl.classList.remove('ds-target--reached');
        }
      }
    } catch (_) { /* silent */ }
  };

  // ── Date navigation — always today (date picker removed) ──
  let today = greeceToday();

  // ── Bind form ──
  const initForm = () => {
    const amountInput = $('[data-ds-amount]');
    const saveBtn = $('[data-ds-save-btn]');

    if (amountInput) {
      // Initialize display
      amountInput.value = '0,00';

      // ATM-style: digits fill from right, comma auto-placed
      // e.g. press 5 → 0,05 → 0,55 → 5,55 → 55,55
      amountInput.addEventListener('keydown', (e) => {
        // Allow Tab/Enter to pass through for navigation
        if (e.key === 'Tab' || e.key === 'Enter') return;
        e.preventDefault();

        if (e.key >= '0' && e.key <= '9') {
          // Prevent unreasonably large amounts (max 99999,99)
          if (amountCents >= 10000000) return;
          amountCents = amountCents * 10 + parseInt(e.key);
          amountInput.value = centsToDisplay(amountCents);
          updateNetPreview();
          updateSaveBtn();
        } else if (e.key === 'Backspace') {
          amountCents = Math.floor(amountCents / 10);
          amountInput.value = centsToDisplay(amountCents);
          updateNetPreview();
          updateSaveBtn();
        } else if (e.key === 'Delete') {
          amountCents = 0;
          amountInput.value = '0,00';
          updateNetPreview();
          updateSaveBtn();
        }
      });

      // Make it focusable and show keyboard on mobile
      amountInput.removeAttribute('readonly');
      amountInput.setAttribute('inputmode', 'numeric');
      // Prevent native input handling (we handle keydown)
      amountInput.addEventListener('beforeinput', (e) => e.preventDefault());

      // Prevent paste
      amountInput.addEventListener('paste', (e) => e.preventDefault());
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', saveEntry);
    }
  };

  // ── Init ──
  await loadSources();
  await loadDriverPrefs();
  renderSourcePills();
  initForm();
  updateNetPreview();
  updateSaveBtn();
  await Promise.all([loadEntries(), loadDailyTarget()]);

  // ── Live updates: poll every 20s + midnight detection ──
  let lastKnownDate = greeceToday();

  const liveRefresh = async () => {
    const nowDate = greeceToday();
    if (nowDate !== lastKnownDate) {
      // Day changed — update today reference and switch to new day
      lastKnownDate = nowDate;
      today = nowDate;
      currentDate = nowDate;
      await Promise.all([loadEntries(), loadDailyTarget()]);
      return;
    }
    // Refresh current view
    await Promise.all([loadEntries(), loadDailyTarget()]);
  };

  setInterval(liveRefresh, 20000);
})();
