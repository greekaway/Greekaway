// Choose Experience Type card renderer (shared on trip.html)
(function () {
  const MODE_ORDER = ['van', 'mercedes', 'bus'];
  const MODE_LABELS = {
    van: 'Premium Van',
    mercedes: 'Private Mercedes',
    bus: 'Bus Tour'
  };

  function escapeHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(str || '').replace(/[&<>"']/g, (ch) => map[ch] || ch);
  }

  function canonicalMode(mode) {
    const value = String(mode || '').toLowerCase();
    if (value === 'private') return 'mercedes';
    return MODE_ORDER.includes(value) ? value : 'van';
  }

  function toNavMode(key) {
    return key === 'mercedes' ? 'private' : key;
  }

  function formatPrice(amount, currency) {
    const cur = (currency || 'EUR').toUpperCase();
    const val = Number(amount || 0);
    const locale = (window.currentI18n && window.currentI18n.lang) || undefined;
    try {
      if (cur === 'EUR') {
        return val.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20AC';
      }
      return val.toLocaleString(locale, { style: 'currency', currency: cur });
    } catch (_) {
      return `${val.toFixed(2)} ${cur}`;
    }
  }

  function deriveModeInfo(trip, canonicalKey) {
    if (!trip || !trip.modes) return null;
    const safeKey = canonicalMode(canonicalKey);
    const mode = trip.modes[safeKey];
    if (!mode) return null;
    const rawPrice = mode.price;
    if (rawPrice == null || rawPrice === '') return null;
    const price = Number(rawPrice);
    if (!Number.isFinite(price)) return null;
    const activeValue = mode.active;
    const isActive = (() => {
      if (typeof activeValue === 'boolean') return activeValue;
      if (activeValue == null) return true;
      if (typeof activeValue === 'number') return activeValue !== 0;
      if (typeof activeValue === 'string') {
        const normalized = activeValue.trim().toLowerCase();
        if (!normalized) return true;
        if (['false','0','no','inactive'].includes(normalized)) return false;
        if (['true','1','yes','active'].includes(normalized)) return true;
      }
      return true;
    })();
    if (!isActive) return null;
    const chargeRaw = (mode.charge_type || mode.charging_type || 'per_person').toLowerCase();
    const chargeType = chargeRaw === 'per_vehicle' ? 'per_vehicle' : 'per_person';
    const capacityRaw = mode.default_capacity != null ? mode.default_capacity : mode.capacity;
    const capacityNum = capacityRaw != null ? Number(capacityRaw) : null;
    const capacity = Number.isFinite(capacityNum) ? capacityNum : null;
    const currency = (trip.currency || 'EUR').toUpperCase();
    return { price, chargeType, capacity, currency, key: safeKey };
  }

  function buildDescription(category, canonicalKey) {
    const desc = category && category.modeCard && category.modeCard.desc;
    if (desc && typeof desc[canonicalKey] === 'string') return desc[canonicalKey];
    return '';
  }

  function renderModeCards({ root, trip, category, activeMode, onSelect }) {
    if (!root || !trip) return;
    const currentActive = canonicalMode(activeMode);
    root.innerHTML = '';
    root.classList.add('choose-experience-card');
    const cardTexts = category && category.modeCard ? category.modeCard : null;
    const header = document.createElement('div');
    header.className = 'mode-card-header';
    const headerBody = document.createElement('div');
    const titleEl = document.createElement('h3');
    titleEl.className = 'mode-card-title';
    titleEl.textContent = (cardTexts && cardTexts.title) || '';
    const subtitleEl = document.createElement('p');
    subtitleEl.className = 'mode-card-subtitle';
    subtitleEl.textContent = (cardTexts && cardTexts.subtitle) || '';
    headerBody.appendChild(titleEl);
    headerBody.appendChild(subtitleEl);
    header.appendChild(headerBody);
    if ((cardTexts && (cardTexts.title || cardTexts.subtitle))) {
      root.appendChild(header);
    }

    const listEl = document.createElement('div');
    listEl.className = 'trip-mode-card-list';
    let rendered = 0;
    MODE_ORDER.forEach((modeKey) => {
      const info = deriveModeInfo(trip, modeKey);
      if (!info) return;
      rendered++;
      const navMode = toNavMode(modeKey);
      const card = document.createElement('article');
      card.className = `trip-mode-card trip-mode-${navMode}`;
      if (currentActive === modeKey) card.classList.add('active');
      const cardHeader = document.createElement('div');
      cardHeader.className = 'trip-mode-header';
      const title = document.createElement('span');
      title.className = 'trip-mode-title';
      title.textContent = MODE_LABELS[modeKey] || navMode;
      const price = document.createElement('span');
      price.className = 'trip-mode-price';
      price.textContent = formatPrice(info.price, info.currency);
      cardHeader.appendChild(title);
      cardHeader.appendChild(price);
      const desc = document.createElement('p');
      desc.className = 'trip-mode-desc';
      const descText = buildDescription(category, modeKey);
      desc.innerHTML = escapeHtml(descText).replace(/\n/g, '<br>');
      const meta = document.createElement('div');
      meta.className = 'trip-mode-meta';
      const chargeLabel = info.chargeType === 'per_vehicle' ? 'ανά όχημα' : 'ανά άτομο';
      const bits = [chargeLabel];
      if (info.capacity) bits.push(`${info.capacity} pax`);
      meta.textContent = bits.join(' • ');
      card.appendChild(cardHeader);
      if (descText) card.appendChild(desc);
      card.appendChild(meta);
      card.addEventListener('click', () => {
        if (typeof onSelect === 'function') onSelect({ mode: navMode, canonicalMode: modeKey, info });
      });
      listEl.appendChild(card);
    });

    if (!rendered) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    root.appendChild(listEl);
  }

  window.GWModeCard = {
    render: renderModeCards,
    extractModeInfo: (trip, modeKey) => deriveModeInfo(trip, modeKey)
  };
})();
