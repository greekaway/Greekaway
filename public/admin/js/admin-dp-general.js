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
    $('#dpDefaultTheme').value = g.defaultTheme || 'auto';
  };

  const init = () => {
    $('#dpAccentColor')?.addEventListener('input', (e) => {
      $('#dpAccentColorText').value = e.target.value;
    });
    $('#dpAccentColorText')?.addEventListener('input', (e) => {
      const v = e.target.value;
      if (/^#[0-9a-f]{6}$/i.test(v)) $('#dpAccentColor').value = v;
    });

    // Logo upload
    const logoFile = $('#dpLogoFile');
    $('#dpLogoUploadBtn')?.addEventListener('click', () => logoFile?.click());
    logoFile?.addEventListener('change', async () => {
      const file = logoFile.files?.[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('logo', file);
      try {
        const res = await fetch('/api/admin/driver-panel/upload-logo', { method: 'POST', credentials: 'include', body: fd });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.url) {
          $('#dpLogoUrl').value = data.url;
          state.config.general = { ...state.config.general, logoUrl: data.url };
          showToast('Logo uploaded');
        } else {
          showToast(data.error || 'Upload failed');
        }
      } catch (_) { showToast('Upload failed'); }
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
