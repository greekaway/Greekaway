(function(){
  const TEMPLATE_URL = '/trip-photos.html';
  const DEFAULT_ROOT_TEMPLATE = '<div class="trip-photos-root" data-trip-photos-root></div>';
  const DEFAULT_VIEWER_TEMPLATE = '<div id="photoViewerOverlay" class="photo-viewer-overlay" role="dialog" aria-modal="true" hidden><div class="photo-viewer-content"><button type="button" class="photo-viewer-close" aria-label="Κλείσιμο">&times;</button><div class="photo-viewer-meta"><span class="photo-viewer-title" data-photo-viewer-title></span><span class="photo-viewer-counter" data-photo-viewer-counter></span></div><div class="photo-viewer-frame" data-photo-viewer-frame><img data-photo-viewer-image alt="Trip photo" /></div><div class="photo-viewer-dots" data-photo-viewer-dots></div><button type="button" class="photo-viewer-nav prev" aria-label="Προηγούμενη" data-photo-viewer-prev>‹</button><button type="button" class="photo-viewer-nav next" aria-label="Επόμενη" data-photo-viewer-next>›</button></div></div>';

  const state = {
    rootTemplate: DEFAULT_ROOT_TEMPLATE,
    viewerTemplate: DEFAULT_VIEWER_TEMPLATE,
    viewerMounted: false,
    stops: [],
    overlay: null,
    elements: {},
    pointerMap: new Map(),
    gesture: {
      swipeStartX: 0,
      swipeStartY: 0,
      lastDeltaX: 0,
      pinchStartDistance: 0,
      pinchStartScale: 1,
      panStartX: 0,
      panStartY: 0
    },
    activeStopIndex: 0,
    activePhotoIndex: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    isVisible: false,
    thumbHandler: null
  };

  function init(){
    preloadTemplates();
    attachTripListeners();
    ensureViewerMounted();
  }

  function preloadTemplates(){
    fetch(TEMPLATE_URL, { cache: 'no-store' })
      .then(res => res.ok ? res.text() : '')
      .then(html => {
        if (!html) return;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const rootTpl = doc.getElementById('tripPhotosTemplate');
        const viewerTpl = doc.getElementById('tripPhotoViewerTemplate');
        if (rootTpl && rootTpl.innerHTML.trim()) state.rootTemplate = rootTpl.innerHTML.trim();
        if (viewerTpl && viewerTpl.innerHTML.trim()) state.viewerTemplate = viewerTpl.innerHTML.trim();
        ensureViewerMounted();
        dispatchUpdate();
      })
      .catch(() => {});
  }

  function attachTripListeners(){
    if (window.__loadedTrip) updateStops(window.__loadedTrip);
    document.addEventListener('trip:data:ready', (event) => {
      updateStops(event.detail || window.__loadedTrip || null);
    });
  }

  function updateStops(trip){
    if (!trip || !Array.isArray(trip.stops)) {
      state.stops = [];
      dispatchUpdate();
      return;
    }
    const mapped = trip.stops.map((stop, idx) => {
      const photos = normalizePhotos(stop && stop.photos);
      if (!photos.length) return null;
      return { title: getStopTitle(stop, idx), photos };
    }).filter(Boolean);
    state.stops = mapped;
    dispatchUpdate();
  }

  function normalizePhotos(list){
    if (!Array.isArray(list)) return [];
    return list.map(normalizePhoto).filter(Boolean);
  }

  function normalizePhoto(entry){
    const raw = typeof entry === 'string' ? entry : (entry && (entry.url || entry.src || entry.path || entry.href));
    const url = resolveUrl(raw);
    if (!url) return null;
    const thumb = resolveUrl(entry && (entry.thumb || entry.thumbnail || entry.preview)) || url;
    const caption = entry && (entry.caption || entry.alt || entry.title) ? String(entry.caption || entry.alt || entry.title) : '';
    return { url, thumb, caption };
  }

  function resolveUrl(value){
    const str = String(value || '').trim();
    if (!str) return '';
    if (/^https?:/i.test(str)) return str;
    if (str.startsWith('/')) return str;
    return `/uploads/trips/${str}`;
  }

  function getStopTitle(stop, idx){
    const raw = (stop && (stop.title || stop.name || stop.label)) || '';
    if (typeof window.getLocalized === 'function') {
      const localized = window.getLocalized(raw);
      if (localized) return localized;
    }
    return raw || `Στάση ${idx + 1}`;
  }

  function dispatchUpdate(){
    try {
      document.dispatchEvent(new CustomEvent('trip-photos:updated', { detail: { available: state.stops.length > 0 } }));
    } catch(_){ }
  }

  function ensureViewerMounted(){
    if (state.viewerMounted || !document.body) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = state.viewerTemplate;
    const overlay = wrapper.querySelector('#photoViewerOverlay');
    if (!overlay) return;
    document.body.appendChild(overlay);
    state.overlay = overlay;
    state.elements = {
      title: overlay.querySelector('[data-photo-viewer-title]'),
      counter: overlay.querySelector('[data-photo-viewer-counter]'),
      image: overlay.querySelector('[data-photo-viewer-image]'),
      frame: overlay.querySelector('[data-photo-viewer-frame]'),
      dots: overlay.querySelector('[data-photo-viewer-dots]'),
      prev: overlay.querySelector('[data-photo-viewer-prev]'),
      next: overlay.querySelector('[data-photo-viewer-next]'),
      close: overlay.querySelector('.photo-viewer-close')
    };
    bindViewerEvents();
    state.viewerMounted = true;
  }

  function bindViewerEvents(){
    if (!state.overlay) return;
    const { close, prev, next, frame } = state.elements;
    if (close) close.addEventListener('click', closeViewer);
    state.overlay.addEventListener('click', (ev) => {
      if (ev.target === state.overlay) closeViewer();
    });
    if (prev) prev.addEventListener('click', () => navigateRelative(-1));
    if (next) next.addEventListener('click', () => navigateRelative(1));
    window.addEventListener('keydown', (ev) => {
      if (!state.isVisible) return;
      if (ev.key === 'Escape') closeViewer();
      if (ev.key === 'ArrowLeft') navigateRelative(-1);
      if (ev.key === 'ArrowRight') navigateRelative(1);
    });
    if (frame) {
      frame.addEventListener('pointerdown', handlePointerDown);
      frame.addEventListener('pointermove', handlePointerMove);
      frame.addEventListener('pointerup', handlePointerUp);
      frame.addEventListener('pointercancel', handlePointerUp);
      frame.addEventListener('wheel', handleWheel, { passive: false });
    }
  }

  function buildMarkup(){
    syncStops();
    ensureViewerMounted();
    if (!state.stops.length) return '';
    const staging = document.createElement('div');
    staging.innerHTML = state.rootTemplate;
    const root = staging.querySelector('[data-trip-photos-root]') || staging.firstElementChild;
    if (!root) return '';
    root.innerHTML = state.stops.map(buildStopSection).join('');
    return staging.innerHTML;
  }

  function buildStopSection(stop, stopIdx){
    const title = escapeHtml(stop.title);
    const grid = stop.photos.map((photo, photoIdx) => buildThumb(stopIdx, photoIdx, photo, stop.title)).join('');
    return `
      <section class="trip-photo-stop" data-trip-photo-stop="${stopIdx}">
        <p class="trip-photo-stop-title">${title}</p>
        <div class="trip-photo-grid">
          ${grid}
        </div>
      </section>
    `;
  }

  function buildThumb(stopIdx, photoIdx, photo, stopTitle){
    const altBase = photo.caption || `${stopTitle} – Φωτογραφία ${photoIdx + 1}`;
    const alt = escapeHtml(altBase);
    const thumb = escapeHtml(photo.thumb || photo.url);
    return `
      <button class="trip-photo-thumb" type="button" data-stop-index="${stopIdx}" data-photo-index="${photoIdx}" aria-label="${alt}">
        <span class="trip-photo-thumb-inner">
          <img src="${thumb}" alt="${alt}" loading="lazy" decoding="async">
        </span>
      </button>
    `;
  }

  function afterRender(container){
    if (!container) return;
    const root = container.querySelector('[data-trip-photos-root]');
    if (!root) return;
    ensureViewerMounted();
    hydrateLazyImages(root);
    if (!state.thumbHandler) {
      state.thumbHandler = (event) => {
        const btn = event.target.closest('.trip-photo-thumb');
        if (!btn) return;
        const stopIdx = parseInt(btn.dataset.stopIndex, 10);
        const photoIdx = parseInt(btn.dataset.photoIndex, 10);
        if (Number.isNaN(stopIdx) || Number.isNaN(photoIdx)) return;
        openViewer(stopIdx, photoIdx);
      };
    }
    root.removeEventListener('click', state.thumbHandler);
    root.addEventListener('click', state.thumbHandler);
    requestAnimationFrame(() => root.classList.add('is-ready'));
  }

  function hydrateLazyImages(root){
    const images = root.querySelectorAll('img[loading="lazy"]');
    images.forEach(img => {
      const markLoaded = () => { img.dataset.loaded = 'true'; };
      if (img.complete) {
        markLoaded();
      } else {
        img.addEventListener('load', markLoaded, { once: true });
        img.addEventListener('error', markLoaded, { once: true });
      }
    });
  }

  function openViewer(stopIdx, photoIdx){
    syncStops();
    ensureViewerMounted();
    if (!state.overlay || !state.stops[stopIdx]) return;
    state.activeStopIndex = stopIdx;
    state.activePhotoIndex = Math.min(Math.max(photoIdx, 0), state.stops[stopIdx].photos.length - 1);
    resetTransforms();
    renderViewerImage();
    state.overlay.hidden = false;
    requestAnimationFrame(() => state.overlay.classList.add('is-visible'));
    document.body.classList.add('photo-viewer-active');
    state.isVisible = true;
  }

  function closeViewer(){
    if (!state.overlay || !state.isVisible) return;
    state.overlay.classList.remove('is-visible');
    const overlayRef = state.overlay;
    const finalize = () => {
      overlayRef.hidden = true;
      overlayRef.removeEventListener('transitionend', finalize);
    };
    overlayRef.addEventListener('transitionend', finalize, { once: true });
    setTimeout(finalize, 260);
    document.body.classList.remove('photo-viewer-active');
    state.isVisible = false;
    state.pointerMap.clear();
    state.gesture.pinchStartDistance = 0;
  }

  function renderViewerImage(){
    const stop = state.stops[state.activeStopIndex];
    if (!stop) return;
    const photo = stop.photos[state.activePhotoIndex];
    if (!photo || !state.elements.image) return;
    state.elements.image.src = photo.url;
    state.elements.image.alt = photo.caption || `${stop.title} – Φωτογραφία ${state.activePhotoIndex + 1}`;
    if (state.elements.title) state.elements.title.textContent = stop.title;
    if (state.elements.counter) state.elements.counter.textContent = `${state.activePhotoIndex + 1} / ${stop.photos.length}`;
    renderDots(stop);
    updateNavButtons(stop);
    applyTransform();
  }

  function renderDots(stop){
    if (!state.elements.dots) return;
    const total = stop.photos.length;
    const shouldShow = total > 1 && total <= 12;
    if (!shouldShow) {
      state.elements.dots.innerHTML = '';
      return;
    }
    state.elements.dots.innerHTML = stop.photos.map((_, idx) => `<span class="photo-viewer-dot${idx === state.activePhotoIndex ? ' is-active' : ''}"></span>`).join('');
  }

  function updateNavButtons(stop){
    if (state.elements.prev) state.elements.prev.disabled = state.activePhotoIndex === 0;
    if (state.elements.next) state.elements.next.disabled = state.activePhotoIndex >= stop.photos.length - 1;
  }

  function navigateRelative(delta){
    if (!state.isVisible) return;
    const stop = state.stops[state.activeStopIndex];
    if (!stop) return;
    const nextIndex = state.activePhotoIndex + delta;
    if (nextIndex < 0 || nextIndex >= stop.photos.length) return;
    state.activePhotoIndex = nextIndex;
    resetTransforms();
    renderViewerImage();
  }

  function resetTransforms(){
    state.scale = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    state.gesture.panStartX = 0;
    state.gesture.panStartY = 0;
    applyTransform();
  }

  function applyTransform(){
    if (!state.elements.image) return;
    const transform = `translate3d(${state.offsetX}px, ${state.offsetY}px, 0) scale(${state.scale})`;
    state.elements.image.style.transform = transform;
  }

  function handlePointerDown(event){
    if (!state.isVisible || !state.elements.frame) return;
    state.elements.frame.setPointerCapture(event.pointerId);
    state.pointerMap.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (state.pointerMap.size === 1) {
      state.gesture.swipeStartX = event.clientX;
      state.gesture.swipeStartY = event.clientY;
      state.gesture.panStartX = state.offsetX;
      state.gesture.panStartY = state.offsetY;
      state.gesture.lastDeltaX = 0;
    } else if (state.pointerMap.size === 2) {
      const pts = Array.from(state.pointerMap.values());
      state.gesture.pinchStartDistance = distance(pts[0], pts[1]);
      state.gesture.pinchStartScale = state.scale;
    }
  }

  function handlePointerMove(event){
    if (!state.pointerMap.has(event.pointerId) || !state.isVisible) return;
    event.preventDefault();
    state.pointerMap.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (state.pointerMap.size === 2) {
      const pts = Array.from(state.pointerMap.values());
      const dist = distance(pts[0], pts[1]);
      if (state.gesture.pinchStartDistance) {
        const ratio = dist / state.gesture.pinchStartDistance;
        setScale(state.gesture.pinchStartScale * ratio);
      } else {
        state.gesture.pinchStartDistance = dist;
      }
      return;
    }
    if (state.scale > 1) {
      const point = state.pointerMap.get(event.pointerId);
      const dx = point.x - state.gesture.swipeStartX;
      const dy = point.y - state.gesture.swipeStartY;
      setOffsets(state.gesture.panStartX + dx, state.gesture.panStartY + dy);
    } else {
      const point = state.pointerMap.get(event.pointerId);
      state.gesture.lastDeltaX = point.x - state.gesture.swipeStartX;
    }
  }

  function handlePointerUp(event){
    if (!state.pointerMap.has(event.pointerId)) return;
    if (state.elements.frame && state.elements.frame.hasPointerCapture(event.pointerId)) {
      try { state.elements.frame.releasePointerCapture(event.pointerId); } catch(_){ }
    }
    state.pointerMap.delete(event.pointerId);
    if (state.pointerMap.size < 2) {
      state.gesture.pinchStartDistance = 0;
    }
    if (!state.pointerMap.size && state.scale === 1) {
      if (Math.abs(state.gesture.lastDeltaX) > 60) {
        navigateRelative(state.gesture.lastDeltaX < 0 ? 1 : -1);
      }
    }
  }

  function handleWheel(event){
    if (!state.isVisible || !state.elements.frame) return;
    if (!state.elements.frame.contains(event.target)) return;
    if (!event.ctrlKey) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -0.1 : 0.1;
    setScale(state.scale + direction);
  }

  function setScale(next){
    const clamped = Math.max(1, Math.min(next, 3));
    state.scale = clamped;
    clampOffsets();
    applyTransform();
  }

  function setOffsets(x, y){
    state.offsetX = x;
    state.offsetY = y;
    clampOffsets();
    applyTransform();
  }

  function clampOffsets(){
    if (!state.elements.frame) return;
    const rect = state.elements.frame.getBoundingClientRect();
    const maxOffsetX = ((state.scale - 1) * rect.width) / 2;
    const maxOffsetY = ((state.scale - 1) * rect.height) / 2;
    state.offsetX = clamp(state.offsetX, -maxOffsetX, maxOffsetX);
    state.offsetY = clamp(state.offsetY, -maxOffsetY, maxOffsetY);
  }

  function distance(a, b){
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function clamp(value, min, max){
    return Math.min(Math.max(value, min), max);
  }

  function syncStops(){
    if (state.stops.length || !window.__loadedTrip) return;
    updateStops(window.__loadedTrip);
  }

  function escapeHtml(str){
    return String(str || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
  }

  init();

  window.TripPhotos = {
    buildMarkup,
    afterRender,
    hasPhotos: () => {
      syncStops();
      return state.stops.length > 0;
    }
  };
})();
