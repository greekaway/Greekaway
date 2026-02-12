/**
 * DriversSystem — Expenses Page
 * CRUD for expense entries by category (car / fixed / personal / family)
 */
(async () => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const STORAGE_KEY = 'ds_driver_phone';

  // ── Auth guard ──
  const savedPhone = localStorage.getItem(STORAGE_KEY);
  if (!savedPhone) {
    window.location.href = window.DriversSystemConfig
      ? window.DriversSystemConfig.buildRoute('/profile')
      : '/driverssystem/profile';
    return;
  }

  // ── Config ──
  const cfg = await window.DriversSystemConfig.load();
  const logo = $('[data-ds-hero-logo]');
  if (logo && cfg.heroLogoUrl) { logo.src = cfg.heroLogoUrl; logo.style.display = 'block'; }
  const homeLink = $('[data-ds-home-link]');
  if (homeLink) homeLink.href = window.DriversSystemConfig.buildRoute('/');

  // ── Category names ──
  const CAT_NAMES = {
    car: 'Έξοδα Αυτοκινήτου',
    fixed: 'Πάγια Έξοδα',
    personal: 'Προσωπικά Έξοδα',
    family: 'Οικογενειακά Έξοδα'
  };

  // ── Determine active category from URL ──
  const pathParts = window.location.pathname.split('/');
  const lastPart = pathParts[pathParts.length - 1];
  let activeCategory = ['car', 'fixed', 'personal', 'family'].includes(lastPart) ? lastPart : 'car';

  // ── Format helpers ──
  const fmtEur = (v) => (v || 0).toFixed(2).replace('.', ',') + ' €';
  const fmtDate = (d) => {
    if (!d) return '—';
    const p = d.slice(0, 10).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
  };

  // ── Set page title ──
  const titleEl = $('[data-ds-expenses-title]');
  const updateTitle = () => {
    if (titleEl) titleEl.textContent = CAT_NAMES[activeCategory] || 'Έξοδα';
  };
  updateTitle();

  // ── Tab switching ──
  const setActiveTab = (cat) => {
    activeCategory = cat;
    $$('[data-expense-tab]').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.expenseTab === cat);
    });
    updateTitle();
    loadExpenses();
  };

  $$('[data-expense-tab]').forEach(tab => {
    tab.addEventListener('click', () => setActiveTab(tab.dataset.expenseTab));
  });

  // Set initial tab active
  $$('[data-expense-tab]').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.expenseTab === activeCategory);
  });

  // ── Get current month range ──
  const now = new Date();
  const fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const toDate = now.toISOString().slice(0, 10);

  // Set default date
  const dateInput = $('[data-ds-expense-date]');
  if (dateInput) dateInput.value = toDate;

  // ── Load expenses ──
  const loadExpenses = async () => {
    const listEl = $('[data-ds-expenses-list]');
    const totalEl = $('[data-ds-expenses-total]');
    if (!listEl) return;

    try {
      const params = new URLSearchParams({
        driverId: savedPhone,
        category: activeCategory,
        from: fromDate,
        to: toDate
      });
      const res = await fetch(`/api/driverssystem/expenses?${params}`);
      if (!res.ok) throw new Error();
      const expenses = await res.json();

      const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);
      if (totalEl) totalEl.textContent = fmtEur(total);

      if (expenses.length === 0) {
        listEl.innerHTML = '<div class="ds-expenses-empty">Δεν υπάρχουν καταχωρήσεις</div>';
        return;
      }

      listEl.innerHTML = expenses.map(e => `
        <div class="ds-expenses-item" data-expense-id="${e.id}">
          <div class="ds-expenses-item__info">
            <span class="ds-expenses-item__desc">${e.description || '—'}</span>
            <span class="ds-expenses-item__date">${fmtDate(e.date)}</span>
          </div>
          <span class="ds-expenses-item__amount">${fmtEur(e.amount)}</span>
          <button class="ds-expenses-item__delete" data-delete-expense="${e.id}">✕</button>
        </div>
      `).join('');

      // Delete handlers
      listEl.querySelectorAll('[data-delete-expense]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.deleteExpense;
          if (!confirm('Διαγραφή αυτού του εξόδου;')) return;
          try {
            await fetch(`/api/driverssystem/expenses/${id}`, { method: 'DELETE' });
            loadExpenses();
          } catch (_) {}
        });
      });
    } catch (_) {
      listEl.innerHTML = '<div class="ds-expenses-empty">Σφάλμα φόρτωσης</div>';
    }
  };

  // ── Add expense form ──
  const form = $('[data-ds-expense-form]');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const desc = ($('[data-ds-expense-desc]') || {}).value || '';
      const amount = parseFloat(($('[data-ds-expense-amount]') || {}).value) || 0;
      const date = ($('[data-ds-expense-date]') || {}).value || toDate;

      if (!amount || amount <= 0) { alert('Εισάγετε ποσό'); return; }

      try {
        const res = await fetch('/api/driverssystem/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            driverId: savedPhone,
            category: activeCategory,
            description: desc,
            amount,
            date
          })
        });
        if (res.ok) {
          // Clear form
          if ($('[data-ds-expense-desc]')) $('[data-ds-expense-desc]').value = '';
          if ($('[data-ds-expense-amount]')) $('[data-ds-expense-amount]').value = '';
          loadExpenses();
        } else {
          alert('Σφάλμα αποθήκευσης');
        }
      } catch (_) {
        alert('Σφάλμα σύνδεσης');
      }
    });
  }

  // ── Initial load ──
  await loadExpenses();

})();
