/**
 * MoveAthens Admin — Info Page Tab
 * Depends on: admin-ma-helpers.js (window.MaAdmin)
 */
(() => {
  'use strict';
  const { $, showToast, setStatus, state, api } = window.MaAdmin;

  const initInfoPageTab = () => {
    const form = $('#ma-infopage-form');
    const titleInput = $('#maInfoPageTitle');
    const contentInput = $('#maInfoPageContent');
    const cancellationTitleInput = $('#maInfoCancellationTitle');
    const cancellationContentInput = $('#maInfoCancellationContent');
    const complianceTitleInput = $('#maInfoComplianceTitle');
    const complianceContentInput = $('#maInfoComplianceContent');
    const faqTitleInput = $('#maInfoFaqTitle');
    const faqContentInput = $('#maInfoFaqContent');
    const aboutCompanyName = $('#maAboutUsCompanyName');
    const aboutAfm = $('#maAboutUsAfm');
    const aboutDoy = $('#maAboutUsDoy');
    const aboutActivity = $('#maAboutUsActivity');
    const aboutAddress = $('#maAboutUsAddress');
    const aboutManager = $('#maAboutUsManager');
    const aboutPhone = $('#maAboutUsPhone');
    const aboutEmail = $('#maAboutUsEmail');
    const aboutWebsite = $('#maAboutUsWebsite');
    const saveBtn = $('#maInfoPageSaveBtn');
    const status = $('#maInfoPageStatus');
    const preview = $('#maInfoPagePreview');

    const parseContent = (text) => {
      if (!text) return '';
      let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
      html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
      html = html.split(/\n\n+/).map(p => {
        p = p.trim();
        if (!p) return '';
        if (p.startsWith('<ul>') || p.startsWith('<li>')) return p;
        return `<p>${p.replace(/\n/g, '<br>')}</p>`;
      }).join('');
      return html;
    };

    const renderSection = (title, content, icon) => {
      if (!title && !content) return '';
      let html = '<div class="ma-preview-section-divider"></div>';
      if (title) {
        html += `<h3>${icon ? icon + ' ' : ''}${title.replace(/</g,'&lt;')}</h3>`;
      }
      html += parseContent(content);
      return html;
    };

    const updatePreview = () => {
      if (preview) {
        let html = '';
        const title1 = titleInput?.value || '';
        const content1 = contentInput?.value || '';
        if (title1 || content1) {
          if (title1) html += `<h3>📍 ${title1.replace(/</g,'&lt;')}</h3>`;
          html += parseContent(content1);
        }
        html += renderSection(cancellationTitleInput?.value, cancellationContentInput?.value, '🚫');
        html += renderSection(complianceTitleInput?.value, complianceContentInput?.value, '📋');
        html += renderSection(faqTitleInput?.value, faqContentInput?.value, '❓');

        // About Us preview
        const aboutFields = [
          { label: 'Επωνυμία', val: aboutCompanyName?.value },
          { label: 'ΑΦΜ', val: aboutAfm?.value },
          { label: 'ΔΟΥ', val: aboutDoy?.value },
          { label: 'Δραστηριότητα', val: aboutActivity?.value },
          { label: 'Επίσημη Έδρα', val: aboutAddress?.value },
          { label: 'Νόμιμος Εκπρόσωπος', val: aboutManager?.value },
          { label: 'Τηλέφωνο', val: aboutPhone?.value },
          { label: 'Email', val: aboutEmail?.value },
          { label: 'Website', val: aboutWebsite?.value }
        ];
        const hasAbout = aboutFields.some(f => f.val);
        if (hasAbout) {
          html += '<div class="ma-preview-section-divider"></div>';
          html += '<h3>🏢 About Us</h3>';
          aboutFields.forEach(f => {
            if (f.val) {
              const escaped = f.val.replace(/</g, '&lt;').replace(/\n/g, '<br>');
              html += `<p><strong>${f.label}:</strong> ${escaped}</p>`;
            }
          });
        }

        preview.innerHTML = html || '<span style="color:#999;">Η προεπισκόπηση θα εμφανιστεί εδώ...</span>';
      }
    };

    const populate = () => {
      const C = state.CONFIG;
      if (titleInput) titleInput.value = C.infoPageTitle || '';
      if (contentInput) contentInput.value = C.infoPageContent || '';
      if (cancellationTitleInput) cancellationTitleInput.value = C.infoCancellationTitle || '';
      if (cancellationContentInput) cancellationContentInput.value = C.infoCancellationContent || '';
      if (complianceTitleInput) complianceTitleInput.value = C.infoComplianceTitle || '';
      if (complianceContentInput) complianceContentInput.value = C.infoComplianceContent || '';
      if (faqTitleInput) faqTitleInput.value = C.infoFaqTitle || '';
      if (faqContentInput) faqContentInput.value = C.infoFaqContent || '';
      if (aboutCompanyName) aboutCompanyName.value = C.aboutUsCompanyName || '';
      if (aboutAfm) aboutAfm.value = C.aboutUsAfm || '';
      if (aboutDoy) aboutDoy.value = C.aboutUsDoy || '';
      if (aboutActivity) aboutActivity.value = C.aboutUsActivity || '';
      if (aboutAddress) aboutAddress.value = C.aboutUsAddress || '';
      if (aboutManager) aboutManager.value = C.aboutUsManager || '';
      if (aboutPhone) aboutPhone.value = C.aboutUsPhone || '';
      if (aboutEmail) aboutEmail.value = C.aboutUsEmail || '';
      if (aboutWebsite) aboutWebsite.value = C.aboutUsWebsite || '';
      updatePreview();
    };

    const allInputs = [
      titleInput, contentInput,
      cancellationTitleInput, cancellationContentInput,
      complianceTitleInput, complianceContentInput,
      faqTitleInput, faqContentInput,
      aboutCompanyName, aboutAfm, aboutDoy, aboutActivity,
      aboutAddress, aboutManager, aboutPhone, aboutEmail, aboutWebsite
    ];
    allInputs.forEach(input => {
      if (input) input.addEventListener('input', updatePreview);
    });

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        setStatus(status, 'Αποθήκευση...', '');

        const payload = {
          infoPageTitle: titleInput?.value || '',
          infoPageContent: contentInput?.value || '',
          infoCancellationTitle: cancellationTitleInput?.value || '',
          infoCancellationContent: cancellationContentInput?.value || '',
          infoComplianceTitle: complianceTitleInput?.value || '',
          infoComplianceContent: complianceContentInput?.value || '',
          infoFaqTitle: faqTitleInput?.value || '',
          infoFaqContent: faqContentInput?.value || '',
          aboutUsCompanyName: aboutCompanyName?.value || '',
          aboutUsAfm: aboutAfm?.value || '',
          aboutUsDoy: aboutDoy?.value || '',
          aboutUsActivity: aboutActivity?.value || '',
          aboutUsAddress: aboutAddress?.value || '',
          aboutUsManager: aboutManager?.value || '',
          aboutUsPhone: aboutPhone?.value || '',
          aboutUsEmail: aboutEmail?.value || '',
          aboutUsWebsite: aboutWebsite?.value || ''
        };

        const res = await api('/api/admin/moveathens/ui-config', 'PUT', payload);
        if (!res) return;

        if (res.ok) {
          const data = await res.json();
          Object.assign(state.CONFIG, data);
          showToast('Αποθηκεύτηκε!');
          setStatus(status, '✓ Αποθηκεύτηκε', 'ok');
        } else {
          const err = await res.json().catch(() => ({}));
          setStatus(status, err.error || 'Σφάλμα', 'error');
        }
      });
    }

    return { populate };
  };

  window.MaAdmin.initInfoPageTab = initInfoPageTab;
})();
