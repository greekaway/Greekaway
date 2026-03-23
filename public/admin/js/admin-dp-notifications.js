/**
 * Driver Panel Admin — Tab 5: Ειδοποιήσεις
 * Push on/off, sound, vibration, reminder, push template.
 * Reads/writes: state.config.notifications
 */
(() => {
  'use strict';
  const { $, setStatus, showToast, state, saveConfig } = window.DpAdmin;

  const DEFAULTS = {
    pushEnabled: true,
    soundEnabled: true,
    vibrationEnabled: true,
    reminderMinutes: 15,
    pushTemplate: 'Νέα διαδρομή: {origin} → {destination} στις {datetime}'
  };

  const populate = () => {
    const cfg = { ...DEFAULTS, ...state.config.notifications };
    const el = (id) => $(id);
    const cb = (id, val) => { const e = el(id); if (e) e.checked = !!val; };
    const sv = (id, val) => { const e = el(id); if (e) e.value = val; };

    cb('#dpNotifPush', cfg.pushEnabled);
    cb('#dpNotifSound', cfg.soundEnabled);
    cb('#dpNotifVibration', cfg.vibrationEnabled);
    sv('#dpNotifReminder', cfg.reminderMinutes);
    sv('#dpNotifTemplate', cfg.pushTemplate);
  };

  const collect = () => ({
    pushEnabled: $('#dpNotifPush')?.checked ?? DEFAULTS.pushEnabled,
    soundEnabled: $('#dpNotifSound')?.checked ?? DEFAULTS.soundEnabled,
    vibrationEnabled: $('#dpNotifVibration')?.checked ?? DEFAULTS.vibrationEnabled,
    reminderMinutes: parseInt($('#dpNotifReminder')?.value, 10) || DEFAULTS.reminderMinutes,
    pushTemplate: $('#dpNotifTemplate')?.value?.trim() || DEFAULTS.pushTemplate
  });

  const init = () => {
    $('#dpNotifSave')?.addEventListener('click', async () => {
      const status = $('#dpNotifStatus');
      setStatus(status, 'Αποθήκευση…', 'info');
      state.config.notifications = collect();
      const ok = await saveConfig();
      setStatus(status, ok ? '✅ Αποθηκεύτηκε' : '❌ Σφάλμα', ok ? 'ok' : 'err');
      if (ok) showToast('Ειδοποιήσεις αποθηκεύτηκαν');
    });
    return { populate };
  };

  window.DpAdmin.initNotificationsTab = init;
})();
