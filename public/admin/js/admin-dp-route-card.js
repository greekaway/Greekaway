/**
 * Driver Panel Admin — Tab 4: Κάρτα Διαδρομής
 * 3-level card field ordering with drag & drop + visibility toggles.
 * Card types: urgent, scheduled, detail
 * Reads/writes: state.config.routeCard
 */
(() => {
  'use strict';
  const { $, $$, setStatus, showToast, state, saveConfig } = window.DpAdmin;

  // All available fields (pool)
  const ALL_FIELDS = [
    { id: 'price',        label: 'Ποσό €' },
    { id: 'origin',       label: 'Αφετηρία' },
    { id: 'destination',  label: 'Προορισμός' },
    { id: 'datetime',     label: 'Ημ/νία & Ώρα' },
    { id: 'hotel_name',   label: 'Ξενοδοχείο' },
    { id: 'room_number',  label: 'Δωμάτιο' },
    { id: 'passengers',   label: 'Επιβάτες' },
    { id: 'luggage',      label: 'Αποσκευές' },
    { id: 'vehicle_type', label: 'Τύπος οχήματος' },
    { id: 'flight_info',  label: 'Πτήση' },
    { id: 'notes',        label: 'Σημειώσεις' },
    { id: 'commission',   label: 'Προμήθεια οδηγού' }
  ];

  const CARD_TYPES = [
    { key: 'urgent',    title: 'Άμεση Κλήση',        icon: '⚡' },
    { key: 'scheduled', title: 'Προγραμματισμένη',    icon: '📅' },
    { key: 'detail',    title: 'Λεπτομέρειες',        icon: '📋' }
  ];

  let dragSrcEl = null;
  let dragCardType = null;

  const getFields = (type) => {
    const saved = state.config.routeCard?.[type];
    if (Array.isArray(saved) && saved.length) return [...saved];
    // Defaults
    if (type === 'urgent') return ALL_FIELDS.slice(0, 4).map((f, i) => ({ ...f, visible: true, order: i + 1 }));
    if (type === 'scheduled') return ALL_FIELDS.slice(0, 6).map((f, i) => ({ ...f, visible: true, order: i + 1 }));
    return ALL_FIELDS.map((f, i) => ({ ...f, visible: true, order: i + 1 }));
  };

  const renderCardSection = (type, title, icon) => {
    const fields = getFields(type);
    return `
      <div class="dp-card-section" data-card-type="${type}">
        <h3 class="dp-subtitle">${icon} ${title}</h3>
        <div class="dp-card-fields" data-card-type="${type}">
          ${fields.sort((a, b) => a.order - b.order).map(f => `
            <div class="dp-card-field-row" draggable="true" data-field-id="${f.id}" data-card-type="${type}">
              <span class="dp-drag-handle">⠿</span>
              <span class="dp-card-field-label">${f.label || ALL_FIELDS.find(af => af.id === f.id)?.label || f.id}</span>
              <label class="dp-inline-field dp-card-vis-toggle">
                <input type="checkbox" ${f.visible ? 'checked' : ''} data-field-id="${f.id}" data-card-type="${type}">
                <span>Ορατό</span>
              </label>
            </div>
          `).join('')}
        </div>
        <button type="button" class="button dp-btn-sm dp-add-field-btn" data-card-type="${type}">+ Πεδίο</button>
      </div>
    `;
  };

  const populate = () => {
    const wrap = $('#dpRouteCardSections');
    if (!wrap) return;
    wrap.innerHTML = CARD_TYPES.map(ct => renderCardSection(ct.key, ct.title, ct.icon)).join('');
    attachDragListeners();
    attachAddFieldListeners();
  };

  // Drag & drop
  const attachDragListeners = () => {
    $$('.dp-card-field-row').forEach(row => {
      row.addEventListener('dragstart', (e) => {
        dragSrcEl = row;
        dragCardType = row.dataset.cardType;
        row.classList.add('dp-dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dp-dragging');
        $$('.dp-card-field-row').forEach(r => r.classList.remove('dp-drag-over'));
        dragSrcEl = null;
      });
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (row.dataset.cardType !== dragCardType) return;
        e.dataTransfer.dropEffect = 'move';
        row.classList.add('dp-drag-over');
      });
      row.addEventListener('dragleave', () => {
        row.classList.remove('dp-drag-over');
      });
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('dp-drag-over');
        if (!dragSrcEl || dragSrcEl === row) return;
        if (row.dataset.cardType !== dragCardType) return;
        const container = row.parentElement;
        const allRows = [...container.querySelectorAll('.dp-card-field-row')];
        const fromIdx = allRows.indexOf(dragSrcEl);
        const toIdx = allRows.indexOf(row);
        if (fromIdx < toIdx) { container.insertBefore(dragSrcEl, row.nextSibling); }
        else { container.insertBefore(dragSrcEl, row); }
      });
    });
  };

  // Add field from pool
  const attachAddFieldListeners = () => {
    $$('.dp-add-field-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.cardType;
        const container = $(`.dp-card-fields[data-card-type="${type}"]`);
        if (!container) return;
        const existing = [...container.querySelectorAll('.dp-card-field-row')].map(r => r.dataset.fieldId);
        const available = ALL_FIELDS.filter(f => !existing.includes(f.id));
        if (!available.length) { showToast('Όλα τα πεδία χρησιμοποιούνται'); return; }
        // Add first available
        const f = available[0];
        const newRow = document.createElement('div');
        newRow.className = 'dp-card-field-row';
        newRow.draggable = true;
        newRow.dataset.fieldId = f.id;
        newRow.dataset.cardType = type;
        newRow.innerHTML = `
          <span class="dp-drag-handle">⠿</span>
          <span class="dp-card-field-label">${f.label}</span>
          <label class="dp-inline-field dp-card-vis-toggle">
            <input type="checkbox" checked data-field-id="${f.id}" data-card-type="${type}">
            <span>Ορατό</span>
          </label>
        `;
        container.appendChild(newRow);
        attachDragListeners();
        showToast(`Προστέθηκε: ${f.label}`);
      });
    });
  };

  const collectFields = (type) => {
    const container = $(`.dp-card-fields[data-card-type="${type}"]`);
    if (!container) return [];
    return [...container.querySelectorAll('.dp-card-field-row')].map((row, i) => {
      const id = row.dataset.fieldId;
      const cb = row.querySelector(`input[type="checkbox"]`);
      const fieldMeta = ALL_FIELDS.find(f => f.id === id);
      return {
        id,
        label: fieldMeta?.label || id,
        visible: cb?.checked ?? true,
        order: i + 1
      };
    });
  };

  const init = () => {
    $('#dpRouteCardSave')?.addEventListener('click', async () => {
      const status = $('#dpRouteCardStatus');
      setStatus(status, 'Αποθήκευση…', 'info');
      state.config.routeCard = {
        urgent: collectFields('urgent'),
        scheduled: collectFields('scheduled'),
        detail: collectFields('detail')
      };
      const ok = await saveConfig();
      setStatus(status, ok ? '✅ Αποθηκεύτηκε' : '❌ Σφάλμα', ok ? 'ok' : 'err');
      if (ok) showToast('Κάρτα διαδρομής αποθηκεύτηκε');
    });

    return { populate };
  };

  window.DpAdmin.initRouteCardTab = init;
})();
