/**
 * MoveAthens Transfers Admin Panel — Orchestrator
 * Loads config, initialises all tab modules, wires price toggle.
 * Per-section logic lives in admin-ma-*.js modules.
 * Shared helpers / state live in admin-ma-helpers.js (window.MaAdmin).
 */
(() => {
  'use strict';
  const { $$, $, showToast, state, api, loadConfig } = window.MaAdmin;

  // ========================================
  // TAB NAVIGATION
  // ========================================
  const initTabs = () => {
    $$('.bar-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.bar-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        $$('.tab-content').forEach(c => c.classList.remove('active'));
        $(`.tab-content[data-tab="${tabName}"]`)?.classList.add('active');
      });
    });
  };

  // ========================================
  // INIT — wire up all tab modules
  // ========================================
  const safe = (label, fn) => {
    try { return fn(); }
    catch (err) { console.error(`[admin-ma] ${label}:`, err); return null; }
  };

  const init = async () => {
    try {
      console.log('[admin-ma] Initializing tabs…');
      initTabs();
      const M = window.MaAdmin;
      const generalTab      = safe('initGeneralTab',      () => M.initGeneralTab());
      const categoriesTab   = safe('initCategoriesTab',   () => M.initCategoriesTab());
      const destinationsTab = safe('initDestinationsTab', () => M.initDestinationsTab());
      const vehiclesTab     = safe('initVehiclesTab',     () => M.initVehiclesTab());
      const zonesTab        = safe('initZonesTab',        () => M.initZonesTab());
      const pricingTab      = safe('initPricingTab',      () => M.initPricingTab());
      const pricingMatrix   = safe('initPricingMatrixTab', () => M.initPricingMatrixTab());
      const infoPageTab     = safe('initInfoPageTab',     () => M.initInfoPageTab());
      const filtersTab      = safe('initFiltersTab',      () => M.initFiltersTab());

      console.log('[admin-ma] Loading config from server…');
      await loadConfig();

      if (!state.configLoaded) {
        console.error('[admin-ma] Config failed to load — tabs will be empty.');
        return;
      }

      safe('generalTab.populate',      () => generalTab?.populate());
      safe('categoriesTab.render',     () => categoriesTab?.render());
      safe('destinationsTab.render',   () => destinationsTab?.render());
      safe('vehiclesTab.render',       () => vehiclesTab?.render());
      safe('zonesTab.render',          () => zonesTab?.render());
      safe('pricingTab.render',        () => pricingTab?.render());
      safe('pricingMatrix.render',     () => pricingMatrix?.render());
      safe('infoPageTab.populate',     () => infoPageTab?.populate());
      safe('filtersTab.render',          () => filtersTab?.render());
      console.log('[admin-ma] Init complete ✔');

      // Price toggle — auto-save on change
      const priceToggle = document.getElementById('showPriceToggle');
      if (priceToggle) {
        priceToggle.addEventListener('change', async () => {
          const val = priceToggle.checked;
          const res = await api('/api/admin/moveathens/ui-config', 'PUT', { showPriceInMessage: val });
          if (res && res.ok) {
            showToast(val ? '✅ Τιμή ενεργή στο μήνυμα' : '❌ Τιμή κρυφή από το μήνυμα');
          } else {
            showToast('⚠️ Σφάλμα αποθήκευσης');
          }
        });
      }
    } catch (err) {
      console.error('[admin-ma] INIT CRASHED:', err);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
