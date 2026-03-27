/**
 * Driver Panel Admin — Tab 9: Ήχοι
 * Upload MP3 sounds, assign per event, set defaults.
 * Reads/writes: config.sounds { files, defaults }
 */
(() => {
  'use strict';
  const { $, setStatus, showToast, state, saveConfig } = window.DpAdmin;

  const EVENTS = [
    { key: 'new_ride', label: '🚖 Νέα Διαδρομή', desc: 'Ήχος όταν έρχεται νέο αίτημα' },
    { key: 'app_open', label: '📱 Άνοιγμα App', desc: 'Ήχος κατά το άνοιγμα της εφαρμογής' }
  ];

  let currentAudio = null;

  const stopAudio = () => {
    if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; currentAudio = null; }
    // Stop programmatic sounds too
    if (window.DpSounds) window.DpSounds.stop();
  };

  const playMp3 = (url) => {
    stopAudio();
    currentAudio = new Audio(url);
    currentAudio.play().catch(() => {});
  };

  const esc = (s) => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

  // ── Build the full tab HTML ──
  const buildUI = () => {
    const wrap = $('#dpSoundsContent');
    if (!wrap) return;

    const files = state.config.sounds?.files || [];
    const defaults = state.config.sounds?.defaults || {};

    wrap.innerHTML = `
      <div class="dp-sounds-upload">
        <h3 class="dp-sounds-section-title">📁 Ανέβασμα Ήχου (MP3)</h3>
        <div class="dp-sounds-upload-row">
          <input type="text" id="dpSoundLabel" class="input dp-sound-label-input" placeholder="Όνομα ήχου">
          <select id="dpSoundEvent" class="input dp-sound-event-select">
            ${EVENTS.map(e => `<option value="${e.key}">${e.label}</option>`).join('')}
          </select>
          <input type="file" id="dpSoundFile" accept="audio/mpeg,.mp3" hidden>
          <button type="button" id="dpSoundUploadBtn" class="button dp-upload-btn">📁 Επιλογή MP3</button>
        </div>
        <div id="dpSoundUploadStatus" class="dp-status"></div>
      </div>

      ${EVENTS.map(ev => {
        const evFiles = files.filter(f => f.event === ev.key);
        const programmatic = window.DpSounds?.SOUNDS || {};
        const programmaticGroups = window.DpSounds?.GROUPS || [];
        const defaultId = defaults[ev.key] || '';

        return `
        <div class="dp-sounds-event-section">
          <h3 class="dp-sounds-section-title">${ev.label}</h3>
          <p class="dp-sounds-desc">${ev.desc}</p>

          ${evFiles.length > 0 ? `
            <div class="dp-sounds-list">
              ${evFiles.map(f => `
                <div class="dp-sounds-item ${defaultId === f.id ? 'dp-sounds-item--active' : ''}" data-id="${f.id}" data-event="${ev.key}">
                  <button type="button" class="dp-sounds-play" data-url="${esc(f.url)}" title="Ακρόαση">▶️</button>
                  <span class="dp-sounds-name">${esc(f.label)}</span>
                  <span class="dp-sounds-badge">MP3</span>
                  <button type="button" class="dp-sounds-default-btn ${defaultId === f.id ? 'dp-sounds-default-btn--active' : ''}"
                    data-id="${f.id}" data-event="${ev.key}" title="Ορισμός ως προεπιλογή">
                    ${defaultId === f.id ? '⭐' : '☆'}
                  </button>
                  <button type="button" class="dp-sounds-delete" data-id="${f.id}" title="Διαγραφή">🗑️</button>
                </div>
              `).join('')}
            </div>
          ` : '<p class="dp-sounds-empty">Δεν υπάρχουν MP3 — ανεβάστε ήχους παραπάνω</p>'}

          <details class="dp-sounds-programmatic">
            <summary>Ενσωματωμένοι Ήχοι</summary>
            <div class="dp-sounds-list">
              ${programmaticGroups.map(g => g.ids.map(id => {
                const s = programmatic[id];
                if (!s) return '';
                const isDefault = defaultId === id;
                return `
                <div class="dp-sounds-item ${isDefault ? 'dp-sounds-item--active' : ''}" data-id="${id}" data-event="${ev.key}">
                  <button type="button" class="dp-sounds-play-synth" data-sound="${id}" title="Ακρόαση">▶️</button>
                  <span class="dp-sounds-name">${s.name}</span>
                  <span class="dp-sounds-badge dp-sounds-badge--synth">SYNTH</span>
                  <button type="button" class="dp-sounds-default-btn ${isDefault ? 'dp-sounds-default-btn--active' : ''}"
                    data-id="${id}" data-event="${ev.key}" title="Ορισμός ως προεπιλογή">
                    ${isDefault ? '⭐' : '☆'}
                  </button>
                </div>`;
              }).join('')).join('')}
            </div>
          </details>
        </div>`;
      }).join('')}

      <button type="button" id="dpSoundsStopAll" class="button dp-cancel-btn" style="margin-top:12px">⏹️ Σταμάτημα Ήχου</button>
    `;

    attachEvents();
  };

  // ── Event handlers ──
  const attachEvents = () => {
    // Upload
    const fileInput = $('#dpSoundFile');
    const uploadBtn = $('#dpSoundUploadBtn');
    uploadBtn?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const label = $('#dpSoundLabel')?.value?.trim() || '';
      const event = $('#dpSoundEvent')?.value || 'new_ride';
      const status = $('#dpSoundUploadStatus');

      const fd = new FormData();
      fd.append('sound', file);
      fd.append('label', label);
      fd.append('event', event);

      setStatus(status, 'Ανέβασμα…', 'info');
      try {
        const res = await fetch('/api/admin/driver-panel/upload-sound', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) { setStatus(status, data.error || 'Σφάλμα', 'err'); return; }

        // Update local config
        if (!state.config.sounds) state.config.sounds = { files: [], defaults: {} };
        if (!state.config.sounds.files) state.config.sounds.files = [];
        state.config.sounds.files.push({ id: data.id, label: data.label, url: data.url, event: data.event, filename: data.id + '.mp3' });

        setStatus(status, '✅ Ανέβηκε: ' + data.label, 'ok');
        if ($('#dpSoundLabel')) $('#dpSoundLabel').value = '';
        fileInput.value = '';
        buildUI();
      } catch (e) {
        setStatus(status, '❌ Σφάλμα δικτύου', 'err');
      }
    });

    // Play MP3
    document.querySelectorAll('.dp-sounds-play').forEach(btn => {
      btn.addEventListener('click', () => playMp3(btn.dataset.url));
    });
    // Play synth
    document.querySelectorAll('.dp-sounds-play-synth').forEach(btn => {
      btn.addEventListener('click', () => {
        stopAudio();
        if (window.DpSounds) window.DpSounds.play(btn.dataset.sound);
      });
    });

    // Set default
    document.querySelectorAll('.dp-sounds-default-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const soundId = btn.dataset.id;
        const event = btn.dataset.event;
        try {
          const res = await fetch('/api/admin/driver-panel/sounds/default', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event, soundId })
          });
          if (res.ok) {
            if (!state.config.sounds) state.config.sounds = { files: [], defaults: {} };
            if (!state.config.sounds.defaults) state.config.sounds.defaults = {};
            state.config.sounds.defaults[event] = soundId;
            showToast('Προεπιλογή: ' + event);
            buildUI();
          }
        } catch (_) { showToast('Σφάλμα'); }
      });
    });

    // Delete
    document.querySelectorAll('.dp-sounds-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Διαγραφή αυτού του ήχου;')) return;
        const id = btn.dataset.id;
        try {
          const res = await fetch(`/api/admin/driver-panel/sounds/${encodeURIComponent(id)}`, { method: 'DELETE' });
          if (res.ok) {
            if (state.config.sounds?.files) {
              state.config.sounds.files = state.config.sounds.files.filter(f => f.id !== id);
            }
            showToast('Διαγράφτηκε');
            buildUI();
          }
        } catch (_) { showToast('Σφάλμα'); }
      });
    });

    // Stop all
    $('#dpSoundsStopAll')?.addEventListener('click', stopAudio);
  };

  const populate = () => buildUI();

  const init = () => {
    return { populate };
  };

  window.DpAdmin.initSoundsTab = init;
})();
