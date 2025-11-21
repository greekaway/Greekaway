(() => {
  const MODE_ORDER = ['van', 'mercedes', 'bus'];
  const MODE_LABELS = {
    van: 'Premium Van',
    mercedes: 'Ιδιωτική Mercedes',
    bus: 'All-Day Bus'
  };
  const CHARGE_LABELS = {
    per_person: 'Ανά άτομο',
    per_vehicle: 'Ιδιωτική κράτηση'
  };

  const ModeSelect = {
    mount(root, options = {}) {
      if (!root) return;
      const { trip, slug, selectedMode, onSelect } = options;
      root.innerHTML = '';
      root.classList.add('mode-select-grid', 'mode-card-grid');
      if (!trip || !trip.mode_set) {
        root.appendChild(renderMessage('Δεν υπάρχουν διαθέσιμες εμπειρίες για επιλογή.'));
        return;
      }
      const entries = buildEntries(trip.mode_set, trip.currency);
      if (!entries.length) {
        root.appendChild(renderMessage('Δεν υπάρχουν διαθέσιμες εμπειρίες για επιλογή.'));
        return;
      }
      const normalizedSelected = normalizeKey(selectedMode);
      entries.forEach((entry) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mode-option mode-card';
        button.dataset.mode = entry.key;
        const isActive = entry.key === normalizedSelected;
        if (isActive) button.classList.add('is-selected');
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        button.innerHTML = buildOptionTemplate(entry);
        button.addEventListener('click', () => {
          const handler = typeof onSelect === 'function' ? onSelect : defaultNavigate;
          handler(entry.key, Object.assign({ slug: slug || trip.slug || trip.id || '' }, entry));
        });
        root.appendChild(button);
      });
    }
  };

  window.ModeSelect = ModeSelect;

  document.addEventListener('DOMContentLoaded', () => {
    if (document.body && document.body.dataset && document.body.dataset.view === 'mode-select') {
      bootstrapStandalone();
    }
  });

  async function bootstrapStandalone() {
    const qs = new URLSearchParams(window.location.search);
    const slug = (qs.get('trip') || '').trim();
    const selectedMode = qs.get('mode') || '';
    if (!slug) {
      showStandaloneError('Δεν ορίστηκε εκδρομή για επιλογή εμπειρίας.');
      return;
    }
    setStatus('Φόρτωση διαθέσιμων modes...');
    try {
      const trip = await fetchTrip(slug);
      updateStandaloneHero(trip);
      hideStatus();
      ModeSelect.mount(document.getElementById('modeCards'), {
        trip,
        slug,
        selectedMode,
        onSelect: (modeKey) => defaultNavigate(modeKey, { slug })
      });
    } catch (err) {
      console.error('mode-select', err);
      showStandaloneError('Δεν μπορέσαμε να φορτώσουμε τα διαθέσιμα modes.');
    }
  }

  function buildEntries(modeSet, currency) {
    const entries = [];
    const cur = (currency || 'EUR').toUpperCase();
    for (const key of MODE_ORDER) {
      const raw = modeSet[key];
      if (!raw || !isActive(raw.active)) continue;
      if (typeof raw.price_cents !== 'number') continue;
      const normalized = normalizeKey(key);
      entries.push({
        key: normalized,
        label: MODE_LABELS[normalized] || normalized,
        priceCents: raw.price_cents,
        priceText: formatPrice(raw.price_cents, cur),
        capacity: validNumber(raw.default_capacity),
        chargeType: normalizeCharge(raw.charge_type),
        currency: cur
      });
    }
    return entries;
  }

  function buildOptionTemplate(entry) {
    const capacityLabel = entry.capacity ? `Έως ${entry.capacity} άτομα` : '';
    const chargeLabel = CHARGE_LABELS[entry.chargeType] || CHARGE_LABELS.per_person;
    return `
      <div class="mode-card-heading">
        <span class="mode-option-title">${escapeHtml(entry.label)}</span>
        <span class="mode-option-price">${escapeHtml(entry.priceText)}</span>
      </div>
      <div class="mode-option-meta">
        <span><i class="fa-solid fa-tag" aria-hidden="true"></i>${escapeHtml(chargeLabel)}</span>
        ${capacityLabel ? `<span><i class="fa-solid fa-users" aria-hidden="true"></i>${escapeHtml(capacityLabel)}</span>` : ''}
      </div>`;
  }

  function renderMessage(text) {
    const p = document.createElement('p');
    p.className = 'mode-select-empty';
    p.textContent = text;
    return p;
  }

  function defaultNavigate(modeKey, payload) {
    const slug = payload && payload.slug ? payload.slug : '';
    if (!slug) return;
    const target = new URL('/trip.html', window.location.origin || window.location.href);
    target.searchParams.set('trip', slug);
    target.searchParams.set('mode', modeKey);
    window.location.assign(target.toString());
  }

  function setStatus(text) {
    const el = document.getElementById('modeStatus');
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
  }

  function hideStatus() {
    const el = document.getElementById('modeStatus');
    if (!el) return;
    el.hidden = true;
  }

  function showStandaloneError(message) {
    hideStatus();
    const el = document.getElementById('modeError');
    if (el) {
      el.hidden = false;
      el.textContent = message;
    }
  }

  function normalizeKey(value) {
    if (!value) return '';
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'private') return 'mercedes';
    return MODE_ORDER.includes(normalized) ? normalized : '';
  }

  function normalizeCharge(raw) {
    const normalized = String(raw || 'per_person').toLowerCase();
    return normalized === 'per_vehicle' ? 'per_vehicle' : 'per_person';
  }

  function isActive(flag) {
    if (typeof flag === 'boolean') return flag;
    if (typeof flag === 'number') return flag !== 0;
    if (typeof flag === 'string') {
      const normalized = flag.trim().toLowerCase();
      if (!normalized) return true;
      if (['false', '0', 'inactive', 'off', 'no'].includes(normalized)) return false;
    }
    return true;
  }

  function validNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  function formatPrice(cents, currency) {
    const amount = Number(cents || 0) / 100;
    try {
      return amount.toLocaleString(undefined, { style: 'currency', currency, minimumFractionDigits: 2 });
    } catch (err) {
      return `${amount.toFixed(2)} ${currency}`;
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;'
    }[ch] || ch));
  }

  async function fetchTrip(slug) {
    const encoded = encodeURIComponent(slug.toLowerCase());
    const res = await fetch(`/api/trips/${encoded}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('trip_not_found');
    const payload = await res.json();
    if (payload && payload.trip) return payload.trip;
    return payload;
  }

  function updateStandaloneHero(trip) {
    try {
      if (trip && trip.category) document.body.dataset.category = trip.category;
    } catch (_) { /* noop */ }
    const title = document.getElementById('modeCardTitle');
    const desc = document.getElementById('modeCardDescription');
    if (title) title.textContent = trip && trip.title ? trip.title : 'Επίλεξε εμπειρία';
    if (desc) desc.textContent = trip && trip.teaser ? trip.teaser : 'Διάλεξε όχημα και εμπειρία πριν συνεχίσεις στην εκδρομή.';
  }
})();
