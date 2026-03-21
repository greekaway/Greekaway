/**
 * MoveAthens Hotel Settings — Client-side logic
 * Theme toggle (auto/light/dark)
 * All settings stored in localStorage (per-user, no backend needed)
 */
(() => {
  const THEME_KEY = 'ma_theme_preference';

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

  // Clean up any leftover scale preference from previous version
  localStorage.removeItem('ma_tile_scale');
})();
