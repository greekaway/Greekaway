/**
 * Admin Footer - Navigation
 * Home | Greekaway | MoveAthens | Πάνελ Οδηγών | DriversSystem
 */
(function() {
  'use strict';

  const currentPath = window.location.pathname;

  // Detect which section we're in
  const isDriverPanelPage = currentPath.includes('driver-panel');
  const isDriversSystemPage = currentPath.includes('driverssystem');
  const isMoveathensPage = currentPath.includes('moveathens') && !isDriversSystemPage && !isDriverPanelPage;
  const isHomePage = currentPath.includes('admin-home');
  const isGreekawayPage = !isHomePage && !isMoveathensPage && !isDriversSystemPage && !isDriverPanelPage;

  // Default landing pages for each project
  const greekawayDefault = '/admin-bookings.html';
  const moveathensDefault = '/admin/moveathens-ui';
  const driverPanelDefault = '/admin/driver-panel';
  const driverssystemDefault = '/admin/driverssystem-ui';

  function createFooter() {
    // Create the simple bottom-nav (same as original)
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.innerHTML = `
      <a href="/admin-home.html"${isHomePage ? ' class="active"' : ''}>Home</a>
      <a href="${greekawayDefault}"${isGreekawayPage ? ' class="active"' : ''}>Greekaway</a>
      <a href="${moveathensDefault}"${isMoveathensPage ? ' class="active"' : ''}>MoveAthens</a>
      <a href="${driverPanelDefault}"${isDriverPanelPage ? ' class="active"' : ''}>🚗 Οδηγοί</a>
      <a href="${driverssystemDefault}"${isDriversSystemPage ? ' class="active"' : ''}>DriversSystem</a>
    `;

    // Create version footer
    const footer = document.createElement('footer');
    footer.className = 'version';
    footer.innerHTML = `Greekaway Admin • v<span id="ga-version">—</span>`;

    return { nav, footer };
  }

  function init() {
    // Remove any existing nav/footer
    const existingNav = document.querySelector('.bottom-nav');
    const existingFooter = document.querySelector('footer.version');
    if (existingNav) existingNav.remove();
    if (existingFooter) existingFooter.remove();

    // Add new footer elements
    const { nav, footer } = createFooter();
    document.body.appendChild(nav);
    document.body.appendChild(footer);

    // Version fetch
    fetch('/version.json')
      .then(r => r.ok ? r.json() : null)
      .then(v => {
        if (v && v.version) {
          const el = document.getElementById('ga-version');
          if (el) el.textContent = v.version;
        }
      })
      .catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
