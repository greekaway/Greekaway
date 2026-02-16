/**
 * DriversSystem — Shift Counter
 * Lives on the entries page. Tracks net earnings during a driver's shift.
 * Features: auto-start on entry save, confirm dialog on close,
 * 3h inactivity detection, elapsed timer display.
 * Stored entirely in localStorage — does NOT affect stats or expenses.
 */
(() => {
  'use strict';

  const SHIFT_KEY = 'ds_shift';
  const STORAGE_KEY = 'ds_driver_phone';
  const POLL_INTERVAL = 30_000;
  const INACTIVITY_MS = 3 * 60 * 60 * 1000; // 3 hours

  const $ = (sel) => document.querySelector(sel);

  const fmtEur = (v) => {
    const num = (v || 0).toFixed(2);
    return num.replace('.', ',') + ' €';
  };

  const greeceNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Athens' }));
  const greeceDateStr = (d) => {
    const g = d || greeceNow();
    return g.getFullYear() + '-' + String(g.getMonth() + 1).padStart(2, '0') + '-' + String(g.getDate()).padStart(2, '0');
  };

  // ── DOM refs ──
  const card = $('[data-ds-shift]');
  const amountEl = $('[data-ds-shift-amount]');
  const labelEl = $('[data-ds-shift-label]');
  const timerEl = $('[data-ds-shift-timer]');
  const grossEl = $('[data-ds-summary-gross]');
  const countEl = $('[data-ds-summary-count]');
  if (!card || !amountEl) return;

  // ── State helpers ──
  const loadShift = () => {
    try { return JSON.parse(localStorage.getItem(SHIFT_KEY)); } catch (_) { return null; }
  };
  const saveShift = (s) => localStorage.setItem(SHIFT_KEY, JSON.stringify(s));
  const clearShift = () => localStorage.removeItem(SHIFT_KEY);

  // ── Elapsed timer ──
  const fmtElapsed = (ms) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    if (h > 0) return `${h}ω ${String(m).padStart(2, '0')}λ`;
    return `${m}λ`;
  };

  let timerInterval = null;

  const startTimer = () => {
    if (timerInterval) return;
    timerInterval = setInterval(() => {
      const shift = loadShift();
      if (!shift || !shift.active || !timerEl) return;
      const elapsed = Date.now() - new Date(shift.startISO).getTime();
      timerEl.textContent = fmtElapsed(elapsed);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  };

  // ── Fetch shift entries — returns { net, gross, count } ──
  const fetchShiftData = async (startISO) => {
    const driverId = localStorage.getItem(STORAGE_KEY);
    if (!driverId) return { net: 0, gross: 0, count: 0 };

    const startDate = new Date(startISO);
    const fromDate = greeceDateStr(startDate);
    const toDate = greeceDateStr(greeceNow());

    try {
      const params = new URLSearchParams({ driverId, from: fromDate, to: toDate });
      const res = await fetch(`/api/driverssystem/entries?${params}`);
      if (!res.ok) return { net: 0, gross: 0, count: 0 };
      const entries = await res.json();

      const startTs = new Date(startISO).getTime();
      const filtered = entries.filter((e) => e.createdAt && new Date(e.createdAt).getTime() >= startTs);
      return {
        net: filtered.reduce((sum, e) => sum + (e.netAmount || 0), 0),
        gross: filtered.reduce((sum, e) => sum + (e.amount || 0), 0),
        count: filtered.length
      };
    } catch (_) {
      return { net: 0, gross: 0, count: 0 };
    }
  };

  // ── Render ──
  const render = (shift) => {
    card.classList.remove('ds-shift--active', 'ds-shift--stopped');

    if (!shift) {
      amountEl.textContent = fmtEur(0);
      if (labelEl) labelEl.textContent = 'Βάρδια';
      if (timerEl) timerEl.textContent = '';
      if (grossEl) grossEl.textContent = fmtEur(0);
      if (countEl) countEl.textContent = '0';
      stopTimer();
      return;
    }

    amountEl.textContent = fmtEur(shift.total || 0);
    if (grossEl) grossEl.textContent = fmtEur(shift.gross || 0);
    if (countEl) countEl.textContent = shift.count || 0;

    if (shift.active) {
      card.classList.add('ds-shift--active');
      if (labelEl) labelEl.textContent = 'Βάρδια';
      startTimer();
      // Immediate timer update
      if (timerEl) {
        const elapsed = Date.now() - new Date(shift.startISO).getTime();
        timerEl.textContent = fmtElapsed(elapsed);
      }
    } else {
      card.classList.add('ds-shift--stopped');
      if (labelEl) labelEl.textContent = 'Βάρδια';
      stopTimer();
      if (timerEl) timerEl.textContent = '';
    }
  };

  // ── Refresh total ──
  const refresh = async () => {
    const shift = loadShift();
    if (!shift || !shift.active) return;

    const data = await fetchShiftData(shift.startISO);
    shift.total = data.net;
    shift.gross = data.gross;
    shift.count = data.count;
    shift.lastActivity = Date.now();
    saveShift(shift);
    render(shift);
  };

  // ── Confirm dialog ──
  const showConfirm = (title, body, confirmText = 'OK', confirmClass = 'ds-confirm-btn--primary') => {
    return new Promise((resolve) => {
      const existing = document.getElementById('dsShiftConfirm');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'dsShiftConfirm';
      overlay.className = 'ds-confirm-overlay';
      overlay.innerHTML = `
        <div class="ds-confirm-dialog" role="dialog" aria-modal="true">
          <h3 class="ds-confirm-dialog__title">${title}</h3>
          <p class="ds-confirm-dialog__body">${body}</p>
          <div class="ds-confirm-dialog__actions">
            <button class="ds-confirm-btn ds-confirm-btn--cancel" data-sc-cancel>Ακύρωση</button>
            <button class="ds-confirm-btn ${confirmClass}" data-sc-ok>${confirmText}</button>
          </div>
        </div>`;

      document.body.appendChild(overlay);

      const close = (result) => { overlay.remove(); document.removeEventListener('keydown', onKey); resolve(result); };
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(false); } };

      overlay.querySelector('[data-sc-ok]').addEventListener('click', () => close(true));
      overlay.querySelector('[data-sc-cancel]').addEventListener('click', () => close(false));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
      document.addEventListener('keydown', onKey);
    });
  };

  // ── Click handler: only allows STOPPING a running shift ──
  card.addEventListener('click', async () => {
    const shift = loadShift();

    if (!shift || !shift.active) {
      // Shift not running — do nothing (starts only via auto-start on new entry)
      return;
    }

    // Confirm before closing
    const confirmed = await showConfirm(
      'Κλείσιμο Βάρδιας',
      `Σύνολο βάρδιας: <strong>${fmtEur(shift.total || 0)}</strong><br>Θέλεις να κλείσεις τη βάρδια;`,
      'Κλείσιμο',
      'ds-confirm-btn--danger'
    );

    if (!confirmed) return;

    shift.active = false;
    await refresh();
    const finalShift = loadShift();
    if (finalShift) {
      finalShift.active = false;
      saveShift(finalShift);
      render(finalShift);
    }
  });

  // ── Auto-start: called from entries.js after saving an entry ──
  // If 3h+ without entry → asks "continue same shift or start new?"
  window._dsShiftAutoStart = async () => {
    const shift = loadShift();

    if (shift && shift.active) {
      // Check if 3+ hours since last activity
      const lastAct = shift.lastActivity || new Date(shift.startISO).getTime();
      const elapsed = Date.now() - lastAct;

      if (elapsed >= INACTIVITY_MS) {
        // 3h+ without entry — ask the driver
        const elapsedText = fmtElapsed(elapsed);
        const keepOld = await showConfirm(
          'Βάρδια ακόμα ανοιχτή',
          `Η βάρδια τρέχει ${elapsedText} χωρίς καταχώρηση.<br>Θέλεις να συνεχίσεις την ίδια ή να ξεκινήσεις νέα;`,
          'Συνέχισε την ίδια',
          'ds-confirm-btn--primary'
        );

        if (!keepOld) {
          // Close old shift, start new one
          shift.active = false;
          saveShift(shift);
          render(shift);

          const now = new Date().toISOString();
          const newShift = { active: true, startISO: now, total: 0, gross: 0, count: 0, lastActivity: Date.now() };
          saveShift(newShift);
          render(newShift);
          refresh();
          return;
        }
      }

      // Continue same shift — update activity timestamp
      shift.lastActivity = Date.now();
      saveShift(shift);
      refresh();
      return;
    }

    // No active shift — start new shift automatically
    const now = new Date().toISOString();
    const newShift = { active: true, startISO: now, total: 0, gross: 0, count: 0, lastActivity: Date.now() };
    saveShift(newShift);
    render(newShift);
    refresh();
  };

  // ── Initial render ──
  const shift = loadShift();
  render(shift);

  if (shift && shift.active) {
    refresh();
    setInterval(refresh, POLL_INTERVAL);
  }
})();
