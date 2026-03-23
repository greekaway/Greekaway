/**
 * Driver Panel Admin — Tab 6: Αποδοχή & Ροή
 * Assignment mode, broadcast timeout, auto-broadcast, auto-reject.
 * Reads/writes: state.config.acceptance
 */
(() => {
  'use strict';
  const { $, setStatus, showToast, state, saveConfig } = window.DpAdmin;

  const DEFAULTS = {
    assignmentMode: 'broadcast',
    broadcastTimeoutMin: 5,
    autoBroadcast: false,
    autoReject: false
  };

  const populate = () => {
    const cfg = { ...DEFAULTS, ...state.config.acceptance };
    const el = (id) => $(id);
    const sv = (id, val) => { const e = el(id); if (e) e.value = val; };
    const cb = (id, val) => { const e = el(id); if (e) e.checked = !!val; };

    sv('#dpAcceptMode', cfg.assignmentMode);
    sv('#dpAcceptTimeout', cfg.broadcastTimeoutMin);
    cb('#dpAcceptAutoBroadcast', cfg.autoBroadcast);
    cb('#dpAcceptAutoReject', cfg.autoReject);
  };

  const collect = () => ({
    assignmentMode: $('#dpAcceptMode')?.value || DEFAULTS.assignmentMode,
    broadcastTimeoutMin: parseInt($('#dpAcceptTimeout')?.value, 10) || DEFAULTS.broadcastTimeoutMin,
    autoBroadcast: $('#dpAcceptAutoBroadcast')?.checked ?? DEFAULTS.autoBroadcast,
    autoReject: $('#dpAcceptAutoReject')?.checked ?? DEFAULTS.autoReject
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
