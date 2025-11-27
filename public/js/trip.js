(() => {
  const TAB_DEFAULT = 'trip-tab-main';
  const UNTITLED_MODE_LABEL = 'Χωρίς τίτλο';
  const state = {
    slug: '',
    activePanel: TAB_DEFAULT,
    trip: null,
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('trip-view-page');
    state.slug = readSlug();
    initTabs();
    if (!state.slug) {
      showBanner('Δεν βρέθηκε η εκδρομή. Επιστρέψτε στις εκδρομές και δοκιμάστε ξανά.');
      setMainPlaceholder('Δεν βρέθηκε εκδρομή με αυτό το slug.');
      return;
    }
    loadTrip();
  });

  function initTabs() {
    const buttons = document.querySelectorAll('.trip-tab-button');
    buttons.forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.tab === TAB_DEFAULT ? 'true' : 'false');
      button.addEventListener('click', () => switchTab(button.dataset.tab));
    });
    switchTab(TAB_DEFAULT);
  }

  function switchTab(target) {
    if (!target) return;
    state.activePanel = target;
    document.querySelectorAll('.trip-tab-button').forEach((button) => {
      const isActive = button.dataset.tab === target;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    document.querySelectorAll('.trip-tab-panel').forEach((panel) => {
      const isActive = panel.id === target;
      panel.classList.toggle('is-active', isActive);
      panel.hidden = !isActive;
    });
  }

  async function loadTrip() {
    try {
      const trip = await fetchTrip(state.slug);
      hydrateTrip(trip);
    } catch (err) {
      console.error('[trip] failed to load trip data', err);
      showBanner('Σφάλμα κατά τη φόρτωση της εκδρομής. Δοκιμάστε ξανά.');
      setMainPlaceholder('Δεν μπορέσαμε να φορτώσουμε τα στοιχεία της εκδρομής.');
    }
  }

  async function fetchTrip(slug) {
    const encoded = encodeURIComponent(String(slug || '').toLowerCase());
    const response = await fetch(`/api/trips/${encoded}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Trip fetch failed');
    const payload = await response.json();
    if (!payload || !payload.trip) throw new Error('Trip payload missing');
    return payload.trip;
  }

  function hydrateTrip(trip) {
    state.trip = trip;
    window.__loadedTrip = trip;
    hideBanner();
    document.body.dataset.view = 'trip';
    if (trip.category) document.body.dataset.category = trip.category;

    const modeInfo = selectMode(trip);
    renderHero(trip, modeInfo);
    renderMainPanel(trip, modeInfo);
    renderPhotos(modeInfo);
    renderListPanel('trip-tab-includes', gatherIncludes(modeInfo), 'Δεν έχουν καταχωρηθεί ακόμη στοιχεία.');
    renderListPanel('trip-tab-excludes', gatherExcludes(modeInfo), 'Δεν έχουν καταχωρηθεί ακόμη στοιχεία.');
    renderExperience(modeInfo);
    renderFaq(modeInfo);
    renderStops(modeInfo);
    setupCalendar(state.slug);
  }

  function selectMode(trip) {
    const modes = trip.modes || {};
    const params = new URLSearchParams(window.location.search);
    const requested = normalizeModeKey(params.get('mode'));
    if (requested && modes[requested]) return { key: requested, data: modes[requested] };
    const fallback = normalizeModeKey(trip.defaultMode || trip.default_mode);
    if (fallback && modes[fallback]) return { key: fallback, data: modes[fallback] };
    const active = Object.entries(modes).find(([, data]) => data && data.active);
    if (active) return { key: active[0], data: active[1] };
    const any = Object.entries(modes).find(([, data]) => data);
    if (any) return { key: any[0], data: any[1] };
    return { key: 'default', data: {} };
  }

  function normalizeModeKey(key) {
    if (!key) return '';
    const map = { private: 'mercedes' };
    const normalized = String(key).trim().toLowerCase();
    return map[normalized] || normalized;
  }

  function renderHero(trip, modeInfo) {
    const mode = modeInfo.data || {};
    const title = trip.title || mode.title || 'Εκδρομή';
    const subtitle = trip.subtitle || '';
    document.title = `${title} – Greekaway`;

    setText('trip-title', title);
    setText('trip-subtitle', subtitle, '');
    setText('trip-description', mode.description || '', '');
    setText('trip-duration', formatModeDuration(mode), '—');
    setText('trip-mode-label', formatMode(modeInfo));
    setText('trip-price', formatPrice(mode, trip.currency));
    setText('trip-category', (trip.category || 'Εκδρομή').toUpperCase());
  }

  function renderMainPanel(trip, modeInfo) {
    const panel = document.getElementById('trip-tab-main');
    if (!panel) return;
    panel.innerHTML = '';

    const mode = modeInfo.data || {};
    const paragraphs = dedupeStrings([
      mode.description,
      mode.long_description,
      mode.details,
      mode.experience,
    ]);
    paragraphs.forEach((text) => panel.appendChild(createParagraph(text)));

    const highlights = collectHighlights(modeInfo);
    if (highlights.length) {
      const ul = document.createElement('ul');
      ul.className = 'trip-list trip-overview-meta';
      highlights.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        ul.appendChild(li);
      });
      panel.appendChild(ul);
    }

    if (!paragraphs.length && !highlights.length) {
      panel.appendChild(createPlaceholder('Δεν υπάρχουν διαθέσιμες πληροφορίες.'));
    }
  }

  function renderPhotos(modeInfo) {
    const panel = document.getElementById('trip-tab-photos');
    if (!panel) return;
    panel.innerHTML = '';
    const mode = modeInfo.data || {};
    const media = (mode.media && typeof mode.media === 'object') ? mode.media : {};
    const items = dedupeStrings([
      ...(Array.isArray(mode.photos) ? mode.photos : []),
      ...(Array.isArray(mode.gallery) ? mode.gallery : []),
      ...(Array.isArray(media.photos) ? media.photos : []),
      ...(Array.isArray(media.images) ? media.images : []),
    ]);
    if (!items.length) {
      panel.appendChild(createPlaceholder('Δεν βρέθηκαν φωτογραφίες για αυτή την εκδρομή.'));
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'trip-photo-grid';
    items.forEach((src) => {
      const img = document.createElement('img');
      img.src = src;
      img.loading = 'lazy';
      img.alt = 'Φωτογραφία εκδρομής';
      grid.appendChild(img);
    });
    panel.appendChild(grid);
  }

  function gatherIncludes(modeInfo) {
    const mode = modeInfo.data || {};
    return Array.isArray(mode.includes) ? mode.includes : [];
  }

  function gatherExcludes(modeInfo) {
    const mode = modeInfo.data || {};
    return Array.isArray(mode.excludes) ? mode.excludes : [];
  }

  function renderListPanel(panelId, entries, emptyText) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    panel.innerHTML = '';
    const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
    if (!list.length) {
      panel.appendChild(createPlaceholder(emptyText));
      return;
    }
    const ul = document.createElement('ul');
    ul.className = 'trip-list';
    list.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    });
    panel.appendChild(ul);
  }

  function renderExperience(modeInfo) {
    const panel = document.getElementById('trip-tab-experience');
    if (!panel) return;
    panel.innerHTML = '';
    const mode = modeInfo.data || {};
    const intro = mode.experience;
    if (intro) panel.appendChild(createParagraph(intro));

    const sections = (Array.isArray(mode.sections) ? mode.sections : [])
      .filter((section) => section && (section.title || section.content));

    if (!intro && !sections.length) {
      panel.appendChild(createPlaceholder('Δεν υπάρχουν επιπλέον πληροφορίες.'));
      return;
    }

    sections.forEach((section) => {
      const article = document.createElement('article');
      article.className = 'trip-experience-section';
      if (section.title) {
        const h4 = document.createElement('h4');
        h4.textContent = section.title;
        article.appendChild(h4);
      }
      if (section.content) article.appendChild(createParagraph(section.content));
      panel.appendChild(article);
    });
  }

  function renderFaq(modeInfo) {
    const panel = document.getElementById('trip-tab-faq');
    if (!panel) return;
    panel.innerHTML = '';
    const mode = modeInfo.data || {};
    const items = (Array.isArray(mode.faq) ? mode.faq : [])
      .filter((item) => item && (item.q || item.question || item.a || item.answer));

    if (!items.length) {
      panel.appendChild(createPlaceholder('Δεν υπάρχουν συχνές ερωτήσεις.'));
      return;
    }

    items.forEach((item) => {
      const block = document.createElement('article');
      block.className = 'trip-faq-item';
      if (item.q || item.question) {
        const h4 = document.createElement('h4');
        h4.textContent = item.q || item.question;
        block.appendChild(h4);
      }
      if (item.a || item.answer) {
        block.appendChild(createParagraph(item.a || item.answer));
      }
      panel.appendChild(block);
    });
  }

  function renderStops(modeInfo) {
    const panel = document.getElementById('trip-tab-stops');
    if (!panel) return;
    panel.innerHTML = '';
    const mode = modeInfo.data || {};
    const stops = (Array.isArray(mode.stops) ? mode.stops : [])
      .filter((stop) => stop && (stop.title || stop.description));

    if (!stops.length) {
      panel.appendChild(createPlaceholder('Δεν υπάρχουν στάσεις για εμφάνιση.'));
      return;
    }

    const list = document.createElement('div');
    list.className = 'trip-stops-list';
    stops.forEach((stop) => {
      const section = document.createElement('section');
      section.className = 'trip-stop';
      if (stop.title) {
        const h3 = document.createElement('h3');
        h3.textContent = stop.title;
        section.appendChild(h3);
      }
      const chips = [];
      if (stop.duration || stop.time) chips.push({ icon: '⏱', text: stop.duration || stop.time });
      if (stop.address || stop.location || stop.label) chips.push({ icon: '📍', text: stop.address || stop.location || stop.label });
      if (chips.length) {
        const meta = document.createElement('div');
        meta.className = 'trip-stop-meta';
        chips.forEach((chip) => {
          if (!chip.text) return;
          const span = document.createElement('span');
          span.className = 'trip-chip';
          span.textContent = `${chip.icon} ${chip.text}`;
          meta.appendChild(span);
        });
        section.appendChild(meta);
      }
      if (stop.description) section.appendChild(createParagraph(stop.description));

      const photos = Array.isArray(stop.images) ? stop.images.filter(Boolean) : [];
      if (photos.length) {
        const grid = document.createElement('div');
        grid.className = 'trip-stop-photos';
        photos.slice(0, 6).forEach((src) => {
          const img = document.createElement('img');
          img.src = src;
          img.loading = 'lazy';
          img.alt = stop.title ? `Στάση ${stop.title}` : 'Στάση εκδρομής';
          grid.appendChild(img);
        });
        section.appendChild(grid);
      }

      const videos = Array.isArray(stop.videos) ? stop.videos.filter(Boolean) : [];
      if (videos.length) {
        const wrap = document.createElement('div');
        wrap.className = 'trip-stop-video';
        const iframe = document.createElement('iframe');
        iframe.src = normalizeVideoUrl(videos[0]);
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.loading = 'lazy';
        wrap.appendChild(iframe);
        section.appendChild(wrap);
      }
      list.appendChild(section);
    });
    panel.appendChild(list);
  }

  function collectHighlights(modeInfo) {
    const highlights = [];
    const mode = modeInfo.data || {};
    if (Array.isArray(mode.highlights)) highlights.push(...mode.highlights);
    if (Array.isArray(mode.tags) && mode.tags.length) highlights.push(`Tags: ${mode.tags.join(', ')}`);
    if (mode.capacity) highlights.push(`Χωρητικότητα: έως ${mode.capacity} άτομα`);
    return dedupeStrings(highlights);
  }

  function setupCalendar(slug) {
    const input = document.getElementById('trip-date');
    const button = document.getElementById('trip-booking-shortcut');
    if (!input || !button) return;

    try {
      const stored = sessionStorage.getItem('gw_trip_date');
      if (stored) input.value = stored;
    } catch (_) {}

    if (window.flatpickr) {
      window.flatpickr(input, {
        dateFormat: 'Y-m-d',
        minDate: 'today',
        locale: resolveCalendarLocale(),
        defaultDate: input.value || undefined,
      });
    }

    input.addEventListener('change', () => {
      try {
        sessionStorage.setItem('gw_trip_date', input.value || '');
      } catch (_) {}
    });

    button.addEventListener('click', () => {
      if (!input.value) {
        input.focus();
        return;
      }
      try {
        sessionStorage.setItem('gw_trip_date', input.value);
      } catch (_) {}
      const url = new URL('/step2.html', window.location.origin || window.location.href);
      url.searchParams.set('trip', slug);
      url.searchParams.set('id', slug);
      url.searchParams.set('date', input.value);
      window.location.assign(url.toString());
    });
  }

  function formatModeDuration(mode) {
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

  function formatMode(modeInfo) {
    const mode = modeInfo.data || {};
    const parts = [];
    parts.push(mode.title || UNTITLED_MODE_LABEL);
    if (mode.capacity) parts.push(`• έως ${mode.capacity} άτομα`);
    if (mode.charge_type === 'per_vehicle') parts.push('• ιδιωτικό όχημα');
    if (mode.charge_type === 'per_person') parts.push('• ανά άτομο');
    return parts.join(' ');
  }

  function formatPrice(mode, currency) {
    const cur = (currency || 'EUR').toUpperCase();
    if (typeof mode.price_per_person === 'number') return `${mode.price_per_person} ${cur} / άτομο`;
    if (typeof mode.price_total === 'number') return `${mode.price_total} ${cur} συνολικά`;
    if (typeof mode.price === 'number') return `${mode.price} ${cur}`;
    return '—';
  }

  function resolveCalendarLocale() {
    const lang = (document.documentElement.lang || 'el').toLowerCase();
    if (window.flatpickr && window.flatpickr.l10ns) {
      if (window.flatpickr.l10ns[lang]) return window.flatpickr.l10ns[lang];
      if (window.flatpickr.l10ns.el) return window.flatpickr.l10ns.el;
    }
    return undefined;
  }

  function setText(id, value, fallback) {
    const el = document.getElementById(id);
    if (!el) return;
    const content = value && String(value).trim() ? value : fallback !== undefined ? fallback : '—';
    el.textContent = content;
  }

  function setMainPlaceholder(message) {
    const panel = document.getElementById('trip-tab-main');
    if (!panel) return;
    panel.innerHTML = '';
    panel.appendChild(createPlaceholder(message));
  }

  function showBanner(message) {
    const banner = document.getElementById('trip-alert');
    if (!banner) return;
    banner.textContent = message;
    banner.hidden = false;
  }

  function hideBanner() {
    const banner = document.getElementById('trip-alert');
    if (!banner) return;
    banner.hidden = true;
  }

  function createParagraph(text) {
    if (!text) return document.createDocumentFragment();
    const p = document.createElement('p');
    p.textContent = text;
    return p;
  }

  function createPlaceholder(text) {
    const p = document.createElement('p');
    p.className = 'trip-panel-placeholder';
    p.textContent = text;
    return p;
  }

  function dedupeStrings(items) {
    const seen = new Set();
    const results = [];
    (items || []).forEach((item) => {
      if (!item) return;
      const value = String(item).trim();
      if (!value || seen.has(value)) return;
      seen.add(value);
      results.push(value);
    });
    return results;
  }

  function normalizeVideoUrl(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url, window.location.origin);
      if (parsed.hostname.includes('youtube.com') && parsed.searchParams.get('v')) {
        return `https://www.youtube.com/embed/${parsed.searchParams.get('v')}`;
      }
      if (parsed.hostname === 'youtu.be') {
        return `https://www.youtube.com/embed/${parsed.pathname.replace('/', '')}`;
      }
      return parsed.href;
    } catch (_) {
      return url;
    }
  }

  function readSlug() {
    try {
      const params = new URLSearchParams(window.location.search);
      const keys = ['trip', 'id', 'slug'];
      for (const key of keys) {
        const value = params.get(key);
        if (value) return value.trim();
      }
    } catch (_) {}
    return '';
  }
})();
