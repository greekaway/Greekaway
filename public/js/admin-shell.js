// Shared admin shell: highlight active link + optional dashboard counters
(function(){
  function findSidebar(){
    const selectors = [
      'aside.admin-sidebar nav',
      'nav[aria-label="Admin Sidebar"]',
      'nav.admin-sidebar',
      '#adminSidebar nav',
      '#adminSidebar',
      '.admin-shell .sidebar nav',
      '.sidebar nav',
      '.admin-side nav',
      '.side-nav',
      '.admin-menu nav',
      '.admin-menu',
      'nav.admin-nav' // fallback
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }
  function ensureCoreLinks(){
    // Set labels strictly by href (EN); do not insert or reorder elements
    try {
      const cat = document.querySelector('a[href="/admin/categories.html"]');
      const trips = document.querySelector('a[href="/admin-trips.html"]');
      if (cat) cat.textContent = 'Categories';
      if (trips) trips.textContent = 'Trips';
    } catch(_) { /* silent */ }
  }
  function markActive(){
    const path = location.pathname;
    const container = findSidebar();
    const links = container ? container.querySelectorAll('a[href]') : document.querySelectorAll('nav.admin-nav a');
    links.forEach(a=>{
      if (a.getAttribute('href') && path.endsWith(a.getAttribute('href'))) a.classList.add('active');
    });
  }
  async function loadDashboardCounts(){
    const catsEl = document.getElementById('count-categories');
    const tripsEl = document.getElementById('count-trips');
    if (!catsEl || !tripsEl) return; // not dashboard
    try {
      const [catsResp,tripsResp] = await Promise.all([
        fetch('/api/admin/categories', { cache:'no-store', credentials:'same-origin' }),
        fetch('/api/admin/trips', { cache:'no-store', credentials:'same-origin' })
      ]);
      const cats = catsResp.ok? await catsResp.json():[];
      const trips = tripsResp.ok? await tripsResp.json():[];
      const publishedCats = Array.isArray(cats) ? cats.filter(c => c && c.published) : [];
      catsEl.textContent = publishedCats.length;
      tripsEl.textContent = Array.isArray(trips) ? trips.length : 0;
    } catch(e){ catsEl.textContent='—'; tripsEl.textContent='—'; }
  }
  document.addEventListener('DOMContentLoaded',()=>{ ensureCoreLinks(); markActive(); loadDashboardCounts(); });
})();
