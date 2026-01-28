(async () => {
  const cfg = await window.MoveAthensConfig.load();
  const root = document.getElementById('maVehicleTypes');
  if (!root) return;
  const list = Array.isArray(cfg.vehicleTypes) ? cfg.vehicleTypes : [];
  const active = list.filter((item) => item && item.is_active !== false);
  if (!active.length) return;

  const title = document.createElement('h2');
  title.className = 'ma-vehicle-types__title';
  title.textContent = 'Τύποι Οχήματος';

  const grid = document.createElement('div');
  grid.className = 'ma-vehicle-types__grid';

  active.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'ma-vehicle-card';

    if (item.imageUrl) {
      const img = document.createElement('img');
      img.className = 'ma-vehicle-card__image';
      img.src = item.imageUrl;
      img.alt = item.name || '';
      card.appendChild(img);
    }

    const name = document.createElement('div');
    name.className = 'ma-vehicle-card__name';
    name.textContent = item.name || '';
    card.appendChild(name);

    if (item.description) {
      const desc = document.createElement('div');
      desc.className = 'ma-vehicle-card__desc';
      desc.textContent = item.description;
      card.appendChild(desc);
    }

    grid.appendChild(card);
  });

  root.appendChild(title);
  root.appendChild(grid);
})();
