(async () => {
  const slot = document.querySelector('[data-ma-footer-slot]');
  if (slot) {
    const cacheBust = window.MoveAthensConfig.isDevHost() ? `?cb=${Date.now()}` : '';
    const res = await fetch(`/moveathens/partials/footer.html${cacheBust}`);
    slot.innerHTML = await res.text();
  }

  const cfg = await window.MoveAthensConfig.load();
  window.MoveAthensConfig.applyFooterLabels(document, cfg);

  // Get route prefix for domain-aware navigation
  const routePrefix = window.MoveAthensConfig.getRoutePrefix();
  const isMoveAthensDomain = window.MoveAthensConfig.isMoveAthensDomain();

  // Update all data-route attributes to be domain-aware
  document.querySelectorAll('[data-route]').forEach((el) => {
    const route = el.getAttribute('data-route');
    if (route && route.startsWith('/moveathens')) {
      // Convert /moveathens/xxx to correct path for current domain
      const cleanPath = route.replace('/moveathens', '') || '/';
      const newRoute = isMoveAthensDomain ? cleanPath : route;
      el.setAttribute('data-route', newRoute);
      // Also fix href for <a> tags so browser navigation works
      if (el.tagName === 'A' && el.getAttribute('href') === route) {
        el.setAttribute('href', newRoute);
      }
    }
  });

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

        // Normalize SVG so it adapts to light/dark via CSS currentColor.
        // Remove hard-coded colors from all paths/shapes and let CSS control them.
        const shapes = svg.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse');
        shapes.forEach((el) => {
          const f = el.getAttribute('fill');
          const s = el.getAttribute('stroke');
          // Convert hard-coded fills to currentColor (skip 'none')
          if (f && f !== 'none') el.setAttribute('fill', 'currentColor');
          // Convert hard-coded strokes to currentColor (skip 'none')
          if (s && s !== 'none') el.setAttribute('stroke', 'currentColor');
        });
        // Also normalize top-level SVG attributes
        const svgFill = svg.getAttribute('fill');
        const svgStroke = svg.getAttribute('stroke');
        if (svgFill && svgFill !== 'none') svg.setAttribute('fill', 'currentColor');
        if (svgStroke && svgStroke !== 'none') svg.setAttribute('stroke', 'currentColor');

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
    
    // First try exact match
    const exact = candidates.find((el) => normalizePath(el.getAttribute('data-route')) === path);
    if (exact) return exact;
    
    // Then try prefix match (exclude home routes)
    const homeRoutes = ['/', '/moveathens'];
    const prefixMatch = candidates.find((el) => {
      const route = normalizePath(el.getAttribute('data-route'));
      return route && path.startsWith(route) && !homeRoutes.includes(route);
    });
    if (prefixMatch) return prefixMatch;
    
    // Default to home
    return candidates.find((el) => {
      const route = normalizePath(el.getAttribute('data-route'));
      return homeRoutes.includes(route);
    });
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
