/**
 * Driver Panel Admin — Tab 7: Κείμενα
 * Editable button labels, section titles, messages.
 * Reads/writes: state.config.labels
 */
(() => {
  'use strict';
  const { $, $$, setStatus, showToast, state, saveConfig } = window.DpAdmin;

  const DEFAULTS = {
    buttons: {
      accept: 'Αποδοχή',
      reject: 'Απόρριψη',
      complete: 'Ολοκλήρωση',
      details: 'Λεπτομέρειες'
    },
    sections: {
      activeTrips: 'Ενεργές Διαδρομές',
      history: 'Ιστορικό',
      finance: 'Οικονομικά'
    },
    messages: {
      noTrips: 'Δεν υπάρχουν ενεργές διαδρομές',
      tripAccepted: 'Η διαδρομή ανατέθηκε επιτυχώς',
      tripRejected: 'Η διαδρομή απορρίφθηκε'
    }
  };

  const renderGroup = (groupKey, groupTitle, icon, entries) => {
    return `
      <div class="dp-labels-group">
        <h3 class="dp-subtitle">${icon} ${groupTitle}</h3>
        ${Object.entries(entries).map(([key, val]) => `
          <div class="dp-inline-field">
            <label>${key}</label>
            <input type="text" class="dp-label-input" data-group="${groupKey}" data-key="${key}" value="${val}">
          </div>
        `).join('')}
      </div>
    `;
  };

  const populate = () => {
    const cfg = state.config.labels || {};
    const merged = {
      buttons: { ...DEFAULTS.buttons, ...cfg.buttons },
      sections: { ...DEFAULTS.sections, ...cfg.sections },
      messages: { ...DEFAULTS.messages, ...cfg.messages }
    };
    const wrap = $('#dpLabelsContent');
    if (!wrap) return;
    wrap.innerHTML = [
      renderGroup('buttons', 'Κουμπιά', '🔘', merged.buttons),
      renderGroup('sections', 'Ενότητες', '📑', merged.sections),
      renderGroup('messages', 'Μηνύματα', '💬', merged.messages)
    ].join('');
  };

  const collect = () => {
    const result = { buttons: {}, sections: {}, messages: {} };
    $$('.dp-label-input').forEach(inp => {
      const group = inp.dataset.group;
      const key = inp.dataset.key;
      if (result[group]) result[group][key] = inp.value.trim();
    });
    return result;
  };

  const init = () => {
    $('#dpLabelsSave')?.addEventListener('click', async () => {
      const status = $('#dpLabelsStatus');
      setStatus(status, 'Αποθήκευση…', 'info');
      state.config.labels = collect();
      const ok = await saveConfig();
      setStatus(status, ok ? '✅ Αποθηκεύτηκε' : '❌ Σφάλμα', ok ? 'ok' : 'err');
      if (ok) showToast('Κείμενα αποθηκεύτηκαν');
    });
    return { populate };
  };

  window.DpAdmin.initLabelsTab = init;
})();
