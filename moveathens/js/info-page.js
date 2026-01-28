/**
 * MoveAthens Info Page
 * Loads and displays content from admin panel configuration
 */
(async () => {
  'use strict';

  const titleEl = document.getElementById('info-title');
  const contentEl = document.getElementById('info-content');

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

  try {
    // Load config from API
    const res = await fetch('/api/moveathens/ui-config');
    if (!res.ok) throw new Error('Failed to load config');
    
    const cfg = await res.json();
    
    // Set title
    if (titleEl) {
      titleEl.textContent = cfg.infoPageTitle || 'Πληροφορίες';
    }
    
    // Set content
    if (contentEl) {
      const content = cfg.infoPageContent || '';
      if (content) {
        contentEl.innerHTML = parseContent(content);
      } else {
        contentEl.innerHTML = '<p class="ma-muted">Δεν υπάρχει διαθέσιμο περιεχόμενο.</p>';
      }
    }
  } catch (err) {
    console.error('Info page error:', err);
    if (contentEl) {
      contentEl.innerHTML = '<p class="ma-muted">Σφάλμα φόρτωσης περιεχομένου.</p>';
    }
  }
})();
