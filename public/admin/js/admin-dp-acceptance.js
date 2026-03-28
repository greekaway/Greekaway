/**
 * Driver Panel Admin — Tab 6: Αποδοχή & Ροή
 * Assignment mode, broadcast timeout, auto-broadcast, auto-reject.
 * Tier settings: Gold percentage, minimum minutes.
 * Reads/writes: state.config.acceptance
 */
(() => {
  'use strict';
  const { $, setStatus, showToast, state, saveConfig } = window.DpAdmin;

  const DEFAULTS = {
    assignmentMode: 'broadcast',
    broadcastTimeoutMinutes: 5,
    autoBroadcast: false,
    autoReject: false,
    tierGoldPercent: 50,
    tierMinMinutes: 15
  };

  const populate = () => {
    const cfg = { ...DEFAULTS, ...state.config.acceptance };
    const el = (id) => $(id);
    const sv = (id, val) => { const e = el(id); if (e) e.value = val; };
    const cb = (id, val) => { const e = el(id); if (e) e.checked = !!val; };

    sv('#dpAcceptMode', cfg.assignmentMode);
    sv('#dpAcceptTimeout', cfg.broadcastTimeoutMinutes || cfg.broadcastTimeoutMin);
    cb('#dpAcceptAutoBroadcast', cfg.autoBroadcast);
    cb('#dpAcceptAutoReject', cfg.autoReject);

    // Tier settings
    const rangeEl = $('#dpTierGoldPercent');
    const rangeVal = $('#dpTierGoldPercentValue');
    if (rangeEl) {
      rangeEl.value = cfg.tierGoldPercent ?? 50;
      if (rangeVal) rangeVal.textContent = rangeEl.value + '%';
      rangeEl.addEventListener('input', () => {
        if (rangeVal) rangeVal.textContent = rangeEl.value + '%';
      });
    }
    sv('#dpTierMinMinutes', cfg.tierMinMinutes ?? 15);
  };

  const collect = () => ({
    assignmentMode: $('#dpAcceptMode')?.value || DEFAULTS.assignmentMode,
    broadcastTimeoutMinutes: parseInt($('#dpAcceptTimeout')?.value, 10) || DEFAULTS.broadcastTimeoutMinutes,
    autoBroadcast: $('#dpAcceptAutoBroadcast')?.checked ?? DEFAULTS.autoBroadcast,
    autoReject: $('#dpAcceptAutoReject')?.checked ?? DEFAULTS.autoReject,
    tierGoldPercent: parseInt($('#dpTierGoldPercent')?.value, 10) ?? DEFAULTS.tierGoldPercent,
    tierMinMinutes: parseInt($('#dpTierMinMinutes')?.value, 10) || DEFAULTS.tierMinMinutes
  });

  const init = () => {
    $('#dpAcceptSave')?.addEventListener('click', async () => {
      const status = $('#dpAcceptStatus');
      setStatus(status, 'Αποθήκευση…', 'info');
      state.config.acceptance = collect();
      const ok = await saveConfig();
      setStatus(status, ok ? '✅ Αποθηκεύτηκε' : '❌ Σφάλμα', ok ? 'ok' : 'err');
      if (ok) showToast('Αποδοχή & Ροή αποθηκεύτηκε');
    });
    return { populate };
  };

  window.DpAdmin.initAcceptanceTab = init;
})();
