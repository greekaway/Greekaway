/**
 * Driver Panel Admin — Tab 2: Footer
 * Reads/writes: state.config.footer
 */
(() => {
  'use strict';
  const { $, $$, setStatus, showToast, state, saveConfig } = window.DpAdmin;

  const ICON_OPTIONS = [
    { value: 'home', label: '🏠 Home' },
    { value: 'calendar', label: '📅 Calendar' },
    { value: 'history', label: '📋 History' },
    { value: 'wallet', label: '💰 Wallet' },
    { value: 'user', label: '👤 User' },
    { value: 'car', label: '🚗 Car' },
    { value: 'map', label: '🗺️ Map' },
    { value: 'bell', label: '🔔 Bell' },
    { value: 'chat', label: '💬 Chat' },
    { value: 'settings', label: '⚙️ Settings' }
  ];

  const render = () => {
    const wrap = $('#dpFooterRows');
    if (!wrap) return;
    const tabs = state.config.footer?.tabs || [];
    wrap.innerHTML = tabs.map((tab, i) => `
      <div class="dp-footer-row" data-idx="${i}">
        <div class="dp-footer-row-head">
          <span class="dp-footer-order">${i + 1}</span>
          <strong>${tab.key}</strong>
        </div>
        <div class="dp-footer-row-fields">
          <label class="dp-field">
            <span class="dp-label">Label</span>
            <input type="text" class="input dp-footer-label" value="${tab.label || ''}" data-idx="${i}">
          </label>
          <label class="dp-field">
            <span class="dp-label">Icon</span>
            <select class="input dp-footer-icon" data-idx="${i}">
              ${ICON_OPTIONS.map(o => `<option value="${o.value}"${o.value === tab.icon ? ' selected' : ''}>${o.label}</option>`).join('')}
            </select>
          </label>
          <label class="dp-field dp-inline-field">
            <input type="checkbox" class="dp-footer-enabled" data-idx="${i}" ${tab.enabled !== false ? 'checked' : ''}>
            <span>Ενεργό</span>
          </label>
        </div>
      </div>
    `).join('');
  };

  const init = () => {
    $('#dpFooterSave')?.addEventListener('click', async () => {
      const status = $('#dpFooterStatus');
      setStatus(status, 'Αποθήκευση…', 'info');
      const tabs = state.config.footer?.tabs || [];
      $$('.dp-footer-row').forEach(row => {
        const idx = parseInt(row.dataset.idx, 10);
        if (tabs[idx]) {
          tabs[idx].label = row.querySelector('.dp-footer-label')?.value?.trim() || tabs[idx].label;
          tabs[idx].icon = row.querySelector('.dp-footer-icon')?.value || tabs[idx].icon;
          tabs[idx].enabled = row.querySelector('.dp-footer-enabled')?.checked !== false;
        }
      });
      state.config.footer = { tabs };
      const ok = await saveConfig();
      setStatus(status, ok ? '✅ Αποθηκεύτηκε' : '❌ Σφάλμα', ok ? 'ok' : 'err');
      if (ok) showToast('Footer αποθηκεύτηκε');
    });

    return { render };
  };

  window.DpAdmin.initFooterTab = init;
})();
