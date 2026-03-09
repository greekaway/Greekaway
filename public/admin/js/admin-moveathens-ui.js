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
  const init = async () => {
    try {
      console.log('[admin-ma] Initializing tabs…');
      initTabs();
      const M = window.MaAdmin;
      const generalTab      = M.initGeneralTab();
      const categoriesTab   = M.initCategoriesTab();
      const subcategoriesTab = M.initSubcategoriesTab();
      const destinationsTab = M.initDestinationsTab();
      const vehiclesTab     = M.initVehiclesTab();
      const zonesTab        = M.initZonesTab();
      const pricingTab      = M.initPricingTab();
      const infoPageTab     = M.initInfoPageTab();

      console.log('[admin-ma] Loading config from server…');
      await loadConfig();

      if (!state.configLoaded) {
        console.error('[admin-ma] Config failed to load — tabs will be empty.');
        return;
      }

      generalTab.populate();
      categoriesTab.render();
      subcategoriesTab.render();
      destinationsTab.render();
      vehiclesTab.render();
      zonesTab.render();
      pricingTab.render();
      infoPageTab.populate();
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
