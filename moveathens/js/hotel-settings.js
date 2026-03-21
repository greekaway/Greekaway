/**
 * MoveAthens Hotel Settings — Client-side logic
 * Theme toggle (auto/light/dark) + Tile scale preference
 * All settings stored in localStorage (per-user, no backend needed)
 */
(() => {
  const THEME_KEY = 'ma_theme_preference';
  const SCALE_KEY = 'ma_tile_scale';

  // ── Theme logic ──
  const currentTheme = localStorage.getItem(THEME_KEY) || 'auto';

  function applyTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
    const html = document.documentElement;

    // Remove any forced class
    html.classList.remove('ma-force-light', 'ma-force-dark');

    if (theme === 'light') {
      html.classList.add('ma-force-light');
    } else if (theme === 'dark') {
      html.classList.add('ma-force-dark');
    }
    // 'auto' = no forced class, CSS media query handles it
  }

  // Apply stored preference on load
  applyTheme(currentTheme);

  // Theme buttons
  const themeSelector = document.getElementById('theme-selector');
  if (themeSelector) {
    const btns = themeSelector.querySelectorAll('.ma-theme-btn');

    // Highlight active
    btns.forEach(btn => {
      if (btn.dataset.theme === currentTheme) btn.classList.add('active');
    });

    themeSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.ma-theme-btn');
      if (!btn) return;
      const theme = btn.dataset.theme;
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyTheme(theme);
    });
  }

  // ── Tile Scale logic ──
  const currentScale = localStorage.getItem(SCALE_KEY) || '1';
  const scaleSelector = document.getElementById('scale-selector');
  const previewCard = document.getElementById('scale-preview-card');

  function applyScalePreview(scale) {
    if (previewCard) {
      previewCard.style.transform = `scale(${scale})`;
    }
  }

  applyScalePreview(currentScale);

  if (scaleSelector) {
    const btns = scaleSelector.querySelectorAll('.ma-scale-btn');

    // Highlight active
    btns.forEach(btn => {
      if (btn.dataset.scale === currentScale) btn.classList.add('active');
    });

    scaleSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.ma-scale-btn');
      if (!btn) return;
      const scale = btn.dataset.scale;
      localStorage.setItem(SCALE_KEY, scale);
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyScalePreview(scale);
    });
  }
})();
