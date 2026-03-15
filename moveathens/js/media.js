/**
 * MoveAthens — Media Gallery Page
 * Reads dest= query param, fetches destination media_links, renders gallery
 */
(() => {
  'use strict';

  const PLATFORMS = ['instagram', 'tiktok', 'youtube'];
  const PLATFORM_LABELS = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' };
  const PLATFORM_ICONS = { instagram: '📸', tiktok: '🎵', youtube: '▶️' };

  const params = new URLSearchParams(window.location.search);
  const destId = params.get('dest');

  const destNameEl = document.getElementById('media-dest-name');
  const platformsEl = document.getElementById('media-platforms');
  const emptyEl = document.getElementById('media-empty');
  const backBtn = document.getElementById('media-back-btn');

  // Back button → go to the transfer page
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = (window.MoveAthensConfig?.buildRoute || (p => p))('/transfer');
      }
    });
  }

  const parseMediaLinks = (raw) => {
    if (!raw) return null;
    try {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const hasAny = PLATFORMS.some(p => Array.isArray(obj[p]) && obj[p].length > 0);
      return hasAny ? obj : null;
    } catch { return null; }
  };

  const PLATFORM_BADGE_ICONS = { instagram: '📸', tiktok: '♪', youtube: '▶' };

  const renderCard = (item, platform) => {
    const a = document.createElement('a');
    a.className = 'ma-media-card';
    a.href = item.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    a.innerHTML = `
      <div class="ma-media-card-thumb ma-media-card-thumb--${platform}">
        <span class="ma-media-card-badge ma-media-card-badge--${platform}">${PLATFORM_BADGE_ICONS[platform]}</span>
        <span class="ma-media-card-play">▶</span>
      </div>
      <div class="ma-media-card-info">
        <span class="ma-media-card-title">${item.title || PLATFORM_LABELS[platform] + ' Video'}</span>
      </div>
    `;
    return a;
  };

  const renderPlatformSection = (platform, items) => {
    const section = document.createElement('div');
    section.className = 'ma-media-platform';

    section.innerHTML = `
      <div class="ma-media-platform-title">
        <span class="ma-media-platform-icon ma-media-platform-icon--${platform}">${PLATFORM_ICONS[platform]}</span>
        ${PLATFORM_LABELS[platform]}
      </div>
    `;

    const grid = document.createElement('div');
    grid.className = 'ma-media-grid';
    items.forEach(item => grid.appendChild(renderCard(item, platform)));
    section.appendChild(grid);

    return section;
  };

  const init = async () => {
    if (!destId) {
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    try {
      // Use shared config loader (from moveathens-config.js)
      const config = await window.MoveAthensConfig.load();
      const destinations = config.destinations || [];
      const dest = destinations.find(d => d.id === destId);

      if (!dest) {
        if (emptyEl) { emptyEl.textContent = 'Ο προορισμός δεν βρέθηκε.'; emptyEl.hidden = false; }
        return;
      }

      // Set destination name
      if (destNameEl) destNameEl.textContent = dest.name || '';

      // Parse media links
      const media = parseMediaLinks(dest.media_links);
      if (!media) {
        if (emptyEl) emptyEl.hidden = false;
        return;
      }

      // Render platform sections (only those with links)
      let hasContent = false;
      PLATFORMS.forEach(p => {
        if (Array.isArray(media[p]) && media[p].length > 0) {
          platformsEl.appendChild(renderPlatformSection(p, media[p]));
          hasContent = true;
        }
      });

      if (!hasContent && emptyEl) emptyEl.hidden = false;
    } catch (err) {
      console.error('[media] Init error:', err);
      if (emptyEl) { emptyEl.textContent = 'Σφάλμα φόρτωσης.'; emptyEl.hidden = false; }
    }
  };

  init();
})();
