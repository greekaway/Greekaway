/**
 * Admin Driver Panel — Orchestrator
 * Loads config, initializes all tab modules.
 * Tab modules: admin-dp-general, admin-dp-footer, admin-dp-drivers,
 *   admin-dp-route-card, admin-dp-notifications, admin-dp-acceptance,
 *   admin-dp-labels, admin-dp-finance
 */
(() => {
  'use strict';
  const { $, $$, api, state, loadConfig } = window.DpAdmin;

  const initTabs = () => {
    $$('.bar-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.bar-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const name = tab.dataset.tab;
        $$('.tab-content').forEach(c => c.classList.remove('active'));
        $(`.tab-content[data-tab="${name}"]`)?.classList.add('active');
      });
    });
  };

  const safe = (label, fn) => {
    try { return fn(); }
    catch (err) { console.error(`[dp] ${label}:`, err); return null; }
  };

  const init = async () => {
    initTabs();
    const D = window.DpAdmin;

    // Init all tab modules
    const generalTab      = safe('initGeneralTab',      () => D.initGeneralTab());
    const footerTab       = safe('initFooterTab',       () => D.initFooterTab());
    const driversTab      = safe('initDriversTab',      () => D.initDriversTab());
    const routeCardTab    = safe('initRouteCardTab',    () => D.initRouteCardTab());
    const notificationsTab= safe('initNotificationsTab',() => D.initNotificationsTab());
    const acceptanceTab   = safe('initAcceptanceTab',   () => D.initAcceptanceTab());
    const labelsTab       = safe('initLabelsTab',       () => D.initLabelsTab());
    const financeTab      = safe('initFinanceTab',      () => D.initFinanceTab());
    const soundsTab       = safe('initSoundsTab',       () => D.initSoundsTab());

    // Load config
    await loadConfig();

    // Load vehicle types from MoveAthens
    try {
      const res = await api('/api/admin/moveathens/ui-config');
      if (res?.ok) {
        const maConfig = await res.json();
        state.vehicleTypes = maConfig.vehicleTypes || [];
      }
    } catch (err) {
      console.error('[dp] Vehicle types load failed:', err);
    }

    // Load drivers
    try {
      const res = await api('/api/admin/driver-panel/drivers');
      if (res?.ok) {
        const data = await res.json();
        state.drivers = data.drivers || [];
      }
    } catch (err) {
      console.error('[dp] Drivers load failed:', err);
    }

    // Populate all tabs
    safe('general.populate',      () => generalTab?.populate());
    safe('footer.render',         () => footerTab?.render());
    safe('drivers.renderVT',      () => driversTab?.renderVehicleCheckboxes([]));
    safe('drivers.render',        () => driversTab?.render());
    safe('routeCard.populate',    () => routeCardTab?.populate());
    safe('notifications.populate',() => notificationsTab?.populate());
    safe('acceptance.populate',   () => acceptanceTab?.populate());
    safe('labels.populate',       () => labelsTab?.populate());
    safe('finance.populate',      () => financeTab?.populate());
    safe('sounds.populate',       () => soundsTab?.populate());
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
