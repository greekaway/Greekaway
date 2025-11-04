/* Admin Theme Toggle controller
   - Injects a fixed circular button top-right
   - Persists preference in localStorage (key: themeMode)
   - Default: dark
*/
(function(){
  const STORAGE_KEY = 'themeMode';
  const DEFAULT_MODE = 'dark';

  function getSavedMode(){
    try { const m = localStorage.getItem(STORAGE_KEY); return (m==='light'||m==='dark')? m : null; } catch(_) { return null; }
  }
  function saveMode(mode){ try { localStorage.setItem(STORAGE_KEY, mode); } catch(_){} }
  function applyMode(mode){
    const doc = document.documentElement;
    doc.setAttribute('data-theme', mode);
    const btn = document.getElementById('ga-theme-toggle');
    if (btn){
      const icon = btn.querySelector('.icon');
      if (icon) icon.textContent = (mode==='light' ? '☀️' : '🌙');
      btn.setAttribute('aria-label', mode==='light' ? 'Switch to night mode' : 'Switch to day mode');
      btn.setAttribute('title', mode==='light' ? 'Day mode' : 'Night mode');
      btn.setAttribute('data-mode', mode);
    }
  }

  function ensureButton(){
    let btn = document.getElementById('ga-theme-toggle');
    if (btn) return btn;
    btn = document.createElement('button');
    btn.id = 'ga-theme-toggle';
    btn.className = 'theme-toggle-btn';
    btn.type = 'button';
    btn.innerHTML = '<span class="icon" aria-hidden="true">🌙</span>';
    btn.setAttribute('aria-label', 'Switch theme');
    btn.setAttribute('title', 'Night mode');
    btn.addEventListener('click', () => {
      const curr = document.documentElement.getAttribute('data-theme') || DEFAULT_MODE;
      const next = (curr === 'light') ? 'dark' : 'light';
      applyMode(next);
      saveMode(next);
    });
    document.body.appendChild(btn);
    return btn;
  }

  function init(){
    const initial = getSavedMode() || DEFAULT_MODE;
    // Ensure attribute before painting button
    applyMode(initial);
    ensureButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
