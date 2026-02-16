/**
 * DriversSystem — Partners (Συνεργάτες / Τεφτέρι)
 *
 * Digital ledger per partner:
 *   - Manage partners (name, phone, note)
 *   - Add charge / payment transactions
 *   - Running balance auto-calculated
 *   - Share summary via copy or WhatsApp
 */
(async () => {
  const $ = (s, root) => (root || document).querySelector(s);
  const $$ = (s, root) => (root || document).querySelectorAll(s);

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

  const BASE = '/api/driverssystem/partners';

  // ── State ──
  let partners = [];       // { id, driverId, name, phone, note, createdAt }
  let transactions = [];   // { id, partnerId, driverId, type, amount, description, date, createdAt }
  let currentPartnerId = null;

  // ── DOM refs – List View ──
  const listView      = $('[data-ds-partners-list-view]');
  const listEl        = $('[data-ds-partners-list]');
  const emptyEl       = $('[data-ds-partners-empty]');
  const addBtn        = $('[data-ds-partners-add-btn]');

  // ── DOM refs – Partner Overlay ──
  const partnerOverlay   = $('[data-ds-partners-overlay]');
  const partnerForm      = $('[data-ds-partners-form]');
  const partnerDialogTitle = $('[data-ds-partners-dialog-title]');
  const partnerEditId    = $('[data-ds-partners-edit-id]');
  const partnerNameInput = $('[data-ds-partners-name]');
  const partnerPhoneInput= $('[data-ds-partners-phone]');
  const partnerNoteInput = $('[data-ds-partners-note]');
  const partnerDeleteBtn = $('[data-ds-partners-delete]');
  const partnerCancelBtn = $('[data-ds-partners-cancel]');

  // ── DOM refs – Ledger View ──
  const ledgerView     = $('[data-ds-partners-ledger-view]');
  const ledgerBackBtn  = $('[data-ds-partners-ledger-back]');
  const ledgerNameEl   = $('[data-ds-partners-ledger-name]');
  const editPartnerBtn = $('[data-ds-partners-edit-btn]');
  const chargesEl      = $('[data-ds-partners-ledger-charges]');
  const paymentsEl     = $('[data-ds-partners-ledger-payments]');
  const balanceEl      = $('[data-ds-partners-ledger-balance]');
  const ledgerBody     = $('[data-ds-partners-ledger-body]');
  const ledgerEmptyEl  = $('[data-ds-partners-ledger-empty]');
  const txnAddBtn      = $('[data-ds-partners-txn-add]');

  // ── DOM refs – Transaction Overlay ──
  const txnOverlay     = $('[data-ds-partners-txn-overlay]');
  const txnForm        = $('[data-ds-partners-txn-form]');
  const txnAmountInput = $('[data-ds-partners-txn-amount]');
  const txnDescInput   = $('[data-ds-partners-txn-desc]');
  const txnDateInput   = $('[data-ds-partners-txn-date]');
  const txnCancelBtn   = $('[data-ds-partners-txn-cancel]');

  // ── DOM refs – Share Overlay ──
  const shareBtn       = $('[data-ds-partners-share-btn]');
  const shareOverlay   = $('[data-ds-partners-share-overlay]');
  const shareTextEl    = $('[data-ds-partners-share-text]');
  const shareCopyBtn   = $('[data-ds-partners-share-copy]');
  const shareWaBtn     = $('[data-ds-partners-share-wa]');
  const shareCloseBtn  = $('[data-ds-partners-share-close]');

  // ── Overlay + mobile keyboard helpers ──
  const overlays = [partnerOverlay, txnOverlay, shareOverlay].filter(Boolean);

  const getOpenOverlay = () => overlays.find((el) => el.style.display !== 'none');

  const clearKeyboardInset = () => {
    document.documentElement.style.removeProperty('--ds-partners-keyboard-inset');
    overlays.forEach(ov => {
      if (!ov) return;
      ov.style.height = '';
      ov.style.top = '';
      ov.style.bottom = '';
    });
    document.querySelectorAll('.ds-partners-dialog').forEach(d => {
      d.style.maxHeight = '';
    });
  };

  const updateKeyboardInset = () => {
    const openOvl = getOpenOverlay();
    if (!window.visualViewport) {
      clearKeyboardInset();
      return;
    }
    if (!openOvl) {
      clearKeyboardInset();
      return;
    }

    const vv = window.visualViewport;
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--ds-partners-keyboard-inset', `${Math.round(inset)}px`);

    // When keyboard is open, explicitly constrain the overlay to the visual viewport
    if (inset > 50) {
      openOvl.style.top = vv.offsetTop + 'px';
      openOvl.style.height = vv.height + 'px';
      openOvl.style.bottom = 'auto';
      const dialog = openOvl.querySelector('.ds-partners-dialog');
      if (dialog) {
        dialog.style.maxHeight = (vv.height - 24) + 'px';
      }
    } else {
      openOvl.style.height = '';
      openOvl.style.top = '';
      openOvl.style.bottom = '';
      const dialog = openOvl.querySelector('.ds-partners-dialog');
      if (dialog) {
        dialog.style.maxHeight = '';
      }
    }
  };

  const openOverlay = (overlayEl, focusEl) => {
    if (!overlayEl) return;
    overlayEl.style.display = '';
    // Reset inline overrides before re-calculating
    overlayEl.style.height = '';
    overlayEl.style.top = '';
    overlayEl.style.bottom = '';
    const dlg = overlayEl.querySelector('.ds-partners-dialog');
    if (dlg) dlg.style.maxHeight = '';

    // Focus SYNCHRONOUSLY so the browser keeps the user-gesture chain
    // and opens the on-screen keyboard immediately on mobile
    if (focusEl) {
      try { focusEl.focus(); } catch (_) {}
    }

    // After the keyboard appears, adjust overlay sizing & scroll
    setTimeout(() => {
      updateKeyboardInset();
      if (focusEl) {
        try {
          const dialog = focusEl.closest('.ds-partners-dialog');
          if (dialog) {
            const inputRect = focusEl.getBoundingClientRect();
            const dialogRect = dialog.getBoundingClientRect();
            if (inputRect.bottom > dialogRect.bottom - 10) {
              dialog.scrollTop += (inputRect.bottom - dialogRect.bottom + 30);
            }
          }
        } catch (_) {}
      }
    }, 200);
  };

  const closeOverlay = (overlayEl) => {
    if (!overlayEl) return;
    overlayEl.style.display = 'none';
    // Reset inline overrides
    overlayEl.style.height = '';
    overlayEl.style.top = '';
    overlayEl.style.bottom = '';
    const dlg = overlayEl.querySelector('.ds-partners-dialog');
    if (dlg) dlg.style.maxHeight = '';
    const active = document.activeElement;
    if (active && typeof active.blur === 'function') {
      try { active.blur(); } catch (_) {}
    }
    setTimeout(() => {
      if (!getOpenOverlay()) clearKeyboardInset();
      else updateKeyboardInset();
    }, 40);
  };

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateKeyboardInset);
    window.visualViewport.addEventListener('scroll', updateKeyboardInset);
  }

  document.addEventListener('focusin', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const dialog = target.closest('.ds-partners-dialog');
    if (!dialog) return;
    updateKeyboardInset();
    // Scroll the focused input into view inside the dialog (not the page)
    setTimeout(() => {
      try {
        const inputRect = target.getBoundingClientRect();
        const dialogRect = dialog.getBoundingClientRect();
        if (inputRect.bottom > dialogRect.bottom - 10) {
          dialog.scrollTop += (inputRect.bottom - dialogRect.bottom + 30);
        } else if (inputRect.top < dialogRect.top + 10) {
          dialog.scrollTop -= (dialogRect.top - inputRect.top + 30);
        }
      } catch (_) {}
    }, 150);
  });

  // ── ATM-style amount input ──
  let _txnAmountCents = 0;
  const _centsToDisplay = (c) => (c / 100).toFixed(2).replace('.', ',');

  if (txnAmountInput) {
    txnAmountInput.value = '0,00';
    txnAmountInput.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' || e.key === 'Enter') return;
      e.preventDefault();
      if (e.key >= '0' && e.key <= '9') {
        if (_txnAmountCents >= 10000000) return;
        _txnAmountCents = _txnAmountCents * 10 + parseInt(e.key);
        txnAmountInput.value = _centsToDisplay(_txnAmountCents);
      } else if (e.key === 'Backspace') {
        _txnAmountCents = Math.floor(_txnAmountCents / 10);
        txnAmountInput.value = _centsToDisplay(_txnAmountCents);
      } else if (e.key === 'Delete') {
        _txnAmountCents = 0;
        txnAmountInput.value = '0,00';
      }
    });
    txnAmountInput.addEventListener('beforeinput', (e) => e.preventDefault());
    txnAmountInput.addEventListener('paste', (e) => e.preventDefault());
  }

  // ── Transaction type toggle ──
  let selectedTxnType = 'charge';
  $$('[data-ds-partners-txn-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-ds-partners-txn-type]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTxnType = btn.getAttribute('data-ds-partners-txn-type');
    });
  });

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

  const escHtml = (s) => {
    const div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  };

  // ── Styled Delete Confirmation (same as debts / appointments) ──
  const showDeleteConfirm = (label) => {
    return new Promise((resolve) => {
      const existing = document.getElementById('dsPartnersDeleteConfirm');
      if (existing) existing.remove();

      const overlayEl = document.createElement('div');
      overlayEl.id = 'dsPartnersDeleteConfirm';
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

  // ═══════════════════════════════════════
  //  API CALLS
  // ═══════════════════════════════════════

  async function fetchPartners() {
    try {
      const res = await fetch(`${BASE}?driverId=${encodeURIComponent(phone)}`);
      if (!res.ok) throw new Error();
      partners = await res.json();
    } catch (_) {
      partners = [];
    }
  }

  async function fetchTransactions(partnerId) {
    try {
      const res = await fetch(`${BASE}/${partnerId}/transactions?driverId=${encodeURIComponent(phone)}`);
      if (!res.ok) throw new Error();
      transactions = await res.json();
    } catch (_) {
      transactions = [];
    }
  }

  async function savePartner(data) {
    const editId = partnerEditId.value;
    const method = editId ? 'PUT' : 'POST';
    const url = editId ? `${BASE}/${editId}` : BASE;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Save failed');
    return res.json();
  }

  async function deletePartner(id) {
    const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
  }

  async function saveTransaction(partnerId, data) {
    const res = await fetch(`${BASE}/${partnerId}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Save failed');
    return res.json();
  }

  async function deleteTransaction(partnerId, txnId) {
    const res = await fetch(`${BASE}/${partnerId}/transactions/${txnId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
  }

  // ═══════════════════════════════════════
  //  PARTNER LIST VIEW
  // ═══════════════════════════════════════

  function computePartnerBalance(partnerId) {
    const txns = transactions.filter(t => t.partnerId === partnerId);
    let balance = 0;
    txns.forEach(t => {
      if (t.type === 'charge') balance += (t.amount || 0);
      else balance -= (t.amount || 0);
    });
    return balance;
  }

  function renderPartnerList() {
    // Remove old cards
    listEl.querySelectorAll('.ds-partner-card').forEach(c => c.remove());

    if (partners.length === 0) {
      emptyEl.style.display = '';
      return;
    }
    emptyEl.style.display = 'none';

    partners.forEach(p => {
      const card = document.createElement('div');
      card.className = 'ds-partner-card';
      card.setAttribute('data-partner-id', p.id || '');

      const balance = p._balance || 0;
      const balCls = balance > 0 ? 'positive' : balance < 0 ? 'negative' : 'zero';
      const balanceDisplay = balance >= 0 ? fmtMoney(balance) : '-' + fmtMoney(Math.abs(balance));
      const initial = (p.name || '?').charAt(0);
      const lastTxn = p._lastTxnDate ? `Τελ. κίνηση: ${fmtDate(p._lastTxnDate)}` : 'Χωρίς κινήσεις';

      card.innerHTML = `
        <div class="ds-partner-card__avatar">${escHtml(initial)}</div>
        <div class="ds-partner-card__body">
          <span class="ds-partner-card__name">${escHtml(p.name)}</span>
          <span class="ds-partner-card__last-txn">${lastTxn}</span>
        </div>
        <span class="ds-partner-card__balance ds-partner-card__balance--${balCls}">${balanceDisplay}</span>
      `;

      card.addEventListener('click', () => openLedger(p.id));
      listEl.appendChild(card);
    });
  }

  function scrollPartnerCardIntoView(partnerId) {
    if (!partnerId) return;
    // Use requestAnimationFrame to ensure DOM is rendered
    requestAnimationFrame(() => {
      const selector = `.ds-partner-card[data-partner-id="${String(partnerId).replace(/"/g, '\\"')}"]`;
      const card = listEl.querySelector(selector);
      if (!card) return;

      // Calculate scroll position accounting for sticky header
      const header = document.querySelector('.ds-partners-header');
      const headerHeight = header ? header.offsetHeight : 0;
      const cardRect = card.getBoundingClientRect();
      const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
      const targetScroll = currentScroll + cardRect.top - headerHeight - 14;

      window.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: 'smooth'
      });
    });
  }

  // ═══════════════════════════════════════
  //  PARTNER ADD / EDIT
  // ═══════════════════════════════════════

  if (addBtn) {
    addBtn.addEventListener('click', () => openPartnerAdd());
  }

  function openPartnerAdd() {
    partnerEditId.value = '';
    partnerDialogTitle.textContent = 'Νέος Συνεργάτης';
    partnerDeleteBtn.style.display = 'none';
    partnerNameInput.value = '';
    partnerPhoneInput.value = '';
    partnerNoteInput.value = '';
    openOverlay(partnerOverlay, partnerNameInput);
  }

  function openPartnerEdit(partner) {
    partnerEditId.value = partner.id;
    partnerDialogTitle.textContent = 'Επεξεργασία Συνεργάτη';
    partnerDeleteBtn.style.display = '';
    partnerNameInput.value = partner.name || '';
    partnerPhoneInput.value = partner.phone || '';
    partnerNoteInput.value = partner.note || '';
    openOverlay(partnerOverlay, partnerNameInput);
  }

  if (partnerCancelBtn) {
    partnerCancelBtn.addEventListener('click', () => {
      closeOverlay(partnerOverlay);
    });
  }

  // Close overlay on background click
  if (partnerOverlay) {
    partnerOverlay.addEventListener('click', (e) => {
      if (e.target === partnerOverlay) closeOverlay(partnerOverlay);
    });
  }

  if (partnerForm) {
    partnerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = partnerNameInput.value.trim();
      if (!name) return;
      try {
        const editingId = partnerEditId.value;
        const saved = await savePartner({
          driverId: phone,
          name,
          phone: partnerPhoneInput.value.trim(),
          note: partnerNoteInput.value.trim()
        });
        const savedId = (saved && saved.id) ? saved.id : editingId;
        closeOverlay(partnerOverlay);
        await loadAll();
        scrollPartnerCardIntoView(savedId);
        // If we were editing the current partner, refresh ledger
        if (currentPartnerId && editingId === currentPartnerId) {
          await openLedger(currentPartnerId);
        }
      } catch (err) {
        console.error('Partner save error:', err);
      }
    });
  }

  if (partnerDeleteBtn) {
    partnerDeleteBtn.addEventListener('click', async () => {
      const id = partnerEditId.value;
      if (!id) return;
      const partner = partners.find(p => p.id === id);
      const lbl = partner ? partner.name : '';
      const confirmed = await showDeleteConfirm(lbl);
      if (!confirmed) return;
      try {
        await deletePartner(id);
        if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
        closeOverlay(partnerOverlay);
        if (currentPartnerId === id) {
          showListView();
        }
        await loadAll();
      } catch (err) {
        console.error('Partner delete error:', err);
      }
    });
  }

  // ═══════════════════════════════════════
  //  LEDGER VIEW (Partner Detail)
  // ═══════════════════════════════════════

  function showListView() {
    currentPartnerId = null;
    ledgerView.style.display = 'none';
    listView.style.display = '';
  }

  async function openLedger(partnerId) {
    currentPartnerId = partnerId;
    const partner = partners.find(p => p.id === partnerId);
    if (!partner) return;

    // Load transactions for this partner
    await fetchTransactions(partnerId);

    // Switch views
    listView.style.display = 'none';
    ledgerView.style.display = '';

    ledgerNameEl.textContent = partner.name;

    renderLedger();
  }

  function renderLedger() {
    // Sort transactions by date asc, then by createdAt asc
    const sorted = [...transactions].sort((a, b) =>
      (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || '')
    );

    // Calculate running balance & totals
    let totalCharges = 0;
    let totalPayments = 0;
    let runningBalance = 0;

    const rows = sorted.map(txn => {
      if (txn.type === 'charge') {
        totalCharges += txn.amount;
        runningBalance += txn.amount;
      } else {
        totalPayments += txn.amount;
        runningBalance -= txn.amount;
      }
      return { ...txn, _balance: runningBalance };
    });

    chargesEl.textContent = fmtMoney(totalCharges);
    paymentsEl.textContent = fmtMoney(totalPayments);

    const balance = totalCharges - totalPayments;
    const balanceDisplay = balance >= 0 ? fmtMoney(balance) : '-' + fmtMoney(Math.abs(balance));
    balanceEl.textContent = balanceDisplay;
    balanceEl.className = 'ds-partners-ledger-sum__value ' + (balance > 0 ? 'positive' : balance < 0 ? 'negative' : '');

    // Render table rows (newest first for display)
    ledgerBody.innerHTML = '';

    if (rows.length === 0) {
      ledgerEmptyEl.style.display = '';
      return;
    }
    ledgerEmptyEl.style.display = 'none';

    // Show newest first
    const displayRows = [...rows].reverse();
    displayRows.forEach(txn => {
      const tr = document.createElement('tr');
      const isCharge = txn.type === 'charge';
      const amountCls = isCharge ? 'ds-partners-txn-amount--charge' : 'ds-partners-txn-amount--payment';
      const amountPrefix = isCharge ? '+' : '-';
      const balCls = txn._balance >= 0 ? 'ds-partners-txn-balance--positive' : 'ds-partners-txn-balance--negative';
      const balDisplay = txn._balance >= 0 ? fmtMoney(txn._balance) : '-' + fmtMoney(Math.abs(txn._balance));

      tr.innerHTML = `
        <td>${fmtDate(txn.date)}</td>
        <td>${escHtml(txn.description || (isCharge ? 'Χρέωση' : 'Πληρωμή'))}</td>
        <td class="${amountCls}">${amountPrefix}${fmtMoney(txn.amount)}</td>
        <td class="${balCls}">${balDisplay}</td>
      `;

      // Tap to delete with styled confirm
      tr.addEventListener('click', async () => {
        const desc = txn.description || (isCharge ? 'Χρέωση' : 'Πληρωμή');
        const lbl = `${desc} — ${fmtMoney(txn.amount)}`;
        const confirmed = await showDeleteConfirm(lbl);
        if (!confirmed) return;
        if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
        await deleteTxnAndRefresh(txn.id);
      });

      ledgerBody.appendChild(tr);
    });
  }

  async function deleteTxnAndRefresh(txnId) {
    try {
      await deleteTransaction(currentPartnerId, txnId);
      await fetchTransactions(currentPartnerId);
      renderLedger();
      // Also refresh partner list data for balance
      await loadAll();
    } catch (err) {
      console.error('Delete txn error:', err);
    }
  }

  // Back button
  if (ledgerBackBtn) {
    ledgerBackBtn.addEventListener('click', () => showListView());
  }

  // Edit partner button in ledger header
  if (editPartnerBtn) {
    editPartnerBtn.addEventListener('click', () => {
      const partner = partners.find(p => p.id === currentPartnerId);
      if (partner) openPartnerEdit(partner);
    });
  }

  // ═══════════════════════════════════════
  //  ADD TRANSACTION
  // ═══════════════════════════════════════

  if (txnAddBtn) {
    txnAddBtn.addEventListener('click', () => {
      _txnAmountCents = 0;
      txnAmountInput.value = '0,00';
      txnDescInput.value = '';
      txnDateInput.value = greeceDateStr();
      selectedTxnType = 'charge';
      $$('[data-ds-partners-txn-type]').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-ds-partners-txn-type') === 'charge');
      });
      openOverlay(txnOverlay, txnAmountInput);
    });
  }

  if (txnCancelBtn) {
    txnCancelBtn.addEventListener('click', () => {
      closeOverlay(txnOverlay);
    });
  }

  if (txnOverlay) {
    txnOverlay.addEventListener('click', (e) => {
      if (e.target === txnOverlay) closeOverlay(txnOverlay);
    });
  }

  if (txnForm) {
    txnForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = _txnAmountCents / 100;
      if (amount <= 0) return;

      try {
        await saveTransaction(currentPartnerId, {
          driverId: phone,
          type: selectedTxnType,
          amount,
          description: txnDescInput.value.trim(),
          date: txnDateInput.value || greeceDateStr()
        });
        closeOverlay(txnOverlay);
        await fetchTransactions(currentPartnerId);
        renderLedger();
        await loadAll(); // refresh partner balances
      } catch (err) {
        console.error('Save txn error:', err);
      }
    });
  }

  // ═══════════════════════════════════════
  //  SHARE / WHATSAPP
  // ═══════════════════════════════════════

  let shareRange = '30';

  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      shareRange = '30';
      $$('[data-ds-partners-share-range]').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-ds-partners-share-range') === '30');
      });
      $('[data-ds-partners-share-custom]').style.display = 'none';
      updateSharePreview();
      openOverlay(shareOverlay);
    });
  }

  // Range pills
  $$('[data-ds-partners-share-range]').forEach(pill => {
    pill.addEventListener('click', () => {
      $$('[data-ds-partners-share-range]').forEach(b => b.classList.remove('active'));
      pill.classList.add('active');
      shareRange = pill.getAttribute('data-ds-partners-share-range');
      const customEl = $('[data-ds-partners-share-custom]');
      customEl.style.display = shareRange === 'custom' ? '' : 'none';
      updateSharePreview();
    });
  });

  // Custom date change listeners
  const shareFromInput = $('[data-ds-partners-share-from]');
  const shareToInput = $('[data-ds-partners-share-to]');
  if (shareFromInput) shareFromInput.addEventListener('change', () => updateSharePreview());
  if (shareToInput) shareToInput.addEventListener('change', () => updateSharePreview());

  function getShareDateRange() {
    const today = greeceDateStr();
    if (shareRange === '30') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      const from = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return { from, to: today };
    }
    if (shareRange === 'month') {
      const [y, m] = today.split('-');
      return { from: `${y}-${m}-01`, to: today };
    }
    // custom
    return {
      from: shareFromInput.value || '2000-01-01',
      to: shareToInput.value || today
    };
  }

  function updateSharePreview() {
    const partner = partners.find(p => p.id === currentPartnerId);
    if (!partner) return;

    const { from, to } = getShareDateRange();
    const filtered = transactions.filter(t => t.date >= from && t.date <= to);
    filtered.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));

    let totalCharges = 0;
    let totalPayments = 0;
    filtered.forEach(t => {
      if (t.type === 'charge') totalCharges += t.amount;
      else totalPayments += t.amount;
    });
    const net = totalCharges - totalPayments;

    // Overall balance (all transactions)
    let fullBalance = 0;
    transactions.forEach(t => {
      if (t.type === 'charge') fullBalance += t.amount;
      else fullBalance -= t.amount;
    });

    let text = `📒 Συνεργάτης: ${partner.name}\n`;
    text += `📅 Περίοδος: ${fmtDate(from)} – ${fmtDate(to)}\n`;
    text += `─────────────────\n`;

    if (filtered.length === 0) {
      text += `Δεν βρέθηκαν κινήσεις.\n`;
    } else {
      filtered.forEach(t => {
        const sign = t.type === 'charge' ? '+' : '-';
        const desc = t.description || (t.type === 'charge' ? 'Χρέωση' : 'Πληρωμή');
        text += `${fmtDate(t.date)}  ${sign}${fmtMoney(t.amount)}  ${desc}\n`;
      });
    }

    text += `─────────────────\n`;
    text += `Σύνολο χρεώσεων: ${fmtMoney(totalCharges)}\n`;
    text += `Σύνολο πληρωμών: ${fmtMoney(totalPayments)}\n`;
    text += `Καθαρή διαφορά: ${net >= 0 ? '+' : '-'}${fmtMoney(Math.abs(net))}\n`;
    text += `─────────────────\n`;
    text += `💰 Τελικό υπόλοιπο: ${fullBalance >= 0 ? '' : '-'}${fmtMoney(Math.abs(fullBalance))}`;
    if (fullBalance > 0) text += ` (σου χρωστάει)`;
    else if (fullBalance < 0) text += ` (χρωστάς)`;
    else text += ` (μηδέν)`;

    shareTextEl.textContent = text;
  }

  // Copy
  if (shareCopyBtn) {
    shareCopyBtn.addEventListener('click', async () => {
      const text = shareTextEl.textContent;
      try {
        await navigator.clipboard.writeText(text);
        const origText = shareCopyBtn.innerHTML;
        shareCopyBtn.textContent = '✓ Αντιγράφηκε!';
        setTimeout(() => { shareCopyBtn.innerHTML = origText; }, 1500);
      } catch (_) {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        shareCopyBtn.textContent = '✓ Αντιγράφηκε!';
        setTimeout(() => { shareCopyBtn.textContent = 'Αντιγραφή'; }, 1500);
      }
    });
  }

  // WhatsApp
  if (shareWaBtn) {
    shareWaBtn.addEventListener('click', () => {
      const partner = partners.find(p => p.id === currentPartnerId);
      const text = encodeURIComponent(shareTextEl.textContent);
      let waUrl = '';
      if (partner && partner.phone) {
        // Normalize phone: remove spaces, dashes, dots, parens
        let cleanPhone = partner.phone.replace(/[\s\-().]/g, '').replace(/^\+/, '');
        // Auto-add country code 30 (Greece) if the number looks Greek
        // Greek mobiles start with 69, landlines with 2
        if (/^6[0-9]{9}$/.test(cleanPhone) || /^2[0-9]{9}$/.test(cleanPhone)) {
          cleanPhone = '30' + cleanPhone;
        }
        waUrl = `https://wa.me/${cleanPhone}?text=${text}`;
      } else {
        waUrl = `https://wa.me/?text=${text}`;
      }
      window.open(waUrl, '_blank');
    });
  }

  // Close share overlay
  if (shareCloseBtn) {
    shareCloseBtn.addEventListener('click', () => {
      closeOverlay(shareOverlay);
    });
  }
  if (shareOverlay) {
    shareOverlay.addEventListener('click', (e) => {
      if (e.target === shareOverlay) closeOverlay(shareOverlay);
    });
  }

  // ═══════════════════════════════════════
  //  LOAD & INIT
  // ═══════════════════════════════════════

  async function loadAll() {
    await fetchPartners();
    // For each partner, we need their balance and last txn date
    // We'll fetch transactions for summary from the server
    try {
      const res = await fetch(`${BASE}/summary?driverId=${encodeURIComponent(phone)}`);
      if (res.ok) {
        const summaries = await res.json();
        // summaries: { partnerId: { balance, lastTxnDate } }
        partners.forEach(p => {
          const s = summaries[p.id];
          if (s) {
            p._balance = s.balance || 0;
            p._lastTxnDate = s.lastTxnDate || '';
          } else {
            p._balance = 0;
            p._lastTxnDate = '';
          }
        });
      }
    } catch (_) {}

    // Sort by name
    partners.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'el'));
    renderPartnerList();
  }

  await loadAll();
})();
