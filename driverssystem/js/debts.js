/**
 * DriversSystem — Debts (Έλεγχος Οφειλών)
 * CRUD for simple ledger of money owed to/from the driver.
 */
(async () => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // ── Auth guard ──
  const phone = localStorage.getItem('ds_driver_phone');
  if (!phone) {
    const prefix = window.DriversSystemConfig ? window.DriversSystemConfig.getRoutePrefix() : '/driverssystem';
    window.location.href = prefix + '/profile';
    return;
  }

  // ── Config ──
  if (window.DriversSystemConfig) {
    await window.DriversSystemConfig.load();
  }

  const BASE = '/api/driverssystem/debts';

  // ── State ──
  let debts = [];
  let activeFilter = 'all'; // all | owed | owe
  let editingId = null;
  let selectedType = 'owed';

  // ── DOM refs ──
  const listEl      = $('[data-ds-debts-list]');
  const emptyEl     = $('[data-ds-debts-empty]');
  const totalOwedEl = $('[data-ds-debts-total-owed]');
  const totalOweEl  = $('[data-ds-debts-total-owe]');
  const totalNetEl  = $('[data-ds-debts-total-net]');
  const overlay     = $('[data-ds-debts-overlay]');
  const dialogTitle = $('[data-ds-debts-dialog-title]');
  const form        = $('[data-ds-debts-form]');
  const nameInput   = $('[data-ds-debts-name]');
  const amountInput = $('[data-ds-debts-amount]');
  const dateInput   = $('[data-ds-debts-date]');
  const noteInput   = $('[data-ds-debts-note]');
  const editIdInput = $('[data-ds-debts-edit-id]');
  const deleteBtn   = $('[data-ds-debts-delete]');

  // ── ATM-style amount input ──
  let _debtAmountCents = 0;
  const _centsToDisplay = (c) => (c / 100).toFixed(2).replace('.', ',');

  if (amountInput) {
    amountInput.value = '0,00';
    amountInput.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' || e.key === 'Enter') return;
      e.preventDefault();
      if (e.key >= '0' && e.key <= '9') {
        if (_debtAmountCents >= 10000000) return;
        _debtAmountCents = _debtAmountCents * 10 + parseInt(e.key);
        amountInput.value = _centsToDisplay(_debtAmountCents);
      } else if (e.key === 'Backspace') {
        _debtAmountCents = Math.floor(_debtAmountCents / 10);
        amountInput.value = _centsToDisplay(_debtAmountCents);
      } else if (e.key === 'Delete') {
        _debtAmountCents = 0;
        amountInput.value = '0,00';
      }
    });
    amountInput.addEventListener('beforeinput', (e) => e.preventDefault());
    amountInput.addEventListener('paste', (e) => e.preventDefault());
  }

  // ── Back button ──
  const backBtn = $('[data-ds-debts-back]');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      const prefix = window.DriversSystemConfig ? window.DriversSystemConfig.getRoutePrefix() : '/driverssystem';
      window.location.href = prefix + '/profile';
    });
  }

  // ── Helpers ──
  const fmtMoney = (v) => {
    const n = parseFloat(v) || 0;
    return n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  };

  const greeceDateStr = () => {
    const now = new Date();
    const gr = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Athens' }));
    return gr.getFullYear() + '-' + String(gr.getMonth() + 1).padStart(2, '0') + '-' + String(gr.getDate()).padStart(2, '0');
  };

  const fmtDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  // ── API ──
  async function fetchDebts() {
    try {
      const res = await fetch(`${BASE}?driverId=${encodeURIComponent(phone)}`);
      if (!res.ok) throw new Error();
      debts = await res.json();
    } catch (_) {
      debts = [];
    }
    render();
  }

  async function saveDebt(data) {
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `${BASE}/${editingId}` : BASE;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Save failed');
    return res.json();
  }

  async function removeDebt(id) {
    const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
  }

  // ── Render ──
  function render() {
    // Summary totals
    let totalOwed = 0;
    let totalOwe = 0;
    debts.forEach(d => {
      if (d.type === 'owed') totalOwed += d.amount || 0;
      else totalOwe += d.amount || 0;
    });
    totalOwedEl.textContent = fmtMoney(totalOwed);
    totalOweEl.textContent = fmtMoney(totalOwe);
    const net = totalOwed - totalOwe;
    if (totalNetEl) {
      const prefix = net > 0 ? '+' : net < 0 ? '-' : '';
      totalNetEl.textContent = prefix + fmtMoney(Math.abs(net));
      totalNetEl.style.color = net > 0 ? '#4CAF50' : net < 0 ? '#FF7043' : '';
    }

    // Filter
    const filtered = activeFilter === 'all'
      ? debts
      : debts.filter(d => d.type === activeFilter);

    // Clear list keeping empty el
    const cards = listEl.querySelectorAll('.ds-debt-card');
    cards.forEach(c => c.remove());

    if (filtered.length === 0) {
      emptyEl.style.display = '';
      return;
    }

    emptyEl.style.display = 'none';

    filtered.forEach(d => {
      const card = document.createElement('div');
      card.className = 'ds-debt-card';
      card.setAttribute('data-ds-debt-id', d.id);

      const isOwed = d.type === 'owed';
      const badgeMod = isOwed ? 'owed' : 'owe';
      const amountMod = isOwed ? 'owed' : 'owe';
      const emoji = isOwed ? '↗' : '↙';
      const typeLabel = isOwed ? 'Πίστωση' : 'Χρέωση';

      // Count how many entries this person has (for ledger indicator)
      const personCount = debts.filter(x => normName(x.name) === normName(d.name)).length;

      card.innerHTML = `
        <div class="ds-debt-card__badge ds-debt-card__badge--${badgeMod}">${emoji}</div>
        <div class="ds-debt-card__body">
          <span class="ds-debt-card__name">${escHtml(d.name)}${personCount > 1 ? `<span class="ds-debt-card__count">${personCount}</span>` : ''}</span>
          ${d.note ? `<span class="ds-debt-card__note">${escHtml(d.note)}</span>` : ''}
          <span class="ds-debt-card__date">${fmtDate(d.date)}</span>
        </div>
        <div>
          <span class="ds-debt-card__amount ds-debt-card__amount--${amountMod}">${fmtMoney(d.amount)}</span>
          <span class="ds-debt-card__type-label">${typeLabel}</span>
        </div>
      `;

      // Tap card → edit, tap name badge → person ledger
      card.addEventListener('click', (e) => {
        // If they tapped the name area & this person has >1 entry, show ledger
        const nameEl = card.querySelector('.ds-debt-card__name');
        const countEl = card.querySelector('.ds-debt-card__count');
        if (personCount > 1 && (e.target === nameEl || e.target === countEl || nameEl.contains(e.target))) {
          openPersonLedger(d.name);
        } else {
          openEdit(d);
        }
      });
      listEl.appendChild(card);
    });
  }

  function escHtml(s) {
    const div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  }

  /** Normalise a person name for grouping (trim, lowercase) */
  function normName(s) {
    return (s || '').trim().toLowerCase();
  }

  // ── Filter ──
  $$('[data-ds-debts-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-ds-debts-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.getAttribute('data-ds-debts-filter');
      render();
    });
  });

  // ── Open Add ──
  const addBtn = $('[data-ds-debts-add]');
  if (addBtn) {
    addBtn.addEventListener('click', () => openAdd());
  }

  function openAdd() {
    editingId = null;
    dialogTitle.textContent = 'Νέα Εγγραφή';
    deleteBtn.style.display = 'none';
    nameInput.value = '';
    _debtAmountCents = 0;
    amountInput.value = '0,00';
    dateInput.value = greeceDateStr();
    noteInput.value = '';
    setType('owed');
    overlay.style.display = '';
    nameInput.focus();
  }

  // ── Open Edit ──
  function openEdit(debt) {
    editingId = debt.id;
    dialogTitle.textContent = 'Επεξεργασία';
    deleteBtn.style.display = '';
    nameInput.value = debt.name || '';
    _debtAmountCents = Math.round((parseFloat(debt.amount) || 0) * 100);
    amountInput.value = _centsToDisplay(_debtAmountCents);
    dateInput.value = debt.date || '';
    noteInput.value = debt.note || '';
    setType(debt.type || 'owed');
    overlay.style.display = '';
  }

  // ── Type toggle ──
  function setType(type) {
    selectedType = type;
    $$('[data-ds-debts-type]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-ds-debts-type') === type);
    });
  }

  $$('[data-ds-debts-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      setType(btn.getAttribute('data-ds-debts-type'));
    });
  });

  // ── Close overlay ──
  const cancelBtn = $('[data-ds-debts-cancel]');
  if (cancelBtn) cancelBtn.addEventListener('click', closeOverlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay();
  });

  function closeOverlay() {
    overlay.style.display = 'none';
    editingId = null;
  }

  // ── Save ──
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (nameInput.value || '').trim();
    const amount = _debtAmountCents / 100;
    if (!name || amount <= 0) return;

    const data = {
      driverId: phone,
      name,
      amount,
      type: selectedType,
      date: dateInput.value || greeceDateStr(),
      note: (noteInput.value || '').trim()
    };

    try {
      await saveDebt(data);
      if (navigator.vibrate) navigator.vibrate(30);
      closeOverlay();
      await fetchDebts();
    } catch (_) {
      // Silently fail — retry
    }
  });

  // ── Delete flow (entries-style dynamic confirm) ──
  const showDeleteConfirm = (label) => {
    return new Promise((resolve) => {
      const existing = document.getElementById('dsDeleteConfirm');
      if (existing) existing.remove();

      const overlayEl = document.createElement('div');
      overlayEl.id = 'dsDeleteConfirm';
      overlayEl.className = 'ds-confirm-overlay';
      overlayEl.innerHTML = `
        <div class="ds-confirm-dialog" role="dialog" aria-modal="true">
          <div class="ds-confirm-dialog__icon">🗑️</div>
          <h3 class="ds-confirm-dialog__title">Διαγραφή Εγγραφής</h3>
          <p class="ds-confirm-dialog__body">${
            label
              ? `<strong>${escHtml(label)}</strong><br>Είσαι σίγουρος ότι θέλεις να διαγράψεις αυτή την εγγραφή;`
              : 'Είσαι σίγουρος ότι θέλεις να διαγράψεις αυτή την εγγραφή;'
          }</p>
          <div class="ds-confirm-dialog__actions">
            <button class="ds-confirm-btn ds-confirm-btn--cancel" data-ds-confirm-cancel>Άκυρο</button>
            <button class="ds-confirm-btn ds-confirm-btn--danger" data-ds-confirm-ok>Διαγραφή</button>
          </div>
        </div>`;

      document.body.appendChild(overlayEl);

      const okBtn     = overlayEl.querySelector('[data-ds-confirm-ok]');
      const cancelBtn = overlayEl.querySelector('[data-ds-confirm-cancel]');

      const close = (result) => {
        overlayEl.remove();
        document.removeEventListener('keydown', onKey);
        resolve(result);
      };

      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(false); }
      };

      okBtn.addEventListener('click', () => close(true));
      cancelBtn.addEventListener('click', () => close(false));
      overlayEl.addEventListener('click', (e) => {
        if (e.target === overlayEl) close(false);
      });
      document.addEventListener('keydown', onKey);
      setTimeout(() => { try { okBtn.focus(); } catch (_) {} }, 30);
    });
  };

  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!editingId) return;
      // Build a label for the confirm dialog
      const debt = debts.find(d => d.id === editingId);
      const lbl = debt ? `${debt.name} — ${fmtMoney(debt.amount)}` : '';
      const confirmed = await showDeleteConfirm(lbl);
      if (!confirmed) return;
      try {
        await removeDebt(editingId);
        if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
        closeOverlay();
        await fetchDebts();
      } catch (_) {
        // Silently fail
      }
    });
  }

  // ═══════════════════════════════════════
  // PER-PERSON LEDGER
  // ═══════════════════════════════════════
  const ledgerOverlay = $('[data-ds-debts-ledger]');
  const ledgerName    = $('[data-ds-debts-ledger-name]');
  const ledgerBody    = $('[data-ds-debts-ledger-body]');
  const ledgerOwed    = $('[data-ds-debts-ledger-owed]');
  const ledgerOwe     = $('[data-ds-debts-ledger-owe]');
  const ledgerNet     = $('[data-ds-debts-ledger-net]');
  const ledgerClose   = $('[data-ds-debts-ledger-close]');

  function openPersonLedger(name) {
    const key = normName(name);
    // Get all entries for this person, sorted by date ascending
    const entries = debts
      .filter(d => normName(d.name) === key)
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id || '').localeCompare(b.id || ''));

    if (!entries.length) return;

    // Use the first entry's original name casing
    ledgerName.textContent = entries[0].name;

    // Calculate per-type totals
    let totalOwed = 0, totalOwe = 0;
    entries.forEach(d => {
      if (d.type === 'owed') totalOwed += d.amount || 0;
      else totalOwe += d.amount || 0;
    });

    ledgerOwed.textContent = fmtMoney(totalOwed);
    ledgerOwe.textContent = fmtMoney(totalOwe);

    const net = totalOwed - totalOwe;
    ledgerNet.textContent = (net >= 0 ? '+' : '') + fmtMoney(Math.abs(net));
    ledgerNet.className = 'ds-debts-ledger-sum__value ' +
      (net > 0 ? 'ds-debts-ledger-sum__value--positive' :
       net < 0 ? 'ds-debts-ledger-sum__value--negative' : '');

    // Build table rows with running balance
    let running = 0;
    ledgerBody.innerHTML = '';
    entries.forEach(d => {
      const isOwed = d.type === 'owed';
      running += isOwed ? (d.amount || 0) : -(d.amount || 0);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="ds-debts-ledger-td--date">${fmtDate(d.date)}</td>
        <td><span class="ds-debts-ledger-badge ds-debts-ledger-badge--${isOwed ? 'owed' : 'owe'}">${isOwed ? 'Πίστωση' : 'Χρέωση'}</span></td>
        <td class="ds-debts-ledger-td--amount ${isOwed ? 'ds-debts-ledger-td--plus' : 'ds-debts-ledger-td--minus'}">${isOwed ? '+' : '-'}${fmtMoney(d.amount)}</td>
        <td class="ds-debts-ledger-td--running ${running >= 0 ? 'ds-debts-ledger-td--plus' : 'ds-debts-ledger-td--minus'}">${running >= 0 ? '+' : '-'}${fmtMoney(Math.abs(running))}</td>
        <td class="ds-debts-ledger-td--note">${escHtml(d.note || '—')}</td>
      `;
      // Tap a row → open that entry for editing
      tr.addEventListener('click', () => {
        closeLedger();
        openEdit(d);
      });
      ledgerBody.appendChild(tr);
    });

    ledgerOverlay.style.display = '';
    if (navigator.vibrate) navigator.vibrate(15);
  }

  function closeLedger() {
    if (ledgerOverlay) ledgerOverlay.style.display = 'none';
  }

  if (ledgerClose) ledgerClose.addEventListener('click', closeLedger);
  if (ledgerOverlay) {
    ledgerOverlay.addEventListener('click', (e) => {
      if (e.target === ledgerOverlay) closeLedger();
    });
  }

  // ── Init ──
  await fetchDebts();
})();
