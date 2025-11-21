(function(){
  const MODE_TITLES = {
    van: 'Premium Van',
    mercedes: 'Private Mercedes',
    bus: 'Classic Bus Tour'
  };
  const MODE_ORDER = ['van','mercedes','bus'];
  const CHARGE_LABELS = {
    per_person: 'ανά άτομο',
    per_vehicle: 'συνολική τιμή'
  };
  let activeTripSlug = '';

  document.addEventListener('DOMContentLoaded', initModeSelect);

  async function initModeSelect(){
    const qs = new URLSearchParams(window.location.search);
    const tripParam = (qs.get('trip') || '').trim();
    if (!tripParam) {
      window.location.href = '/trips.html';
      return;
    }
    activeTripSlug = tripParam;
    const preselectedMode = (qs.get('mode') || '').trim().toLowerCase();
    setStatus('Φόρτωση διαθέσιμων modes...');
    try {
      const [trip, categories] = await Promise.all([
        fetchTripPayload(tripParam),
        fetchCategories()
      ]);
      if (!trip) throw new Error('Trip not found');
      activeTripSlug = trip.slug || trip.id || tripParam;
      const category = findCategoryMeta(categories, trip.category);
      renderHero(trip, category);
      renderModes(trip, category, preselectedMode);
      hideStatus();
    } catch (err) {
      console.error('mode-select: failed to load', err);
      showError('Δεν μπορέσαμε να φορτώσουμε τα modes. Δοκίμασε ξανά σε λίγο.');
    }
  }

  function canonicalMode(key){
    const value = String(key || '').toLowerCase();
    if (value === 'private') return 'mercedes';
    return ['van','mercedes','bus'].includes(value) ? value : '';
  }

  async function fetchTripPayload(tripId){
    const slug = encodeURIComponent(tripId);
    const attempts = [
      `/api/trips/${slug}`,
      `/api/public/trips/${slug}`,
      `/data/trips/${slug}.json`
    ];
    for (const url of attempts) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json && typeof json === 'object') return json;
        }
      } catch(_) {
        /* continue */
      }
    }
    // final fallback: fetch list and locate trip
    try {
      const listRes = await fetch('/api/public/trips', { cache: 'no-store' });
      if (listRes.ok) {
        const list = await listRes.json();
        if (Array.isArray(list)) {
          const match = list.find(item => (item.slug || item.id) === tripId || item.id === tripId);
          if (match) return match;
        }
      }
    } catch(_){}
    throw new Error('trip_not_found');
  }

  async function fetchCategories(){
    try {
      const res = await fetch('/api/categories?published=true', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        return Array.isArray(json) ? json : [];
      }
    } catch(_){}
    return [];
  }

  function findCategoryMeta(categories, slug){
    if (!slug || !Array.isArray(categories)) return null;
    return categories.find(cat => (cat.slug || cat.id) === slug) || null;
  }

  function renderHero(trip, category){
    try {
      if (trip && trip.category) document.body.dataset.category = trip.category;
    } catch(_){}
    const titleEl = document.getElementById('modeCardTitle');
    const descEl = document.getElementById('modeCardDescription');
    const breadcrumbEl = document.getElementById('modeTripBreadcrumb');
    const metaEl = document.getElementById('modeTripMeta');
    const catCard = category && category.modeCard ? category.modeCard : null;
    if (titleEl) titleEl.textContent = (catCard && catCard.title) || 'Επίλεξε εμπειρία';
    if (descEl) descEl.textContent = (catCard && catCard.subtitle) || 'Διάλεξε όχημα και εμπειρία για την εκδρομή σου.';
    if (breadcrumbEl) {
      const catTitle = category ? (category.title || category.slug || '') : '';
      breadcrumbEl.textContent = catTitle ? `${catTitle} → ${trip.title || ''}` : (trip.title || '');
    }
    if (metaEl) {
      const chips = [];
      if (trip && trip.duration) chips.push(`${trip.duration} ώρες`);
      if (trip && trip.tags && trip.tags.length) chips.push(trip.tags[0]);
      if (chips.length) {
        metaEl.innerHTML = chips.map(text => `<span class="chip">${escapeHtml(text)}</span>`).join('');
      } else {
        metaEl.innerHTML = '';
      }
    }
  }

  function renderModes(trip, category, preselectedMode){
    const container = document.getElementById('modeCards');
    const errorEl = document.getElementById('modeError');
    if (!container) return;
    container.innerHTML = '';
    if (errorEl) errorEl.hidden = true;
    const cards = [];
    MODE_ORDER.forEach(key => {
      const info = deriveModeInfo(trip, key);
      if (!info) return;
      cards.push({ key, info });
    });
    if (!cards.length) {
      showError('Δεν βρέθηκαν ενεργά modes για αυτή την εκδρομή.');
      return;
    }
    const catCard = category && category.modeCard ? category.modeCard : null;
    const descMap = (catCard && catCard.desc) || {};
    let selectedKey = canonicalMode(preselectedMode);
    if (!selectedKey || !cards.find(card => card.key === selectedKey)) selectedKey = '';
    cards.forEach(card => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mode-card';
      button.dataset.mode = card.key;
      const title = MODE_TITLES[card.key] || card.key;
      const desc = descMap[card.key] || '';
      const descHtml = escapeHtml(desc || card.info.description || '').replace(/\n/g, '<br>');
      button.innerHTML = `
        <div class="mode-card-heading">
          <span class="mode-card-title">${escapeHtml(title)}</span>
          <span class="mode-card-price">${formatPrice(card.info.price, card.info.currency)}</span>
        </div>
        <p class="mode-card-desc">${descHtml}</p>
        <div class="mode-card-meta">
          <span><i class="fa-solid fa-user" aria-hidden="true"></i>${chargeLabel(card.info.chargeType)}</span>
          ${card.info.capacity ? `<span><i class="fa-solid fa-users" aria-hidden="true"></i>Έως ${card.info.capacity} pax</span>` : ''}
        </div>`;
      const handleNavigate = () => {
        try { persistModeSelection(trip, card.key, card.info); } catch(_){ }
        navigateToMode(card.key);
      };
      button.addEventListener('click', handleNavigate);
      button.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          handleNavigate();
        }
      });
      if (selectedKey && selectedKey === card.key) {
        button.classList.add('selected');
        try { persistModeSelection(trip, card.key, card.info); } catch(_){ }
      }
      container.appendChild(button);
    });
  }

  function deriveModeInfo(trip, key){
    if (!trip) return null;
    const canonical = canonicalMode(key);
    if (!canonical) return null;
    const rawModes = (trip.modes && typeof trip.modes === 'object') ? trip.modes : {};
    const rawMode = rawModes[canonical];
    const modeSet = (trip.mode_set && typeof trip.mode_set === 'object') ? trip.mode_set[canonical] : null;
    const activeFlag = resolveActive(modeSet && modeSet.active, rawMode && rawMode.active);
    if (!activeFlag) return null;
    const price = resolvePriceEuros(modeSet, rawMode);
    if (price == null) return null;
    const chargeType = resolveChargeType(modeSet, rawMode);
    const capacity = resolveCapacity(modeSet, rawMode);
    const currency = (trip.currency || 'EUR').toUpperCase();
    const description = rawMode && rawMode.description ? rawMode.description : '';
    return { price, chargeType, capacity, currency, description };
  }

  function resolveActive(primary, fallback){
    const value = typeof primary !== 'undefined' ? primary : fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (!normalized) return true;
      if (['false','0','no','inactive','disabled'].includes(normalized)) return false;
      if (['true','1','yes','active'].includes(normalized)) return true;
    }
    return true;
  }

  function resolvePriceEuros(modeSet, rawMode){
    if (modeSet && typeof modeSet.price_cents === 'number') return modeSet.price_cents / 100;
    const list = [rawMode && rawMode.price_per_person, rawMode && rawMode.price_total, rawMode && rawMode.price];
    for (const candidate of list) {
      if (candidate == null || candidate === '') continue;
      const num = Number(candidate);
      if (Number.isFinite(num)) return num;
    }
    return null;
  }

  function resolveChargeType(modeSet, rawMode){
    const raw = (modeSet && modeSet.charge_type) || (rawMode && (rawMode.charge_type || rawMode.charging_type)) || 'per_person';
    const lowered = String(raw).toLowerCase();
    if (lowered === 'per_vehicle' || lowered === 'flat') return 'per_vehicle';
    return 'per_person';
  }

  function resolveCapacity(modeSet, rawMode){
    const list = [
      modeSet && modeSet.default_capacity,
      rawMode && rawMode.default_capacity,
      rawMode && rawMode.capacity
    ];
    for (const candidate of list) {
      const num = Number(candidate);
      if (Number.isFinite(num) && num > 0) return num;
    }
    return null;
  }

  function chargeLabel(type){
    return CHARGE_LABELS[type] || CHARGE_LABELS.per_person;
  }

  function persistModeSelection(trip, modeKey, info){
    const canonical = canonicalMode(modeKey) || 'van';
    const navMode = canonical === 'mercedes' ? 'private' : canonical;
    try { localStorage.setItem('trip_mode', navMode); } catch(_){}
    try {
      sessionStorage.setItem('gw_trip_id', trip.slug || trip.id || '');
      sessionStorage.setItem('selectedVehicleType', canonical);
      if (info && typeof info.price === 'number') {
        sessionStorage.setItem('selectedVehiclePrice', String(info.price));
      }
      sessionStorage.setItem('selectedVehicleCurrency', info.currency || (trip.currency || 'EUR'));
      sessionStorage.setItem('selectedVehicleChargeType', info.chargeType || 'per_person');
      if (info.capacity != null) sessionStorage.setItem('selectedVehicleCapacity', String(info.capacity));
    } catch(_){}
  }

  function setStatus(text){
    const el = document.getElementById('modeStatus');
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
  }

  function hideStatus(){
    const el = document.getElementById('modeStatus');
    if (!el) return;
    el.hidden = true;
  }

  function showError(msg){
    const el = document.getElementById('modeError');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    hideStatus();
  }

  function escapeHtml(str){
    return String(str || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch] || ch));
  }

  function formatPrice(amount, currency){
    const val = Number(amount || 0);
    const cur = (currency || 'EUR').toUpperCase();
    try {
      if (cur === 'EUR') {
        return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
      }
      return val.toLocaleString(undefined, { style: 'currency', currency: cur });
    } catch(_) {
      return `${val.toFixed(2)} ${cur}`;
    }
  }

  function navigateToMode(modeKey){
    const canonical = canonicalMode(modeKey);
    if (!canonical) return;
    const slug = activeTripSlug || (new URLSearchParams(window.location.search).get('trip') || '').trim();
    if (!slug) return;
    const target = new URL('/trips/trip.html', window.location.origin || window.location.href);
    target.searchParams.set('trip', slug);
    target.searchParams.set('id', slug);
    target.searchParams.set('mode', canonical);
    window.location.href = target.toString();
  }
})();
