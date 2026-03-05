/**
 * DriversSystem — Obligations (Μηνιαίες Υποχρεώσεις)
 *
 * Recurring payments tracker:
 *   - Create/edit/delete recurring obligations
 *   - Two directions: incoming (μου χρωστάνε) / outgoing (χρωστάω)
 *   - Tap to mark a period as paid (with timestamp)
 *   - History view per obligation with filters
 *   - Summary totals at top
 */
(async () => {
  const $ = (s, root) => (root || document).querySelector(s);
  const $$ = (s, root) => [...(root || document).querySelectorAll(s)];

  // ── Auth guard ──
  const phone = localStorage.getItem('ds_driver_phone');
  if (!phone) {
    const prefix = window.DriversSystemConfig ? window.DriversSystemConfig.getRoutePrefix() : '/driverssystem';
    window.location.href = prefix + '/profile';
    return;
  }

  if (window.DriversSystemConfig) await window.DriversSystemConfig.load();

  const BASE = '/api/driverssystem/obligations';
  const PAYMENTS_BASE = '/api/driverssystem/obligation-payments';

  // ── State ──
  let obligations = [];
  let allPayments = [];
  let currentOblId = null;
  let activeFilter = 'all';
  let historyFilter = 'all';

  // ── Greece timezone ──
  function greeceDateStr() {
    const now = new Date();
    const gr = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Athens' }));
    return gr.getFullYear() + '-' + String(gr.getMonth() + 1).padStart(2, '0') + '-' + String(gr.getDate()).padStart(2, '0');
  }
  function currentPeriod() {
    const now = new Date();
    const gr = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Athens' }));
    return gr.getFullYear() + '-' + String(gr.getMonth() + 1).padStart(2, '0');
  }

  // ── Formatting ──
  const fmtEUR = (n) => {
    const v = parseFloat(n) || 0;
    return v.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  };

  const MONTH_NAMES = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
  function fmtPeriod(period) {
    const [y, m] = period.split('-').map(Number);
    return MONTH_NAMES[m - 1] + ' ' + y;
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  const FREQ_LABELS = { monthly: 'Μηνιαία', quarterly: 'Τριμηνιαία', yearly: 'Ετήσια' };
  const DIR_LABELS = { incoming: 'Μου χρωστάνε', outgoing: 'Χρωστάω' };

  // ── DOM refs — Main view ──
  const backBtn = $('[data-ds-obl-back]');
  const listEl = $('[data-ds-obl-list]');
  const emptyEl = $('[data-ds-obl-empty]');
  const addBtn = $('[data-ds-obl-add]');
  const totalIncomingEl = $('[data-ds-obl-total-incoming]');
  const totalOutgoingEl = $('[data-ds-obl-total-outgoing]');
  const totalNetEl = $('[data-ds-obl-total-net]');

  // ── DOM refs — Overlay ──
  const overlay = $('[data-ds-obl-overlay]');
  const form = $('[data-ds-obl-form]');
  const dialogTitle = $('[data-ds-obl-dialog-title]');
  const editIdInput = $('[data-ds-obl-edit-id]');
  const titleInput = $('[data-ds-obl-title]');
  const counterpartyInput = $('[data-ds-obl-counterparty]');
  const amountInput = $('[data-ds-obl-amount]');
  const directionInput = $('[data-ds-obl-direction]');
  const frequencyInput = $('[data-ds-obl-frequency]');
  const startDateInput = $('[data-ds-obl-start-date]');
  const deleteBtn = $('[data-ds-obl-delete]');
  const cancelBtn = $('[data-ds-obl-cancel]');
  const oblTypeInput = $('[data-ds-obl-obl-type]');
  const installmentFieldsEl = $('[data-ds-obl-installment-fields]');
  const totalAmountInput = $('[data-ds-obl-total-amount]');
  const totalInstallmentsInput = $('[data-ds-obl-total-installments]');
  const installmentCalcEl = $('[data-ds-obl-installment-calc]');

  // ── DOM refs — Detail view ──
  const detailView = $('[data-ds-obl-detail-view]');
  const detailBack = $('[data-ds-obl-detail-back]');
  const detailTitle = $('[data-ds-obl-detail-title]');
  const detailEdit = $('[data-ds-obl-detail-edit]');
  const detailCounterparty = $('[data-ds-obl-detail-counterparty]');
  const detailAmount = $('[data-ds-obl-detail-amount]');
  const detailDirection = $('[data-ds-obl-detail-direction]');
  const detailFrequency = $('[data-ds-obl-detail-frequency]');
  const detailInstallmentInfo = $('[data-ds-obl-detail-installment-info]');
  const detailProgress = $('[data-ds-obl-detail-progress]');
  const detailRemainingRow = $('[data-ds-obl-detail-remaining-row]');
  const detailRemaining = $('[data-ds-obl-detail-remaining]');
  const historyList = $('[data-ds-obl-history-list]');

  // ═══════════════════════════════════════
  // DATA FETCHING
  // ═══════════════════════════════════════

  async function fetchObligations() {
    try {
      const res = await fetch(`${BASE}?driverId=${encodeURIComponent(phone)}`);
      obligations = res.ok ? await res.json() : [];
    } catch (_) { obligations = []; }
  }

  async function fetchPayments() {
    try {
      const res = await fetch(`${PAYMENTS_BASE}?driverId=${encodeURIComponent(phone)}`);
      allPayments = res.ok ? await res.json() : [];
    } catch (_) { allPayments = []; }
  }

  async function fetchSummary() {
    try {
      const res = await fetch(`${BASE}/summary?driverId=${encodeURIComponent(phone)}`);
      if (res.ok) {
        const s = await res.json();
        totalIncomingEl.textContent = fmtEUR(s.totalOwedToMe);
        totalOutgoingEl.textContent = fmtEUR(s.totalIOwe);
        const net = (s.totalOwedToMe || 0) - (s.totalIOwe || 0);
        const prefix = net > 0 ? '+' : net < 0 ? '-' : '';
        if (totalNetEl) {
          totalNetEl.textContent = prefix + fmtEUR(Math.abs(net));
          totalNetEl.style.color = net > 0 ? '#4CAF50' : net < 0 ? '#FF7043' : '';
        }
      }
    } catch (_) {}
  }

  async function loadAll() {
    await Promise.all([fetchObligations(), fetchPayments(), fetchSummary()]);
    renderList();
  }

  // ═══════════════════════════════════════
  // PERIOD GENERATION (client-side mirror)
  // ═══════════════════════════════════════

  function generatePeriods(startDate, endPeriod, frequency, maxPeriods) {
    const periods = [];
    if (!startDate || !endPeriod) return periods;
    const [sy, sm] = startDate.split('-').map(Number);
    const [ey, em] = endPeriod.split('-').map(Number);
    if (!sy || !sm || !ey || !em) return periods;
    let y = sy, m = sm;
    const step = frequency === 'yearly' ? 12 : frequency === 'quarterly' ? 3 : 1;
    const limit = maxPeriods > 0 ? maxPeriods : Infinity;
    while ((y < ey || (y === ey && m <= em)) && periods.length < limit) {
      periods.push(`${y}-${String(m).padStart(2, '0')}`);
      m += step;
      while (m > 12) { m -= 12; y++; }
    }
    return periods;
  }

  // ═══════════════════════════════════════
  // LIST RENDERING
  // ═══════════════════════════════════════

  function renderList() {
    const cp = currentPeriod();
    const paidSet = new Set(allPayments.map(p => `${p.obligationId}__${p.period}`));

    let filtered = obligations.filter(o => o.active);
    if (activeFilter === 'incoming') filtered = filtered.filter(o => o.direction === 'incoming');
    else if (activeFilter === 'outgoing') filtered = filtered.filter(o => o.direction === 'outgoing');
    else if (activeFilter === 'installment') filtered = filtered.filter(o => o.oblType === 'installment');

    // Clear existing cards (keep empty el)
    $$('.ds-obl-card', listEl).forEach(c => c.remove());

    if (filtered.length === 0) {
      emptyEl.style.display = '';
      return;
    }
    emptyEl.style.display = 'none';

    filtered.forEach(obl => {
      const maxP = obl.oblType === 'installment' && obl.totalInstallments > 0 ? obl.totalInstallments : 0;
      const periods = generatePeriods(obl.startDate, cp, obl.frequency, maxP);
      let unpaid = 0;
      let paidCount = 0;
      periods.forEach(p => {
        if (paidSet.has(`${obl.id}__${p}`)) paidCount++;
        else unpaid++;
      });
      const unpaidAmount = unpaid * obl.amount;
      const currentPaid = paidSet.has(`${obl.id}__${cp}`);
      const isInstallment = obl.oblType === 'installment' && obl.totalInstallments > 0;
      // Check if current period is within installment range
      const currentPeriodInRange = periods.includes(cp);

      const card = document.createElement('div');
      card.className = 'ds-obl-card' + (obl.direction === 'outgoing' ? ' ds-obl-card--outgoing' : ' ds-obl-card--incoming');
      card.setAttribute('data-obl-id', obl.id);

      const dirIcon = obl.direction === 'incoming'
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 13 12 18 17 13"/><line x1="12" y1="18" x2="12" y2="6"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 11 12 6 7 11"/><line x1="12" y1="6" x2="12" y2="18"/></svg>';

      let progressHtml = '';
      if (isInstallment) {
        const total = obl.totalInstallments;
        const pct = Math.round((paidCount / total) * 100);
        const allDone = paidCount >= total;
        const remainingAmt = (total - paidCount) * obl.amount;
        progressHtml = `
          <div class="ds-obl-card__progress-wrap">
            <span class="ds-obl-card__progress-text">${paidCount}/${total} δόσεις${allDone ? ' — Ολοκληρώθηκε!' : ` — Υπόλοιπο: ${fmtEUR(remainingAmt)}`}</span>
            <div class="ds-obl-card__progress-bar">
              <div class="ds-obl-card__progress-fill${allDone ? ' ds-obl-card__progress-fill--done' : ''}" style="width:${pct}%"></div>
            </div>
          </div>`;
      }

      card.innerHTML = `
        <div class="ds-obl-card__left">
          <div class="ds-obl-card__icon">${dirIcon}</div>
          <div class="ds-obl-card__body">
            <span class="ds-obl-card__title">${escHtml(obl.title)}</span>
            <span class="ds-obl-card__sub">${escHtml(obl.counterparty || '—')} · ${fmtEUR(obl.amount)} · ${FREQ_LABELS[obl.frequency] || obl.frequency}${isInstallment ? ' · Δόσεις' : ''}</span>
            ${progressHtml}
            ${!isInstallment && unpaid > 0 ? `<span class="ds-obl-card__debt">${unpaid} ανεξόφλητ${unpaid === 1 ? 'η' : 'ες'} · ${fmtEUR(unpaidAmount)}</span>` : ''}
            ${!isInstallment && unpaid === 0 ? '<span class="ds-obl-card__ok">Εντάξει</span>' : ''}
            ${isInstallment && unpaid > 0 && !progressHtml.includes('Ολοκληρώθηκε') ? `<span class="ds-obl-card__debt">${unpaid} ανεξόφλητ${unpaid === 1 ? 'η' : 'ες'} · ${fmtEUR(unpaidAmount)}</span>` : ''}
          </div>
        </div>
        <button class="ds-obl-card__pay-btn ${currentPaid && currentPeriodInRange ? 'ds-obl-card__pay-btn--paid' : ''}" ${!currentPeriodInRange ? 'disabled style="opacity:0.3"' : ''} data-obl-pay="${obl.id}" data-obl-period="${cp}" aria-label="Πληρωμή τρέχοντος μήνα">
          ${currentPaid && currentPeriodInRange ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : fmtPeriod(cp)}
        </button>
      `;

      // Card click → detail view
      card.querySelector('.ds-obl-card__left').addEventListener('click', () => openDetail(obl.id));

      // Pay button click → toggle payment
      const payBtn = card.querySelector('.ds-obl-card__pay-btn');
      payBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (currentPaid) {
          // Find the payment record and unmark
          const payment = allPayments.find(p => p.obligationId === obl.id && p.period === cp);
          if (payment) {
            await fetch(`${PAYMENTS_BASE}/${payment.id}?driverId=${encodeURIComponent(phone)}`, { method: 'DELETE' });
          }
        } else {
          await fetch(`${BASE}/${obl.id}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ driverId: phone, period: cp })
          });
        }
        await loadAll();
      });

      listEl.appendChild(card);
    });
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // ═══════════════════════════════════════
  // FILTERS
  // ═══════════════════════════════════════

  $$('[data-ds-obl-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-ds-obl-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.getAttribute('data-ds-obl-filter');
      renderList();
    });
  });

  // ═══════════════════════════════════════
  // ADD / EDIT OVERLAY
  // ═══════════════════════════════════════

  function openAdd() {
    editIdInput.value = '';
    titleInput.value = '';
    counterpartyInput.value = '';
    amountInput.value = '';
    directionInput.value = 'incoming';
    frequencyInput.value = 'monthly';
    startDateInput.value = greeceDateStr();
    dialogTitle.textContent = 'Νέα Υποχρέωση';
    deleteBtn.style.display = 'none';
    setDirToggle('incoming');
    setTypeToggle('recurring');
    if (totalAmountInput) totalAmountInput.value = '';
    if (totalInstallmentsInput) totalInstallmentsInput.value = '';
    if (installmentCalcEl) installmentCalcEl.textContent = '';
    amountInput.required = true;
    overlay.style.display = '';
    titleInput.focus();
  }

  function openEdit(obl) {
    editIdInput.value = obl.id;
    titleInput.value = obl.title || '';
    counterpartyInput.value = obl.counterparty || '';
    amountInput.value = obl.amount || '';
    directionInput.value = obl.direction || 'incoming';
    frequencyInput.value = obl.frequency || 'monthly';
    startDateInput.value = obl.startDate || '';
    dialogTitle.textContent = 'Επεξεργασία Υποχρέωσης';
    deleteBtn.style.display = '';
    setDirToggle(obl.direction);
    const type = obl.oblType || 'recurring';
    setTypeToggle(type);
    if (type === 'installment') {
      if (totalAmountInput) totalAmountInput.value = obl.totalAmount || '';
      if (totalInstallmentsInput) totalInstallmentsInput.value = obl.totalInstallments || '';
      updateInstallmentCalc();
      amountInput.required = false;
    } else {
      if (totalAmountInput) totalAmountInput.value = '';
      if (totalInstallmentsInput) totalInstallmentsInput.value = '';
      if (installmentCalcEl) installmentCalcEl.textContent = '';
      amountInput.required = true;
    }
    overlay.style.display = '';
    titleInput.focus();
  }

  function closeOverlay() {
    overlay.style.display = 'none';
  }

  // Direction toggle buttons
  function setDirToggle(dir) {
    $$('[data-ds-obl-dir]').forEach(b => b.classList.toggle('active', b.getAttribute('data-ds-obl-dir') === dir));
    directionInput.value = dir;
  }
  $$('[data-ds-obl-dir]').forEach(btn => {
    btn.addEventListener('click', () => setDirToggle(btn.getAttribute('data-ds-obl-dir')));
  });

  // Type toggle buttons
  function setTypeToggle(type) {
    $$('[data-ds-obl-type]').forEach(b => b.classList.toggle('active', b.getAttribute('data-ds-obl-type') === type));
    if (oblTypeInput) oblTypeInput.value = type;
    if (installmentFieldsEl) installmentFieldsEl.style.display = type === 'installment' ? '' : 'none';
    if (type === 'installment') {
      amountInput.required = false;
    } else {
      amountInput.required = true;
    }
  }
  $$('[data-ds-obl-type]').forEach(btn => {
    btn.addEventListener('click', () => setTypeToggle(btn.getAttribute('data-ds-obl-type')));
  });

  // Auto-calculate installment amount
  function updateInstallmentCalc() {
    if (!installmentCalcEl || !totalAmountInput || !totalInstallmentsInput) return;
    const total = parseFloat(totalAmountInput.value) || 0;
    const count = parseInt(totalInstallmentsInput.value) || 0;
    if (total > 0 && count > 0) {
      const perInstallment = Math.round((total / count) * 100) / 100;
      installmentCalcEl.textContent = `= ${fmtEUR(perInstallment)} / δόση`;
      amountInput.value = perInstallment;
    } else {
      installmentCalcEl.textContent = '';
    }
  }
  if (totalAmountInput) totalAmountInput.addEventListener('input', updateInstallmentCalc);
  if (totalInstallmentsInput) totalInstallmentsInput.addEventListener('input', updateInstallmentCalc);

  addBtn.addEventListener('click', openAdd);
  cancelBtn.addEventListener('click', closeOverlay);

  // Overlay backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay();
  });

  // Save
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editIdInput.value;
    const data = {
      driverId: phone,
      title: titleInput.value.trim(),
      counterparty: counterpartyInput.value.trim(),
      amount: parseFloat(amountInput.value) || 0,
      direction: directionInput.value,
      frequency: frequencyInput.value,
      startDate: startDateInput.value || greeceDateStr(),
      oblType: oblTypeInput ? oblTypeInput.value : 'recurring'
    };
    if (data.oblType === 'installment') {
      data.totalAmount = parseFloat(totalAmountInput.value) || 0;
      data.totalInstallments = parseInt(totalInstallmentsInput.value) || 0;
      if (data.totalAmount <= 0 || data.totalInstallments <= 0) return;
      data.amount = Math.round((data.totalAmount / data.totalInstallments) * 100) / 100;
    }
    if (!data.title || data.amount <= 0) return;

    if (id) {
      await fetch(`${BASE}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } else {
      await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    }
    closeOverlay();
    await loadAll();
    if (currentOblId === id) openDetail(id);
  });

  // Delete
  deleteBtn.addEventListener('click', async () => {
    const id = editIdInput.value;
    if (!id) return;
    if (!confirm('Διαγραφή αυτής της υποχρέωσης και όλου του ιστορικού πληρωμών;')) return;
    await fetch(`${BASE}/${id}?driverId=${encodeURIComponent(phone)}`, { method: 'DELETE' });
    closeOverlay();
    closeDetail();
    await loadAll();
  });

  // ═══════════════════════════════════════
  // DETAIL / HISTORY VIEW
  // ═══════════════════════════════════════

  function openDetail(oblId) {
    currentOblId = oblId;
    const obl = obligations.find(o => o.id === oblId);
    if (!obl) return;

    detailTitle.textContent = obl.title;
    detailCounterparty.textContent = obl.counterparty || '—';
    detailAmount.textContent = fmtEUR(obl.amount);
    detailDirection.textContent = DIR_LABELS[obl.direction] || obl.direction;
    detailFrequency.textContent = FREQ_LABELS[obl.frequency] || obl.frequency;

    const isInstallment = obl.oblType === 'installment' && obl.totalInstallments > 0;
    if (detailInstallmentInfo) detailInstallmentInfo.style.display = isInstallment ? '' : 'none';
    if (detailRemainingRow) detailRemainingRow.style.display = isInstallment ? '' : 'none';

    if (isInstallment) {
      const cp = currentPeriod();
      const periods = generatePeriods(obl.startDate, cp, obl.frequency, obl.totalInstallments);
      const oblPayments = allPayments.filter(p => p.obligationId === obl.id);
      const paidCount = periods.filter(p => oblPayments.some(pay => pay.period === p)).length;
      const remaining = (obl.totalInstallments - paidCount) * obl.amount;
      if (detailProgress) detailProgress.textContent = `${paidCount}/${obl.totalInstallments} δόσεις (Σύνολο: ${fmtEUR(obl.totalAmount)})`;
      if (detailRemaining) detailRemaining.textContent = fmtEUR(remaining);
    }

    // Hide main, show detail
    $('main.ds-obl-main').style.display = 'none';
    $('header.ds-obl-back-header').style.display = 'none';
    detailView.style.display = '';

    renderHistory();
  }

  function closeDetail() {
    currentOblId = null;
    detailView.style.display = 'none';
    $('main.ds-obl-main').style.display = '';
    $('header.ds-obl-back-header').style.display = '';
  }

  detailBack.addEventListener('click', closeDetail);

  detailEdit.addEventListener('click', () => {
    const obl = obligations.find(o => o.id === currentOblId);
    if (obl) openEdit(obl);
  });

  // History filter buttons
  $$('[data-ds-obl-hist-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-ds-obl-hist-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      historyFilter = btn.getAttribute('data-ds-obl-hist-filter');
      renderHistory();
    });
  });

  function renderHistory() {
    if (!currentOblId) return;
    const obl = obligations.find(o => o.id === currentOblId);
    if (!obl) return;

    const cp = currentPeriod();
    const maxP = obl.oblType === 'installment' && obl.totalInstallments > 0 ? obl.totalInstallments : 0;
    const periods = generatePeriods(obl.startDate, cp, obl.frequency, maxP);
    const oblPayments = allPayments.filter(p => p.obligationId === obl.id);
    const paymentMap = {};
    oblPayments.forEach(p => { paymentMap[p.period] = p; });

    // Reverse so newest first
    const sortedPeriods = [...periods].reverse();

    historyList.innerHTML = '';

    sortedPeriods.forEach(period => {
      const payment = paymentMap[period];
      const isPaid = !!payment;

      // Apply filter
      if (historyFilter === 'paid' && !isPaid) return;
      if (historyFilter === 'unpaid' && isPaid) return;

      const row = document.createElement('div');
      row.className = 'ds-obl-history-row' + (isPaid ? ' ds-obl-history-row--paid' : ' ds-obl-history-row--unpaid');

      row.innerHTML = `
        <div class="ds-obl-history-row__left">
          <span class="ds-obl-history-row__period">${fmtPeriod(period)}</span>
          <span class="ds-obl-history-row__amount">${fmtEUR(obl.amount)}</span>
          ${isPaid ? `<span class="ds-obl-history-row__date">Πληρώθηκε: ${fmtDate(payment.paidAt)}</span>` : '<span class="ds-obl-history-row__pending">Εκκρεμεί</span>'}
        </div>
        <button class="ds-obl-history-row__btn ${isPaid ? 'ds-obl-history-row__btn--paid' : ''}" data-hist-period="${period}">
          ${isPaid ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>'}
        </button>
      `;

      const btn = row.querySelector('.ds-obl-history-row__btn');
      btn.addEventListener('click', async () => {
        if (isPaid) {
          // Unmark
          await fetch(`${PAYMENTS_BASE}/${payment.id}?driverId=${encodeURIComponent(phone)}`, { method: 'DELETE' });
        } else {
          // Mark paid
          await fetch(`${BASE}/${obl.id}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ driverId: phone, period })
          });
        }
        await Promise.all([fetchPayments(), fetchSummary()]);
        renderHistory();
        renderList();
      });

      historyList.appendChild(row);
    });

    if (historyList.children.length === 0) {
      historyList.innerHTML = '<div class="ds-obl-history-empty">Δεν υπάρχουν εγγραφές</div>';
    }
  }

  // ═══════════════════════════════════════
  // BACK BUTTON
  // ═══════════════════════════════════════

  backBtn.addEventListener('click', () => {
    const prefix = window.DriversSystemConfig ? window.DriversSystemConfig.getRoutePrefix() : '/driverssystem';
    window.location.href = prefix + '/profile';
  });

  // ═══════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════

  await loadAll();
})();
