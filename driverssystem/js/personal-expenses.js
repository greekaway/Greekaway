/**
 * DriversSystem — Personal / Home Expenses Page
 * Two-mode page based on URL:
 *   /personal-expenses          → Level 1: list of groups (navigate via links)
 *   /personal-expenses/:groupId → Level 2: items (toggle-select) + ATM amount + notes
 */
(async () => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
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

  // ── Detect groupId from URL ──
  const pathParts = window.location.pathname.replace(/\/$/, '').split('/');
  const lastPart = pathParts[pathParts.length - 1];
  const groupIdFromUrl = (lastPart !== 'personal-expenses') ? lastPart : null;

  // ── DOM refs ──
  const groupsSection = $('[data-ds-pers-exp-groups]');
  const itemsSection  = $('[data-ds-pers-exp-items]');
  const itemsGrid     = $('[data-ds-pers-exp-items-grid]');
  const amountInput   = $('[data-ds-pers-exp-amount]');
  const noteInput     = $('[data-ds-pers-exp-note]');
  const saveBtn       = $('[data-ds-pers-exp-save]');
  const msgEl         = $('[data-ds-pers-exp-msg]');
  const backBar       = $('[data-ds-pers-exp-back-bar]');
  const titleEl       = $('[data-ds-pers-exp-title]');

  // ── ATM-style helpers ──
  let amountCents = 0;
  const centsToDisplay = (cents) => (cents / 100).toFixed(2).replace('.', ',');
  const centsToFloat = (cents) => cents / 100;

  // ── State ──
  let categories = [];
  let selectedGroup = null;
  let selectedItemIdx = null;

  // ── Save button state ──
  const updateSaveState = () => {
    const hasItem = selectedItemIdx !== null;
    const hasAmount = amountCents > 0;
    saveBtn.disabled = !(hasItem && hasAmount);
  };

  // ── Load categories ──
  const loadCategories = async () => {
    try {
      const res = await fetch('/api/driverssystem/personal-expense-categories');
      if (!res.ok) throw new Error();
      categories = await res.json();
    } catch (_) {
      categories = [];
    }
  };

  // ── LEVEL 1: Render groups as navigation links ──
  const renderGroupsList = () => {
    if (!groupsSection) return;
    if (categories.length === 0) {
      groupsSection.innerHTML = '<div class="ds-pers-exp-empty">Δεν υπάρχουν κατηγορίες</div>';
      return;
    }
    const base = window.DriversSystemConfig.buildRoute('/personal-expenses');
    groupsSection.innerHTML = categories.map((group) => `
      <a class="ds-pers-exp-group-btn" href="${base}/${group.id}">
        <span class="ds-pers-exp-group-btn__name">${group.name}</span>
        <span class="ds-pers-exp-group-btn__count">${(group.items || []).length} είδη</span>
      </a>
    `).join('');
  };

  // ── LEVEL 2: Show items page ──
  const showItemsPage = (group) => {
    selectedGroup = group;
    selectedItemIdx = null;
    amountCents = 0;

    // Toggle sections
    groupsSection.hidden = true;
    itemsSection.hidden = false;
    backBar.hidden = false;
    titleEl.textContent = group.name;

    // Reset inputs
    amountInput.value = '0,00';
    if (noteInput) noteInput.value = '';
    if (msgEl) { msgEl.textContent = ''; msgEl.classList.remove('success'); }
    saveBtn.disabled = true;

    renderItems(group);
  };

  // ── Render items as toggle buttons ──
  const renderItems = (group) => {
    if (!itemsGrid) return;
    const items = group.items || [];
    if (items.length === 0) {
      itemsGrid.innerHTML = '<div class="ds-pers-exp-empty">Κανένα είδος σε αυτή την ομάδα</div>';
      return;
    }
    itemsGrid.innerHTML = items.map((item, i) => `
      <button class="ds-pers-exp-item-btn" data-item-idx="${i}">
        ${item.name}
      </button>
    `).join('');

    itemsGrid.querySelectorAll('[data-item-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.itemIdx, 10);
        itemsGrid.querySelectorAll('[data-item-idx]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedItemIdx = idx;
        updateSaveState();
      });
    });
  };

  // ── ATM-style amount input ──
  if (amountInput) {
    amountInput.value = '0,00';

    amountInput.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' || e.key === 'Enter') return;
      e.preventDefault();

      if (e.key >= '0' && e.key <= '9') {
        if (amountCents >= 10000000) return;
        amountCents = amountCents * 10 + parseInt(e.key);
        amountInput.value = centsToDisplay(amountCents);
        updateSaveState();
      } else if (e.key === 'Backspace') {
        amountCents = Math.floor(amountCents / 10);
        amountInput.value = centsToDisplay(amountCents);
        updateSaveState();
      } else if (e.key === 'Delete') {
        amountCents = 0;
        amountInput.value = '0,00';
        updateSaveState();
      }
    });

    amountInput.removeAttribute('readonly');
    amountInput.setAttribute('inputmode', 'numeric');

    amountInput.addEventListener('input', (e) => {
      e.preventDefault();
      amountInput.value = centsToDisplay(amountCents);
    });

    amountInput.addEventListener('paste', (e) => e.preventDefault());
  }

  // ── Save ──
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      if (!selectedGroup || selectedItemIdx === null) return;
      const item = (selectedGroup.items || [])[selectedItemIdx];
      if (!item) return;
      const amount = centsToFloat(amountCents);
      if (amount <= 0) return;

      saveBtn.disabled = true;
      saveBtn.textContent = 'Αποθήκευση…';

      try {
        const body = {
          driverId: savedPhone,
          groupId: selectedGroup.id,
          groupName: selectedGroup.name,
          itemId: item.id,
          itemName: item.name,
          amount,
          date: new Date().toISOString().slice(0, 10)
        };
        if (noteInput && noteInput.value.trim()) {
          body.note = noteInput.value.trim();
        }

        const res = await fetch('/api/driverssystem/personal-expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (res.ok) {
          if (msgEl) { msgEl.textContent = 'Αποθηκεύτηκε!'; msgEl.classList.add('success'); }
          amountCents = 0;
          amountInput.value = '0,00';
          if (noteInput) noteInput.value = '';
          itemsGrid.querySelectorAll('[data-item-idx]').forEach(b => b.classList.remove('selected'));
          selectedItemIdx = null;
          saveBtn.textContent = 'Αποθήκευση';
          saveBtn.disabled = true;
          setTimeout(() => { if (msgEl) { msgEl.textContent = ''; msgEl.classList.remove('success'); } }, 2500);
        } else {
          if (msgEl) msgEl.textContent = 'Σφάλμα αποθήκευσης';
          saveBtn.disabled = false;
          saveBtn.textContent = 'Αποθήκευση';
        }
      } catch (_) {
        if (msgEl) msgEl.textContent = 'Σφάλμα σύνδεσης';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Αποθήκευση';
      }
    });
  }

  // ── Back button → navigate back to groups page ──
  const backBtn = $('[data-ds-pers-exp-back]');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.href = window.DriversSystemConfig.buildRoute('/personal-expenses');
    });
  }

  // ── Init ──
  await loadCategories();

  if (groupIdFromUrl) {
    const group = categories.find(g => g.id === groupIdFromUrl);
    if (group) {
      showItemsPage(group);
    } else {
      window.location.href = window.DriversSystemConfig.buildRoute('/personal-expenses');
    }
  } else {
    renderGroupsList();
  }

})();
