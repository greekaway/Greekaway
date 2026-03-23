/**
 * Driver Panel Admin — Tab 8: Οικονομικά
 * Toggle visibility of balance, history, commission for drivers.
 * Reads/writes: state.config.finance
 */
(() => {
  'use strict';
  const { $, setStatus, showToast, state, saveConfig } = window.DpAdmin;

  const DEFAULTS = {
    showBalance: true,
    showHistory: true,
    showCommission: true
  };

  const populate = () => {
    const cfg = { ...DEFAULTS, ...state.config.finance };
    const cb = (id, val) => { const e = $(id); if (e) e.checked = !!val; };
    cb('#dpFinBalance', cfg.showBalance);
    cb('#dpFinHistory', cfg.showHistory);
    cb('#dpFinCommission', cfg.showCommission);
  };

  const collect = () => ({
    showBalance: $('#dpFinBalance')?.checked ?? DEFAULTS.showBalance,
    showHistory: $('#dpFinHistory')?.checked ?? DEFAULTS.showHistory,
    showCommission: $('#dpFinCommission')?.checked ?? DEFAULTS.showCommission
  });

  const init = () => {
    $('#dpFinSave')?.addEventListener('click', async () => {
      const status = $('#dpFinStatus');
      setStatus(status, 'Αποθήκευση…', 'info');
      state.config.finance = collect();
      const ok = await saveConfig();
      setStatus(status, ok ? '✅ Αποθηκεύτηκε' : '❌ Σφάλμα', ok ? 'ok' : 'err');
      if (ok) showToast('Οικονομικά αποθηκεύτηκαν');
    });
    return { populate };
  };

  window.DpAdmin.initFinanceTab = init;
})();
