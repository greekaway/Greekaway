/**
 * MoveAthens Info Page
 * Loads and displays content from admin panel configuration
 * Supports multiple tabs: Transfers, Cancellation, Compliance, FAQ
 */
(async () => {
  'use strict';

  // Tab elements
  const tabs = document.querySelectorAll('.ma-info-tab');
  const panels = document.querySelectorAll('.ma-info-panel');

  // Simple markdown-like parser (same as admin preview)
  const parseContent = (text) => {
    if (!text) return '';
    // Escape HTML
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Bold: **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic: *text*
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Lists: lines starting with -
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    // Paragraphs: double newlines
    html = html.split(/\n\n+/).map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<ul>') || p.startsWith('<li>')) return p;
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('');
    
    return html;
  };

  // Tab switching
  const switchTab = (tabId) => {
    tabs.forEach(tab => {
      const isActive = tab.dataset.tab === tabId;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive);
    });
    panels.forEach(panel => {
      const isActive = panel.dataset.panel === tabId;
      panel.classList.toggle('active', isActive);
      panel.hidden = !isActive;
    });
  };

  // Add click handlers to tabs
  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Populate a section
  const populateSection = (key, titleEl, contentEl, title, content, defaultTitle) => {
    if (titleEl) {
      titleEl.textContent = title || defaultTitle;
    }
    if (contentEl) {
      if (content) {
        contentEl.innerHTML = parseContent(content);
      } else {
        contentEl.innerHTML = '<p class="ma-muted">Δεν υπάρχει διαθέσιμο περιεχόμενο σε αυτή την ενότητα.</p>';
      }
    }
  };

  try {
    // Load config via shared loader (avoids duplicate fetch)
    const cfg = await (window.MoveAthensConfig?.load
      ? window.MoveAthensConfig.load()
      : fetch('/api/moveathens/ui-config').then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load config'))));
    
    // Populate all sections
    populateSection(
      'transfers',
      document.getElementById('info-title-transfers'),
      document.getElementById('info-content-transfers'),
      cfg.infoPageTitle,
      cfg.infoPageContent,
      'Μεταφορές'
    );

    populateSection(
      'cancellation',
      document.getElementById('info-title-cancellation'),
      document.getElementById('info-content-cancellation'),
      cfg.infoCancellationTitle,
      cfg.infoCancellationContent,
      'Πολιτική Ακυρώσεων'
    );

    populateSection(
      'compliance',
      document.getElementById('info-title-compliance'),
      document.getElementById('info-content-compliance'),
      cfg.infoComplianceTitle,
      cfg.infoComplianceContent,
      'Κανόνες Επιβατών'
    );

    populateSection(
      'faq',
      document.getElementById('info-title-faq'),
      document.getElementById('info-content-faq'),
      cfg.infoFaqTitle,
      cfg.infoFaqContent,
      'Συχνές Ερωτήσεις'
    );

    // About Us — structured company info
    const aboutEl = document.getElementById('info-content-aboutus');
    if (aboutEl) {
      const fields = [
        { label: 'Επωνυμία', value: cfg.aboutUsCompanyName, cls: 'company' },
        { label: 'ΑΦΜ', value: cfg.aboutUsAfm },
        { label: 'ΔΟΥ', value: cfg.aboutUsDoy },
        { label: 'Δραστηριότητα', value: cfg.aboutUsActivity },
        { label: 'Επίσημη Έδρα', value: cfg.aboutUsAddress, multiline: true },
        { label: 'Νόμιμος Εκπρόσωπος', value: cfg.aboutUsManager },
        { label: 'Τηλέφωνο', value: cfg.aboutUsPhone, href: cfg.aboutUsPhone ? 'tel:' + cfg.aboutUsPhone.replace(/\s/g, '') : '' },
        { label: 'Email', value: cfg.aboutUsEmail, href: cfg.aboutUsEmail ? 'mailto:' + cfg.aboutUsEmail : '' },
        { label: 'Website', value: cfg.aboutUsWebsite, href: cfg.aboutUsWebsite || '' }
      ];
      const hasAny = fields.some(f => f.value);
      if (hasAny) {
        let html = '<dl class="ma-aboutus-list">';
        fields.forEach(f => {
          if (!f.value) return;
          const escaped = f.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const display = f.multiline ? escaped.replace(/\n/g, '<br>') : escaped;
          const val = f.href
            ? `<a href="${f.href.replace(/"/g, '&quot;')}" target="_blank" rel="noopener">${display}</a>`
            : display;
          html += `<div class="ma-aboutus-row${f.cls ? ' ma-aboutus-row--' + f.cls : ''}">`;
          html += `<dt>${f.label}</dt><dd>${val}</dd></div>`;
        });
        html += '</dl>';
        aboutEl.innerHTML = html;
      } else {
        aboutEl.innerHTML = '<p class="ma-muted">Δεν υπάρχουν διαθέσιμα εταιρικά στοιχεία.</p>';
      }
    }

  } catch (err) {
    console.error('Info page error:', err);
    // Show error in all panels
    panels.forEach(panel => {
      const content = panel.querySelector('.ma-info-content');
      if (content) {
        content.innerHTML = '<p class="ma-muted">Σφάλμα φόρτωσης περιεχομένου.</p>';
      }
    });
  }
})();
