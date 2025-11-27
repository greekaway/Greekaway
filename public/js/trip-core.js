(() => {
  const state = {
    slug: '',
    trip: null,
    modeKey: '',
    modeData: null,
    mapInstance: null,
    navButtons: []
  };
  let sectionObserver = null;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    document.body.classList.add('trip-view-page');
    document.documentElement.classList.add('trip-view-root');
    setupSectionNav();
    state.slug = readSlug();
    if (!state.slug) {
      showAlert('Δεν βρέθηκε εκδρομή με αυτό το αναγνωριστικό. Επιστρέψτε στις εκδρομές και δοκιμάστε ξανά.');
      setRootState('error');
      return;
    }
    loadTrip();
  }

  async function loadTrip() {
    setRootState('loading');
    try {
      const trip = await fetchTrip(state.slug);
      state.trip = trip;
      const modeInfo = selectMode(trip);
      state.modeKey = modeInfo.key;
      state.modeData = modeInfo.data || {};
      renderTrip(trip, modeInfo);
      bindFooterCta();
      setRootState('ready');
      window.__tripView = { trip, mode: modeInfo };
    } catch (error) {
      console.error('[trip-core] failed to load trip', error);
      showAlert('Παρουσιάστηκε σφάλμα κατά τη φόρτωση της εκδρομής. Δοκιμάστε να ανανεώσετε τη σελίδα.');
      setRootState('error');
    }
  }

  function readSlug() {
    try {
      const params = new URLSearchParams(window.location.search);
      const keys = ['trip', 'slug', 'id'];
      for (const key of keys) {
        const value = params.get(key);
        if (value) return String(value).trim().toLowerCase();
      }
    } catch (_) {}
    return '';
  }

  async function fetchTrip(slug) {
    const encoded = encodeURIComponent(slug);
    const res = await fetch(`/api/trips/${encoded}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Trip fetch failed');
    const payload = await res.json();
    if (!payload || !payload.trip) throw new Error('Trip payload missing');
    return payload.trip;
  }

  function selectMode(trip) {
    const modes = trip.modes || {};
    const params = new URLSearchParams(window.location.search);
    const requested = normalizeModeKey(params.get('mode'));
    if (requested && modes[requested]) return { key: requested, data: modes[requested] };
    const fallback = normalizeModeKey(trip.defaultMode || trip.default_mode);
    if (fallback && modes[fallback]) return { key: fallback, data: modes[fallback] };
    const activeEntry = Object.entries(modes).find(([, data]) => data && data.active);
    if (activeEntry) return { key: activeEntry[0], data: activeEntry[1] };
    const firstEntry = Object.entries(modes).find(([, data]) => data);
    if (firstEntry) return { key: firstEntry[0], data: firstEntry[1] };
    return { key: 'default', data: {} };
  }

  function normalizeModeKey(key) {
    if (!key) return '';
    const alias = { private: 'mercedes' };
    const normalized = String(key).trim().toLowerCase();
    return alias[normalized] || normalized;
  }

  function renderTrip(trip, modeInfo) {
    hideAlert();
    document.body.dataset.view = 'trip';
    if (trip.category) document.body.dataset.category = trip.category;
    renderHero(trip, modeInfo);
    renderOverview(modeInfo, trip.currency);
    renderHighlights(trip, modeInfo);
    renderGallery(trip, modeInfo);
    renderChecklist('trip-includes-list', 'trip-includes-section', collectList(modeInfo.data && modeInfo.data.includes));
    renderChecklist('trip-excludes-list', 'trip-excludes-section', collectList(modeInfo.data && modeInfo.data.excludes));
    renderSections(modeInfo);
    renderStops(modeInfo);
    renderMedia(trip, modeInfo);
    renderFaq(modeInfo);
    renderMap(trip, modeInfo);
    updateSectionNavState();
  }

  function renderHero(trip, modeInfo) {
    const mode = modeInfo.data || {};
    const title = mode.title || trip.title || 'Εκδρομή';
    const tagline = mode.subtitle || trip.subtitle || trip.teaser || '';
    const description = mode.description || trip.description || '';
    const heroImage = selectHeroImage(trip, mode);
    setText('trip-title', title);
    setText('trip-tagline', tagline);
    setText('trip-description', description);
    const modeLabel = formatModeLabel(trip, modeInfo);
    setText('trip-mode-label', modeLabel);
    const heroEl = document.getElementById('trip-hero-image');
    if (heroEl) {
      if (heroImage) {
        heroEl.style.backgroundImage = `url('${heroImage}')`;
        heroEl.classList.add('has-image');
        heroEl.setAttribute('aria-label', `${title}`);
      } else {
        heroEl.style.backgroundImage = '';
        heroEl.classList.remove('has-image');
        heroEl.setAttribute('aria-label', '');
      }
    }
    document.title = `${title} – Greekaway`;
  }

  function renderOverview(modeInfo, currency) {
    const mode = modeInfo.data || {};
    setText('trip-duration', formatDuration(mode));
    setText('trip-price', formatPrice(mode, currency));
    setText('trip-capacity', formatCapacity(mode));
  }

  function renderHighlights(trip, modeInfo) {
    const section = document.getElementById('trip-highlights');
    if (!section) return;
    const mode = modeInfo.data || {};
    const summary = mode.tagline || mode.summary || mode.long_description || trip.teaser || '';
    const tags = dedupeStrings([...(Array.isArray(trip.tags) ? trip.tags : []), ...(Array.isArray(mode.tags) ? mode.tags : [])]);
    const summaryEl = document.getElementById('trip-summary-text');
    if (summaryEl) summaryEl.textContent = summary || '';
    const hasSummary = Boolean(summary);
    const tagsList = document.getElementById('trip-tags');
    if (tagsList) {
      tagsList.innerHTML = '';
      tags.forEach((tag) => {
        const li = document.createElement('li');
        li.textContent = tag;
        tagsList.appendChild(li);
      });
    }
    const hasTags = tags.length > 0;
    section.hidden = !(hasSummary || hasTags);
  }

  function renderGallery(trip, modeInfo) {
    const section = document.getElementById('trip-gallery-section');
    const target = document.getElementById('trip-gallery');
    if (!section || !target) return;
    const mode = modeInfo.data || {};
    const sources = dedupeStrings([
      trip.coverImage,
      trip.heroImage,
      ...(Array.isArray(trip.gallery) ? trip.gallery : []),
      ...(Array.isArray(mode.gallery) ? mode.gallery : []),
      ...(Array.isArray(mode.photos) ? mode.photos : [])
    ]).filter(Boolean);
    target.innerHTML = '';
    if (!sources.length) {
      section.hidden = true;
      return;
    }
    sources.forEach((src) => {
      const img = document.createElement('img');
      img.src = src;
      img.loading = 'lazy';
      img.alt = 'Φωτογραφία εκδρομής';
      target.appendChild(img);
    });
    section.hidden = false;
  }

  function renderChecklist(listId, sectionId, entries) {
    const target = document.getElementById(listId);
    const section = document.getElementById(sectionId);
    if (!target || !section) return;
    target.innerHTML = '';
    if (!entries.length) {
      section.hidden = true;
      return;
    }
    entries.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      target.appendChild(li);
    });
    section.hidden = false;
  }

  function renderSections(modeInfo) {
    const section = document.getElementById('trip-sections-section');
    const target = document.getElementById('trip-sections-grid');
    if (!section || !target) return;
    target.innerHTML = '';
    const sections = (Array.isArray(modeInfo.data && modeInfo.data.sections) ? modeInfo.data.sections : [])
      .filter((block) => block && (block.title || block.content));
    if (!sections.length) {
      section.hidden = true;
      return;
    }
    sections.forEach((block) => {
      const card = document.createElement('article');
      card.className = 'segment-card';
      if (block.title) {
        const h3 = document.createElement('h3');
        h3.textContent = block.title;
        card.appendChild(h3);
      }
      if (block.content) {
        const p = document.createElement('p');
        p.textContent = block.content;
        card.appendChild(p);
      }
      target.appendChild(card);
    });
    section.hidden = false;
  }

  function renderStops(modeInfo) {
    const section = document.getElementById('trip-stops-section');
    const target = document.getElementById('trip-stops-list');
    if (!section || !target) return;
    target.innerHTML = '';
    const stops = (Array.isArray(modeInfo.data && modeInfo.data.stops) ? modeInfo.data.stops : [])
      .filter((stop) => stop && (stop.title || stop.description));
    if (!stops.length) {
      section.hidden = true;
      return;
    }
    stops.forEach((stop) => {
      const card = document.createElement('article');
      card.className = 'stop-card';
      if (stop.title) {
        const h3 = document.createElement('h3');
        h3.textContent = stop.title;
        card.appendChild(h3);
      }
      if (stop.description) {
        const p = document.createElement('p');
        p.textContent = stop.description;
        card.appendChild(p);
      }
      const photos = Array.isArray(stop.images) ? stop.images.filter(Boolean).slice(0, 6) : [];
      if (photos.length) {
        const gallery = document.createElement('div');
        gallery.className = 'stop-gallery';
        photos.forEach((src) => {
          const img = document.createElement('img');
          img.src = src;
          img.alt = stop.title ? `Στάση ${stop.title}` : 'Στάση εκδρομής';
          img.loading = 'lazy';
          gallery.appendChild(img);
        });
        card.appendChild(gallery);
      }
      const videos = Array.isArray(stop.videos) ? stop.videos.filter(Boolean) : [];
      if (videos.length) {
        const videoWrap = document.createElement('div');
        videoWrap.className = 'stop-video';
        const iframe = document.createElement('iframe');
        iframe.src = toEmbedUrl(videos[0]);
        iframe.loading = 'lazy';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        videoWrap.appendChild(iframe);
        card.appendChild(videoWrap);
      }
      target.appendChild(card);
    });
    section.hidden = false;
  }

  function renderMedia(trip, modeInfo) {
    const section = document.getElementById('trip-media-section');
    const grid = document.getElementById('trip-media-grid');
    if (!section || !grid) return;
    grid.innerHTML = '';
    const mode = modeInfo.data || {};
    const tripMedia = trip && trip.media ? trip.media : {};
    const videoLinks = dedupeStrings([
      mode.video && mode.video.url,
      ...(Array.isArray(mode.videos) ? mode.videos : []),
      ...(mode.media && Array.isArray(mode.media.videos) ? mode.media.videos : []),
      ...(Array.isArray(tripMedia.videos) ? tripMedia.videos : [])
    ]).filter(Boolean);
    const miscLinks = dedupeStrings([
      ...(mode.media && Array.isArray(mode.media.links) ? mode.media.links : []),
      ...(Array.isArray(tripMedia.links) ? tripMedia.links : [])
    ]).filter(Boolean);
    const cards = [];
    videoLinks.slice(0, 6).forEach((url) => {
      const card = document.createElement('article');
      card.className = 'media-card';
      const iframe = document.createElement('iframe');
      iframe.src = toEmbedUrl(url);
      iframe.loading = 'lazy';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      card.appendChild(iframe);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = 'Άνοιγμα video';
      card.appendChild(anchor);
      cards.push(card);
    });
    miscLinks.slice(0, 6).forEach((url) => {
      if (videoLinks.includes(url)) return;
      const card = document.createElement('article');
      card.className = 'media-card';
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = 'Άνοιγμα συνδέσμου media';
      card.appendChild(anchor);
      cards.push(card);
    });
    cards.forEach((card) => grid.appendChild(card));
    section.hidden = cards.length === 0;
  }

  function renderFaq(modeInfo) {
    const section = document.getElementById('trip-faq-section');
    const list = document.getElementById('trip-faq-list');
    if (!section || !list) return;
    list.innerHTML = '';
    const faq = (Array.isArray(modeInfo.data && modeInfo.data.faq) ? modeInfo.data.faq : [])
      .filter((item) => item && (item.q || item.question || item.a || item.answer));
    if (!faq.length) {
      section.hidden = true;
      return;
    }
    faq.forEach((item) => {
      const block = document.createElement('article');
      block.className = 'faq-item';
      if (item.q || item.question) {
        const h3 = document.createElement('h3');
        h3.textContent = item.q || item.question;
        block.appendChild(h3);
      }
      if (item.a || item.answer) {
        const p = document.createElement('p');
        p.textContent = item.a || item.answer;
        block.appendChild(p);
      }
      list.appendChild(block);
    });
    section.hidden = false;
  }

  function renderMap(trip, modeInfo) {
    const section = document.getElementById('trip-map-section');
    const list = document.getElementById('trip-route-list');
    const mapLabel = document.getElementById('trip-map-label');
    const mapContainer = document.getElementById('trip-map');
    if (!section || !list || !mapContainer) return;
    list.innerHTML = '';
    mapContainer.innerHTML = '';
    if (state.mapInstance) {
      state.mapInstance.remove();
      state.mapInstance = null;
    }
    const mapData = (modeInfo.data && modeInfo.data.map) || trip.map || {};
    const points = [];
    if (mapData.start) points.push({ label: mapData.start.label || 'Start', ...mapData.start, type: 'start' });
    if (Array.isArray(mapData.route)) {
      mapData.route.forEach((stop) => {
        if (!stop) return;
        points.push({ label: stop.label || 'Stop', ...stop, type: 'route' });
      });
    }
    if (mapData.end) points.push({ label: mapData.end.label || 'End', ...mapData.end, type: 'end' });
    if (!points.length) {
      section.hidden = true;
      return;
    }
    points.forEach((point) => {
      const li = document.createElement('li');
      li.className = 'route-item';
      const strong = document.createElement('strong');
      strong.textContent = labelWithPrefix(point);
      li.appendChild(strong);
      if (point.lat && point.lng) {
        const small = document.createElement('small');
        small.textContent = `${Number(point.lat).toFixed(4)}, ${Number(point.lng).toFixed(4)}`;
        li.appendChild(small);
      }
      list.appendChild(li);
    });
    section.hidden = false;
    if (mapLabel) {
      mapLabel.textContent = mapData.label || 'Προβολή διαδρομής και στάσεων.';
    }
    const latLngPoints = points.filter((point) => isFiniteNumber(point.lat) && isFiniteNumber(point.lng));
    if (window.L && latLngPoints.length) {
      const map = window.L.map(mapContainer, { zoomControl: false, scrollWheelZoom: false });
      state.mapInstance = map;
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
      const latlngs = latLngPoints.map((point) => window.L.latLng(Number(point.lat), Number(point.lng)));
      latlngs.forEach((latlng, idx) => {
        const refPoint = latLngPoints[idx];
        window.L.marker(latlng, { title: refPoint.label || 'Stop' }).addTo(map).bindPopup(refPoint.label || 'Stop');
      });
      if (latlngs.length >= 2) {
        window.L.polyline(latlngs, { color: '#0052cc', weight: 4 }).addTo(map);
      }
      map.fitBounds(window.L.latLngBounds(latlngs), { padding: [24, 24] });
    } else {
      const fallback = document.createElement('p');
      fallback.textContent = 'Ο χάρτης δεν είναι διαθέσιμος αυτή τη στιγμή. Δείτε τις συντεταγμένες δίπλα.';
      mapContainer.appendChild(fallback);
    }
  }

  function bindFooterCta() {
    if (!state.trip) return;
    const tripId = state.trip.id || state.trip.slug || state.slug;
    const target = `/booking/step1?trip=${encodeURIComponent(tripId)}&mode=${encodeURIComponent(state.modeKey || '')}`;
    const apply = () => {
      const button = document.querySelector('footer a.central-btn');
      if (!button) return false;
      button.href = target;
      if (!button.dataset.tripCtaBound) {
        button.dataset.tripCtaBound = '1';
        button.addEventListener('click', (event) => {
          event.preventDefault();
          window.location.assign(target);
        });
      }
      return true;
    };
    if (!apply()) {
      const observer = new MutationObserver(() => {
        if (apply()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 10000);
    }
  }

  function setRootState(next) {
    const root = document.getElementById('trip-root');
    if (root) root.dataset.state = next;
  }

  function showAlert(message) {
    const el = document.getElementById('trip-alert');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
  }

  function hideAlert() {
    const el = document.getElementById('trip-alert');
    if (el) el.hidden = true;
  }

  function formatModeLabel(trip, modeInfo) {
    const mode = modeInfo.data || {};
    if (mode.charge_type === 'per_vehicle') return `${mode.title || trip.title} · Ιδιωτική εμπειρία`;
    if (mode.charge_type === 'per_person') return `${mode.title || trip.title} · Ανά άτομο`;
    return mode.title || trip.title || 'Εμπειρία';
  }

  function formatDuration(mode) {
    const days = toPositiveInt(mode.duration_days || mode.durationDays);
    const hours = parseFloat(mode.duration || mode.duration_hours);
    const labels = [];
    if (days > 1) labels.push(`${days} ημέρες`);
    if (days === 1) labels.push('1 ημέρα');
    if (!Number.isNaN(hours) && hours > 0) labels.push(`${hours} ώρες`);
    return labels.join(' · ') || '—';
  }

  function formatPrice(mode, currency) {
    const formatter = buildCurrencyFormatter(currency || 'EUR');
    if (isFiniteNumber(mode.price_per_person)) {
      return `${formatter(mode.price_per_person)} / άτομο`;
    }
    if (isFiniteNumber(mode.price_total)) {
      return `${formatter(mode.price_total)} / όχημα`;
    }
    return 'Επικοινωνήστε για τιμή';
  }

  function formatCapacity(mode) {
    if (isFiniteNumber(mode.capacity)) return `Έως ${mode.capacity} άτομα`;
    return 'Κατόπιν συνεννόησης';
  }

  function collectList(source) {
    return Array.isArray(source) ? source.filter(Boolean) : [];
  }

  function selectHeroImage(trip, mode) {
    const images = dedupeStrings([
      mode.heroImage,
      trip.heroImage,
      trip.coverImage,
      ...(Array.isArray(mode.gallery) ? mode.gallery : []),
      ...(Array.isArray(trip.gallery) ? trip.gallery : [])
    ]);
    return images[0] || '';
  }

  function dedupeStrings(list) {
    const seen = new Set();
    const result = [];
    list.filter(Boolean).forEach((item) => {
      const key = String(item).trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      result.push(item);
    });
    return result;
  }

  function toEmbedUrl(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url, window.location.origin);
      if (parsed.hostname.includes('youtube.com')) {
        const videoId = parsed.searchParams.get('v');
        if (videoId) return `https://www.youtube.com/embed/${videoId}`;
        if (parsed.pathname.startsWith('/embed/')) return parsed.toString();
      }
      if (parsed.hostname === 'youtu.be') {
        const videoId = parsed.pathname.replace('/', '');
        if (videoId) return `https://www.youtube.com/embed/${videoId}`;
      }
      return parsed.toString();
    } catch (_) {
      return url;
    }
  }

  function buildCurrencyFormatter(currency) {
    try {
      const fmt = new Intl.NumberFormat('el-GR', { style: 'currency', currency });
      return (value) => fmt.format(Number(value));
    } catch (_) {
      return (value) => `${Number(value).toFixed(2)} ${currency}`;
    }
  }

  function isFiniteNumber(value) {
    return Number.isFinite(Number(value));
  }

  function toPositiveInt(value) {
    const num = Number(value);
    return Number.isInteger(num) && num > 0 ? num : 0;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value || '';
  }

  function labelWithPrefix(point) {
    if (point.type === 'start') return `Έναρξη · ${point.label}`;
    if (point.type === 'end') return `Τερματισμός · ${point.label}`;
    return `Στάση · ${point.label}`;
  }

  function setupSectionNav() {
    const nav = document.querySelector('.trip-section-nav');
    if (!nav) return;
    state.navButtons = Array.from(nav.querySelectorAll('button[data-target]'));
    state.navButtons.forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        scrollToSection(button.dataset.target);
      });
    });
    if ('IntersectionObserver' in window) {
      sectionObserver = new IntersectionObserver(handleSectionIntersection, {
        rootMargin: '-45% 0px -45% 0px',
        threshold: [0.05, 0.25, 0.5, 0.75]
      });
    }
  }

  function scrollToSection(sectionId) {
    if (!sectionId) return;
    const section = document.getElementById(sectionId);
    if (!section) return;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    } catch (_) {
      section.scrollIntoView(true);
    }
    highlightNavButton(sectionId);
  }

  function handleSectionIntersection(entries) {
    const candidates = entries
      .filter((entry) => entry.isIntersecting && entry.target && !entry.target.hidden)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
    if (!candidates.length) return;
    highlightNavButton(candidates[0].target.id);
  }

  function highlightNavButton(sectionId) {
    if (!state.navButtons.length || !sectionId) return;
    state.navButtons.forEach((button) => {
      const isActive = button.dataset.target === sectionId && !button.disabled;
      button.classList.toggle('is-active', isActive);
      if (isActive) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  }

  function updateSectionNavState() {
    if (!state.navButtons.length) return;
    let firstAvailable = null;
    state.navButtons.forEach((button) => {
      const target = document.getElementById(button.dataset.target);
      const available = Boolean(target && !target.hidden);
      button.disabled = !available;
      button.classList.toggle('is-disabled', !available);
      if (available && !firstAvailable) firstAvailable = button.dataset.target;
    });
    refreshSectionObservers();
    if (firstAvailable) highlightNavButton(firstAvailable);
  }

  function refreshSectionObservers() {
    if (!sectionObserver) return;
    sectionObserver.disconnect();
    state.navButtons.forEach((button) => {
      const target = document.getElementById(button.dataset.target);
      if (target && !target.hidden) sectionObserver.observe(target);
    });
  }
})();
