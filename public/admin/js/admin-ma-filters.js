/**
 * MoveAthens Admin — Filters Tab
 * Manages: Areas, Price Ranges, Vibe/Style lists
 * Depends on: admin-ma-helpers.js (window.MaAdmin)
 */
(() => {
  'use strict';
  const { $, showToast, setStatus, state, api, ensureConfigLoaded } = window.MaAdmin;

  const initFiltersTab = () => {
    // ── DOM refs ──
    const areaInput = $('#maFilterAreaInput');
    const areaAddBtn = $('#maFilterAreaAddBtn');
    const areasList = $('#maFilterAreasList');

    const priceLabel = $('#maFilterPriceLabel');
    const priceMin = $('#maFilterPriceMin');
    const priceMax = $('#maFilterPriceMax');
    const priceAddBtn = $('#maFilterPriceAddBtn');
    const pricesList = $('#maFilterPricesList');

    const vibeInput = $('#maFilterVibeInput');
    const vibeAddBtn = $('#maFilterVibeAddBtn');
    const vibesList = $('#maFilterVibesList');

    const status = $('#maFilterStatus');

    // ── Helpers ──
    const ensureArrays = () => {
      if (!state.CONFIG.filterAreas) state.CONFIG.filterAreas = [];
      if (!state.CONFIG.filterPriceRanges) state.CONFIG.filterPriceRanges = [];
      if (!state.CONFIG.filterVibes) state.CONFIG.filterVibes = [];
    };

    const saveFilters = async () => {
      if (!ensureConfigLoaded()) return false;
      ensureArrays();
      const res = await api('/api/admin/moveathens/ui-config', 'PUT', {
        filterAreas: state.CONFIG.filterAreas,
        filterPriceRanges: state.CONFIG.filterPriceRanges,
        filterVibes: state.CONFIG.filterVibes
      });
      if (res && res.ok) {
        showToast('✅ Φίλτρα αποθηκεύτηκαν');
        return true;
      }
      showToast('⚠️ Σφάλμα αποθήκευσης');
      return false;
    };

    // ── Render tag lists ──
    const renderAreas = () => {
      ensureArrays();
      if (!areasList) return;
      const items = state.CONFIG.filterAreas;
      areasList.innerHTML = items.length ? items.map((a, i) => `
        <span class="ma-filter-tag" data-idx="${i}">
          ${escHtml(a.name)}
          <button class="ma-filter-tag__remove" type="button" data-type="area" data-idx="${i}" title="Διαγραφή">&times;</button>
        </span>
      `).join('') : '<span class="ma-empty" style="font-size:13px">Δεν υπάρχουν περιοχές.</span>';
    };

    const renderPrices = () => {
      ensureArrays();
      if (!pricesList) return;
      const items = state.CONFIG.filterPriceRanges;
      pricesList.innerHTML = items.length ? items.map((p, i) => {
        const maxLabel = p.max != null ? `${p.max}€` : '∞';
        return `
        <span class="ma-filter-tag" data-idx="${i}">
          ${escHtml(p.label)} (${p.min}€ – ${maxLabel})
          <button class="ma-filter-tag__remove" type="button" data-type="price" data-idx="${i}" title="Διαγραφή">&times;</button>
        </span>`;
      }).join('') : '<span class="ma-empty" style="font-size:13px">Δεν υπάρχουν εύρη τιμών.</span>';
    };

    const renderVibes = () => {
      ensureArrays();
      if (!vibesList) return;
      const items = state.CONFIG.filterVibes;
      vibesList.innerHTML = items.length ? items.map((v, i) => `
        <span class="ma-filter-tag" data-idx="${i}">
          ${escHtml(v.name)}
          <button class="ma-filter-tag__remove" type="button" data-type="vibe" data-idx="${i}" title="Διαγραφή">&times;</button>
        </span>
      `).join('') : '<span class="ma-empty" style="font-size:13px">Δεν υπάρχουν ύφη.</span>';
    };

    const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const render = () => {
      renderAreas();
      renderPrices();
      renderVibes();
    };

    // ── Add handlers ──
    areaAddBtn?.addEventListener('click', async () => {
      const name = (areaInput?.value || '').trim();
      if (!name) { setStatus(status, 'Γράψτε όνομα περιοχής', 'error'); return; }
      ensureArrays();
      // Duplicate check
      if (state.CONFIG.filterAreas.some(a => a.name.toLowerCase() === name.toLowerCase())) {
        setStatus(status, 'Η περιοχή υπάρχει ήδη', 'error'); return;
      }
      state.CONFIG.filterAreas.push({ id: `area_${Date.now()}`, name });
      if (await saveFilters()) {
        if (areaInput) areaInput.value = '';
        setStatus(status, '', '');
        render();
      }
    });

    priceAddBtn?.addEventListener('click', async () => {
      const label = (priceLabel?.value || '').trim();
      const min = parseFloat(priceMin?.value);
      const max = priceMax?.value ? parseFloat(priceMax.value) : null;
      if (!label) { setStatus(status, 'Γράψτε label τιμής', 'error'); return; }
      if (isNaN(min) || min < 0) { setStatus(status, 'Μη έγκυρο "Από"', 'error'); return; }
      if (max !== null && (isNaN(max) || max <= min)) { setStatus(status, 'Το "Έως" πρέπει να είναι > "Από"', 'error'); return; }
      ensureArrays();
      if (state.CONFIG.filterPriceRanges.some(p => p.label.toLowerCase() === label.toLowerCase())) {
        setStatus(status, 'Αυτό το εύρος υπάρχει ήδη', 'error'); return;
      }
      state.CONFIG.filterPriceRanges.push({ id: `pr_${Date.now()}`, label, min, max });
      if (await saveFilters()) {
        if (priceLabel) priceLabel.value = '';
        if (priceMin) priceMin.value = '';
        if (priceMax) priceMax.value = '';
        setStatus(status, '', '');
        render();
      }
    });

    vibeAddBtn?.addEventListener('click', async () => {
      const name = (vibeInput?.value || '').trim();
      if (!name) { setStatus(status, 'Γράψτε ύφος', 'error'); return; }
      ensureArrays();
      if (state.CONFIG.filterVibes.some(v => v.name.toLowerCase() === name.toLowerCase())) {
        setStatus(status, 'Αυτό το ύφος υπάρχει ήδη', 'error'); return;
      }
      state.CONFIG.filterVibes.push({ id: `vibe_${Date.now()}`, name });
      if (await saveFilters()) {
        if (vibeInput) vibeInput.value = '';
        setStatus(status, '', '');
        render();
      }
    });

    // ── Delete handlers (event delegation) ──
    const handleDelete = async (e) => {
      const btn = e.target.closest('.ma-filter-tag__remove');
      if (!btn) return;
      const type = btn.dataset.type;
      const idx = parseInt(btn.dataset.idx, 10);
      ensureArrays();
      if (type === 'area' && idx < state.CONFIG.filterAreas.length) {
        state.CONFIG.filterAreas.splice(idx, 1);
      } else if (type === 'price' && idx < state.CONFIG.filterPriceRanges.length) {
        state.CONFIG.filterPriceRanges.splice(idx, 1);
      } else if (type === 'vibe' && idx < state.CONFIG.filterVibes.length) {
        state.CONFIG.filterVibes.splice(idx, 1);
      }
      if (await saveFilters()) render();
    };

    areasList?.addEventListener('click', handleDelete);
    pricesList?.addEventListener('click', handleDelete);
    vibesList?.addEventListener('click', handleDelete);

    // Enter key support
    areaInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); areaAddBtn?.click(); } });
    vibeInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); vibeAddBtn?.click(); } });

    return { render };
  };

  window.MaAdmin.initFiltersTab = initFiltersTab;
})();
