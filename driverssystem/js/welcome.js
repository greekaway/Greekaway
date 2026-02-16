/**
 * DriversSystem — Welcome Page
 * Monthly dashboard — reads REAL entries + expenses via /api/driverssystem/dashboard
 * + daily target API for per-euro breakdown and cost/km
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

  const fmtCents = (v) => {
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

  // ── Fetch dashboard + daily-target in parallel ──
  const params = new URLSearchParams({ driverId: savedPhone });

  const [dashRes, targetRes] = await Promise.all([
    fetch(`/api/driverssystem/dashboard?${params}`).catch(() => null),
    fetch(`/api/driverssystem/daily-target?${params}`).catch(() => null)
  ]);

  const data = dashRes && dashRes.ok ? await dashRes.json() : null;
  const target = targetRes && targetRes.ok ? await targetRes.json() : null;

  const set = (attr, val) => { const el = $(`[${attr}]`); if (el) el.textContent = val; };

  // ── Quick stats ──
  if (data) {
    set('data-ds-perf-days', data.workingDays);
    set('data-ds-perf-net', fmtEur(data.totalNet));
    set('data-ds-perf-avg', fmtEur(data.avgNetPerDay));
    set('data-ds-perf-expenses', fmtEur(data.totalExpenses));

    if (data.expenses) {
      set('data-ds-perf-exp-car', fmtEur(data.expenses.car || 0));
      set('data-ds-perf-exp-personal', fmtEur((data.expenses.personal || 0) + (data.expenses.family || 0) + (data.expenses.fixed || 0)));
      set('data-ds-perf-exp-tax', fmtEur(data.expenses.tax || 0));
    }
  }

  // ── Per Euro breakdown ──
  if (target && data) {
    const totalNet = data.totalNet || 0;
    const byRole = target.byRole || {};
    const proExp = byRole.professional || 0;
    const persExp = byRole.personal || 0;
    const taxExp = byRole.tax || 0;
    const totalExp = proExp + persExp + taxExp;

    if (totalNet > 0 && totalExp > 0) {
      const pct = (v) => Math.round(v * 100) + '%';
      const proPerEuro = pct(proExp / totalNet);
      const persPerEuro = pct(persExp / totalNet);
      const taxPerEuro = pct(taxExp / totalNet);
      const leftPerEuro = pct(Math.max(0, 1 - totalExp / totalNet));

      set('data-ds-perf-per-euro-pro', proPerEuro);
      set('data-ds-perf-per-euro-pers', persPerEuro);
      set('data-ds-perf-per-euro-tax', taxPerEuro);
      set('data-ds-perf-per-euro-left', leftPerEuro);
    } else {
      set('data-ds-perf-per-euro-pro', '—');
      set('data-ds-perf-per-euro-pers', '—');
      set('data-ds-perf-per-euro-tax', '—');
      set('data-ds-perf-per-euro-left', '—');
    }
  }

  // ── Cost per km ──
  if (target && target.costPerKm) {
    const cpk = target.costPerKm;
    set('data-ds-perf-km-fuel', cpk.fuel != null ? fmtCents(cpk.fuel) : '—');
    set('data-ds-perf-km-maint', cpk.maintenance != null ? fmtCents(cpk.maintenance) : '—');
    set('data-ds-perf-km-total', cpk.total != null ? fmtCents(cpk.total) : '—');
  }

})();
