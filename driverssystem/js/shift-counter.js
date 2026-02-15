/**
 * DriversSystem — Shift Counter
 * A "psychological" live counter that shows net earnings during a driver's shift.
 * Stored entirely in localStorage — does NOT affect stats, expenses, or any other data.
 */
(() => {
  'use strict';

  const SHIFT_KEY = 'ds_shift';
  const STORAGE_KEY = 'ds_driver_phone';
  const POLL_INTERVAL = 30_000; // refresh every 30 seconds while active

  const $ = (sel) => document.querySelector(sel);

  const fmtEur = (v) => {
    const num = (v || 0).toFixed(2);
    return num.replace('.', ',') + ' €';
  };

  // Greece time helpers
  const greeceNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Athens' }));
  const greeceDateStr = (d) => {
    const g = d || greeceNow();
    return g.getFullYear() + '-' + String(g.getMonth() + 1).padStart(2, '0') + '-' + String(g.getDate()).padStart(2, '0');
  };

  // ── DOM refs ──
  const card = $('[data-ds-shift]');
  const amountEl = $('[data-ds-shift-amount]');
  const labelEl = $('[data-ds-shift-label]');
  if (!card || !amountEl) return;

  // ── State helpers ──
  const loadShift = () => {
    try { return JSON.parse(localStorage.getItem(SHIFT_KEY)); } catch (_) { return null; }
  };
  const saveShift = (s) => localStorage.setItem(SHIFT_KEY, JSON.stringify(s));
  const clearShift = () => localStorage.removeItem(SHIFT_KEY);

  // ── Fetch entries for a date range & sum net after startISO ──
  const fetchShiftNet = async (startISO) => {
    const driverId = localStorage.getItem(STORAGE_KEY);
    if (!driverId) return 0;

    const startDate = new Date(startISO);
    const fromDate = greeceDateStr(startDate);
    const toDate = greeceDateStr(greeceNow());

    try {
      const params = new URLSearchParams({
        driverId,
        from: fromDate,
        to: toDate
      });
      const res = await fetch(`/api/driverssystem/entries?${params}`);
      if (!res.ok) return 0;
      const entries = await res.json();

      // Only count entries created AFTER the shift started
      const startTs = new Date(startISO).getTime();
      const filtered = entries.filter((e) => {
        if (!e.createdAt) return false;
        return new Date(e.createdAt).getTime() >= startTs;
      });

      return filtered.reduce((sum, e) => sum + (e.netAmount || 0), 0);
    } catch (_) {
      return 0;
    }
  };

  // ── Render UI state ──
  const render = (shift) => {
    card.classList.remove('ds-shift--active', 'ds-shift--stopped');

    if (!shift) {
      amountEl.textContent = fmtEur(0);
      if (labelEl) labelEl.textContent = 'Βάρδια';
      return;
    }

    amountEl.textContent = fmtEur(shift.total || 0);

    if (shift.active) {
      card.classList.add('ds-shift--active');
      if (labelEl) labelEl.textContent = 'Βάρδια ▶';
    } else {
      card.classList.add('ds-shift--stopped');
      if (labelEl) labelEl.textContent = 'Βάρδια ■';
    }
  };

  // ── Refresh total from API ──
  const refresh = async () => {
    const shift = loadShift();
    if (!shift || !shift.active) return;

    const total = await fetchShiftNet(shift.startISO);
    shift.total = total;
    saveShift(shift);
    render(shift);
  };

  // ── Click handler: toggle shift ──
  card.addEventListener('click', async () => {
    const shift = loadShift();

    if (!shift || !shift.active) {
      // Start new shift
      const now = new Date().toISOString();
      const newShift = { active: true, startISO: now, total: 0 };
      saveShift(newShift);
      render(newShift);
      refresh(); // initial fetch
    } else {
      // Stop shift — freeze total, mark inactive
      shift.active = false;
      await refresh(); // one last update
      const finalShift = loadShift();
      if (finalShift) {
        finalShift.active = false;
        saveShift(finalShift);
        render(finalShift);
      }
    }
  });

  // ── Initial render ──
  const shift = loadShift();
  render(shift);

  // If shift is active, refresh immediately + start polling
  if (shift && shift.active) {
    refresh();
    setInterval(refresh, POLL_INTERVAL);
  }
})();
