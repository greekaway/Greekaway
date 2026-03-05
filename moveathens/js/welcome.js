(async () => {
  const cfg = await window.MoveAthensConfig.load();

  // ── Video toggle: if disabled, add no-video class before applying hero ──
  if (cfg.heroVideoEnabled === false) {
    const hero = document.querySelector('.ma-hero');
    if (hero) hero.classList.add('ma-hero--no-video');
  }

  await window.MoveAthensConfig.applyHero(document, cfg);
  window.MoveAthensConfig.applyPageTitles(document, cfg);
  window.MoveAthensConfig.applyContactInfo(document, cfg);
  window.MoveAthensConfig.applyHotelLabels(document, cfg);

  const isDevHost = window.MoveAthensConfig.isDevHost();
  const cb = isDevHost ? `?cb=${Date.now()}` : '';

  // ── Welcome Metrics + System Status ──
  try {
    const url = `/api/moveathens/welcome-stats${cb}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
      const { metrics, status } = await res.json();
      document.querySelectorAll('[data-ma-metric]').forEach(card => {
        const key = card.getAttribute('data-ma-metric');
        const m = metrics[key];
        if (!m) return;
        const valEl = card.querySelector('[data-ma-metric-value]');
        const lblEl = card.querySelector('[data-ma-metric-label]');
        if (valEl) animateNumber(valEl, m.value);
        if (lblEl) lblEl.textContent = m.label || '';
      });

      // System Status cards
      if (status) {
        document.querySelectorAll('[data-ma-status-item]').forEach(card => {
          const key = card.getAttribute('data-ma-status-item');
          const s = status[key];
          if (!s) return;
          const valEl = card.querySelector('[data-ma-status-value]');
          const lblEl = card.querySelector('[data-ma-status-label]');
          if (lblEl) lblEl.textContent = s.label || '';
          if (!valEl) return;
          if (key === 'flightTracking') {
            valEl.textContent = s.value ? 'Ενεργό' : 'Ανενεργό';
            valEl.classList.add(s.value ? 'ma-status__value--active' : 'ma-status__value--inactive');
          } else {
            animateNumber(valEl, s.value);
          }
        });
      }
    }
  } catch (_) { /* silent — metrics are enhancement only */ }

  // ── Personal Hotel Stats ("Τα Δικά Μου") ──
  try {
    const raw = localStorage.getItem('moveathens_hotel');
    const hotel = raw ? JSON.parse(raw) : null;
    const zoneId = hotel && hotel.origin_zone_id;

    // Show hotel name instead of "Τα Δικά Μου"
    const hotelNameEl = document.querySelector('[data-ma-mystats-hotel-name]');
    const hName = hotel && (hotel.hotelName || hotel.origin_zone_name || '');
    if (hotelNameEl && hName) hotelNameEl.textContent = hName;

    if (zoneId) {
      const url = `/api/moveathens/my-stats?zone_id=${encodeURIComponent(zoneId)}${cb ? '&cb=' + Date.now() : ''}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const map = {
          myRoutes:     { value: data.myRoutes,     suffix: '' },
          myRevenue:    { value: data.myRevenue,     suffix: '€' },
          myCommission: { value: data.myCommission,  suffix: '€' }
        };
        document.querySelectorAll('[data-ma-mystats-item]').forEach(card => {
          const key = card.getAttribute('data-ma-mystats-item');
          const item = map[key];
          if (!item) return;
          const valEl = card.querySelector('[data-ma-mystats-value]');
          if (valEl) animateNumber(valEl, item.value, item.suffix);
        });
      }
    }
  } catch (_) { /* silent */ }

  // ── Welcome Text Block (admin-controlled) ──
  if (cfg.welcomeTextBlock) {
    const tb = document.getElementById('maWelcomeTextBlock');
    const tbText = document.getElementById('maWelcomeTextBlockText');
    if (tb && tbText) {
      tbText.textContent = cfg.welcomeTextBlock;
      tb.hidden = false;
    }
  }

  // Show the dashboard container
  const container = document.querySelector('[data-ma-metrics]');
  if (container) container.style.opacity = '1';

  /** Animate a number counting up from 0 */
  function animateNumber(el, target, suffix) {
    const duration = 1400;
    const start = performance.now();
    const end = Number(target) || 0;
    const sfx = suffix || '';
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(ease * end).toLocaleString('el-GR') + sfx;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
})();
