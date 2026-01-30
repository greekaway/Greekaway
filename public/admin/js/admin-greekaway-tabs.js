/**
 * Greekaway Admin Header Tabs
 * Adds navigation tabs to Greekaway admin pages (like MoveAthens has)
 */
(function() {
  'use strict';

  const currentPath = window.location.pathname;

  // Greekaway pages with their labels
  const greekawayPages = [
    { href: '/admin-bookings.html', label: 'Κρατήσεις' },
    { href: '/admin-payments.html', label: 'Αυτόματες Πληρωμές' },
    { href: '/admin-manual.html', label: 'Χειροκίνητες Πληρωμές' },
    { href: '/admin-providers.html', label: 'Συνεργάτες' },
    { href: '/admin-availability.html', label: 'Διαθεσιμότητα' },
    { href: '/admin/trip-availability.html', label: 'Διαθ. Ταξιδιών' },
    { href: '/admin-trips.html', label: 'Ταξίδια' },
    { href: '/admin/categories.html', label: 'Κατηγορίες' }
  ];

  function isCurrentPage(href) {
    const hrefClean = href.replace('.html', '');
    return currentPath.includes(hrefClean);
  }

  function createHeaderRow() {
    // Create a consistent header row with title + tabs
    const row = document.createElement('div');
    row.className = 'greekaway-header-row';
    
    const title = document.createElement('div');
    title.className = 'greekaway-header-title';
    title.textContent = 'Greekaway';
    row.appendChild(title);

    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'bar-tabs greekaway-nav-tabs';
    
    greekawayPages.forEach(page => {
      const link = document.createElement('a');
      link.href = page.href;
      link.className = 'bar-tab' + (isCurrentPage(page.href) ? ' active' : '');
      link.textContent = page.label;
      tabsContainer.appendChild(link);
    });

    row.appendChild(tabsContainer);
    return row;
  }

  function init() {
    // Only run on Greekaway pages (not MoveAthens, not Home)
    if (currentPath.includes('moveathens') || currentPath.includes('admin-home')) {
      return;
    }

    // Find the header
    const header = document.querySelector('header.sticky-bar');
    if (!header) return;

    // Create header row and insert at the beginning of header
    const headerRow = createHeaderRow();
    header.insertBefore(headerRow, header.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
