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
      const res = await fetch('/api/driver-panel/config', { cache: 'no-store' });
      if (res.ok) config = await res.json();
    } catch (err) {
      console.error('[dp] Config load failed:', err);
    }
  };

  // ── Header builder ──
  const buildHeader = () => {
    const logo = document.getElementById('dpHeaderLogo');
    const title = document.getElementById('dpHeaderTitle');
    if (logo && config.general?.logoUrl) logo.src = config.general.logoUrl;
    if (title && config.general?.appTitle) title.textContent = config.general.appTitle;
  };

  // ── Network status banner (offline/online) ──
  const initNetworkBanner = () => {
    const banner = document.createElement('div');
    banner.className = 'ma-dp-network-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    document.body.prepend(banner);

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const getThemeColor = () => {
      const t = document.documentElement.getAttribute('data-theme');
      return t === 'light' ? '#f5f7fa' : '#0b0f1a';
    };

    let hideTimer = null;
    let clearTimer = null;

    const show = (text, type) => {
      clearTimeout(hideTimer);
      clearTimeout(clearTimer);
      banner.textContent = text;
      banner.classList.remove('ma-dp-network-banner--offline', 'ma-dp-network-banner--online', 'ma-dp-network-banner--hidden');
      banner.classList.add(`ma-dp-network-banner--${type}`);

      // Only change PWA status bar color for offline (red) — never green
      if (themeMeta && type === 'offline') {
        themeMeta.setAttribute('content', '#d32f2f');
      }

      if (type === 'online') {
        // Restore theme-color immediately when back online (don't wait)
        if (themeMeta) themeMeta.setAttribute('content', getThemeColor());
        hideTimer = setTimeout(() => {
          banner.classList.add('ma-dp-network-banner--hidden');
          clearTimer = setTimeout(() => {
            banner.classList.remove('ma-dp-network-banner--online');
          }, 400);
        }, 3000);
      }
    };

    window.addEventListener('offline', () => show('Δεν υπάρχει σύνδεση στο διαδίκτυο', 'offline'));
    window.addEventListener('online', () => show('Η σύνδεση αποκαταστάθηκε', 'online'));
    if (!navigator.onLine) show('Δεν υπάρχει σύνδεση στο διαδίκτυο', 'offline');
  };

  // ── Floating availability toggle ──
  let _blockPollTimer = null;

  const buildAvailButton = () => {
    let btn = document.getElementById('dpAvailBtn');
    if (btn) btn.remove();

    const driver = getDriver();
    const isActive = driver?.is_available === true;

    btn = document.createElement('button');
    btn.id = 'dpAvailBtn';
    btn.className = 'ma-dp-avail-btn' + (isActive ? ' on' : '');
    btn.textContent = isActive ? 'ΕΝΕΡΓΟΣ' : 'ΕΝΑΡΞΗ';

    // Check block status and update button accordingly
    const checkBlocked = async () => {
      const d = getDriver();
      if (!d?.phone) return;
      try {
        const res = await fetch('/api/driver-panel/block-status?phone=' + encodeURIComponent(d.phone));
        if (!res.ok) return;
        const data = await res.json();
        if (data.blocked) {
          showBlockedState(btn, data.blocked_until);
        } else {
          clearBlockedState(btn);
        }
      } catch { /* offline */ }
    };

    const showBlockedState = (b, until) => {
      b.classList.add('blocked');
      b.classList.remove('on', 'off');
      b.disabled = true;
      let label = 'ΚΛΕΙΔΩΜΕΝΟΣ';
      if (until) {
        const d = new Date(until);
        label += '\n' + 'έως ' + d.toLocaleDateString('el-GR');
      }
      b.textContent = label;
    };

    const clearBlockedState = (b) => {
      if (!b.classList.contains('blocked')) return;
      b.classList.remove('blocked');
      b.disabled = false;
      const d = getDriver();
      const on = d?.is_available === true;
      b.classList.toggle('on', on);
      b.classList.toggle('off', !on);
      b.textContent = on ? 'ΕΝΕΡΓΟΣ' : 'ΕΝΑΡΞΗ';
    };

    // Initial check + poll every 30s
    checkBlocked();
    if (_blockPollTimer) clearInterval(_blockPollTimer);
    _blockPollTimer = setInterval(checkBlocked, 30000);

    btn.addEventListener('click', async () => {
      const d = getDriver();
      if (!d?.phone || btn.disabled || btn.classList.contains('blocked')) return;
      const wasOn = btn.classList.contains('on');
      const nowActive = !wasOn;
      btn.disabled = true;
      btn.classList.add('loading');

      try {
        const res = await fetch('/api/driver-panel/availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: d.phone, is_available: nowActive })
        });

        if (res.status === 403) {
          // Driver got blocked while logged in
          const errData = await res.json().catch(() => ({}));
          btn.classList.remove('loading');
          showBlockedState(btn, errData.blocked_until);
          return;
        }

        if (res.ok) {
          d.is_available = nowActive;
          localStorage.setItem(LS_KEY, JSON.stringify(d));

          // Play correct sound based on state change
          if (window.DpSounds) {
            const key = nowActive ? 'ma_dp_app_open_sound' : 'ma_dp_app_close_sound';
            const defKey = nowActive ? 'app_open' : 'app_close';
            const sid = localStorage.getItem(key) || config.sounds?.defaults?.[defKey] || '';
            if (sid) window.DpSounds.play(sid);
          }

          // Brief delay so animation feels intentional
          await new Promise(r => setTimeout(r, 650));

          btn.classList.remove('loading');
          btn.classList.toggle('on', nowActive);
          btn.classList.toggle('off', !nowActive);
          btn.textContent = nowActive ? 'ΕΝΕΡΓΟΣ' : 'ΕΝΑΡΞΗ';
          // Sync profile toggle
          const pa = document.getElementById('dpProfileAvail');
          if (pa) pa.checked = nowActive;
          const pl = document.getElementById('dpAvailLabel');
          if (pl) pl.textContent = nowActive ? 'Ενεργός' : 'Ανενεργός';
        } else {
          btn.classList.remove('loading');
        }
      } catch { btn.classList.remove('loading'); }
      btn.disabled = false;
    });

    document.getElementById('dpApp').appendChild(btn);
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

    footer.innerHTML = sorted.map(t => {
      // Use built-in SVG or placeholder for custom (loaded async below)
      let iconHtml = FOOTER_ICONS[t.icon] || '';
      if (t.iconUrl) {
        iconHtml = '';  // will be replaced by inline SVG below
      }
      return `
      <button class="ma-dp-footer-btn${t.key === activeTab ? ' active' : ''}" data-tab="${t.key}" aria-label="${t.label}">
        <span class="ma-dp-footer-icon" ${t.iconUrl ? `data-icon-url="${t.iconUrl}"` : ''}>${iconHtml}</span>
        <span class="ma-dp-footer-label">${t.label}</span>
      </button>
    `;
    }).join('');

    // Fetch custom SVGs and inject inline with currentColor (like MoveAthens)
    footer.querySelectorAll('.ma-dp-footer-icon[data-icon-url]').forEach(async (slot) => {
      const url = slot.getAttribute('data-icon-url');
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return;
        const text = await res.text();
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        const svg = doc.querySelector('svg');
        if (!svg) return;
        svg.setAttribute('aria-hidden', 'true');
        // Normalize all colors to currentColor so CSS color inheritance works
        svg.querySelectorAll('path,circle,rect,line,polyline,polygon,ellipse').forEach(el => {
          const f = el.getAttribute('fill');
          const s = el.getAttribute('stroke');
          if (f && f !== 'none') el.setAttribute('fill', 'currentColor');
          if (s && s !== 'none') el.setAttribute('stroke', 'currentColor');
        });
        if (svg.getAttribute('fill') && svg.getAttribute('fill') !== 'none') svg.setAttribute('fill', 'currentColor');
        if (svg.getAttribute('stroke') && svg.getAttribute('stroke') !== 'none') svg.setAttribute('stroke', 'currentColor');
        slot.innerHTML = '';
        slot.appendChild(document.importNode(svg, true));
      } catch (_) { /* silent */ }
    });

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
    // Header + availability button visible only on home
    const h = document.getElementById('dpHeader');
    if (h) h.style.display = tabKey === 'home' ? '' : 'none';
    const ab = document.getElementById('dpAvailBtn');
    if (ab) ab.style.display = tabKey === 'home' ? '' : 'none';
    // Dismiss new-request banner when switching to home
    if (tabKey === 'home') {
      const banner = document.querySelector('.ma-dp-new-req-banner');
      if (banner) { banner.classList.add('hiding'); setTimeout(() => banner.remove(), 300); }
      // Fix map tiles after tab switch
      if (window.DpMap) window.DpMap.resize();
    }
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
      else {
        // Auto: follow system preference
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
          document.documentElement.setAttribute('data-theme', 'light');
        // else: no attribute = dark (default)
      }
    };
    window.DpApp._applyTheme(themePref);

    // Listen for system theme changes when in auto mode
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        const current = localStorage.getItem('ma_dp_theme') || 'auto';
        if (current === 'auto') window.DpApp._applyTheme('auto');
      });
    }

    // Apply accent color from config
    if (config.general?.accentColor) {
      const ac = config.general.accentColor;
      document.documentElement.style.setProperty('--ma-dp-accent', ac);
      // Parse hex to generate glow rgba
      const r = parseInt(ac.slice(1, 3), 16);
      const g = parseInt(ac.slice(3, 5), 16);
      const b = parseInt(ac.slice(5, 7), 16);
      if (!isNaN(r)) document.documentElement.style.setProperty('--ma-dp-accent-glow', `rgba(${r},${g},${b},0.2)`);
    }

    // Build header from config
    buildHeader();

    // Network status banner (offline/online)
    initNetworkBanner();

    buildFooter();
    buildAvailButton();

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

    // Store sound files for dp-sounds.js MP3 playback
    window._dpSoundFiles = config.sounds?.files || [];

    // ── Unlock audio on mobile (iOS requires gesture) ──
    let audioUnlocked = false;
    const unlockAudio = () => {
      if (audioUnlocked) return;
      audioUnlocked = true;
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        ctx.resume();
      } catch { /* */ }
    };

    // ── App-open sound: play on first genuine interaction ──
    const playAppOpen = () => {
      unlockAudio();
      const soundId = localStorage.getItem('ma_dp_app_open_sound') || config.sounds?.defaults?.app_open || '';
      if (soundId && window.DpSounds) window.DpSounds.play(soundId);
      ['click', 'touchstart'].forEach(t => document.removeEventListener(t, playAppOpen, true));
    };
    ['click', 'touchstart'].forEach(e =>
      document.addEventListener(e, playAppOpen, { capture: true, passive: true })
    );

    // ── App-close sound: preload during gesture, play on hide ──
    let closeAudio = null;
    const preloadCloseAudio = () => {
      const soundId = localStorage.getItem('ma_dp_app_close_sound') || config.sounds?.defaults?.app_close || '';
      if (!soundId) { closeAudio = null; return; }
      const files = window._dpSoundFiles || [];
      const file = files.find(f => f.id === soundId);
      if (!file) { closeAudio = null; return; }
      closeAudio = new Audio(file.url);
      closeAudio.preload = 'auto';
      closeAudio.load();
    };
    window._dpPreloadCloseAudio = preloadCloseAudio;
    const warmClose = () => {
      preloadCloseAudio();
      ['click', 'touchstart'].forEach(t => document.removeEventListener(t, warmClose, true));
    };
    ['click', 'touchstart'].forEach(e =>
      document.addEventListener(e, warmClose, { capture: true, passive: true })
    );
    /* visibilitychange sound removed — only ON/OFF button triggers sounds */
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.DpApp = { switchTab, getDriver, loadConfig, getActiveTab: () => activeTab };
})();
