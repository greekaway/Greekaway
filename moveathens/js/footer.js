(async () => {
  const slot = document.querySelector('[data-ma-footer-slot]');
  if (slot) {
    const cacheBust = window.MoveAthensConfig.isDevHost() ? `?cb=${Date.now()}` : '';
    const res = await fetch(`/moveathens/partials/footer.html${cacheBust}`);
    slot.innerHTML = await res.text();
  }

  const cfg = await window.MoveAthensConfig.load();
  window.MoveAthensConfig.applyFooterLabels(document, cfg);

  const applyFooterIcons = async () => {
    const icons = (cfg && cfg.footerIcons) ? cfg.footerIcons : {};
    const slots = Array.from(document.querySelectorAll('[data-ma-footer-icon]'));
    await Promise.all(slots.map(async (slot) => {
      const key = slot.getAttribute('data-ma-footer-icon');
      const url = icons && key ? icons[key] : '';
      if (!url) {
        slot.innerHTML = '';
        return;
      }
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('icon');
        const text = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'image/svg+xml');
        const svg = doc.querySelector('svg');
        if (!svg) throw new Error('icon');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        slot.innerHTML = '';
        slot.appendChild(document.importNode(svg, true));
      } catch (_) {
        slot.innerHTML = '';
      }
    }));
  };

  const normalizePath = (value) => {
    if (!value) return '';
    return value.endsWith('/') && value.length > 1 ? value.slice(0, -1) : value;
  };

  const getActiveRoute = () => {
    const path = normalizePath(window.location.pathname || '');
    const candidates = Array.from(document.querySelectorAll('[data-route]'));
    const exact = candidates.find((el) => normalizePath(el.getAttribute('data-route')) === path);
    if (exact) return exact;
    return candidates.find((el) => {
      const route = normalizePath(el.getAttribute('data-route'));
      return route && path.startsWith(route) && route !== '/moveathens';
    }) || candidates.find((el) => normalizePath(el.getAttribute('data-route')) === '/moveathens');
  };

  const applyActive = () => {
    document.querySelectorAll('.ma-footer__item').forEach((el) => el.classList.remove('active'));
    const active = getActiveRoute();
    if (active) active.classList.add('active');
  };

  document.querySelectorAll('[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-route');
      if (target) window.location.href = target;
    });
  });

  await applyFooterIcons();
  applyActive();
})();
