/**
 * DriversSystem — Welcome Page
 * Monthly dashboard — reads REAL entries + expenses via /api/driverssystem/dashboard
 */
(async () => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const STORAGE_KEY = 'ds_driver_phone';

  const cfg = await window.DriversSystemConfig.load();
  await window.DriversSystemConfig.applyHero(document, cfg);
  window.DriversSystemConfig.applyPageTitles(document, cfg);
  window.DriversSystemConfig.applyContactInfo(document, cfg);

  const fmtEur = (v) => {
    const num = (v || 0).toFixed(2);
    return num.replace('.', ',') + ' €';
  };

  // ── Check login ──
  const savedPhone = localStorage.getItem(STORAGE_KEY);
  const dashboard = $('[data-ds-welcome-dashboard]');
  const loginPrompt = $('[data-ds-welcome-login-prompt]');

  if (!savedPhone) {
    if (loginPrompt) loginPrompt.style.display = 'block';
    const loginLink = $('[data-ds-welcome-login-link]');
    if (loginLink) loginLink.href = window.DriversSystemConfig.buildRoute('/profile');
    return;
  }

  if (dashboard) dashboard.style.display = 'block';

  // ── Fetch dashboard data from server (real entries + expenses) ──
  let data = null;
  try {
    const params = new URLSearchParams({ driverId: savedPhone });
    const res = await fetch(`/api/driverssystem/dashboard?${params}`);
    if (res.ok) data = await res.json();
  } catch (_) {}

  if (!data) return;

  // ── Populate quick stats ──
  const set = (attr, val) => { const el = $(`[${attr}]`); if (el) el.textContent = val; };

  set('data-ds-perf-days', data.workingDays);
  set('data-ds-perf-trips', data.totalTrips);
  set('data-ds-perf-net', fmtEur(data.totalNet));
  set('data-ds-perf-avg', fmtEur(data.avgNetPerDay));

  // ── Projections ──
  set('data-ds-perf-proj-net', fmtEur(data.projectedNet));
  set('data-ds-perf-expenses', fmtEur(data.totalExpenses));

  const projAfterEl = $('[data-ds-perf-proj-after]');
  if (projAfterEl) {
    projAfterEl.textContent = fmtEur(data.projectedNetAfterExpenses);
    projAfterEl.classList.remove('positive', 'negative');
    projAfterEl.classList.add(data.projectedNetAfterExpenses >= 0 ? 'positive' : 'negative');
  }

  // ── Expense breakdown ──
  if (data.expenses) {
    set('data-ds-perf-exp-car', fmtEur(data.expenses.car || 0));
    set('data-ds-perf-exp-personal', fmtEur((data.expenses.personal || 0) + (data.expenses.family || 0) + (data.expenses.fixed || 0)));
    set('data-ds-perf-exp-tax', fmtEur(data.expenses.tax || 0));
  }

})();
