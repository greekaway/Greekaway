(() => {
  const DEFAULT_SECTION_ID = 'trip-section-description';
  const state = {
    slug: '',
    trip: null,
    modeKey: '',
    modeData: null,
    mapInstance: null,
    mapOverlays: [],
    navButtons: [],
    activeSection: DEFAULT_SECTION_ID,
    stops: [],
    busPickupPoints: [],
    routeMapInfo: null,
    routeMapReady: false
  };
  let lightboxKeyListenerAttached = false;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    document.body.classList.add('trip-view-page');
    document.documentElement.classList.add('trip-view-root');
    setupSectionNav();
    setupFeaturedImageLightboxControls();
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
      state.stops = collectStops(trip, modeInfo);
      state.busPickupPoints = collectBusPickupPoints(modeInfo);
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
    renderDescription(trip, modeInfo);
    renderRouteSection(trip, modeInfo);
    renderChecklist('trip-includes-list', 'trip-section-includes', collectList(state.modeData && state.modeData.includes));
    renderChecklist('trip-excludes-list', 'trip-section-excludes', collectList(state.modeData && state.modeData.excludes));
    renderFaq(trip, modeInfo);
    state.activeSection = DEFAULT_SECTION_ID;
    updateSectionNavState();
  }

  function resolveTripSubtitle(trip, mode) {
    const candidates = [trip && trip.subtitle, mode && mode.subtitle];
    for (const entry of candidates) {
      if (typeof entry !== 'string') continue;
      const trimmed = entry.trim();
      if (trimmed) return trimmed;
    }
    return '';
  }

  function resolveHeroVideoMeta(trip, mode) {
    const modeGalleryFallback = dedupeStrings(collectList(mode && mode.gallery));
    const tripGalleryFallback = dedupeStrings(collectList(trip && trip.gallery));
    const tripVideoObj = (trip && (trip.heroVideo || trip.video)) || {};
    const modeVideoObj = (mode && (mode.heroVideo || mode.video)) || {};
    const modeHeroRaw = mode && mode.heroVideo;
    const tripHeroRaw = trip && trip.heroVideo;
    const url = pickFirstString([
      mode && mode.heroVideoURL,
      mode && mode.heroVideoUrl,
      typeof modeHeroRaw === 'string' ? modeHeroRaw : '',
      modeVideoObj && modeVideoObj.url,
      trip && trip.heroVideoURL,
      trip && trip.heroVideoUrl,
      typeof tripHeroRaw === 'string' ? tripHeroRaw : '',
      tripVideoObj && tripVideoObj.url
    ]);
    const thumbnail = pickFirstString([
      mode && mode.heroThumbnail,
      mode && mode.heroVideoThumbnail,
      modeVideoObj && modeVideoObj.thumbnail,
      modeGalleryFallback[0],
      trip && trip.heroThumbnail,
      trip && trip.heroVideoThumbnail,
      tripVideoObj && tripVideoObj.thumbnail,
      trip && trip.featuredImage,
      tripGalleryFallback[0],
      selectHeroImage(trip, mode)
    ]);
    return { url, thumbnail };
  }

  function renderDescription(trip, modeInfo) {
    const mode = modeInfo.data || {};
    const title = mode.title || trip.title || 'Εκδρομή';
    const subtitle = resolveTripSubtitle(trip, mode);
    const description = mode.description || trip.description || '';
    const featured = trip.featuredImage || selectHeroImage(trip, mode);
    setText('trip-mode-title', title);
    setText('trip-mode-subtitle', subtitle);
    toggleVisibility('trip-mode-subtitle', Boolean(subtitle));
    const durationLabel = formatDuration(mode);
    setText('trip-description-duration', durationLabel);
    setText('trip-description-charge', formatChargeType(mode));
    setText('trip-description-capacity', formatCapacity(mode));
    setText('trip-description-price', formatPrice(mode, trip.currency));
    setParagraphs('trip-description-text', description);
    renderHeroVideoBlock(trip, mode);
    renderTripGallery(trip, mode);
    renderTripVideosBlock(trip, mode);
    const img = document.getElementById('trip-featured-image');
    const featuredFigure = img ? img.closest('.trip-featured-wrapper') : null;
    if (img && featured) {
      img.src = featured;
      img.alt = trip && trip.title ? `Κεντρική φωτογραφία – ${trip.title}` : 'Κεντρική φωτογραφία εκδρομής';
      if (featuredFigure) featuredFigure.removeAttribute('hidden');
      updateFeaturedImageLightbox(featured, img.alt);
    } else {
      if (featuredFigure) featuredFigure.setAttribute('hidden', '');
      updateFeaturedImageLightbox('', '');
      closeFeaturedImageLightbox();
    }
    document.title = `${title} – Greekaway`;
  }

  function renderHeroVideoBlock(trip, mode) {
    const container = document.getElementById('trip-hero-video');
    const previewBtn = container && container.querySelector('[data-trip-hero-preview]');
    const embedHost = container && container.querySelector('[data-trip-hero-embed]');
    const thumbImg = document.getElementById('trip-hero-video-thumb');
    if (!container || !previewBtn || !embedHost || !thumbImg) return;
    const meta = resolveHeroVideoMeta(trip, mode);
    const hasVideo = Boolean(meta.url);
    container.dataset.videoUrl = hasVideo ? meta.url : '';
    embedHost.innerHTML = '';
    embedHost.setAttribute('hidden', '');
    container.classList.remove('is-playing');
    if (!hasVideo) {
      container.setAttribute('hidden', '');
      previewBtn.disabled = true;
      previewBtn.hidden = false;
      previewBtn.removeAttribute('aria-hidden');
      thumbImg.removeAttribute('src');
      return;
    }
    container.removeAttribute('hidden');
    previewBtn.disabled = false;
    previewBtn.hidden = false;
    previewBtn.removeAttribute('aria-hidden');
    previewBtn.setAttribute('aria-label', trip && trip.title ? `Αναπαραγωγή βίντεο για ${trip.title}` : 'Αναπαραγωγή βίντεο εκδρομής');
    thumbImg.alt = trip && trip.title ? `Προεπισκόπηση βίντεο – ${trip.title}` : 'Προεπισκόπηση βίντεο εκδρομής';
    if (meta.thumbnail) {
      thumbImg.src = meta.thumbnail;
    } else {
      thumbImg.removeAttribute('src');
    }
    if (!previewBtn.dataset.heroVideoBound) {
      previewBtn.addEventListener('click', () => activateHeroVideo(container));
      previewBtn.dataset.heroVideoBound = '1';
    }
  }

  function activateHeroVideo(container) {
    if (!container) return;
    const url = container.dataset.videoUrl || '';
    const embedHost = container.querySelector('[data-trip-hero-embed]');
    const previewBtn = container.querySelector('[data-trip-hero-preview]');
    if (!url || !embedHost) return;
    const embedNode = createVideoEmbed(url);
    if (!embedNode) return;
    embedHost.innerHTML = '';
    embedHost.appendChild(embedNode);
    embedHost.removeAttribute('hidden');
    container.classList.add('is-playing');
    if (previewBtn) {
      previewBtn.hidden = true;
      previewBtn.setAttribute('aria-hidden', 'true');
    }
  }

  function renderTripGallery(trip, mode) {
    const container = document.getElementById('trip-description-gallery');
    const track = container && container.querySelector('.trip-gallery-track');
    if (!container || !track) return;
    const modeGallery = dedupeStrings(collectList(mode && mode.gallery));
    const tripGallery = dedupeStrings(collectList(trip && trip.gallery));
    const gallery = modeGallery.length ? modeGallery : tripGallery;
    track.innerHTML = '';
    if (!gallery.length) {
      container.setAttribute('hidden', '');
      return;
    }
    gallery.forEach((src, index) => {
      if (!src) return;
      const figure = document.createElement('figure');
      figure.className = 'trip-gallery-card';
      const img = document.createElement('img');
      img.src = src;
      img.loading = 'lazy';
      img.alt = trip && trip.title ? `${trip.title} – Gallery ${index + 1}` : 'Φωτογραφία εκδρομής';
      figure.appendChild(img);
      track.appendChild(figure);
    });
    container.removeAttribute('hidden');
    track.scrollLeft = 0;
    bindCarouselControls(container, track);
  }

  function renderTripVideosBlock(trip, mode) {
    const container = document.getElementById('trip-description-videos');
    const track = container && container.querySelector('.trip-videos-track');
    if (!container || !track) return;
    const modeVideos = dedupeStrings(collectList(mode && mode.videos));
    const tripVideos = dedupeStrings(collectList(trip && trip.videos));
    const videos = modeVideos.length ? modeVideos : tripVideos;
    track.innerHTML = '';
    if (!videos.length) {
      container.setAttribute('hidden', '');
      return;
    }
    videos.forEach((src, index) => {
      if (!src) return;
      const embed = createVideoEmbed(src);
      if (!embed) return;
      embed.title = trip && trip.title ? `${trip.title} – Video ${index + 1}` : `Trip video ${index + 1}`;
      const card = document.createElement('article');
      card.className = 'trip-video-card';
      card.appendChild(embed);
      track.appendChild(card);
    });
    if (!track.childElementCount) {
      container.setAttribute('hidden', '');
      return;
    }
    container.removeAttribute('hidden');
    track.scrollLeft = 0;
    bindCarouselControls(container, track);
  }

  function bindCarouselControls(container, track) {
    if (!container || !track) return;
    const controls = container.querySelector('.trip-carousel-controls');
    const prev = controls && controls.querySelector('[data-carousel-prev]');
    const next = controls && controls.querySelector('[data-carousel-next]');
    if (!controls || !prev || !next) return;
    const hasMultiple = track.childElementCount > 1;
    controls.hidden = !hasMultiple;
    if (!hasMultiple) {
      prev.onclick = null;
      next.onclick = null;
      prev.disabled = true;
      next.disabled = true;
      track.onscroll = null;
      track.scrollLeft = 0;
      return;
    }
    const isRouteSection = Boolean(container.closest('.trip-route'));
    const desktopPrefersControls = Boolean(isRouteSection && typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(min-width: 1024px)').matches);
    controls.classList.toggle('trip-carousel-controls--force', desktopPrefersControls);
    const scrollAmount = () => Math.max(track.clientWidth * 0.9, 240);
    const updateButtons = () => {
      const maxScroll = Math.max(0, Math.ceil(track.scrollWidth - track.clientWidth));
      const canScroll = maxScroll > 0;
      controls.hidden = !canScroll && !desktopPrefersControls;
      if (!canScroll) {
        prev.disabled = true;
        next.disabled = true;
        return;
      }
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= (maxScroll - 2);
    };
    prev.onclick = (event) => {
      event.preventDefault();
      track.scrollBy({ left: -scrollAmount(), behavior: 'smooth' });
    };
    next.onclick = (event) => {
      event.preventDefault();
      track.scrollBy({ left: scrollAmount(), behavior: 'smooth' });
    };
    track.onscroll = updateButtons;
    updateButtons();
    requestAnimationFrame(updateButtons);
  }

  function renderRouteSection(trip, modeInfo) {
    const section = document.getElementById('trip-section-route');
    const target = document.getElementById('trip-stops-list');
    const mapLabel = document.getElementById('trip-map-label');
    if (!section || !target) return;
    target.innerHTML = '';
    const stops = state.stops || [];
    stops.forEach((stop, index) => {
      const card = document.createElement('article');
      card.className = 'stop-card';

      const head = document.createElement('div');
      head.className = 'stop-card-head';
      const indexLabel = document.createElement('span');
      indexLabel.className = 'stop-card-index';
      indexLabel.textContent = `Στάση ${index + 1}`;
      head.appendChild(indexLabel);
      if (stop.arrivalTime) {
        const arrival = document.createElement('span');
        arrival.className = 'stop-card-arrival';
        const icon = document.createElement('span');
        icon.className = 'stop-time-icon';
        icon.textContent = '🕒';
        icon.setAttribute('aria-hidden', 'true');
        const timeValue = document.createElement('span');
        timeValue.className = 'stop-time-value';
        timeValue.textContent = stop.arrivalTime;
        arrival.appendChild(icon);
        arrival.appendChild(timeValue);
        arrival.setAttribute('aria-label', `Ώρα άφιξης ${stop.arrivalTime}`);
        head.appendChild(arrival);
      }
      if (stop.title) {
        const title = document.createElement('h3');
        title.className = 'stop-card-title';
        title.textContent = stop.title;
        head.appendChild(title);
      }
      card.appendChild(head);

      const galleryNode = buildStopGallery(stop, index);
      if (galleryNode) card.appendChild(galleryNode);

      const videosNode = buildStopVideos(stop, index);
      if (videosNode) card.appendChild(videosNode);

      const descriptionNode = createStopDescription(stop.description);
      if (descriptionNode) card.appendChild(descriptionNode);

      target.appendChild(card);
    });
    const hasStops = stops.length > 0;
    const mapInfo = normalizeMapPoints(trip, modeInfo, stops);
    const hasMap = mapInfo.points.length > 0;
    state.routeMapInfo = mapInfo;
    state.routeMapReady = false;
    if (mapLabel) mapLabel.textContent = '';
    resetRouteMapShell();
    section.hidden = !(hasStops || hasMap);
    if (state.activeSection === 'trip-section-route') {
      ensureRouteMapReady();
    }
  }

  function createStopDescription(text) {
    const value = typeof text === 'string' ? text.trim() : '';
    if (!value) return null;
    const container = document.createElement('div');
    container.className = 'stop-card-description';
    value.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean).forEach((part) => {
      const paragraph = document.createElement('p');
      paragraph.textContent = part;
      container.appendChild(paragraph);
    });
    return container;
  }

  function buildStopGallery(stop, stopIndex) {
    const photos = Array.isArray(stop.photos) ? stop.photos.filter(Boolean) : [];
    if (!photos.length) return null;
    const container = document.createElement('div');
    container.className = 'stop-media trip-gallery';
    container.appendChild(createMediaHead('Gallery',
      `Προηγούμενη φωτογραφία για στάση ${stopIndex + 1}`,
      `Επόμενη φωτογραφία για στάση ${stopIndex + 1}`));
    const track = document.createElement('div');
    track.className = 'trip-gallery-track';
    track.setAttribute('role', 'list');
    photos.forEach((src, idx) => {
      if (!src) return;
      const figure = document.createElement('figure');
      figure.className = 'trip-gallery-card';
      const img = document.createElement('img');
      img.src = src;
      img.loading = 'lazy';
      img.alt = stop.title ? `${stop.title} – Gallery ${idx + 1}` : `Φωτογραφία στάσης ${idx + 1}`;
      figure.appendChild(img);
      track.appendChild(figure);
    });
    if (!track.childElementCount) return null;
    container.appendChild(track);
    bindCarouselControls(container, track);
    return container;
  }

  function buildStopVideos(stop, stopIndex) {
    const videos = Array.isArray(stop.videos) ? stop.videos.filter(Boolean) : [];
    if (!videos.length) return null;
    const container = document.createElement('div');
    container.className = 'stop-media trip-videos';
    container.appendChild(createMediaHead('Βίντεο',
      `Προηγούμενο βίντεο για στάση ${stopIndex + 1}`,
      `Επόμενο βίντεο για στάση ${stopIndex + 1}`));
    const track = document.createElement('div');
    track.className = 'trip-videos-track';
    track.setAttribute('role', 'list');
    videos.forEach((src, idx) => {
      const embed = createVideoEmbed(src);
      if (!embed) return;
      embed.title = stop.title ? `${stop.title} – Video ${idx + 1}` : `Video ${idx + 1}`;
      const card = document.createElement('article');
      card.className = 'trip-video-card';
      card.appendChild(embed);
      track.appendChild(card);
    });
    if (!track.childElementCount) return null;
    container.appendChild(track);
    bindCarouselControls(container, track);
    return container;
  }

  function createMediaHead(labelText, prevLabel, nextLabel) {
    const head = document.createElement('div');
    head.className = 'trip-media-head';
    const title = document.createElement('div');
    title.className = 'trip-media-title';
    title.textContent = labelText;
    head.appendChild(title);
    const controls = document.createElement('div');
    controls.className = 'trip-carousel-controls';
    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'trip-carousel-btn';
    prev.setAttribute('data-carousel-prev', '');
    prev.setAttribute('aria-label', prevLabel || 'Προηγούμενο');
    prev.innerHTML = '<i class="fa-solid fa-chevron-left" aria-hidden="true"></i>';
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'trip-carousel-btn';
    next.setAttribute('data-carousel-next', '');
    next.setAttribute('aria-label', nextLabel || 'Επόμενο');
    next.innerHTML = '<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';
    controls.appendChild(prev);
    controls.appendChild(next);
    head.appendChild(controls);
    return head;
  }

  function resetRouteMapShell() {
    const mapContainer = document.getElementById('route-map');
    state.mapInstance = null;
    state.mapOverlays = [];
    if (mapContainer) mapContainer.innerHTML = '';
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

  function renderFaq(trip, modeInfo) {
    const section = document.getElementById('trip-section-faq');
    const list = document.getElementById('trip-faq-list');
    if (!section || !list) return;
    list.innerHTML = '';
    const tripFaq = Array.isArray(trip.faq) ? trip.faq : [];
    const modeFaq = Array.isArray(modeInfo.data && modeInfo.data.faq) ? modeInfo.data.faq : [];
    const faq = (tripFaq.length ? tripFaq : modeFaq).filter((item) => item && (item.q || item.question || item.a || item.answer));
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

  function renderMap(trip, modeInfo, stops, mapInfoOverride) {
    const mapLabel = document.getElementById('trip-map-label');
    const mapEl = document.getElementById('route-map');
    if (!mapEl) return false;
    mapEl.innerHTML = '';
    state.mapInstance = null;
    state.mapOverlays = [];

    const mapInfo = mapInfoOverride || normalizeMapPoints(trip, modeInfo, stops);
    state.routeMapInfo = mapInfo;
    const markerPoints = Array.isArray(mapInfo && mapInfo.points) ? mapInfo.points.filter((point) => hasLatLng(point)) : [];
    const zoomValue = Number(mapInfo && mapInfo.zoom);
    const zoomLevel = Number.isFinite(zoomValue) && zoomValue > 0 ? zoomValue : 13;
    const hasCenter = mapInfo && hasLatLng(mapInfo.center);
    const label = mapInfo && mapInfo.label ? mapInfo.label : '';

    if (!markerPoints.length) {
      if (mapLabel) mapLabel.textContent = '';
      const fallback = document.createElement('p');
      fallback.textContent = 'Δεν υπάρχουν δεδομένα διαδρομής για αυτή την εκδρομή.';
      mapEl.appendChild(fallback);
      return false;
    }

    if (mapLabel) {
      mapLabel.textContent = label || 'Προβολή διαδρομής και στάσεων.';
    }

    const renderGoogleMap = () => {
      if (!(window.google && window.google.maps)) return false;
      const defaultCenter = resolveRouteMapCenter(mapInfo) || { lat: 37.9838, lng: 23.7278 };
      const map = new window.google.maps.Map(mapEl, {
        center: defaultCenter,
        zoom: zoomLevel,
        mapTypeId: 'roadmap',
        disableDefaultUI: true,
        zoomControl: true,
        fullscreenControl: false,
        streetViewControl: false
      });

      const overlays = [];
      const finalizeReady = () => {
        state.mapInstance = map;
        state.mapOverlays = overlays;
        state.routeMapReady = true;
        setTimeout(() => scheduleRouteMapResize(), 150);
      };

      const fitBoundsToPoints = (points) => {
        if (!points.length) {
          if (hasCenter) {
            map.setCenter(defaultCenter);
            map.setZoom(zoomLevel);
          }
          return;
        }
        if (points.length === 1) {
          map.setCenter(points[0]);
          map.setZoom(zoomLevel);
          return;
        }
        const bounds = new window.google.maps.LatLngBounds();
        points.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds, { top: 24, right: 24, bottom: 24, left: 24 });
      };

      const drawFallbackRoute = () => {
        const markers = addCustomMarkers(map, markerPoints);
        overlays.push(...markers);
        const polylinePath = (mapInfo.routePath || [])
          .filter((point) => hasLatLng(point))
          .map((point) => ({ lat: Number(point.lat), lng: Number(point.lng) }));
        if (polylinePath.length >= 2) {
          const polyline = new window.google.maps.Polyline({
            map,
            path: polylinePath,
            strokeColor: '#0052cc',
            strokeOpacity: 1,
            strokeWeight: 4
          });
          overlays.push(polyline);
          fitBoundsToPoints(polylinePath);
        } else {
          const boundsPoints = markerPoints.map((point) => ({ lat: Number(point.lat), lng: Number(point.lng) }));
          fitBoundsToPoints(boundsPoints);
        }
        finalizeReady();
      };

      if (markerPoints.length >= 2) {
        requestDirectionsRoute(map, markerPoints, mapInfo && mapInfo.travelMode)
          .then(({ renderer, markers, bounds }) => {
            if (renderer) overlays.push(renderer);
            if (Array.isArray(markers) && markers.length) overlays.push(...markers);
            if (bounds) {
              map.fitBounds(bounds, { top: 24, right: 24, bottom: 24, left: 24 });
            } else {
              fitBoundsToPoints(markerPoints.map((point) => ({ lat: Number(point.lat), lng: Number(point.lng) })));
            }
            finalizeReady();
          })
          .catch((error) => {
            console.warn('[trip-core] directions failed', error && error.message ? error.message : error);
            drawFallbackRoute();
          });
      } else {
        drawFallbackRoute();
      }

      return true;
    };

    if (window.google && window.google.maps) {
      return renderGoogleMap();
    }

    ensureGoogleMapsReady()
      .then(() => {
        const rendered = renderGoogleMap();
        if (!rendered) {
          mapEl.textContent = 'Δεν ήταν δυνατή η φόρτωση του χάρτη.';
        }
      })
      .catch((error) => {
        console.warn('[trip-core] google maps load failed', error && error.message ? error.message : error);
        mapEl.textContent = 'Δεν ήταν δυνατή η φόρτωση του χάρτη.';
      });

    return false;
  }

  function normalizeMapPoints(trip, modeInfo, stops) {
    const mapData = (modeInfo.data && modeInfo.data.map) || trip.map || {};
    const center = readLatLng(mapData.center);
    const zoomValue = Number(mapData.zoom);
    const zoom = Number.isFinite(zoomValue) && zoomValue > 0 ? zoomValue : null;
    const label = typeof mapData.label === 'string' ? mapData.label.trim() : '';
    const travelMode = normalizeTravelMode(mapData.travelMode || mapData.travel_mode);
    const points = collectMapWaypoints(mapData, stops);
    return {
      points,
      routePath: points,
      center,
      zoom,
      label,
      travelMode
    };
  }

  function collectMapWaypoints(mapData, stops) {
    const buildDirectPoints = () => {
      if (!Array.isArray(mapData.waypoints)) return [];
      const total = mapData.waypoints.length;
      return mapData.waypoints
        .map((entry, idx) => {
          const type = resolveWaypointType(idx, total);
          return buildMapPoint(entry, type, entry && entry.label ? entry.label : `Σημείο ${idx + 1}`);
        })
        .filter(hasLatLng);
    };

    const directPoints = buildDirectPoints();
    if (directPoints.length) return directPoints;

    const legacyPoints = [];
    const startPoint = buildMapPoint(mapData.start, 'start', 'Έναρξη');
    if (hasLatLng(startPoint)) legacyPoints.push(startPoint);
    const routeEntries = Array.isArray(mapData.route)
      ? mapData.route
      : typeof mapData.route === 'string'
        ? parseLegacyWaypointLines(mapData.route)
        : [];
    const routePoints = routeEntries
      .map((entry, idx) => buildMapPoint(entry, 'waypoint', entry && entry.label ? entry.label : `Σημείο ${idx + 1}`))
      .filter(hasLatLng);
    if (routePoints.length) legacyPoints.push(...routePoints);
    const endPoint = buildMapPoint(mapData.end, 'end', 'Τερματισμός');
    if (hasLatLng(endPoint)) legacyPoints.push(endPoint);
    if (legacyPoints.length) return legacyPoints;

    const stopSource = Array.isArray(stops) ? stops : [];
    const stopPoints = stopSource
      .map((stop, idx) => {
        if (!isFiniteNumber(stop.lat) || !isFiniteNumber(stop.lng)) return null;
        return {
          label: stop.title || `Στάση ${idx + 1}`,
          lat: Number(stop.lat),
          lng: Number(stop.lng),
          type: idx === 0 ? 'start' : (idx === stopSource.length - 1 ? 'end' : 'stop')
        };
      })
      .filter(hasLatLng);
    return stopPoints;
  }

  function resolveWaypointType(index, total) {
    if (!Number.isInteger(index) || !Number.isInteger(total) || total <= 0) return 'waypoint';
    if (total === 1) return 'start';
    if (index === 0) return 'start';
    if (index === total - 1) return 'end';
    return 'waypoint';
  }

  function parseLegacyWaypointLines(value) {
    if (typeof value !== 'string') return [];
    return value
      .split(/\r?\n/g)
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const parts = trimmed.split(',').map((part) => part.trim());
        if (parts.length < 2) return null;
        const lat = Number(parts[0]);
        const lng = Number(parts[1]);
        if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
        const label = parts.slice(2).join(',').trim();
        return { lat, lng, label };
      })
      .filter(Boolean);
  }

  function buildMapPoint(entry, type, fallbackLabel) {
    if (!entry) return null;
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      return {
        label: trimmed || fallbackLabel,
        lat: null,
        lng: null,
        type
      };
    }
    if (Array.isArray(entry) && entry.length >= 2) {
      const lat = Number(entry[0]);
      const lng = Number(entry[1]);
      return {
        label: fallbackLabel,
        lat: isFiniteNumber(lat) ? lat : null,
        lng: isFiniteNumber(lng) ? lng : null,
        type
      };
    }
    if (typeof entry !== 'object') return null;
    const coords = extractCoordinates(entry);
    const label = entry.label || fallbackLabel;
    return {
      label,
      lat: coords.lat,
      lng: coords.lng,
      type
    };
  }

  function readLatLng(entry) {
    if (!entry) return null;
    if (Array.isArray(entry) && entry.length >= 2) {
      const lat = Number(entry[0]);
      const lng = Number(entry[1]);
      if (isFiniteNumber(lat) && isFiniteNumber(lng)) {
        return { lat, lng };
      }
      return null;
    }
    if (typeof entry !== 'object') return null;
    const coords = extractCoordinates(entry);
    return hasLatLng(coords) ? { lat: Number(coords.lat), lng: Number(coords.lng) } : null;
  }

  function hasLatLng(point) {
    return point && isFiniteNumber(point.lat) && isFiniteNumber(point.lng);
  }

  function normalizeTravelMode(mode) {
    const allowed = ['DRIVING', 'WALKING', 'BICYCLING', 'TRANSIT'];
    const normalized = String(mode || '').trim().toUpperCase();
    return allowed.includes(normalized) ? normalized : 'DRIVING';
  }

  function toGoogleTravelMode(mode) {
    if (!(window.google && window.google.maps && window.google.maps.TravelMode)) {
      return 'DRIVING';
    }
    const normalized = normalizeTravelMode(mode);
    const TravelMode = window.google.maps.TravelMode;
    switch (normalized) {
      case 'WALKING':
        return TravelMode.WALKING;
      case 'BICYCLING':
        return TravelMode.BICYCLING;
      case 'TRANSIT':
        return TravelMode.TRANSIT;
      default:
        return TravelMode.DRIVING;
    }
  }

  function toLatLngLiteral(point) {
    return { lat: Number(point.lat), lng: Number(point.lng) };
  }

  function addCustomMarkers(map, points) {
    if (!(window.google && window.google.maps)) return [];
    return points
      .filter((point) => hasLatLng(point))
      .map((point) => {
        return new window.google.maps.Marker({
          map,
          position: toLatLngLiteral(point),
          title: labelWithPrefix(point)
        });
      });
  }

  function requestDirectionsRoute(map, points, travelMode) {
    return new Promise((resolve, reject) => {
      if (!(window.google && window.google.maps)) {
        reject(new Error('google-maps-unavailable'));
        return;
      }
      if (!Array.isArray(points) || points.length < 2) {
        reject(new Error('insufficient-waypoints'));
        return;
      }
      const service = new window.google.maps.DirectionsService();
      const renderer = new window.google.maps.DirectionsRenderer({
        map,
        suppressMarkers: true,
        preserveViewport: true,
        polylineOptions: {
          strokeColor: '#0052cc',
          strokeOpacity: 1,
          strokeWeight: 4
        }
      });
      const origin = toLatLngLiteral(points[0]);
      const destination = toLatLngLiteral(points[points.length - 1]);
      const waypoints = points
        .slice(1, -1)
        .filter((point) => hasLatLng(point))
        .map((point) => ({ location: toLatLngLiteral(point), stopover: true }));
      service.route(
        {
          origin,
          destination,
          waypoints,
          travelMode: toGoogleTravelMode(travelMode),
          provideRouteAlternatives: false,
          optimizeWaypoints: false
        },
        (response, status) => {
          if (status === 'OK' && response) {
            renderer.setDirections(response);
            const markers = addCustomMarkers(map, points);
            const bounds = response.routes && response.routes[0] ? response.routes[0].bounds : null;
            resolve({ renderer, markers, bounds });
          } else {
            renderer.setMap(null);
            reject(new Error(status || 'directions_failed'));
          }
        }
      );
    });
  }

  let googleMapsLoaderPromise = null;

  function ensureGoogleMapsReady() {
    if (window.google && window.google.maps) return Promise.resolve(window.google.maps);
    if (googleMapsLoaderPromise) return googleMapsLoaderPromise;
    googleMapsLoaderPromise = fetch('/api/maps-key', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('maps-key-missing'))))
      .then((payload) => {
        const key = payload && payload.key;
        if (!key || key === 'YOUR_GOOGLE_MAPS_API_KEY') {
          throw new Error('maps-key-missing');
        }
        return new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`;
          script.async = true;
          script.defer = true;
          script.onload = () => resolve(window.google.maps);
          script.onerror = () => reject(new Error('maps-script-error'));
          document.head.appendChild(script);
        });
      })
      .catch((error) => {
        googleMapsLoaderPromise = null;
        throw error;
      });
    return googleMapsLoaderPromise;
  }

  function scheduleRouteMapResize() {
    if (!(window.google && window.google.maps && state.mapInstance)) return;
    const center = resolveRouteMapCenter(state.routeMapInfo);
    window.google.maps.event.trigger(state.mapInstance, 'resize');
    if (center) state.mapInstance.setCenter(center);
  }

  function resolveRouteMapCenter(mapInfo) {
    const info = mapInfo || state.routeMapInfo;
    if (!info) return null;
    if (hasLatLng(info.center)) return { lat: Number(info.center.lat), lng: Number(info.center.lng) };
    const fallback = (info.routePath && info.routePath.find((point) => hasLatLng(point))) ||
      (info.points && info.points.find((point) => hasLatLng(point)));
    return fallback ? { lat: Number(fallback.lat), lng: Number(fallback.lng) } : null;
  }

  function setupFeaturedImageLightboxControls() {
    const trigger = document.querySelector('.trip-featured-trigger');
    if (trigger && !trigger.dataset.tripLightboxBound) {
      trigger.dataset.tripLightboxBound = '1';
      trigger.addEventListener('click', () => openFeaturedImageLightbox());
    }
    const overlay = document.getElementById('trip-featured-lightbox');
    if (overlay && !overlay.dataset.tripLightboxBound) {
      overlay.dataset.tripLightboxBound = '1';
      overlay.addEventListener('click', (event) => {
        if (event.target.closest('[data-trip-lightbox-close]')) {
          closeFeaturedImageLightbox();
        }
      });
    }
    if (!lightboxKeyListenerAttached) {
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeFeaturedImageLightbox();
      });
      lightboxKeyListenerAttached = true;
    }
  }

  function updateFeaturedImageLightbox(src, altText) {
    const trigger = document.querySelector('.trip-featured-trigger');
    if (!trigger) return;
    if (src) {
      trigger.dataset.lightboxSrc = src;
      trigger.dataset.lightboxAlt = altText || 'Κεντρική φωτογραφία εκδρομής';
      trigger.removeAttribute('disabled');
    } else {
      trigger.dataset.lightboxSrc = '';
      trigger.dataset.lightboxAlt = '';
      trigger.setAttribute('disabled', 'disabled');
    }
  }

  function openFeaturedImageLightbox() {
    const trigger = document.querySelector('.trip-featured-trigger');
    if (!trigger) return;
    const src = trigger.dataset.lightboxSrc;
    if (!src) return;
    const overlay = document.getElementById('trip-featured-lightbox');
    const img = document.getElementById('trip-featured-lightbox-img');
    if (!overlay || !img) return;
    img.src = src;
    img.alt = trigger.dataset.lightboxAlt || 'Κεντρική φωτογραφία εκδρομής';
    overlay.removeAttribute('hidden');
    document.body.classList.add('trip-lightbox-open');
  }

  function closeFeaturedImageLightbox() {
    const overlay = document.getElementById('trip-featured-lightbox');
    if (!overlay || overlay.hasAttribute('hidden')) return;
    overlay.setAttribute('hidden', '');
    document.body.classList.remove('trip-lightbox-open');
  }
  function bindFooterCta() {
    if (!state.trip) return;
    const tripSlug = resolveTripSlug();
    const target = `/booking/step1?trip=${encodeURIComponent(tripSlug)}&mode=${encodeURIComponent(state.modeKey || '')}`;
    const bindAction = (node) => {
      if (!node) return false;
      if (node.tagName && node.tagName.toLowerCase() === 'a') {
        node.href = target;
      }
      node.dataset.tripReserveTarget = target;
      if (!node.dataset.tripCtaBound) {
        node.dataset.tripCtaBound = '1';
        node.addEventListener('click', (event) => {
          event.preventDefault();
          window.location.assign(target);
        });
      }
      return true;
    };
    document.querySelectorAll('[data-trip-reserve-btn]').forEach((node) => bindAction(node));
    const applyFooterCta = () => {
      const button = document.querySelector('footer a.central-btn');
      return bindAction(button);
    };
    if (!applyFooterCta()) {
      const observer = new MutationObserver(() => {
        if (applyFooterCta()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 10000);
    }
  }

  function resolveTripSlug(){
    const tryVal = (val) => {
      if (val == null) return '';
      const str = String(val).trim();
      return str;
    };
    const candidates = [
      tryVal(state.trip && state.trip.slug),
      tryVal(state.slug),
      tryVal(state.tripParam),
      tryVal(state.trip && state.trip.id)
    ].filter(Boolean);
    if (!candidates.length) return '';
    const looksUuid = (val) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    const slugMatch = candidates.find((val) => !looksUuid(val));
    return slugMatch || candidates[0];
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

  function formatChargeType(mode) {
    const type = (mode.charge_type || mode.chargeType || '').toLowerCase();
    if (type === 'per_vehicle') return 'Ανά όχημα';
    if (type === 'per_person') return 'Ανά άτομο';
    if (type === 'per_group') return 'Ανά γκρουπ';
    return 'Κατόπιν συνεννόησης';
  }

  function collectList(source) {
    if (Array.isArray(source)) {
      return source
        .map((entry) => typeof entry === 'string' ? entry.trim() : String(entry || '').trim())
        .filter(Boolean);
    }
    if (typeof source === 'string') {
      return source
        .split(/\r?\n|,/g)
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    return [];
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
      result.push(key);
    });
    return result;
  }

  function pickFirstString(list) {
    if (!Array.isArray(list)) return '';
    for (const entry of list) {
      if (typeof entry !== 'string') continue;
      const trimmed = entry.trim();
      if (trimmed) return trimmed;
    }
    return '';
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

  function createVideoEmbed(url) {
    if (!url) return null;
    if (isMp4Url(url)) {
      const video = document.createElement('video');
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.src = url;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      return video;
    }
    const iframe = document.createElement('iframe');
    iframe.src = toEmbedUrl(url);
    iframe.loading = 'lazy';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    return iframe;
  }

  function isMp4Url(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url, window.location.origin);
      return /\.mp4$/i.test(parsed.pathname || '');
    } catch (_) {
      return /\.mp4(\?|#|$)/i.test(String(url));
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
        if (button.disabled) return;
        activateSection(button.dataset.target);
      });
    });
    activateSection(state.activeSection);
  }

  function activateSection(sectionId) {
    const requested = sectionId || DEFAULT_SECTION_ID;
    const resolved = getAvailableSectionId(requested) || getFirstEnabledSectionId();
    state.activeSection = resolved;
    const panels = document.querySelectorAll('[data-trip-panel]');
    panels.forEach((panel) => {
      const isActive = !panel.hidden && panel.id === resolved;
      panel.classList.toggle('is-active', isActive);
      panel.setAttribute('aria-hidden', String(!isActive));
    });
    state.navButtons.forEach((button) => {
      const isActive = button.dataset.target === resolved && !button.disabled;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });
    if (resolved === 'trip-section-route') {
      ensureRouteMapReady();
    }
  }

  function ensureRouteMapReady() {
    if (!state.trip) return false;
    const modeInfo = { key: state.modeKey, data: state.modeData || {} };
    if (!state.routeMapInfo) {
      state.routeMapInfo = normalizeMapPoints(state.trip, modeInfo, state.stops || []);
    }
    if (!state.routeMapReady) {
      return renderMap(state.trip, modeInfo, state.stops || [], state.routeMapInfo);
    }
    scheduleRouteMapResize();
    return Boolean(state.routeMapInfo && state.routeMapInfo.points && state.routeMapInfo.points.length);
  }

  function getAvailableSectionId(sectionId) {
    if (!sectionId) return '';
    const panel = document.getElementById(sectionId);
    if (!panel || panel.hidden) return '';
    return sectionId;
  }

  function getFirstEnabledSectionId() {
    const button = state.navButtons.find((item) => !item.disabled);
    return (button && button.dataset.target) || DEFAULT_SECTION_ID;
  }

  function updateSectionNavState() {
    if (!state.navButtons.length) return;
    state.navButtons.forEach((button) => {
      const panel = document.getElementById(button.dataset.target);
      const available = Boolean(panel && !panel.hidden);
      button.disabled = !available;
      button.classList.toggle('is-disabled', !available);
      if (!available) button.removeAttribute('aria-selected');
    });
    activateSection(state.activeSection);
  }

  function normalizeStopTime(value) {
    if (value === null || typeof value === 'undefined') return '';
    let raw = typeof value === 'number' ? String(value) : String(value || '');
    raw = raw.trim();
    if (!raw) return '';
    const colonMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
    let hours;
    let minutes;
    if (colonMatch) {
      hours = parseInt(colonMatch[1], 10);
      minutes = parseInt(colonMatch[2], 10);
    } else if (/^\d{3,4}$/.test(raw)) {
      hours = parseInt(raw.slice(0, raw.length - 2), 10);
      minutes = parseInt(raw.slice(-2), 10);
    } else {
      return '';
    }
    if (!Number.isFinite(hours) || hours < 0 || hours > 23) return '';
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) return '';
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  function collectBusPickupPoints(modeInfo) {
    const list = modeInfo && modeInfo.data && Array.isArray(modeInfo.data.busPickupPoints)
      ? modeInfo.data.busPickupPoints
      : [];
    return list
      .map((point) => {
        if (!point || typeof point !== 'object') return null;
        const title = point.title || '';
        const address = point.address || '';
        const departureTime = normalizeStopTime(point.departureTime || point.time);
        if (!title && !address && !departureTime) return null;
        return { title, address, departureTime };
      })
      .filter(Boolean);
  }

  function collectStops(trip, modeInfo) {
    const tripStops = Array.isArray(trip.stops) ? trip.stops : [];
    const modeStops = Array.isArray(modeInfo.data && modeInfo.data.stops) ? modeInfo.data.stops : [];
    const source = modeStops.length ? modeStops : tripStops;
    return source
      .map((stop) => {
        if (!stop || typeof stop !== 'object') return null;
        const coords = extractCoordinates(stop);
        const photos = dedupeStrings([
          ...collectList(stop.photos),
          ...collectList(stop.images)
        ]);
        const videos = dedupeStrings(collectList(stop.videos));
        const arrivalTime = normalizeStopTime(stop.arrivalTime || stop.arrival_time || stop.time);
        return {
          title: stop.title || '',
          description: stop.description || '',
          photos,
          videos,
          arrivalTime,
          lat: coords.lat,
          lng: coords.lng
        };
      })
      .filter(Boolean);
  }

  function extractCoordinates(stop) {
    const directLat = stop.lat ?? stop.latitude;
    const directLng = stop.lng ?? stop.longitude;
    if (isFiniteNumber(directLat) && isFiniteNumber(directLng)) {
      return { lat: Number(directLat), lng: Number(directLng) };
    }
    const nested = stop.coordinates || stop.location || stop.position;
    if (nested && isFiniteNumber(nested.lat) && isFiniteNumber(nested.lng)) {
      return { lat: Number(nested.lat), lng: Number(nested.lng) };
    }
    if (Array.isArray(stop.coords) && stop.coords.length === 2) {
      const [lat, lng] = stop.coords;
      if (isFiniteNumber(lat) && isFiniteNumber(lng)) {
        return { lat: Number(lat), lng: Number(lng) };
      }
    }
    return { lat: null, lng: null };
  }

  function setParagraphs(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '';
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) {
      el.setAttribute('hidden', '');
      return;
    }
    const parts = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    if (!parts.length) {
      el.setAttribute('hidden', '');
      return;
    }
    parts.forEach((part) => {
      const p = document.createElement('p');
      p.textContent = part;
      el.appendChild(p);
    });
    el.removeAttribute('hidden');
  }

  function toggleVisibility(target, visible) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return;
    if (visible) el.removeAttribute('hidden');
    else el.setAttribute('hidden', '');
  }
})();
