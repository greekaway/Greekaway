/**
 * DriversSystem — Entries Page
 * Quick-entry UI for drivers to log trip earnings
 */
(async () => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ── Config ──
  const cfg = await window.DriversSystemConfig.load();
  window.DriversSystemConfig.applyPageTitles(document, cfg);

  // Apply logo
  const logo = $('[data-ds-hero-logo]');
  if (logo && cfg.heroLogoUrl) {
    logo.src = cfg.heroLogoUrl;
    logo.style.display = 'block';
  }

  // Home link — domain-aware
  const homeLink = $('[data-ds-home-link]');
  if (homeLink) {
    homeLink.href = window.DriversSystemConfig.buildRoute('/');
  }

  // ── State ──
  let sources = [];
  let selectedSource = null;
  let currentDate = new Date().toISOString().slice(0, 10);
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

  // ── Render source pills ──
  const renderSourcePills = () => {
    const container = $('[data-ds-source-pills]');
    if (!container) return;

    container.innerHTML = sources.map((s) => `
      <button type="button" class="ds-source-pill" 
              data-source-id="${s.id}" 
              style="--pill-color: ${s.color || '#059669'}">
        <span class="ds-source-pill__dot" style="background: ${s.color || '#059669'}"></span>
        <span class="ds-source-pill__name">${s.name}</span>
        ${s.commission > 0 ? `<span class="ds-source-pill__commission">${s.commission}%</span>` : ''}
      </button>
    `).join('');

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
      const driverData = JSON.parse(localStorage.getItem('ds_driver') || '{}');
      const res = await api('/api/driverssystem/entries', 'POST', {
        driverId: driverData.phone || '',
        sourceId: selectedSource.id,
        sourceName: selectedSource.name,
        amount,
        commission,
        netAmount: Math.round(netAmount * 100) / 100,
        date: currentDate,
        note: noteInput?.value || ''
      });

      if (res.ok) {
        // Reset form
        if (amountInput) amountInput.value = '0,00';
        amountCents = 0;
        if (noteInput) noteInput.value = '';
        selectedSource = null;
        $('[data-ds-source-pills]')?.querySelectorAll('.ds-source-pill').forEach(p => p.classList.remove('selected'));
        updateNetPreview();
        updateSaveBtn();

        // Haptic feedback (if available)
        if (navigator.vibrate) navigator.vibrate(50);

        // Reload list & summary
        await Promise.all([loadEntries(), loadSummary()]);
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

  // ── Load entries ──
  const loadEntries = async () => {
    const list = $('[data-ds-entries-list]');
    const empty = $('[data-ds-entries-empty]');
    if (!list) return;

    try {
      const res = await api(`/api/driverssystem/entries?date=${currentDate}`);
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
            <button class="ds-entry-item__delete" data-delete-id="${e.id}" aria-label="Διαγραφή">✕</button>
          </div>`;
      }).join('');

      // Bind delete buttons
      list.querySelectorAll('[data-delete-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.deleteId;
          if (!confirm('Διαγραφή αυτής της καταχώρησης;')) return;
          const res = await api(`/api/driverssystem/entries/${id}`, 'DELETE');
          if (res.ok) {
            await Promise.all([loadEntries(), loadSummary()]);
          }
        });
      });
    } catch (_) { /* silent */ }
  };

  // ── Load summary ──
  const loadSummary = async () => {
    try {
      const res = await api(`/api/driverssystem/entries/summary?date=${currentDate}`);
      if (!res.ok) return;
      const s = await res.json();

      const grossEl = $('[data-ds-summary-gross]');
      const netEl = $('[data-ds-summary-net]');
      const countEl = $('[data-ds-summary-count]');

      if (grossEl) grossEl.textContent = fmtEur(s.totalGross);
      if (netEl) netEl.textContent = fmtEur(s.totalNet);
      if (countEl) countEl.textContent = s.count || 0;
    } catch (_) { /* silent */ }
  };

  // ── Date navigation ──
  const setDate = (dateStr) => {
    currentDate = dateStr;
    const picker = $('[data-ds-date-picker]');
    if (picker) picker.value = dateStr;
    loadEntries();
    loadSummary();
  };

  const initDateNav = () => {
    const picker = $('[data-ds-date-picker]');
    const prevBtn = $('[data-ds-date-prev]');
    const nextBtn = $('[data-ds-date-next]');

    if (picker) {
      picker.value = currentDate;
      picker.addEventListener('change', () => setDate(picker.value));
    }

    const shiftDate = (days) => {
      const d = new Date(currentDate + 'T12:00:00');
      d.setDate(d.getDate() + days);
      setDate(d.toISOString().slice(0, 10));
    };

    if (prevBtn) prevBtn.addEventListener('click', () => shiftDate(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => shiftDate(1));
  };

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
      amountInput.addEventListener('input', (e) => {
        e.preventDefault();
        amountInput.value = centsToDisplay(amountCents);
      });

      // Prevent paste
      amountInput.addEventListener('paste', (e) => e.preventDefault());
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', saveEntry);
    }
  };

  // ── Init ──
  await loadSources();
  renderSourcePills();
  initDateNav();
  initForm();
  updateSaveBtn();
  await Promise.all([loadEntries(), loadSummary()]);
})();
