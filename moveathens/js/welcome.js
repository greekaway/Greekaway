(async () => {
  const cfg = await window.MoveAthensConfig.load();
  await window.MoveAthensConfig.applyHero(document, cfg);
  window.MoveAthensConfig.applyPageTitles(document, cfg);
  window.MoveAthensConfig.applyContactInfo(document, cfg);
  window.MoveAthensConfig.applyHotelLabels(document, cfg);

  // ── Welcome Metrics (dynamic) ──
  try {
    const isDevHost = window.MoveAthensConfig.isDevHost();
    const url = isDevHost
      ? `/api/moveathens/welcome-stats?cb=${Date.now()}`
      : '/api/moveathens/welcome-stats';
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
      const { metrics } = await res.json();
      document.querySelectorAll('[data-ma-metric]').forEach(card => {
        const key = card.getAttribute('data-ma-metric');
        const m = metrics[key];
        if (!m) return;
        const valEl = card.querySelector('[data-ma-metric-value]');
        const lblEl = card.querySelector('[data-ma-metric-label]');
        if (valEl) animateNumber(valEl, m.value);
        if (lblEl) lblEl.textContent = m.label || '';
      });
      // Show the metrics container
      const container = document.querySelector('[data-ma-metrics]');
      if (container) container.style.opacity = '1';
    }
  } catch (_) { /* silent — metrics are enhancement only */ }

  /** Animate a number counting up from 0 */
  function animateNumber(el, target) {
    const duration = 1400;
    const start = performance.now();
    const end = Number(target) || 0;
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(ease * end).toLocaleString('el-GR');
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
})();
