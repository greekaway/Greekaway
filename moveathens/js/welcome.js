(async () => {
  const cfg = await window.MoveAthensConfig.load();
  await window.MoveAthensConfig.applyHero(document, cfg);
  window.MoveAthensConfig.applyPageTitles(document, cfg);
  window.MoveAthensConfig.applyContactInfo(document, cfg);
  window.MoveAthensConfig.applyHotelLabels(document, cfg);
})();
