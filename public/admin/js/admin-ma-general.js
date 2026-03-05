/**
 * MoveAthens Admin — General Tab (UI Config)
 * Depends on: admin-ma-helpers.js (window.MaAdmin)
 */
(() => {
  'use strict';
  const { $, showToast, setStatus, authRedirect, state, api } = window.MaAdmin;

  const initGeneralTab = () => {
    const form = $('#ma-form');
    const status = $('#ma-status');
    const fields = {
      heroVideoFile: $('#heroVideoFile'),
      heroVideoUploadBtn: $('#heroVideoUploadBtn'),
      heroLogoFile: $('#heroLogoFile'),
      heroLogoUploadBtn: $('#heroLogoUploadBtn'),
      heroLogoUrl: $('#heroLogoUrl'),
      heroHeadline: $('#heroHeadline'),
      heroSubtext: $('#heroSubtext'),
      footerHome: $('#footerHome'),
      footerPrices: $('#footerPrices'),
      footerCta: $('#footerCta'),
      footerInfo: $('#footerInfo'),
      footerContext: $('#footerContext'),
      footerIconHomeFile: $('#footerIconHomeFile'),
      footerIconHomeUpload: $('#footerIconHomeUpload'),
      footerIconHomeUrl: $('#footerIconHomeUrl'),
      footerIconPricesFile: $('#footerIconPricesFile'),
      footerIconPricesUpload: $('#footerIconPricesUpload'),
      footerIconPricesUrl: $('#footerIconPricesUrl'),
      footerIconCtaFile: $('#footerIconCtaFile'),
      footerIconCtaUpload: $('#footerIconCtaUpload'),
      footerIconCtaUrl: $('#footerIconCtaUrl'),
      footerIconInfoFile: $('#footerIconInfoFile'),
      footerIconInfoUpload: $('#footerIconInfoUpload'),
      footerIconInfoUrl: $('#footerIconInfoUrl'),
      footerIconContextFile: $('#footerIconContextFile'),
      footerIconContextUpload: $('#footerIconContextUpload'),
      footerIconContextUrl: $('#footerIconContextUrl'),
      phoneNumber: $('#phoneNumber'),
      whatsappNumber: $('#whatsappNumber'),
      companyEmail: $('#companyEmail'),
      irisPhone: $('#irisPhone')
    };

    const populate = () => {
      const C = state.CONFIG;
      if (fields.heroLogoUrl) fields.heroLogoUrl.value = C.heroLogoUrl || '';
      if (fields.heroHeadline) fields.heroHeadline.value = C.heroHeadline || '';
      if (fields.heroSubtext) fields.heroSubtext.value = C.heroSubtext || '';
      if (fields.footerHome) fields.footerHome.value = C.footerLabels?.home || '';
      if (fields.footerPrices) fields.footerPrices.value = C.footerLabels?.prices || '';
      if (fields.footerCta) fields.footerCta.value = C.footerLabels?.cta || '';
      if (fields.footerInfo) fields.footerInfo.value = C.footerLabels?.info || '';
      if (fields.footerContext) fields.footerContext.value = C.footerLabels?.context || '';
      if (fields.footerIconHomeUrl) fields.footerIconHomeUrl.value = C.footerIcons?.home || '';
      if (fields.footerIconPricesUrl) fields.footerIconPricesUrl.value = C.footerIcons?.prices || '';
      if (fields.footerIconCtaUrl) fields.footerIconCtaUrl.value = C.footerIcons?.cta || '';
      if (fields.footerIconInfoUrl) fields.footerIconInfoUrl.value = C.footerIcons?.info || '';
      if (fields.footerIconContextUrl) fields.footerIconContextUrl.value = C.footerIcons?.context || '';
      if (fields.phoneNumber) fields.phoneNumber.value = C.phoneNumber || '';
      if (fields.whatsappNumber) fields.whatsappNumber.value = C.whatsappNumber || '';
      if (fields.companyEmail) fields.companyEmail.value = C.companyEmail || '';
      if (fields.irisPhone) fields.irisPhone.value = C.irisPhone || '';

      const priceToggle = document.getElementById('showPriceToggle');
      if (priceToggle) priceToggle.checked = C.showPriceInMessage !== false;

      const ftEnabled = document.getElementById('flightTrackingEnabled');
      if (ftEnabled) ftEnabled.checked = C.flightTrackingEnabled !== false;
      const ftMins = document.getElementById('flightCheckMinsBefore');
      if (ftMins) ftMins.value = C.flightCheckMinsBefore || 25;

      const heroVideoToggle = document.getElementById('heroVideoEnabled');
      if (heroVideoToggle) heroVideoToggle.checked = C.heroVideoEnabled !== false;

      const wm = C.welcomeMetrics || {};
      const mlHotels = document.getElementById('metricLabelHotels');
      const mlRoutes = document.getElementById('metricLabelRoutes');
      const mlDest   = document.getElementById('metricLabelDestinations');
      const mlCats   = document.getElementById('metricLabelCategories');
      if (mlHotels) mlHotels.value = wm.hotels || '';
      if (mlRoutes) mlRoutes.value = wm.routes || '';
      if (mlDest)   mlDest.value   = wm.destinations || '';
      if (mlCats)   mlCats.value   = wm.categories || '';
    };

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        setStatus(status, '', '');
        const payload = {
          heroLogoUrl: fields.heroLogoUrl?.value || '',
          heroHeadline: fields.heroHeadline?.value || '',
          heroSubtext: fields.heroSubtext?.value || '',
          footerLabels: {
            home: fields.footerHome?.value || '',
            prices: fields.footerPrices?.value || '',
            cta: fields.footerCta?.value || '',
            info: fields.footerInfo?.value || '',
            context: fields.footerContext?.value || ''
          },
          footerIcons: {
            home: fields.footerIconHomeUrl?.value || '',
            prices: fields.footerIconPricesUrl?.value || '',
            cta: fields.footerIconCtaUrl?.value || '',
            info: fields.footerIconInfoUrl?.value || '',
            context: fields.footerIconContextUrl?.value || ''
          },
          phoneNumber: fields.phoneNumber?.value || '',
          whatsappNumber: fields.whatsappNumber?.value || '',
          companyEmail: fields.companyEmail?.value || '',
          irisPhone: fields.irisPhone?.value || '',
          heroVideoEnabled: document.getElementById('heroVideoEnabled')?.checked !== false,
          showPriceInMessage: document.getElementById('showPriceToggle')?.checked !== false,
          flightTrackingEnabled: document.getElementById('flightTrackingEnabled')?.checked !== false,
          flightCheckMinsBefore: parseInt(document.getElementById('flightCheckMinsBefore')?.value, 10) || 25,
          welcomeMetrics: {
            hotels:      document.getElementById('metricLabelHotels')?.value || '',
            routes:      document.getElementById('metricLabelRoutes')?.value || '',
            destinations: document.getElementById('metricLabelDestinations')?.value || '',
            categories:  document.getElementById('metricLabelCategories')?.value || ''
          }
        };
        const res = await api('/api/admin/moveathens/ui-config', 'POST', payload);
        if (!res) return;
        if (res.ok) {
          showToast('Αποθηκεύτηκε');
          setStatus(status, 'Saved', 'ok');
        } else {
          const err = await res.json().catch(() => ({}));
          setStatus(status, err.error || 'Σφάλμα', 'error');
        }
      });
    }

    // Upload handlers
    const uploadFile = async (endpoint, fileInput, fieldName, onSuccess) => {
      const file = fileInput?.files?.[0];
      if (!file) { showToast('Επίλεξε αρχείο'); return; }
      const fd = new FormData();
      fd.append(fieldName, file);
      const res = await fetch(endpoint, { method: 'POST', credentials: 'include', body: fd });
      if (res.status === 401 || res.status === 403) { authRedirect(); return; }
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        onSuccess(data.url);
        showToast('Upload OK');
      } else {
        showToast(data.error || 'Upload failed');
      }
    };

    fields.heroVideoUploadBtn?.addEventListener('click', () => {
      uploadFile('/api/admin/moveathens/upload-hero-video', fields.heroVideoFile, 'video', (url) => {
        state.CONFIG.heroVideoUrl = url;
        showToast('Video uploaded! URL: ' + url);
      });
    });

    fields.heroLogoUploadBtn?.addEventListener('click', () => {
      uploadFile('/api/admin/moveathens/upload-hero-logo', fields.heroLogoFile, 'logo', (url) => {
        if (fields.heroLogoUrl) fields.heroLogoUrl.value = url;
      });
    });

    ['Home', 'Prices', 'Cta', 'Info', 'Context'].forEach(key => {
      const uploadBtn = fields[`footerIcon${key}Upload`];
      const fileInput = fields[`footerIcon${key}File`];
      const urlField = fields[`footerIcon${key}Url`];
      const apiKey = key.toLowerCase();
      uploadBtn?.addEventListener('click', () => {
        uploadFile(`/api/admin/moveathens/upload-footer-icon?key=${apiKey}`, fileInput, 'icon', (url) => {
          if (urlField) urlField.value = url;
        });
      });
    });

    return { populate };
  };

  window.MaAdmin.initGeneralTab = initGeneralTab;
})();
