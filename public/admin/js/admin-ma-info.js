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
      updatePreview();
    };

    const allInputs = [
      titleInput, contentInput,
      cancellationTitleInput, cancellationContentInput,
      complianceTitleInput, complianceContentInput,
      faqTitleInput, faqContentInput
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
          infoFaqContent: faqContentInput?.value || ''
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
