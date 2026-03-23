/**
 * Driver Panel Admin — Tab 1: Γενικά
 * Reads/writes: state.config.general
 */
(() => {
  'use strict';
  const { $, setStatus, showToast, state, saveConfig } = window.DpAdmin;

  const populate = () => {
    const g = state.config.general || {};
    $('#dpAppTitle').value = g.appTitle || '';
    $('#dpLogoUrl').value = g.logoUrl || '';
    $('#dpAccentColor').value = g.accentColor || '#46d3ff';
    $('#dpAccentColorText').value = g.accentColor || '#46d3ff';
    $('#dpDefaultTheme').value = g.defaultTheme || 'dark';
  };

  const init = () => {
    $('#dpAccentColor')?.addEventListener('input', (e) => {
      $('#dpAccentColorText').value = e.target.value;
    });
    $('#dpAccentColorText')?.addEventListener('input', (e) => {
      const v = e.target.value;
      if (/^#[0-9a-f]{6}$/i.test(v)) $('#dpAccentColor').value = v;
    });

    $('#dp-general-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = $('#dpGeneralStatus');
      setStatus(status, 'Αποθήκευση…', 'info');
      state.config.general = {
        appTitle: $('#dpAppTitle').value.trim(),
        logoUrl: $('#dpLogoUrl').value.trim(),
        accentColor: $('#dpAccentColorText').value.trim() || '#46d3ff',
        defaultTheme: $('#dpDefaultTheme').value
      };
      const ok = await saveConfig();
      setStatus(status, ok ? '✅ Αποθηκεύτηκε' : '❌ Σφάλμα αποθήκευσης', ok ? 'ok' : 'err');
      if (ok) showToast('Αποθηκεύτηκε');
    });

    return { populate };
  };

  window.DpAdmin.initGeneralTab = init;
})();
