(async () => {
  const slot = document.querySelector('[data-ds-footer-slot]');
  if (slot) {
    // Check if footer was already server-inlined or cached
    if (!slot.querySelector('[data-ds-footer]')) {
      const cacheBust = window.DriversSystemConfig.isDevHost() ? `?cb=${Date.now()}` : '';
      const res = await fetch(`/driverssystem/partials/footer.html${cacheBust}`);
      slot.innerHTML = await res.text();
    }
  }

  const cfg = await window.DriversSystemConfig.load();
  window.DriversSystemConfig.applyFooterLabels(document, cfg);

  const routePrefix = window.DriversSystemConfig.getRoutePrefix();
  const isDsDomain = window.DriversSystemConfig.isDriversSystemDomain();

  // Update data-route attributes for domain-aware nav
  document.querySelectorAll('[data-route]').forEach((el) => {
    const route = el.getAttribute('data-route');
    if (route && route.startsWith('/driverssystem')) {
      const cleanPath = route.replace('/driverssystem', '') || '/';
      const newRoute = isDsDomain ? cleanPath : route;
      el.setAttribute('data-route', newRoute);
    }
  });

  const applyFooterIcons = async () => {
    const icons = (cfg && cfg.footerIcons) ? cfg.footerIcons : {};
    const slots = Array.from(document.querySelectorAll('[data-ds-footer-icon]'));
    await Promise.all(slots.map(async (iconSlot) => {
      const key = iconSlot.getAttribute('data-ds-footer-icon');
      const url = icons && key ? icons[key] : '';
      if (!url) {
        iconSlot.innerHTML = '';
        return;
      }
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('icon');
        const text = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'image/svg+xml');
        const svg = doc.querySelector('svg');
        if (!svg) throw new Error('icon');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        iconSlot.innerHTML = '';
        iconSlot.appendChild(document.importNode(svg, true));
      } catch (_) {
        iconSlot.innerHTML = '';
      }
    }));
  };

  const normalizePath = (value) => {
    if (!value) return '';
    return value.endsWith('/') && value.length > 1 ? value.slice(0, -1) : value;
  };

  const getActiveRoute = () => {
    const currentPath = normalizePath(window.location.pathname || '');
    const candidates = Array.from(document.querySelectorAll('[data-route]'));

    const exact = candidates.find((el) => normalizePath(el.getAttribute('data-route')) === currentPath);
    if (exact) return exact;

    const homeRoutes = ['/', '/driverssystem'];
    const prefixMatch = candidates.find((el) => {
      const route = normalizePath(el.getAttribute('data-route'));
      return route && currentPath.startsWith(route) && !homeRoutes.includes(route);
    });
    if (prefixMatch) return prefixMatch;

    return candidates.find((el) => {
      const route = normalizePath(el.getAttribute('data-route'));
      return homeRoutes.includes(route);
    });
  };

  const applyActive = () => {
    document.querySelectorAll('.ds-footer__item').forEach((el) => el.classList.remove('active'));
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
