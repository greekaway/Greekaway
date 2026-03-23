/**
 * MoveAthens Driver Panel — Financials Tab
 * Balance, payments, weekly/monthly summary.
 * Visibility controlled by admin config (sub-tab 8).
 * Depends: driver-panel.js (DpApp)
 */
(() => {
  'use strict';

  const LS_KEY = 'moveathens_driver';
  const API = '/api/driver-panel';

  let labels = {};

  const getPhone = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY))?.phone || ''; }
    catch { return ''; }
  };

  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function money(n) { return (parseFloat(n) || 0).toFixed(2) + '€'; }

  // ── Load financials ──

  async function loadFinancials() {
    const phone = getPhone();
    if (!phone) return;

    const container = document.getElementById('dpFinanceContent');
    if (!container) return;
    container.innerHTML = `<div class="ma-dp-empty">${esc(labels.msgLoading || 'Φόρτωση…')}</div>`;

    try {
      const res = await fetch(`${API}/financials?phone=${encodeURIComponent(phone)}`);
      if (!res.ok) throw new Error('fail');
      const d = await res.json();

      let html = '';

      // Balance card
      if (d.showBalance) {
        const balanceClass = d.balance > 0 ? 'positive' : d.balance < 0 ? 'negative' : '';
        html += `
          <div class="ma-dp-fin-balance ${balanceClass}">
            <span class="ma-dp-fin-balance-label">Υπόλοιπο</span>
            <span class="ma-dp-fin-balance-amount">${money(d.balance)}</span>
          </div>`;
      }

      // Summary cards
      html += `
        <div class="ma-dp-fin-summary">
          <div class="ma-dp-fin-stat">
            <span class="ma-dp-fin-stat-val">${d.week.trips}</span>
            <span class="ma-dp-fin-stat-lbl">Εβδομάδα</span>
            <span class="ma-dp-fin-stat-sub">${money(d.week.revenue)}</span>
          </div>
          <div class="ma-dp-fin-stat">
            <span class="ma-dp-fin-stat-val">${d.month.trips}</span>
            <span class="ma-dp-fin-stat-lbl">Μήνας</span>
            <span class="ma-dp-fin-stat-sub">${money(d.month.revenue)}</span>
          </div>
          <div class="ma-dp-fin-stat">
            <span class="ma-dp-fin-stat-val">${d.total_trips}</span>
            <span class="ma-dp-fin-stat-lbl">Σύνολο</span>
            <span class="ma-dp-fin-stat-sub">${money(d.total_revenue)}</span>
          </div>
        </div>`;

      // Totals detail
      if (d.showCommission) {
        html += `
          <div class="ma-dp-fin-detail">
            <div class="ma-dp-fin-row"><span>Σύνολο εσόδων</span><span>${money(d.total_revenue)}</span></div>
            <div class="ma-dp-fin-row"><span>Εκκρεμότητες</span><span>${money(d.total_owed)}</span></div>
            <div class="ma-dp-fin-row"><span>Πληρωμένα</span><span>${money(d.total_paid)}</span></div>
          </div>`;
      }

      // Payment history
      if (d.showHistory && d.payments.length > 0) {
        html += `<h3 class="ma-dp-fin-section-title">Πληρωμές</h3>
          <div class="ma-dp-fin-payments">`;
        html += d.payments.map(p => `
          <div class="ma-dp-fin-pay-row">
            <span class="ma-dp-fin-pay-date">${formatDate(p.date)}</span>
            <span class="ma-dp-fin-pay-note">${esc(p.note || '—')}</span>
            <span class="ma-dp-fin-pay-amount">${money(p.amount)}</span>
          </div>`).join('');
        html += '</div>';
      } else if (d.showHistory && d.payments.length === 0) {
        html += '<div class="ma-dp-empty">Δεν υπάρχουν πληρωμές</div>';
      }

      container.innerHTML = html;
    } catch {
      container.innerHTML = '<div class="ma-dp-empty">Σφάλμα φόρτωσης</div>';
    }
  }

  // ── Init ──

  async function init(driver, cfg) {
    labels = (cfg || {}).labels || {};

    const section = document.querySelector('[data-tab="finance"]');
    if (!section) return;

    section.innerHTML = `
      <h2 class="ma-dp-tab-title">Οικονομικά</h2>
      <div id="dpFinanceContent" class="ma-dp-fin-content"></div>`;

    await loadFinancials();
  }

  window.DpFinancials = { init, reload: loadFinancials };
})();
