/**
 * DriversSystem — Car Expenses Page
 * 3-level flow: Groups → Items → Amount input
 * Categories managed from admin panel (source of truth)
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

  // ── State ──
  let categories = [];
  let selectedGroup = null;
  let selectedItem = null;

  // ── DOM refs ──
  const groupsSection = $('[data-ds-car-exp-groups]');
  const itemsSection = $('[data-ds-car-exp-items]');
  const amountSection = $('[data-ds-car-exp-amount]');
  const itemsTitle = $('[data-ds-car-exp-items-title]');
  const itemsGrid = $('[data-ds-car-exp-items-grid]');
  const amountLabel = $('[data-ds-car-exp-amount-label]');
  const amountInput = $('[data-ds-car-exp-amount-input]');
  const saveBtn = $('[data-ds-car-exp-save]');
  const msgEl = $('[data-ds-car-exp-msg]');

  // ── Show section ──
  const showGroups = () => {
    groupsSection.hidden = false;
    itemsSection.hidden = true;
    amountSection.hidden = true;
    selectedGroup = null;
    selectedItem = null;
    $('[data-ds-car-exp-title]').textContent = 'Έξοδα Αυτοκινήτου';
  };

  const showItems = (group) => {
    selectedGroup = group;
    selectedItem = null;
    groupsSection.hidden = true;
    itemsSection.hidden = false;
    amountSection.hidden = true;
    itemsTitle.textContent = group.name;
    $('[data-ds-car-exp-title]').textContent = group.name;
    renderItems(group);
  };

  const showAmount = (group, item) => {
    selectedItem = item;
    groupsSection.hidden = true;
    itemsSection.hidden = true;
    amountSection.hidden = false;
    amountLabel.textContent = `${group.name} → ${item.name}`;
    $('[data-ds-car-exp-title]').textContent = item.name;
    amountInput.value = '';
    saveBtn.disabled = true;
    if (msgEl) msgEl.textContent = '';
    amountInput.focus();
  };

  // ── Load categories from API ──
  const loadCategories = async () => {
    try {
      const res = await fetch('/api/driverssystem/car-expense-categories');
      if (!res.ok) throw new Error();
      categories = await res.json();
    } catch (_) {
      categories = [];
    }
    renderGroups();
  };

  // ── Render groups as big buttons ──
  const renderGroups = () => {
    if (!groupsSection) return;
    if (categories.length === 0) {
      groupsSection.innerHTML = '<div class="ds-car-exp-empty">Δεν υπάρχουν κατηγορίες</div>';
      return;
    }
    groupsSection.innerHTML = categories.map((group, i) => `
      <button class="ds-car-exp-group-btn" data-group-idx="${i}">
        <span class="ds-car-exp-group-btn__name">${group.name}</span>
        <span class="ds-car-exp-group-btn__count">${(group.items || []).length} είδη</span>
      </button>
    `).join('');

    // Attach click handlers
    groupsSection.querySelectorAll('[data-group-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.groupIdx, 10);
        showItems(categories[idx]);
      });
    });
  };

  // ── Render items as buttons ──
  const renderItems = (group) => {
    if (!itemsGrid) return;
    const items = group.items || [];
    if (items.length === 0) {
      itemsGrid.innerHTML = '<div class="ds-car-exp-empty">Κανένα είδος σε αυτή την ομάδα</div>';
      return;
    }
    itemsGrid.innerHTML = items.map((item, i) => `
      <button class="ds-car-exp-item-btn" data-item-idx="${i}">
        ${item.name}
      </button>
    `).join('');

    itemsGrid.querySelectorAll('[data-item-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.itemIdx, 10);
        showAmount(group, items[idx]);
      });
    });
  };

  // ── Back buttons ──
  const backBtn = $('[data-ds-car-exp-back]');
  if (backBtn) backBtn.addEventListener('click', showGroups);

  const amountBackBtn = $('[data-ds-car-exp-amount-back]');
  if (amountBackBtn) {
    amountBackBtn.addEventListener('click', () => {
      if (selectedGroup) showItems(selectedGroup);
      else showGroups();
    });
  }

  // ── Amount input validation ──
  if (amountInput) {
    amountInput.addEventListener('input', () => {
      const val = parseFloat(amountInput.value);
      saveBtn.disabled = !(val > 0);
    });
  }

  // ── Save expense ──
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      if (!selectedGroup || !selectedItem) return;
      const amount = parseFloat(amountInput.value);
      if (!amount || amount <= 0) { if (msgEl) msgEl.textContent = 'Εισάγετε ποσό'; return; }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Αποθήκευση…';

      try {
        const res = await fetch('/api/driverssystem/car-expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            driverId: savedPhone,
            groupId: selectedGroup.id,
            groupName: selectedGroup.name,
            itemId: selectedItem.id,
            itemName: selectedItem.name,
            amount,
            date: new Date().toISOString().slice(0, 10)
          })
        });
        if (res.ok) {
          if (msgEl) {
            msgEl.textContent = '✓ Αποθηκεύτηκε!';
            msgEl.classList.add('success');
          }
          amountInput.value = '';
          saveBtn.textContent = 'Αποθήκευση';
          // After 1.2s go back to items
          setTimeout(() => {
            if (msgEl) { msgEl.textContent = ''; msgEl.classList.remove('success'); }
            if (selectedGroup) showItems(selectedGroup);
          }, 1200);
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

  // ── Initial load ──
  await loadCategories();

})();
