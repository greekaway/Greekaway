/**
 * Driver Panel Admin — Tab 5: Ειδοποιήσεις
 * Push on/off, sound, vibration, reminder, push template, sound picker.
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
    pushTemplate: 'Νέα διαδρομή: {origin} → {destination} στις {datetime}',
    alertSound: 'chime'
  };

  const buildSoundPicker = (selected) => {
    const wrap = $('#dpSoundPicker');
    if (!wrap || !window.DpSounds) return;
    const sounds = window.DpSounds.SOUNDS;
    wrap.innerHTML = Object.entries(sounds).map(([id, s]) => `
      <div class="dp-sound-option ${id === selected ? 'dp-sound-active' : ''}" data-sound="${id}">
        <span class="dp-sound-name">${s.name}</span>
        <button type="button" class="dp-sound-preview" data-sound="${id}" title="Ακρόαση">▶️</button>
      </div>
    `).join('');
    wrap.addEventListener('click', (e) => {
      const preview = e.target.closest('.dp-sound-preview');
      if (preview) { window.DpSounds.play(preview.dataset.sound); return; }
      const opt = e.target.closest('.dp-sound-option');
      if (!opt) return;
      wrap.querySelectorAll('.dp-sound-option').forEach(o => o.classList.remove('dp-sound-active'));
      opt.classList.add('dp-sound-active');
      window.DpSounds.play(opt.dataset.sound);
    });
  };

  const getSelectedSound = () => {
    const active = $('#dpSoundPicker .dp-sound-active');
    return active?.dataset?.sound || DEFAULTS.alertSound;
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
    buildSoundPicker(cfg.alertSound || 'chime');
  };

  const collect = () => ({
    pushEnabled: $('#dpNotifPush')?.checked ?? DEFAULTS.pushEnabled,
    soundEnabled: $('#dpNotifSound')?.checked ?? DEFAULTS.soundEnabled,
    vibrationEnabled: $('#dpNotifVibration')?.checked ?? DEFAULTS.vibrationEnabled,
    reminderMinutes: parseInt($('#dpNotifReminder')?.value, 10) || DEFAULTS.reminderMinutes,
    pushTemplate: $('#dpNotifTemplate')?.value?.trim() || DEFAULTS.pushTemplate,
    alertSound: getSelectedSound()
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
