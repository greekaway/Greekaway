(() => {
  const state = { data: null, promise: null };

  const isDevHost = () => {
    const host = window.location.hostname || '';
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  };

  const buildConfigUrl = () => {
    const base = '/api/moveathens/ui-config';
    return isDevHost() ? `${base}?cb=${Date.now()}` : base;
  };

  const normalizePhone = (value) => String(value || '').replace(/\D+/g, '');

  const safeText = (el, value) => {
    if (!el) return;
    el.textContent = value || '';
  };

  const resolveHeroVideoUrl = () => {
    const base = '/moveathens/videos/hero.mp4';
    return isDevHost() ? `${base}?cb=${Date.now()}` : base;
  };

  const applyHero = async (root, cfg) => {
    const video = root.querySelector('[data-ma-hero-video]');
    const placeholder = root.querySelector('[data-ma-hero-placeholder]');
    const logo = root.querySelector('[data-ma-hero-logo]');
    const url = resolveHeroVideoUrl();
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok && video) {
        video.src = url;
        video.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
        video.load();
      } else {
        if (video) video.style.display = 'none';
        if (placeholder) placeholder.style.display = 'block';
      }
    } catch (_) {
      if (video) video.style.display = 'none';
      if (placeholder) placeholder.style.display = 'block';
    }
    if (logo) {
      if (cfg.heroLogoUrl) {
        logo.src = cfg.heroLogoUrl;
        logo.style.display = 'block';
      } else {
        logo.removeAttribute('src');
        logo.style.display = 'none';
      }
    }
    safeText(root.querySelector('[data-ma-hero-headline]'), cfg.heroHeadline);
    safeText(root.querySelector('[data-ma-hero-subtext]'), cfg.heroSubtext);
  };

  const applyFooterLabels = (root, cfg) => {
    const labels = cfg.footerLabels || {};
    root.querySelectorAll('[data-ma-footer-label]').forEach((el) => {
      const key = el.getAttribute('data-ma-footer-label');
      const normalized = key ? key.replace(/^footer\./, '') : '';
      safeText(el, labels[normalized]);
    });
  };

  const applyPageTitles = (root, cfg) => {
    const labels = cfg.footerLabels || {};
    root.querySelectorAll('[data-ma-page-title]').forEach((el) => {
      const key = el.getAttribute('data-ma-page-title');
      safeText(el, labels[key]);
    });
  };

  const applyContactInfo = (root, cfg) => {
    const labels = cfg.contactLabels || {};
    const phone = cfg.phoneNumber || '';
    const whatsapp = cfg.whatsappNumber || '';
    const email = cfg.companyEmail || '';

    root.querySelectorAll('[data-ma-contact-label]').forEach((el) => {
      const key = el.getAttribute('data-ma-contact-label');
      safeText(el, labels[key]);
    });

    root.querySelectorAll('[data-ma-contact-value]').forEach((el) => {
      const key = el.getAttribute('data-ma-contact-value');
      const link = el.closest('a') || el;
      if (key === 'phone') {
        safeText(el, phone);
        link.setAttribute('href', phone ? `tel:${phone}` : '#');
      }
      if (key === 'whatsapp') {
        safeText(el, whatsapp);
        const wa = normalizePhone(whatsapp);
        link.setAttribute('href', wa ? `https://wa.me/${wa}` : '#');
      }
      if (key === 'email') {
        safeText(el, email);
        link.setAttribute('href', email ? `mailto:${email}` : '#');
      }
    });
  };

  const applyHotelLabels = (root, cfg) => {
    const labels = cfg.hotelContextLabels || {};
    root.querySelectorAll('[data-ma-hotel-label]').forEach((el) => {
      const key = el.getAttribute('data-ma-hotel-label');
      safeText(el, labels[key]);
    });
    root.querySelectorAll('[data-ma-hotel-button]').forEach((el) => {
      const key = el.getAttribute('data-ma-hotel-button');
      safeText(el, labels[key]);
    });
  };

  const applyModalLabels = (root, cfg) => {
    const labels = cfg.ctaLabels || {};
    root.querySelectorAll('[data-ma-cta-label]').forEach((el) => {
      const key = el.getAttribute('data-ma-cta-label');
      safeText(el, labels[key]);
    });
    root.querySelectorAll('[data-ma-cta-aria]').forEach((el) => {
      const key = el.getAttribute('data-ma-cta-aria');
      const value = labels[key];
      if (value) el.setAttribute('aria-label', value);
    });
  };

  const load = async () => {
    if (state.data) return state.data;
    if (!state.promise) {
      state.promise = fetch(buildConfigUrl(), { cache: 'no-store' })
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

  window.MoveAthensConfig = {
    load,
    applyHero,
    applyFooterLabels,
    applyPageTitles,
    applyContactInfo,
    applyHotelLabels,
    applyModalLabels,
    resolveHeroVideoUrl,
    normalizePhone,
    isDevHost
  };
})();
