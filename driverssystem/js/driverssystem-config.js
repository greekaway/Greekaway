(() => {
  const state = { data: null, promise: null };

  const isDevHost = () => {
    const host = window.location.hostname || '';
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  };

  const buildConfigUrl = () => {
    const base = '/api/driverssystem/ui-config';
    return isDevHost() ? `${base}?cb=${Date.now()}` : base;
  };

  const safeText = (el, value) => {
    if (!el) return;
    el.textContent = value || '';
  };

  const applyHero = async (root, cfg) => {
    const logo = root.querySelector('[data-ds-hero-logo]');
    if (logo) {
      if (cfg.heroLogoUrl) {
        logo.src = cfg.heroLogoUrl;
        logo.style.display = 'block';
      } else {
        logo.removeAttribute('src');
        logo.style.display = 'none';
      }
    }
    safeText(root.querySelector('[data-ds-hero-headline]'), cfg.heroHeadline);
    safeText(root.querySelector('[data-ds-hero-subtext]'), cfg.heroSubtext);
  };

  const applyFooterLabels = (root, cfg) => {
    const labels = cfg.footerLabels || {};
    root.querySelectorAll('[data-ds-footer-label]').forEach((el) => {
      const key = el.getAttribute('data-ds-footer-label');
      const normalized = key ? key.replace(/^footer\./, '') : '';
      safeText(el, labels[normalized]);
    });
  };

  const applyPageTitles = (root, cfg) => {
    const labels = cfg.footerLabels || {};
    root.querySelectorAll('[data-ds-page-title]').forEach((el) => {
      const key = el.getAttribute('data-ds-page-title');
      safeText(el, labels[key]);
    });
  };

  const applyContactInfo = (root, cfg) => {
    const labels = cfg.contactLabels || {};
    const phone = cfg.phoneNumber || '';
    const whatsapp = cfg.whatsappNumber || '';
    const email = cfg.companyEmail || '';

    root.querySelectorAll('[data-ds-contact-label]').forEach((el) => {
      const key = el.getAttribute('data-ds-contact-label');
      safeText(el, labels[key]);
    });

    root.querySelectorAll('[data-ds-contact-value]').forEach((el) => {
      const key = el.getAttribute('data-ds-contact-value');
      const link = el.closest('a') || el;
      if (key === 'phone') {
        safeText(el, phone);
        link.setAttribute('href', phone ? `tel:${phone}` : '#');
      }
      if (key === 'whatsapp') {
        const wa = String(whatsapp || '').replace(/\D+/g, '');
        safeText(el, whatsapp);
        link.setAttribute('href', wa ? `https://wa.me/${wa}` : '#');
      }
      if (key === 'email') {
        safeText(el, email);
        link.setAttribute('href', email ? `mailto:${email}` : '#');
      }
    });
  };

  const load = async () => {
    if (state.data) return state.data;
    if (!state.promise) {
      // Dev: cache-bust; Prod: allow short browser cache (2 min)
      const fetchOpts = isDevHost() ? { cache: 'no-store' } : {};
      state.promise = fetch(buildConfigUrl(), fetchOpts)
        .then((res) => res.ok ? res.json() : Promise.reject(new Error('config')))
        .then((data) => {
          state.data = data || {};
          return state.data;
        })
        .catch(() => {
          state.data = {};
          return state.data;
        });
    }
    return state.promise;
  };

  const isDriversSystemDomain = () => {
    const host = window.location.hostname || '';
    return host === 'driverssystem.com' || host === 'www.driverssystem.com';
  };

  const getRoutePrefix = () => {
    return isDriversSystemDomain() ? '' : '/driverssystem';
  };

  const buildRoute = (routePath) => {
    const prefix = getRoutePrefix();
    const normalized = routePath.startsWith('/') ? routePath : `/${routePath}`;
    return `${prefix}${normalized}`;
  };

  window.DriversSystemConfig = {
    load,
    applyHero,
    applyFooterLabels,
    applyPageTitles,
    applyContactInfo,
    isDevHost,
    isDriversSystemDomain,
    getRoutePrefix,
    buildRoute
  };
})();
