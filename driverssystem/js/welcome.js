/**
 * DriversSystem — Welcome Page
 * Monthly dashboard with stats + business plan prediction
 */
(async () => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const STORAGE_KEY = 'ds_driver_phone';

  const cfg = await window.DriversSystemConfig.load();
  await window.DriversSystemConfig.applyHero(document, cfg);
  window.DriversSystemConfig.applyPageTitles(document, cfg);
  window.DriversSystemConfig.applyContactInfo(document, cfg);
  window.DriversSystemConfig.applyFinancials(document, cfg);

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

  // ── Get current month range ──
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const fromDate = firstOfMonth.toISOString().slice(0, 10);
  const toDate = now.toISOString().slice(0, 10);

  // ── Load monthly stats (revenue) ──
  let monthStats = null;
  try {
    const params = new URLSearchParams({
      driverId: savedPhone,
      from: fromDate,
      to: toDate,
      period: 'month'
    });
    const res = await fetch(`/api/driverssystem/stats?${params}`);
    if (res.ok) monthStats = await res.json();
  } catch (_) {}

  // ── Load monthly expenses ──
  let expenseSummary = null;
  try {
    const params = new URLSearchParams({
      driverId: savedPhone,
      from: fromDate,
      to: toDate
    });
    const res = await fetch(`/api/driverssystem/expenses/summary?${params}`);
    if (res.ok) expenseSummary = await res.json();
  } catch (_) {}

  const netRevenue = monthStats ? monthStats.totalNet : 0;
  const carExpenses = expenseSummary ? (expenseSummary.byCategory.car || {}).total || 0 : 0;
  const fixedExpenses = expenseSummary ? (expenseSummary.byCategory.fixed || {}).total || 0 : 0;
  const personalExpenses = expenseSummary ? (expenseSummary.byCategory.personal || {}).total || 0 : 0;
  const familyExpenses = expenseSummary ? (expenseSummary.byCategory.family || {}).total || 0 : 0;
  const totalExpenses = carExpenses + fixedExpenses + personalExpenses + familyExpenses;
  const balance = netRevenue - totalExpenses;

  // ── Populate monthly overview ──
  const setVal = (attr, value) => {
    const el = $(`[${attr}]`);
    if (el) el.textContent = fmtEur(value);
  };

  setVal('data-ds-month-net', netRevenue);
  setVal('data-ds-month-car', carExpenses);
  setVal('data-ds-month-fixed', fixedExpenses);
  setVal('data-ds-month-personal', personalExpenses);
  setVal('data-ds-month-family', familyExpenses);

  const balanceEl = $('[data-ds-month-balance]');
  if (balanceEl) {
    balanceEl.textContent = fmtEur(balance);
    balanceEl.classList.remove('positive', 'negative');
    balanceEl.classList.add(balance >= 0 ? 'positive' : 'negative');
  }

  // ══════════════════════════════════════════
  // BUSINESS PLAN ALGORITHM
  // ══════════════════════════════════════════
  // The idea: expenses fall on the 1st of the month but revenue is earned daily.
  // We calculate daily average net revenue based on days worked so far,
  // then project forward to end of month to predict final balance.
  // We also calculate when (which day) the driver will break even.

  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remainingDays = daysInMonth - dayOfMonth;

  // Count actual working days (days with at least 1 entry)
  const workingDays = monthStats && monthStats.timeline ? monthStats.timeline.length : dayOfMonth;
  const effectiveDays = Math.max(workingDays, 1);

  // Daily average net revenue
  const dailyAvgNet = netRevenue / effectiveDays;

  // Projected net for full month
  const projectedNet = dailyAvgNet * daysInMonth;

  // Projected balance (projected net - total expenses)
  // Note: expenses are assumed to be already known/entered for the month
  const projectedBalance = projectedNet - totalExpenses;

  // Break-even point: how many days of work needed to cover expenses
  // daysNeeded = totalExpenses / dailyAvgNet
  let breakevenText = '—';
  if (dailyAvgNet > 0 && totalExpenses > 0) {
    const daysToBreakeven = Math.ceil(totalExpenses / dailyAvgNet);
    if (netRevenue >= totalExpenses) {
      breakevenText = '✅ Καλύφθηκαν!';
    } else {
      const remaining = daysToBreakeven - dayOfMonth;
      if (remaining <= 0) {
        breakevenText = '✅ Σήμερα';
      } else if (daysToBreakeven <= daysInMonth) {
        breakevenText = `${remaining} ημέρες ακόμα`;
      } else {
        breakevenText = `⚠️ ${daysToBreakeven} ημέρες (πέρα του μήνα)`;
      }
    }
  } else if (totalExpenses === 0) {
    breakevenText = '✅ Κανένα έξοδο';
  } else {
    breakevenText = '⚠️ Δεν υπάρχουν έσοδα';
  }

  // Populate business plan
  const bpDailyEl = $('[data-ds-bplan-daily-avg]');
  const bpProjNetEl = $('[data-ds-bplan-projected-net]');
  const bpProjBalEl = $('[data-ds-bplan-projected-balance]');
  const bpBreakevenEl = $('[data-ds-bplan-breakeven]');

  if (bpDailyEl) bpDailyEl.textContent = fmtEur(dailyAvgNet);
  if (bpProjNetEl) bpProjNetEl.textContent = fmtEur(projectedNet);
  if (bpProjBalEl) {
    bpProjBalEl.textContent = fmtEur(projectedBalance);
    bpProjBalEl.classList.remove('positive', 'negative');
    bpProjBalEl.classList.add(projectedBalance >= 0 ? 'positive' : 'negative');
  }
  if (bpBreakevenEl) bpBreakevenEl.textContent = breakevenText;

  // Progress bar: how much of expenses covered
  const progressFill = $('[data-ds-bplan-progress-fill]');
  const progressText = $('[data-ds-bplan-progress-text]');
  if (progressFill && totalExpenses > 0) {
    const pct = Math.min(Math.round((netRevenue / totalExpenses) * 100), 100);
    progressFill.style.width = `${pct}%`;
    progressFill.style.background = pct >= 100
      ? 'linear-gradient(90deg, #00c896, #059669)'
      : pct >= 50
        ? 'linear-gradient(90deg, #f59e0b, #eab308)'
        : 'linear-gradient(90deg, #ef4444, #dc2626)';
    if (progressText) progressText.textContent = `${pct}% κάλυψη εξόδων`;
  } else if (progressFill) {
    progressFill.style.width = totalExpenses === 0 ? '100%' : '0%';
    progressFill.style.background = 'linear-gradient(90deg, #00c896, #059669)';
    if (progressText) progressText.textContent = totalExpenses === 0 ? 'Κανένα έξοδο' : 'Δεν υπάρχουν έσοδα';
  }

})();
