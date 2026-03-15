/**
 * MoveAthens Admin — Media Links (per destination)
 * Depends on: admin-ma-helpers.js (window.MaAdmin)
 * Three platforms: instagram, tiktok, youtube
 * Data stored as JSON string in destination.media_links
 * Supports: individual add per platform + bulk paste (auto-detect platform)
 */
(() => {
  'use strict';
  const { $ } = window.MaAdmin;

  const PLATFORMS = ['instagram', 'tiktok', 'youtube'];

  /** Detect platform from URL */
  const detectPlatform = (url) => {
    if (!url) return null;
    const lower = url.toLowerCase();
    if (lower.includes('instagram.com')) return 'instagram';
    if (lower.includes('tiktok.com')) return 'tiktok';
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
    return null;
  };

  /** Parse media_links JSON string → { instagram:[], tiktok:[], youtube:[] } */
  const parseMediaLinks = (raw) => {
    const empty = { instagram: [], tiktok: [], youtube: [] };
    if (!raw) return empty;
    try {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      PLATFORMS.forEach(p => { if (!Array.isArray(obj[p])) obj[p] = []; });
      return obj;
    } catch { return empty; }
  };

  /** Serialize media object → JSON string */
  const serializeMediaLinks = (obj) => {
    const clean = {};
    PLATFORMS.forEach(p => {
      const items = (obj[p] || []).filter(i => i && i.url);
      if (items.length) clean[p] = items;
    });
    return Object.keys(clean).length ? JSON.stringify(clean) : '';
  };

  /** Generate unique id */
  const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  /** Render one media item row */
  const renderItem = (item, platform, onRemove) => {
    const row = document.createElement('div');
    row.className = 'ma-media-item';
    // Show a short display: title or truncated URL
    const displayUrl = item.url.length > 55 ? item.url.slice(0, 52) + '…' : item.url;
    const displayText = item.title || displayUrl;
    row.innerHTML = `
      <span class="ma-media-item-title" title="${item.url}">${displayText}</span>
      <button type="button" class="ma-media-item-remove" aria-label="Αφαίρεση">✕</button>
    `;
    row.querySelector('.ma-media-item-remove').addEventListener('click', () => {
      onRemove(item.id);
    });
    return row;
  };

  /** Render all items for a platform */
  const renderPlatformList = (listEl, items, platform, onChange) => {
    listEl.innerHTML = '';
    items.forEach(item => {
      listEl.appendChild(renderItem(item, platform, (removeId) => {
        onChange(platform, items.filter(i => i.id !== removeId));
      }));
    });
  };

  /** Show prompt for new link (URL + optional title) */
  const promptNewLink = (platform, callback) => {
    const overlay = document.createElement('div');
    overlay.className = 'ma-media-prompt-overlay';
    overlay.innerHTML = `
      <div class="ma-media-prompt">
        <h4>Νέο ${platform} link</h4>
        <label>URL <input class="input ma-mp-url" type="url" placeholder="https://..." required></label>
        <label>Τίτλος (προαιρετικό) <input class="input ma-mp-title" type="text" placeholder="π.χ. Beach party sunset" maxlength="100"></label>
        <div class="ma-media-prompt-actions">
          <button type="button" class="btn ma-mp-ok">Προσθήκη</button>
          <button type="button" class="btn secondary ma-mp-cancel">Ακύρωση</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const urlInput = overlay.querySelector('.ma-mp-url');
    const titleInput = overlay.querySelector('.ma-mp-title');
    urlInput.focus();

    const close = () => overlay.remove();

    overlay.querySelector('.ma-mp-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('.ma-mp-ok').addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (!url) { urlInput.focus(); return; }
      const title = titleInput.value.trim() || '';
      close();
      callback({ id: uid(platform.slice(0, 2)), url, title });
    });
  };

  /** Show bulk paste overlay — user pastes multiple URLs, system auto-detects platform */
  const promptBulkPaste = (callback) => {
    const overlay = document.createElement('div');
    overlay.className = 'ma-media-prompt-overlay';
    overlay.innerHTML = `
      <div class="ma-media-prompt ma-media-prompt--bulk">
        <h4>📋 Μαζική Προσθήκη Links</h4>
        <small style="color:#9ca3af">Κάντε paste πολλά links (ένα ανά γραμμή). Η πλατφόρμα αναγνωρίζεται αυτόματα.</small>
        <textarea class="input ma-mp-bulk" rows="8" placeholder="https://youtube.com/shorts/...\nhttps://www.tiktok.com/@.../video/...\nhttps://www.instagram.com/reel/..."></textarea>
        <div class="ma-mp-preview" hidden></div>
        <div class="ma-media-prompt-actions">
          <button type="button" class="btn ma-mp-ok">Προσθήκη</button>
          <button type="button" class="btn secondary ma-mp-cancel">Ακύρωση</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const textarea = overlay.querySelector('.ma-mp-bulk');
    const preview = overlay.querySelector('.ma-mp-preview');
    textarea.focus();

    const close = () => overlay.remove();

    // Live preview: show count per platform as user types/pastes
    const updatePreview = () => {
      const lines = textarea.value.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.startsWith('http'));
      if (!lines.length) { preview.hidden = true; return; }
      const counts = { instagram: 0, tiktok: 0, youtube: 0, unknown: 0 };
      lines.forEach(url => {
        const p = detectPlatform(url);
        if (p) counts[p]++; else counts.unknown++;
      });
      const parts = [];
      if (counts.instagram) parts.push(`📸 ${counts.instagram} Instagram`);
      if (counts.tiktok) parts.push(`🎵 ${counts.tiktok} TikTok`);
      if (counts.youtube) parts.push(`▶️ ${counts.youtube} YouTube`);
      if (counts.unknown) parts.push(`⚠️ ${counts.unknown} μη αναγνωρίσιμα`);
      preview.textContent = parts.join('  •  ');
      preview.hidden = false;
    };

    textarea.addEventListener('input', updatePreview);
    textarea.addEventListener('paste', () => setTimeout(updatePreview, 50));

    overlay.querySelector('.ma-mp-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('.ma-mp-ok').addEventListener('click', () => {
      const lines = textarea.value.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.startsWith('http'));
      const items = [];
      lines.forEach(url => {
        const platform = detectPlatform(url);
        if (platform) {
          items.push({ platform, item: { id: uid(platform.slice(0, 2)), url, title: '' } });
        }
      });
      close();
      if (items.length) callback(items);
    });
  };

  /**
   * Initialize media links UI for the destination form.
   * Returns { get, set, reset } methods.
   */
  const initMediaLinksUI = () => {
    const wrap = $('#maDestMediaWrap');
    if (!wrap) return { get: () => '', set: () => {}, reset: () => {} };

    let data = parseMediaLinks('');

    const refresh = () => {
      PLATFORMS.forEach(p => {
        const section = wrap.querySelector(`.ma-media-section[data-platform="${p}"]`);
        if (!section) return;
        const listEl = section.querySelector('.ma-media-list');
        renderPlatformList(listEl, data[p] || [], p, (platform, updated) => {
          data[platform] = updated;
          refresh();
        });
      });
    };

    // Wire up individual Add buttons (per platform)
    PLATFORMS.forEach(p => {
      const section = wrap.querySelector(`.ma-media-section[data-platform="${p}"]`);
      if (!section) return;
      section.querySelector('.ma-media-add-btn')?.addEventListener('click', () => {
        promptNewLink(p, (item) => {
          if (!data[p]) data[p] = [];
          data[p].push(item);
          refresh();
        });
      });
    });

    // Wire up Bulk Paste button
    wrap.querySelector('.ma-media-bulk-btn')?.addEventListener('click', () => {
      promptBulkPaste((items) => {
        items.forEach(({ platform, item }) => {
          if (!data[platform]) data[platform] = [];
          data[platform].push(item);
        });
        refresh();
      });
    });

    return {
      /** Get serialized JSON string */
      get: () => serializeMediaLinks(data),
      /** Set from raw JSON string (e.g. when editing) */
      set: (raw) => { data = parseMediaLinks(raw); refresh(); },
      /** Clear all */
      reset: () => { data = parseMediaLinks(''); refresh(); }
    };
  };

  // Export for use by admin-ma-destinations.js
  window.MaAdmin.mediaLinks = { initMediaLinksUI, parseMediaLinks, serializeMediaLinks };
})();
