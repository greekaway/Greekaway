(() => {
  const state = {
    slug: '',
    trip: null,
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('mode-select-ready');
    state.slug = readSlug();
    if (!state.slug) {
      showStatus('Δεν βρέθηκε εκδρομή. Επιστρέψτε στις εκδρομές και δοκιμάστε ξανά.', 'error');
      return;
    }
    loadTrip(state.slug);
  });

  async function loadTrip(slug) {
    showStatus('Φόρτωση εκδρομής…', 'info');
    try {
      const trip = await fetchTrip(slug);
      state.trip = trip;
      updateHero(trip);
      updateFooter(trip);
      const modes = deriveModes(trip);
      if (!modes.length) {
        renderEmpty();
        showStatus('Δεν βρέθηκαν διαθέσιμα οχήματα για αυτή την εκδρομή.', 'error');
        return;
      }
      renderModes(modes);
      hideStatus();
    } catch (err) {
      console.error('[mode-select] failed to load trip', err);
      showStatus('Προέκυψε σφάλμα κατά τη φόρτωση. Δοκιμάστε ξανά σε λίγο.', 'error');
    }
  }

  async function fetchTrip(slug) {
    const response = await fetch(`/api/trips/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Trip request failed');
    const payload = await response.json();
    if (!payload || !payload.trip) throw new Error('Empty trip payload');
    return payload.trip;
  }

  function deriveModes(trip) {
    if (!trip || typeof trip !== 'object') return [];
    const detailed = (trip.modes && typeof trip.modes === 'object') ? trip.modes : {};
    const summary = (trip.mode_set && typeof trip.mode_set === 'object') ? trip.mode_set : {};
    const order = Object.keys(detailed).concat(Object.keys(summary));
    const seen = new Set();
    const results = [];

    for (const key of order) {
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const data = detailed[key] || {};
      const meta = summary[key] || {};
      const active = readBoolean(data.active ?? meta.active ?? true);
      if (!active) continue;
      const priceCents = readPriceCents(data, meta);
      const pricingType = readPricingType(data, meta);
      const durationDays = readDurationDays(data, meta);
      const durationText = readDurationString(data, meta);
      const title = (data.title || '').trim();
      if (!title) continue;
      const subtitle = data.subtitle || data.description || '';
      results.push({
        key,
        title,
        subtitle,
        price_cents: priceCents,
        pricing_type: pricingType,
        description: (data.description || '').trim(),
        duration_days: durationDays,
        duration: durationText,
      });
    }
    return results;
  }

  function renderModes(modes) {
    const grid = document.getElementById('modeGrid');
    if (!grid) return;
    grid.innerHTML = '';
    modes.forEach((mode) => {
      const card = buildModeCard(mode);
      if (card) grid.appendChild(card);
    });
  }

  function buildModeCard(mode) {
    if (!mode || !mode.key) return null;
    const card = document.createElement('article');
    card.className = 'mode-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.dataset.modeKey = mode.key;
    card.addEventListener('click', () => handleSelect(mode.key));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleSelect(mode.key);
      }
    });

    const head = document.createElement('div');
    head.className = 'mode-card-head';
    const title = document.createElement('h3');
    title.textContent = mode.title;
    head.appendChild(title);
    if (mode.subtitle) {
      const subtitle = document.createElement('p');
      subtitle.className = 'subtitle';
      subtitle.textContent = mode.subtitle;
      head.appendChild(subtitle);
    }
    card.appendChild(head);

    const price = document.createElement('div');
    price.className = 'mode-card-price price-block';
    const value = document.createElement('span');
    value.className = 'mode-card-price-value';
    value.textContent = formatPrice(mode.price_cents);
    price.appendChild(value);
    const label = document.createElement('span');
    label.className = 'mode-card-price-label';
    label.textContent = formatPricingLabel(mode.pricing_type);
    price.appendChild(label);
    card.appendChild(price);

    const meta = document.createElement('div');
    meta.className = 'mode-card-meta badges';
    meta.appendChild(buildChip(pricingIcon(mode.pricing_type), formatPricingChip(mode.pricing_type)));
    const durationLabel = formatDurationBadge(mode);
    if (durationLabel) {
      meta.appendChild(buildChip('fa-clock', durationLabel));
    }
    card.appendChild(meta);

    return card;
  }

  function buildChip(icon, text) {
    const chip = document.createElement('span');
    chip.className = 'mode-card-chip badge';
    if (icon) {
      const i = document.createElement('i');
      i.className = `fa-solid ${icon}`;
      i.setAttribute('aria-hidden', 'true');
      chip.appendChild(i);
    }
    const span = document.createElement('span');
    span.textContent = text;
    chip.appendChild(span);
    return chip;
  }

  function renderEmpty() {
    const grid = document.getElementById('modeGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const card = document.createElement('article');
    card.className = 'mode-card mode-card-error';
    card.textContent = 'Η εκδρομή δεν έχει διαθέσιμα modes αυτή τη στιγμή.';
    grid.appendChild(card);
  }

  function handleSelect(modeKey) {
    if (!state.slug || !modeKey) return;
    const url = new URL('/trip.html', window.location.origin);
    url.searchParams.set('trip', state.slug);
    url.searchParams.set('mode', modeKey);
    window.location.assign(url.toString());
  }

  function updateHero(trip) {
    setText('modeTripCategory', (trip.category || 'Εκδρομή').toUpperCase());
    setText('modeTripTitle', trip.title || 'Επιλογή εμπειρίας');
    setText('modeTripSubtitle', trip.subtitle || 'Διαλέξτε το όχημα που προτιμάτε για την εκδρομή.');
  }

  function updateFooter(trip) {
    setText('modeTripSlug', trip.slug ? `trip=${trip.slug}` : '');
  }

  function showStatus(message, variant) {
    const status = document.getElementById('modeStatus');
    if (!status) return;
    status.hidden = false;
    status.textContent = message;
    status.dataset.variant = variant || 'info';
  }

  function hideStatus() {
    const status = document.getElementById('modeStatus');
    if (!status) return;
    status.hidden = true;
    status.textContent = '';
    delete status.dataset.variant;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (value) {
      el.textContent = value;
      el.hidden = false;
    } else {
      el.textContent = '';
      el.hidden = true;
    }
  }

  function readSlug() {
    try {
      const params = new URLSearchParams(window.location.search);
      const slug = params.get('trip');
      if (slug && slug.trim()) return slug.trim();
      const legacy = params.get('id');
      if (legacy && legacy.trim()) {
        try {
          params.set('trip', legacy.trim());
          params.delete('id');
          replaceSearch(params);
        } catch (_) {}
        return legacy.trim();
      }
      return '';
    } catch (_) {
      return '';
    }
  }

  function readBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (!normalized) return true;
      if (['false', '0', 'inactive', 'no'].includes(normalized)) return false;
    }
    return true;
  }

  function readPriceCents(data, meta) {
    const candidates = [data.price_cents, meta.price_cents];
    const derived = [data.price_per_person, data.price_total, meta.price_per_person, meta.price_total]
      .map((value) => (typeof value === 'number' ? Math.round(value * 100) : null));
    for (const value of candidates.concat(derived)) {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return null;
  }

  function readPricingType(data, meta) {
    return (data.pricing_type || data.charge_type || meta.pricing_type || meta.charge_type || 'per_person').toLowerCase();
  }

  function readDurationDays(data, meta) {
    const value = data.duration_days ?? data.durationDays ?? meta.duration_days ?? meta.durationDays;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function readDurationString(data, meta) {
    const raw = data.duration ?? meta.duration;
    return raw != null ? String(raw) : '';
  }

  function formatPrice(priceCents) {
    if (typeof priceCents !== 'number') return '—';
    const euros = priceCents / 100;
    try {
      return new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(euros);
    } catch (_) {
      return `${euros.toFixed(2)} €`;
    }
  }

  function formatPricingLabel(pricingType) {
    switch (pricingType) {
      case 'per_vehicle':
      case 'private':
        return 'Ιδιωτική κράτηση';
      case 'group':
        return 'Ομαδική εμπειρία';
      default:
        return 'Ανά άτομο';
    }
  }

  function formatPricingChip(pricingType) {
    switch (pricingType) {
      case 'per_vehicle':
      case 'private':
        return 'Ιδιωτική κράτηση';
      case 'group':
        return 'Ομαδική εμπειρία';
      default:
        return 'Ανά άτομο';
    }
  }

  function formatDurationBadge(mode) {
    if (!mode) return '';
    return buildDurationLabel(mode.duration_days, mode.duration) || '';
  }

  function buildDurationLabel(durationDays, durationRaw) {
    const daysValue = toPositiveInt(durationDays);
    if (daysValue >= 2) return `${daysValue} ημέρες`;
    if (daysValue === 1) return '1 ημέρα';
    return parseDurationString(durationRaw);
  }

  function parseDurationString(raw) {
    if (!raw) return '';
    const compact = String(raw).trim().toLowerCase().replace(/\s+/g, '');
    if (!compact) return '';
    let days = 0;
    let hours = 0;
    let minutes = 0;
    const tokenRegex = /(\d+(?:\.\d+)?)(d|h|m)/g;
    let match;
    while ((match = tokenRegex.exec(compact)) !== null) {
      const value = parseFloat(match[1]);
      if (!Number.isFinite(value)) continue;
      if (match[2] === 'd') days += value;
      else if (match[2] === 'h') hours += value;
      else if (match[2] === 'm') minutes += value;
    }
    if (days === 0 && hours === 0 && minutes === 0) {
      const numeric = parseFloat(compact);
      if (Number.isFinite(numeric)) hours = numeric;
    }
    if (days > 0) {
      const dayLabel = `${stripTrailingZeros(days)} ${days === 1 ? 'ημέρα' : 'ημέρες'}`;
      const hourTotal = hours + (minutes / 60);
      const hourLabel = hourTotal > 0
        ? `${stripTrailingZeros(Math.round(hourTotal * 10) / 10)} ${hourTotal === 1 ? 'ώρα' : 'ώρες'}`
        : '';
      return hourLabel ? `${dayLabel} ${hourLabel}` : dayLabel;
    }
    const totalHours = hours + (minutes / 60);
    if (totalHours > 0) {
      const rounded = Math.round(totalHours * 10) / 10;
      const display = stripTrailingZeros(rounded);
      const unit = rounded === 1 ? 'ώρα' : 'ώρες';
      return `${display} ${unit}`;
    }
    if (minutes > 0) {
      const mins = stripTrailingZeros(minutes);
      return `${mins} λεπτά`;
    }
    return '';
  }

  function stripTrailingZeros(value) {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(1).replace(/\.0$/, '');
  }

  function toPositiveInt(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return 0;
    return Math.floor(num);
  }

  function pricingIcon(pricingType) {
    switch (pricingType) {
      case 'per_vehicle':
      case 'private':
        return 'fa-lock';
      case 'group':
        return 'fa-people-group';
      default:
        return 'fa-user';
    }
  }

  function replaceSearch(params) {
    try {
      const query = params.toString();
      const hash = window.location.hash || '';
      const next = query ? `${window.location.pathname}?${query}${hash}` : `${window.location.pathname}${hash}`;
      window.history.replaceState({}, '', next);
    } catch (_) {}
  }

})();
