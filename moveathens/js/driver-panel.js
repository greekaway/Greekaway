/**
 * MoveAthens Driver Panel — Main Controller + Footer
 * SPA-like tab navigation. Loads config from API, builds footer.
 * Depends: driver-panel-auth.js, driver-panel-profile.js
 */
(() => {
  'use strict';

  const LS_KEY = 'moveathens_driver';

  const FOOTER_ICONS = {
    home:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12l9-9 9 9"/><path d="M5 10v10a1 1 0 001 1h3m10-11v10a1 1 0 01-1 1h-3m-4 0v-6h4v6"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    history:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    wallet:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/><circle cx="17" cy="14" r="1.5"/></svg>',
    user:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0112 0v1"/></svg>',
    menu:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>'
  };

  const getDriver = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
  };

  let config = {};
  let activeTab = 'home';

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/driver-panel/config');
      if (res.ok) config = await res.json();
    } catch (err) {
      console.error('[dp] Config load failed:', err);
    }
  };

  const buildFooter = () => {
    const footer = document.getElementById('dpFooter');
    if (!footer) return;

    const tabs = config.footer?.tabs || [
      { key: 'home',     label: 'Αρχική',     icon: 'home',     enabled: true, order: 1 },
      { key: 'schedule', label: 'Ραντεβού',   icon: 'calendar', enabled: true, order: 2 },
      { key: 'history',  label: 'Ιστορικό',   icon: 'history',  enabled: true, order: 3 },
      { key: 'finance',  label: 'Οικονομικά', icon: 'wallet',   enabled: true, order: 4 },
      { key: 'profile',  label: 'Μενού',     icon: 'menu',     enabled: true, order: 5 }
    ];

    const sorted = [...tabs].filter(t => t.enabled).sort((a, b) => a.order - b.order);

    footer.innerHTML = sorted.map(t => `
      <button class="ma-dp-footer-btn${t.key === activeTab ? ' active' : ''}" data-tab="${t.key}" aria-label="${t.label}">
        <span class="ma-dp-footer-icon">${FOOTER_ICONS[t.icon] || ''}</span>
        <span class="ma-dp-footer-label">${t.label}</span>
      </button>
    `).join('');

    footer.addEventListener('click', (e) => {
      const btn = e.target.closest('.ma-dp-footer-btn');
      if (!btn) return;
      const tabKey = btn.dataset.tab;
      switchTab(tabKey);
      // Ensure profile tab renders hub on click
      if (tabKey === 'profile' && typeof window.DpProfile?.init === 'function') {
        const driver = getDriver();
        if (driver) window.DpProfile.init(driver, config);
      }
    });
  };

  const switchTab = (tabKey) => {
    activeTab = tabKey;
    document.querySelectorAll('.ma-dp-tab').forEach(s => {
      s.classList.toggle('active', s.dataset.tab === tabKey);
    });
    document.querySelectorAll('.ma-dp-footer-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabKey);
    });
  };

  const init = async () => {
    const driver = getDriver();
    if (!driver) return; // auth-gate will handle

    await loadConfig();

    // Apply theme with auto support
    const themePref = localStorage.getItem('ma_dp_theme') || config.general?.defaultTheme || 'auto';
    window.DpApp._applyTheme = function(t) {
      document.documentElement.removeAttribute('data-theme');
      if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
      else if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
        document.documentElement.setAttribute('data-theme', 'light');
    };
    window.DpApp._applyTheme(themePref);

    buildFooter();

    // Init home tab
    if (typeof window.DpHome?.init === 'function') {
      window.DpHome.init(driver, config);
    }

    // Init appointments tab
    if (typeof window.DpAppointments?.init === 'function') {
      window.DpAppointments.init(driver, config);
    }

    // Init history tab
    if (typeof window.DpHistory?.init === 'function') {
      window.DpHistory.init(driver, config);
    }

    // Init financials tab
    if (typeof window.DpFinancials?.init === 'function') {
      window.DpFinancials.init(driver, config);
    }

    // Init profile tab
    if (typeof window.DpProfile?.init === 'function') {
      window.DpProfile.init(driver, config);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.DpApp = { switchTab, getDriver, loadConfig };
})();
