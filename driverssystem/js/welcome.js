(async () => {
  const cfg = await window.DriversSystemConfig.load();
  await window.DriversSystemConfig.applyHero(document, cfg);
  window.DriversSystemConfig.applyPageTitles(document, cfg);
  window.DriversSystemConfig.applyContactInfo(document, cfg);
  window.DriversSystemConfig.applyFinancials(document, cfg);
})();
