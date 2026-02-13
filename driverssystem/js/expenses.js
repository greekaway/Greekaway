/**
 * DriversSystem — Expenses Page (redirect stub)
 * Old multi-category expense UI removed.
 * This page now redirects the user to the new Car Expenses system.
 */
(async () => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  // ── Config ──
  const cfg = await window.DriversSystemConfig.load();
  const logo = $('[data-ds-hero-logo]');
  if (logo && cfg.heroLogoUrl) { logo.src = cfg.heroLogoUrl; logo.style.display = 'block'; }
  const homeLink = $('[data-ds-home-link]');
  if (homeLink) homeLink.href = window.DriversSystemConfig.buildRoute('/');

  // ── Set redirect link ──
  const carLink = $('[data-ds-car-exp-link]');
  if (carLink) carLink.href = window.DriversSystemConfig.buildRoute('/car-expenses');

})();
