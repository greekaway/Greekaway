(function(){
  const MODE_KEYS = ['van','mercedes','bus'];
  const UNTITLED_MODE_TEXT = 'Χωρίς τίτλο';

  const els = {
    title: document.getElementById('title'),
    slug: document.getElementById('slug'),
    subtitle: document.getElementById('subtitle'),
    category: document.getElementById('category'),
    tagsInput: document.getElementById('tagsInput'),
    errors: document.getElementById('formErrors'),
    warning: document.getElementById('categoryWarning'),
    saveBtn: document.getElementById('saveBtn'),
    resetBtn: document.getElementById('resetBtn'),
    deleteBtn: document.getElementById('deleteBtn'),
    tableBody: document.querySelector('#tripsTable tbody'),
    tripsMessage: document.getElementById('tripsMessage'),
    tripIcon: document.getElementById('tripIcon'),
    tripIconPreview: document.getElementById('tripIconPreview'),
    tripIconName: document.getElementById('tripIconName')
  };

  window.TripStopsDraftBridge = window.TripStopsDraftBridge || {};
  let categories = [];
  let trips = [];
  let editingSlug = null;
  let slugManuallyEdited = false;
  let currentTripDraft = null;
  const modeForms = initModeForms();
  MODE_KEYS.forEach((key) => updateModeHeader(key));
  const TRIPS_RENDER_EVENT = 'ga:trips:rendered';
  let rowBindScheduled = false;

  function getModeForm(modeKey, formsRef){
    const registry = formsRef || modeForms;
    if (!registry) return null;
    return registry[modeKey] || null;
  }

  function resolveModeLabel(modeKey, formsRef){
    const cfg = getModeForm(modeKey, formsRef);
    const fieldValue = cfg && cfg.title && cfg.title.value ? cfg.title.value.trim() : '';
    if (fieldValue) return fieldValue;
    if (
      currentTripDraft &&
      currentTripDraft.modes &&
      currentTripDraft.modes[modeKey] &&
      currentTripDraft.modes[modeKey].title
    ) {
      return currentTripDraft.modes[modeKey].title;
    }
    return UNTITLED_MODE_TEXT;
  }

  function updateModeHeader(modeKey, formsRef){
    const cfg = getModeForm(modeKey, formsRef);
    if (!cfg || !cfg.root) return;
    const labelNode = cfg.root.querySelector('[data-mode-label]');
    if (!labelNode) return;
    labelNode.textContent = resolveModeLabel(modeKey, formsRef);
  }
  

  function runSoon(fn){
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(fn);
    } else {
      setTimeout(fn, 0);
    }
  }

  function clearFieldErrors(){
    document.querySelectorAll('.field-error').forEach((node) => {
      node.classList.remove('field-error');
    });
    document.querySelectorAll('.field-error-block').forEach((node) => {
      node.classList.remove('field-error-block');
    });
    document.querySelectorAll('.field-error-hint').forEach((node) => {
      node.remove();
    });
  }

  function markFieldError(element, message){
    if (!element) return;
    const control = element.matches && element.matches('input,textarea,select')
      ? element
      : (element.querySelector && element.querySelector('input,textarea,select'));
    const target = control || element;
    if (control) {
      control.classList.add('field-error');
    } else {
      target.classList.add('field-error-block');
    }
    const host = control && control.closest ? control.closest('label') : null;
    const hintHost = host || target;
    if (!hintHost) return;
    let hint = hintHost.querySelector('.field-error-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'field-error-hint';
      hintHost.appendChild(hint);
    }
    hint.textContent = message || 'Συμπλήρωσε το πεδίο.';
  }

  function focusFirstErrorElement(element){
    if (!element) return;
    const scrollTarget = element.closest ? (element.closest('.mode-card') || element) : element;
    if (scrollTarget && scrollTarget.scrollIntoView) {
      scrollTarget.scrollIntoView({ behavior:'smooth', block:'center' });
    }
    const focusTarget = element.matches && element.matches('input,textarea,select,button')
      ? element
      : (element.querySelector && element.querySelector('input,textarea,select,button'));
    if (focusTarget && typeof focusTarget.focus === 'function') {
      try {
        focusTarget.focus({ preventScroll:true });
      } catch(_){
        focusTarget.focus();
      }
    }
  }

  function refreshImageUploader(){
    try {
      if (window.TripImageUploader && typeof window.TripImageUploader.refresh === 'function') {
        window.TripImageUploader.refresh();
      }
    } catch(err){ console.warn('Trips Admin: updater refresh failed', err); }
  }

  function initModeForms(){
    const forms = {};
    MODE_KEYS.forEach((key) => {
      const root = document.querySelector(`[data-mode-form="${key}"]`);
      if (!root) return;
      forms[key] = {
        root,
        active: root.querySelector('[data-field="active"]'),
        title: root.querySelector('[data-field="title"]'),
        subtitle: root.querySelector('[data-field="subtitle"]'),
        description: root.querySelector('[data-field="description"]'),
        duration: root.querySelector('[data-field="duration"]'),
        durationDays: root.querySelector('[data-field="duration_days"]'),
        pricePerPerson: root.querySelector('[data-field="price_per_person"]'),
        priceTotal: root.querySelector('[data-field="price_total"]'),
        chargeType: root.querySelector('[data-field="charge_type"]'),
        capacity: root.querySelector('[data-field="capacity"]'),
        includesInput: root.querySelector('[data-field="includes"]'),
        excludesInput: root.querySelector('[data-field="excludes"]'),
        galleryInput: root.querySelector('[data-field="gallery"]'),
        videosInput: root.querySelector('[data-field="videos"]'),
        videoUrl: root.querySelector('[data-field="video_url"]'),
        videoThumbnail: root.querySelector('[data-field="video_thumbnail"]'),
        sectionsList: root.querySelector('[data-field="sectionsList"]'),
        faqList: root.querySelector('[data-field="faqList"]'),
        stopsList: root.querySelector('[data-field="stopsList"]'),
        mapStartLabel: root.querySelector('[data-field="map_start_label"]'),
        mapStartLat: root.querySelector('[data-field="map_start_lat"]'),
        mapStartLng: root.querySelector('[data-field="map_start_lng"]'),
        mapEndLabel: root.querySelector('[data-field="map_end_label"]'),
        mapEndLat: root.querySelector('[data-field="map_end_lat"]'),
        mapEndLng: root.querySelector('[data-field="map_end_lng"]'),
        mapRoute: root.querySelector('[data-field="map_route"]')
      };
      if (forms[key].title) {
        forms[key].title.addEventListener('input', () => updateModeHeader(key));
      }
    });
    MODE_KEYS.forEach((key) => updateModeHeader(key, forms));
    document.querySelectorAll('[data-action="add-section"]').forEach((btn) => {
      btn.addEventListener('click', () => addSectionRow(btn.dataset.mode));
    });
    document.querySelectorAll('[data-action="add-faq"]').forEach((btn) => {
      btn.addEventListener('click', () => addFaqRow(btn.dataset.mode));
    });
    document.querySelectorAll('[data-action="add-stop"]').forEach((btn) => {
      btn.addEventListener('click', () => addStopRow(btn.dataset.mode));
    });
    return forms;
  }

  function templateClone(){
    try {
      if (window.TripTemplateLoader && typeof window.TripTemplateLoader.clone === 'function') {
        return window.TripTemplateLoader.clone();
      }
    } catch(err){ console.warn('Trips Admin: template clone failed', err); }
    return {};
  }

  function mergeWithTemplate(source){
    try {
      if (window.TripTemplateLoader && typeof window.TripTemplateLoader.withDefaults === 'function') {
        return window.TripTemplateLoader.withDefaults(source || {});
      }
    } catch(err){ console.warn('Trips Admin: template merge failed', err); }
    return { ...(source||{}) };
  }

  const STOP_SAVE_NOTICE_MS = 3500;

  function linesToArray(val){
    if (val == null) return [];
    if (Array.isArray(val)) return val.map((v)=>String(v||'').trim()).filter(Boolean);
    return String(val).split(/\n/g).map((s)=>s.trim()).filter(Boolean);
  }
  function arrayToLines(arr){
    if (!Array.isArray(arr) || !arr.length) return '';
    return arr.map((s)=>String(s||'').trim()).filter(Boolean).join('\n');
  }
  function ensureTripDraft(){
    if (!currentTripDraft) currentTripDraft = templateClone();
    if (!currentTripDraft.modes || typeof currentTripDraft.modes !== 'object') {
      currentTripDraft.modes = {};
    }
    return currentTripDraft;
  }
  function ensureModeDraft(modeKey){
    const draft = ensureTripDraft();
    if (!draft.modes[modeKey]) draft.modes[modeKey] = {};
    if (!Array.isArray(draft.modes[modeKey].stops)) {
      draft.modes[modeKey].stops = [];
    }
    return draft.modes[modeKey];
  }
  function getStopsDraft(modeKey){
    return ensureModeDraft(modeKey).stops;
  }
  function sanitizeStopEntry(entry){
    const source = entry && typeof entry === 'object' ? entry : {};
    const cleanLines = (value) => {
      if (Array.isArray(value)) return value.map((v)=>String(v||'').trim()).filter(Boolean);
      if (typeof value === 'string') return linesToArray(value);
      return [];
    };
    return {
      title: (source.title || '').trim(),
      description: (source.description || '').trim(),
      images: cleanLines(source.images),
      videos: cleanLines(source.videos)
    };
  }
  function cloneStopsDraft(modeKey){
    return getStopsDraft(modeKey)
      .map((stop)=>sanitizeStopEntry(stop))
      .filter((stop)=>stop.title || stop.description || stop.images.length || stop.videos.length);
  }

  function modeStopsHaveContent(stops){
    if (!Array.isArray(stops)) return false;
    return stops.some((stop) => {
      if (!stop || typeof stop !== 'object') return false;
      if ((stop.title || '').trim()) return true;
      if ((stop.description || '').trim()) return true;
      if (Array.isArray(stop.images) && stop.images.some(Boolean)) return true;
      if (Array.isArray(stop.videos) && stop.videos.some(Boolean)) return true;
      return false;
    });
  }
  function readStopValuesFromItem(item){
    if (!item) return { title:'', description:'', images:[], videos:[] };
    const titleInput = item.querySelector('.stop-title');
    const descriptionInput = item.querySelector('.stop-description');
    const imagesInput = item.querySelector('.stop-images');
    const videosInput = item.querySelector('.stop-videos');
    return {
      title: (titleInput && titleInput.value || '').trim(),
      description: (descriptionInput && descriptionInput.value || '').trim(),
      images: linesToArray(imagesInput && imagesInput.value || ''),
      videos: linesToArray(videosInput && videosInput.value || '')
    };
  }
  function rebuildStopsDraftFromDom(modeKey){
    const cfg = modeForms[modeKey];
    if (!cfg || !cfg.stopsList) return;
    const items = Array.from(cfg.stopsList.querySelectorAll('.stop-item'));
    const stops = items.map((item)=>sanitizeStopEntry(readStopValuesFromItem(item)));
    ensureModeDraft(modeKey).stops = stops;
  }
  function updateStopDraftFromItem(stopItem, options){
    if (!stopItem) return;
    const modeKey = stopItem.dataset.mode || '';
    if (!modeKey) return;
    const cfg = modeForms[modeKey];
    if (!cfg || !cfg.stopsList) return;
    const items = Array.from(cfg.stopsList.querySelectorAll('.stop-item'));
    const index = items.indexOf(stopItem);
    if (index === -1) return;
    const stops = getStopsDraft(modeKey);
    const sanitized = sanitizeStopEntry(readStopValuesFromItem(stopItem));
    while (stops.length <= index) {
      stops.push({ title:'', description:'', images:[], videos:[] });
    }
    stops[index] = sanitized;
    if (options && options.showStatus) showStopSavedStatus(stopItem);
  }
  function showStopSavedStatus(stopItem){
    if (!stopItem) return;
    const status = stopItem.querySelector('.stop-save-status');
    if (!status) return;
    status.textContent = 'Η στάση αποθηκεύτηκε.';
    if (status.__timer) clearTimeout(status.__timer);
    status.__timer = setTimeout(() => {
      status.textContent = '';
      status.__timer = null;
    }, STOP_SAVE_NOTICE_MS);
  }
  function updateAssetCountFromTextarea(textarea, type){
    if (!textarea) return;
    const holder = textarea.parentElement;
    if (!holder) return;
    const counter = holder.querySelector(`.stop-asset-count[data-asset="${type}"]`);
    if (!counter) return;
    const count = linesToArray(textarea.value || '').length;
    const noun = type === 'images' ? 'Εικόνες' : 'Βίντεο';
    if (count > 0) {
      const verb = count === 1 ? 'Προστέθηκε' : 'Προστέθηκαν';
      counter.textContent = `${verb} ${count} ${noun}`;
    } else {
      counter.textContent = `0 ${noun}`;
    }
  }
  function updateStopAssetCounters(stopItem){
    if (!stopItem) return;
    updateAssetCountFromTextarea(stopItem.querySelector('.stop-images'), 'images');
    updateAssetCountFromTextarea(stopItem.querySelector('.stop-videos'), 'videos');
  }
  function removeStopItem(modeKey, item){
    if (!item) return;
    const cfg = modeForms[modeKey];
    if (!cfg || !cfg.stopsList) return;
    item.remove();
    if (!cfg.stopsList.querySelector('.stop-item')) {
      addStopRow(modeKey, {});
      return;
    }
    rebuildStopsDraftFromDom(modeKey);
  }
  function bindStopItemEvents(modeKey, item){
    if (!item || item.dataset.stopBound === '1') return;
    item.dataset.stopBound = '1';
    item.dataset.mode = modeKey;
    const titleInput = item.querySelector('.stop-title');
    const descInput = item.querySelector('.stop-description');
    const imagesInput = item.querySelector('.stop-images');
    const videosInput = item.querySelector('.stop-videos');
    const saveBtn = item.querySelector('.save-stop-btn');
    const removeBtn = item.querySelector('.remove-stop-btn');
    if (titleInput) titleInput.addEventListener('input', () => updateStopDraftFromItem(item));
    if (descInput) descInput.addEventListener('input', () => updateStopDraftFromItem(item));
    if (imagesInput) {
      imagesInput.addEventListener('input', () => {
        updateAssetCountFromTextarea(imagesInput, 'images');
        updateStopDraftFromItem(item);
      });
    }
    if (videosInput) {
      videosInput.addEventListener('input', () => {
        updateAssetCountFromTextarea(videosInput, 'videos');
        updateStopDraftFromItem(item);
      });
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', () => updateStopDraftFromItem(item, { showStatus:true }));
    }
    if (removeBtn) {
      removeBtn.addEventListener('click', () => removeStopItem(modeKey, item));
    }
    updateStopAssetCounters(item);
  }
  function syncStopTextareaExternal(textarea){
    if (!textarea) return;
    const stopItem = textarea.closest('.stop-item');
    if (!stopItem) return;
    const type = textarea.classList.contains('stop-videos') ? 'videos' : 'images';
    updateAssetCountFromTextarea(textarea, type);
    updateStopDraftFromItem(stopItem);
  }
  window.TripStopsDraftBridge.syncFromTextarea = syncStopTextareaExternal;
  function toPositiveInt(v){ const n = parseInt(v,10); return Number.isFinite(n) && n>=0 ? n : 0; }
  function readDurationDaysInput(input){
    if (!input) return null;
    const raw = String(input.value || '').trim();
    if (raw === '') return null;
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) return null;
    return Math.floor(num);
  }

  function isDurationDaysMissing(value){
    return value === '' || value === null || typeof value === 'undefined';
  }
  function toFloatOrNull(v){ const n = parseFloat(v); return Number.isFinite(n) ? n : null; }
  function eurosToNumber(v){ const n = parseFloat(String(v||'').replace(',','.')); return Number.isFinite(n) && n>=0 ? Math.round(n*100)/100 : null; }
  function numberToEuros(num){ if (!Number.isFinite(num) || num<=0) return ''; return num.toFixed(2); }

  function ensureRepeatableHasRow(listEl, factory){
    if (!listEl) return;
    if (!listEl.children.length) listEl.appendChild(factory({}));
  }

  function createSectionItem(modeKey, section){
    const item = document.createElement('div');
    item.className = 'repeatable-item section-item';
    item.dataset.mode = modeKey;
    item.innerHTML = `
      <label>Τίτλος
        <input type="text" class="section-title" placeholder="Τίτλος ενότητας">
      </label>
      <label>Κείμενο
        <textarea class="section-content" rows="3" placeholder="Περιγραφή ενότητας"></textarea>
      </label>
      <div class="inline-actions">
        <button type="button" class="btn danger small remove-section-btn">Διαγραφή</button>
      </div>`;
    const titleInput = item.querySelector('.section-title');
    const contentInput = item.querySelector('.section-content');
    if (titleInput) titleInput.value = section && section.title ? section.title : '';
    if (contentInput) contentInput.value = section && section.content ? section.content : '';
    const removeBtn = item.querySelector('.remove-section-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        const cfg = modeForms[modeKey];
        item.remove();
        ensureRepeatableHasRow(cfg && cfg.sectionsList, (data)=>createSectionItem(modeKey, data));
      });
    }
    return item;
  }

  function addSectionRow(modeKey, section){
    const cfg = modeForms[modeKey];
    if (!cfg || !cfg.sectionsList) return;
    cfg.sectionsList.appendChild(createSectionItem(modeKey, section || {}));
  }

  function renderSectionsForMode(modeKey, sections){
    const cfg = modeForms[modeKey];
    if (!cfg || !cfg.sectionsList) return;
    cfg.sectionsList.innerHTML = '';
    const data = Array.isArray(sections) && sections.length ? sections : [{}];
    data.forEach((entry) => addSectionRow(modeKey, entry));
  }

  function readSectionsFromDom(modeKey){
    const cfg = modeForms[modeKey];
    if (!cfg || !cfg.sectionsList) return [];
    return Array.from(cfg.sectionsList.querySelectorAll('.section-item')).map((item) => {
      const title = (item.querySelector('.section-title')||{}).value || '';
      const content = (item.querySelector('.section-content')||{}).value || '';
      return { title: title.trim(), content: content.trim() };
    }).filter((sec) => sec.title || sec.content);
  }

  function createFaqItem(modeKey, entry){
    const item = document.createElement('div');
    item.className = 'repeatable-item faq-item';
    item.dataset.mode = modeKey;
    item.innerHTML = `
      <label>Ερώτηση
        <input type="text" class="faq-question" placeholder="Π.χ. Τι να έχω μαζί μου;">
      </label>
      <label>Απάντηση
        <textarea class="faq-answer" rows="2" placeholder="Σύντομη απάντηση"></textarea>
      </label>
      <div class="inline-actions">
        <button type="button" class="btn danger small remove-faq-btn">Διαγραφή</button>
      </div>`;
    const qInput = item.querySelector('.faq-question');
    const aInput = item.querySelector('.faq-answer');
    if (qInput) qInput.value = entry && entry.q ? entry.q : '';
    if (aInput) aInput.value = entry && entry.a ? entry.a : '';
    const removeBtn = item.querySelector('.remove-faq-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        const cfg = modeForms[modeKey];
        item.remove();
        ensureRepeatableHasRow(cfg && cfg.faqList, (data)=>createFaqItem(modeKey, data));
      });
    }
    return item;
  }

  function addFaqRow(modeKey, entry){
    const cfg = modeForms[modeKey];
    if (!cfg || !cfg.faqList) return;
    cfg.faqList.appendChild(createFaqItem(modeKey, entry || {}));
  }

  function renderFaqForMode(modeKey, faq){
    const cfg = modeForms[modeKey];
    if (!cfg || !cfg.faqList) return;
    cfg.faqList.innerHTML = '';
    const data = Array.isArray(faq) && faq.length ? faq : [{}];
    data.forEach((entry) => addFaqRow(modeKey, entry));
  }

  function readFaqFromDom(modeKey){
    const cfg = modeForms[modeKey];
    if (!cfg || !cfg.faqList) return [];
    return Array.from(cfg.faqList.querySelectorAll('.faq-item')).map((item) => {
      const q = (item.querySelector('.faq-question')||{}).value || '';
      const a = (item.querySelector('.faq-answer')||{}).value || '';
      return { q: q.trim(), a: a.trim() };
    }).filter((entry) => entry.q || entry.a);
  }

  function createStopItem(modeKey, stop){
    const item = document.createElement('div');
    item.className = 'repeatable-item stop-item';
    item.dataset.mode = modeKey;
    item.innerHTML = `
      <label>Τίτλος στάσης
        <input type="text" class="stop-title" placeholder="Στάση">
      </label>
      <label>Περιγραφή
        <textarea class="stop-description" rows="2" placeholder="Περιγραφή εμπειρίας"></textarea>
      </label>
      <label>Εικόνες (μία ανά γραμμή)
        <textarea class="stop-images" rows="2" placeholder="/uploads/trips/van-stop1.jpg"></textarea>
        <div class="stop-asset-count hint small" data-asset="images">0 Εικόνες</div>
      </label>
      <label>Videos (μία ανά γραμμή)
        <textarea class="stop-videos" rows="2" placeholder="https://youtu.be/...\nhttps://cdn..."></textarea>
        <div class="stop-asset-count hint small" data-asset="videos">0 Βίντεο</div>
      </label>
      <div class="inline-actions">
        <button type="button" class="btn secondary small save-stop-btn">Αποθήκευση στάσης</button>
        <button type="button" class="btn danger small remove-stop-btn">Διαγραφή</button>
        <span class="stop-save-status hint small" aria-live="polite"></span>
      </div>`;
    const titleInput = item.querySelector('.stop-title');
    const descInput = item.querySelector('.stop-description');
    const imagesInput = item.querySelector('.stop-images');
    const videosInput = item.querySelector('.stop-videos');
    if (titleInput) titleInput.value = stop && stop.title ? stop.title : '';
    if (descInput) descInput.value = stop && stop.description ? stop.description : '';
    if (imagesInput) imagesInput.value = arrayToLines(stop && stop.images);
    if (videosInput) videosInput.value = arrayToLines(stop && stop.videos);
    return item;
  }

  function addStopRow(modeKey, stop){
    const cfg = modeForms[modeKey];
    if (!cfg || !cfg.stopsList) return;
    const el = createStopItem(modeKey, stop || {});
    cfg.stopsList.appendChild(el);
    bindStopItemEvents(modeKey, el);
    rebuildStopsDraftFromDom(modeKey);
    refreshImageUploader();
  }

  function renderStopsForMode(modeKey, stops){
    const cfg = modeForms[modeKey];
    if (!cfg || !cfg.stopsList) return;
    cfg.stopsList.innerHTML = '';
    const data = Array.isArray(stops) && stops.length ? stops : [{}];
    data.forEach((entry) => {
      const el = createStopItem(modeKey, entry);
      cfg.stopsList.appendChild(el);
      bindStopItemEvents(modeKey, el);
    });
    rebuildStopsDraftFromDom(modeKey);
    refreshImageUploader();
  }

  function parseRouteTextarea(value){
    return linesToArray(value).map((line) => {
      const parts = line.split(',').map((p)=>p.trim());
      if (!parts.length) return null;
      const lat = toFloatOrNull(parts[0]);
      const lng = toFloatOrNull(parts[1]);
      const label = parts.slice(2).join(',').trim();
      if (lat == null && lng == null && !label) return null;
      return { label, lat, lng };
    }).filter(Boolean);
  }

  function routeArrayToTextarea(route){
    if (!Array.isArray(route) || !route.length) return '';
    return route.map((pt) => {
      const lat = (pt.lat == null) ? '' : String(pt.lat);
      const lng = (pt.lng == null) ? '' : String(pt.lng);
      const label = pt.label || '';
      return [lat, lng, label].filter(Boolean).join(',');
    }).join('\n');
  }

  function readMapFromForm(modeKey){
    const cfg = modeForms[modeKey];
    if (!cfg) return { start:{label:'',lat:null,lng:null}, end:{label:'',lat:null,lng:null}, route:[] };
    return {
      start: {
        label: (cfg.mapStartLabel && cfg.mapStartLabel.value || '').trim(),
        lat: toFloatOrNull(cfg.mapStartLat && cfg.mapStartLat.value),
        lng: toFloatOrNull(cfg.mapStartLng && cfg.mapStartLng.value)
      },
      end: {
        label: (cfg.mapEndLabel && cfg.mapEndLabel.value || '').trim(),
        lat: toFloatOrNull(cfg.mapEndLat && cfg.mapEndLat.value),
        lng: toFloatOrNull(cfg.mapEndLng && cfg.mapEndLng.value)
      },
      route: parseRouteTextarea(cfg.mapRoute && cfg.mapRoute.value || '')
    };
  }

  function renderMapForMode(modeKey, map){
    const cfg = modeForms[modeKey];
    if (!cfg) return;
    const data = map && typeof map === 'object' ? map : {};
    if (cfg.mapStartLabel) cfg.mapStartLabel.value = (data.start && data.start.label) || '';
    if (cfg.mapStartLat) cfg.mapStartLat.value = data.start && data.start.lat != null ? String(data.start.lat) : '';
    if (cfg.mapStartLng) cfg.mapStartLng.value = data.start && data.start.lng != null ? String(data.start.lng) : '';
    if (cfg.mapEndLabel) cfg.mapEndLabel.value = (data.end && data.end.label) || '';
    if (cfg.mapEndLat) cfg.mapEndLat.value = data.end && data.end.lat != null ? String(data.end.lat) : '';
    if (cfg.mapEndLng) cfg.mapEndLng.value = data.end && data.end.lng != null ? String(data.end.lng) : '';
    if (cfg.mapRoute) cfg.mapRoute.value = routeArrayToTextarea(data.route);
  }

  function readModeForm(modeKey){
    const cfg = modeForms[modeKey];
    if (!cfg) return {};
    return {
      active: !!(cfg.active && cfg.active.checked),
      title: (cfg.title && cfg.title.value || '').trim(),
      subtitle: (cfg.subtitle && cfg.subtitle.value || '').trim(),
      description: (cfg.description && cfg.description.value || '').trim(),
      duration: (cfg.duration && cfg.duration.value || '').trim(),
      duration_days: readDurationDaysInput(cfg.durationDays),
      price_per_person: eurosToNumber(cfg.pricePerPerson && cfg.pricePerPerson.value),
      price_total: eurosToNumber(cfg.priceTotal && cfg.priceTotal.value),
      charge_type: (cfg.chargeType && cfg.chargeType.value === 'per_vehicle') ? 'per_vehicle' : 'per_person',
      capacity: cfg.capacity ? Math.max(0, parseInt(cfg.capacity.value||'0',10) || 0) : 0,
      includes: linesToArray(cfg.includesInput && cfg.includesInput.value),
      excludes: linesToArray(cfg.excludesInput && cfg.excludesInput.value),
      sections: readSectionsFromDom(modeKey),
      faq: readFaqFromDom(modeKey),
      stops: cloneStopsDraft(modeKey),
      gallery: linesToArray(cfg.galleryInput && cfg.galleryInput.value),
      videos: linesToArray(cfg.videosInput && cfg.videosInput.value),
      video: {
        url: (cfg.videoUrl && cfg.videoUrl.value || '').trim(),
        thumbnail: (cfg.videoThumbnail && cfg.videoThumbnail.value || '').trim()
      },
      map: readMapFromForm(modeKey)
    };
  }

  function renderModeForm(modeKey, data){
    const cfg = modeForms[modeKey];
    if (!cfg) return;
    const mode = data && typeof data === 'object' ? data : {};
    if (cfg.active) cfg.active.checked = !!mode.active;
    if (cfg.title) cfg.title.value = mode.title || '';
    if (cfg.subtitle) cfg.subtitle.value = mode.subtitle || '';
    if (cfg.description) cfg.description.value = mode.description || '';
    if (cfg.duration) cfg.duration.value = mode.duration || '';
    if (cfg.durationDays) cfg.durationDays.value = mode.duration_days != null ? String(mode.duration_days) : '';
    if (cfg.pricePerPerson) cfg.pricePerPerson.value = numberToEuros(mode.price_per_person);
    if (cfg.priceTotal) cfg.priceTotal.value = numberToEuros(mode.price_total);
    if (cfg.chargeType) cfg.chargeType.value = mode.charge_type === 'per_vehicle' ? 'per_vehicle' : 'per_person';
    if (cfg.capacity) cfg.capacity.value = mode.capacity != null ? String(mode.capacity) : '';
    if (cfg.includesInput) cfg.includesInput.value = arrayToLines(mode.includes);
    if (cfg.excludesInput) cfg.excludesInput.value = arrayToLines(mode.excludes);
    if (cfg.galleryInput) cfg.galleryInput.value = arrayToLines(mode.gallery);
    if (cfg.videosInput) cfg.videosInput.value = arrayToLines(mode.videos);
    if (cfg.videoUrl) cfg.videoUrl.value = mode.video && mode.video.url ? mode.video.url : '';
    if (cfg.videoThumbnail) cfg.videoThumbnail.value = mode.video && mode.video.thumbnail ? mode.video.thumbnail : '';
    renderSectionsForMode(modeKey, mode.sections);
    renderFaqForMode(modeKey, mode.faq);
    renderStopsForMode(modeKey, mode.stops);
    renderMapForMode(modeKey, mode.map);
    updateModeHeader(modeKey);
  }

  function autoSlugFromTitle(){
    if (slugManuallyEdited) return;
    const raw = (els.title && els.title.value || '').trim().toLowerCase();
    const slug = generateSlugFromTitle(raw);
    if (slug) els.slug.value = slug;
  }
  if (els.title) els.title.addEventListener('input', autoSlugFromTitle);
  if (els.slug) {
    els.slug.addEventListener('input', () => {
      slugManuallyEdited = true;
      if (!els.slug.value.trim()) slugManuallyEdited = false;
    });
  }

  const GREEK_MAP = {'α':'a','ά':'a','β':'v','γ':'g','δ':'d','ε':'e','έ':'e','ζ':'z','η':'i','ή':'i','θ':'th','ι':'i','ί':'i','ϊ':'i','ΐ':'i','κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x','ο':'o','ό':'o','π':'p','ρ':'r','σ':'s','ς':'s','τ':'t','υ':'y','ύ':'y','ϋ':'y','ΰ':'y','φ':'f','χ':'ch','ψ':'ps','ω':'o','ώ':'o'};
  function transliterate(s){
    const noDiacritics = String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return noDiacritics.split('').map((ch)=>GREEK_MAP[ch] || ch).join('');
  }
  function sanitizeSlug(raw){
    return String(raw||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }
  function generateSlugFromTitle(title){
    const base = transliterate(title).replace(/['"’]/g,'').replace(/&/g,'-and-');
    return sanitizeSlug(base);
  }

  function showErrors(list){
    if (!list || !list.length){ if (els.errors) els.errors.textContent=''; return; }
    if (els.errors) els.errors.innerHTML = list.map((e)=>`<div>${humanError(e)}</div>`).join('');
  }

  function humanError(code){
    if (!code) return '';
    if (code.startsWith('mode_')){
      const parts = code.split('_');
      const modeKey = parts[1];
      const issue = parts.slice(2).join('_');
      const label = resolveModeLabel(modeKey);
      switch(issue){
        case 'missing_title': return `${label}: απαιτείται τίτλος`;
        case 'missing_description': return `${label}: απαιτείται περιγραφή`;
        case 'missing_duration': return `${label}: συμπλήρωσε διάρκεια`;
        case 'missing_price': return `${label}: απαιτείται τιμή`;
        case 'missing_stops': return `${label}: συμπλήρωσε στάσεις`;
        case 'missing_includes': return `${label}: συμπλήρωσε τι περιλαμβάνεται`;
        default: return `${label}: ${issue}`;
      }
    }
    switch(code){
      case 'missing_title': return 'Απαιτείται Title';
      case 'missing_slug': return 'Απαιτείται Slug';
      case 'missing_category': return 'Απαιτείται Category';
      case 'missing_active_mode': return 'Ενεργοποίησε τουλάχιστον ένα mode';
      default: return code;
    }
  }

  function validateTripForm(values){
    const errors = [];
    let firstInvalid = null;
    const addError = (code, element, message) => {
      if (!errors.includes(code)) errors.push(code);
      if (element) {
        markFieldError(element, message);
        if (!firstInvalid) firstInvalid = element;
      }
    };
    const payload = values || {};
    if (!payload.title) addError('missing_title', els.title, 'Απαιτείται τίτλος');
    if (!payload.slug) addError('missing_slug', els.slug, 'Απαιτείται slug');
    if (!payload.category) addError('missing_category', els.category, 'Διάλεξε κατηγορία');
    const modes = payload.modes || {};
    const activeModes = MODE_KEYS.filter((key) => modes[key] && modes[key].active);
    if (!activeModes.length) {
      const toggle = MODE_KEYS.map((key) => modeForms[key] && modeForms[key].active).find(Boolean);
      addError('missing_active_mode', toggle || (modeForms[MODE_KEYS[0]] && modeForms[MODE_KEYS[0]].root) || els.saveBtn, 'Ενεργοποίησε τουλάχιστον ένα mode');
      return { ok:false, errors, firstInvalid };
    }
    activeModes.forEach((key) => {
      const mode = modes[key] || {};
      const cfg = modeForms[key] || {};
      if (!mode.title) addError(`mode_${key}_missing_title`, cfg.title, 'Συμπλήρωσε τίτλο');
      if (!mode.description) addError(`mode_${key}_missing_description`, cfg.description, 'Συμπλήρωσε περιγραφή');
      const missingDurationDays = isDurationDaysMissing(mode.duration_days);
      if (!mode.duration && missingDurationDays) {
        addError(`mode_${key}_missing_duration`, cfg.durationDays || cfg.duration, 'Δώσε διάρκεια σε ημέρες ή κείμενο');
      }
      const charge = mode.charge_type === 'per_vehicle' ? 'per_vehicle' : 'per_person';
      if (charge === 'per_person' && mode.price_per_person == null) {
        addError(`mode_${key}_missing_price`, cfg.pricePerPerson, 'Συμπλήρωσε τιμή ανά άτομο');
      }
      if (charge === 'per_vehicle' && mode.price_total == null) {
        addError(`mode_${key}_missing_price`, cfg.priceTotal, 'Συμπλήρωσε τιμή οχήματος');
      }
      if (!modeStopsHaveContent(mode.stops)) {
        addError(`mode_${key}_missing_stops`, cfg.stopsList || cfg.root, 'Πρόσθεσε τουλάχιστον μία στάση');
      }
      if (!Array.isArray(mode.includes) || !mode.includes.length) {
        addError(`mode_${key}_missing_includes`, cfg.includesInput, 'Περιέλαβε τι περιλαμβάνεται');
      }
    });
    return { ok: errors.length === 0, errors, firstInvalid };
  }

  function formData(){
    MODE_KEYS.forEach((key)=>rebuildStopsDraftFromDom(key));
    const modes = {};
    MODE_KEYS.forEach((key) => { modes[key] = readModeForm(key); });
    const payload = {
      title: els.title ? els.title.value.trim() : '',
      slug: els.slug ? els.slug.value.trim() : '',
      subtitle: els.subtitle ? els.subtitle.value.trim() : '',
      category: els.category ? els.category.value.trim() : '',
      tags: linesToArray(els.tagsInput && els.tagsInput.value),
      modes
    };
    if (currentTripDraft && currentTripDraft.id) payload.id = currentTripDraft.id;
    if (currentTripDraft && currentTripDraft.createdAt) payload.createdAt = currentTripDraft.createdAt;
    if (currentTripDraft && currentTripDraft.iconPath) payload.iconPath = currentTripDraft.iconPath;
    if (currentTripDraft && currentTripDraft.coverImage) payload.coverImage = currentTripDraft.coverImage;
    return payload;
  }

  function buildTripPayload(values){
    const baseValues = values || formData();
    return mergeWithTemplate(baseValues);
  }

  function renderTable(){
    if (!els.tableBody) return;
    els.tableBody.innerHTML = '';
    if (!trips.length){
      if (els.tripsMessage) els.tripsMessage.textContent = 'Δεν υπάρχουν εκδρομές.';
      scheduleRowBinding();
      emitRenderEvent(0);
      return;
    }
    const fragment = document.createDocumentFragment();
    trips.forEach((trip) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(trip.title || '')}</td>
        <td>${escapeHtml(trip.slug || '')}</td>
        <td>${escapeHtml(trip.category || '')}</td>
        <td>${renderModeSummary(trip.modes)}</td>
        <td>${trip.iconPath ? '<span class="mono">yes</span>' : '—'}</td>
        <td>
          <button type="button" data-slug="${trip.slug}" class="btn secondary edit-btn">Edit</button>
          <button type="button" data-del="${trip.slug}" class="btn danger delete-row-btn">Delete</button>
        </td>`;
      fragment.appendChild(tr);
    });
    els.tableBody.appendChild(fragment);
    if (els.tripsMessage) els.tripsMessage.textContent = '';
    scheduleRowBinding();
    emitRenderEvent(trips.length);
  }

  function renderModeSummary(modes){
    const data = modes && typeof modes === 'object' ? modes : {};
    return MODE_KEYS.map((key) => {
      const block = data[key] || {};
      const active = block.active ? '✓' : '—';
      const charge = block.charge_type === 'per_vehicle' ? ' /vehicle' : ' /person';
      const price = block.charge_type === 'per_vehicle' ? block.price_total : block.price_per_person;
      const priceLabel = Number.isFinite(price) ? `${price.toFixed(2)}€${charge}` : '';
      const label = escapeHtml(block.title || UNTITLED_MODE_TEXT);
      return `<div><strong>${label}:</strong> ${active}${priceLabel ? ` • ${priceLabel}` : ''}</div>`;
    }).join('');
  }

  function escapeHtml(str){
    return String(str||'').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch] || ch));
  }

  async function fetchCategories(){
    try {
      const res = await fetch('/api/categories?published=true', { cache:'no-store' });
      if (res.ok){
        categories = await res.json() || [];
      }
    } catch(err){ console.warn('Trips Admin: fetch categories failed', err); }
    populateCategories();
  }

  function populateCategories(){
    if (!els.category) return;
    const prev = els.category.value;
    els.category.innerHTML = '';
    categories.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat.slug || cat.id || '';
      opt.textContent = cat.title || cat.slug || '';
      els.category.appendChild(opt);
    });
    if (prev && Array.from(els.category.options).some((opt)=>opt.value===prev)) {
      els.category.value = prev;
    }
  }

  async function fetchTrips(){
    try {
      let r = await fetch('/api/admin/trips', { cache:'no-store', credentials:'same-origin' });
      if (!r.ok) {
        console.warn('fetchTrips admin failed', r.status, '-> fallback to public');
        r = await fetch('/api/public/trips', { cache:'no-store' });
      }
      if (r.ok) {
        const data = await r.json();
        trips = Array.isArray(data) ? data : [];
        renderTable();
        if (els.tripsMessage) els.tripsMessage.textContent = '';
      } else if (els.tripsMessage) {
        els.tripsMessage.textContent = 'Σφάλμα φόρτωσης.';
      }
    } catch(e){ console.error('fetchTrips error', e); }
  }

  async function loadTripForEdit(slug){
    if (!slug) return;
    try {
      const res = await fetch('/api/admin/trips/' + encodeURIComponent(slug), { cache:'no-store', credentials:'same-origin' });
      if (!res.ok) throw new Error('fetch_failed');
      const data = await res.json();
      populateForm(data);
    } catch(err){
      console.warn('Trips Admin: failed to fetch trip', slug, err);
      const fallback = trips.find((t)=>t.slug===slug);
      if (fallback) populateForm(fallback);
    }
  }

  function populateForm(trip){
    const tripData = mergeWithTemplate(trip || {});
    currentTripDraft = tripData;
    editingSlug = tripData.slug;
    slugManuallyEdited = true;
    if (els.title) els.title.value = tripData.title || '';
    if (els.slug) els.slug.value = tripData.slug || '';
    if (els.subtitle) els.subtitle.value = tripData.subtitle || '';
    if (els.category) els.category.value = tripData.category || '';
    if (els.tagsInput) els.tagsInput.value = arrayToLines(tripData.tags);
    MODE_KEYS.forEach((key) => renderModeForm(key, tripData.modes && tripData.modes[key]));
    if (els.deleteBtn) els.deleteBtn.disabled = false;
    checkCategoryWarning(tripData.category);
    renderTripIconPreview(tripData.iconPath);
  }

  function resetForm(){
    editingSlug = null;
    slugManuallyEdited = false;
    currentTripDraft = templateClone();
    const draft = currentTripDraft || {};
    if (els.title) els.title.value = '';
    if (els.slug) els.slug.value = '';
    if (els.subtitle) els.subtitle.value = draft.subtitle || '';
    if (els.category) els.category.value = categories.length ? (categories[0].slug || categories[0].id || '') : '';
    if (els.tagsInput) els.tagsInput.value = '';
    MODE_KEYS.forEach((key) => renderModeForm(key, draft.modes && draft.modes[key]));
    if (els.deleteBtn) els.deleteBtn.disabled = true;
    renderTripIconPreview('');
    showErrors([]);
    if (els.tripsMessage) els.tripsMessage.textContent = '';
  }

  function renderTripIconPreview(iconPath){
    if (!els.tripIconPreview) return;
    els.tripIconPreview.innerHTML = '';
    if (!iconPath) {
      if (els.tripIcon) delete els.tripIcon.dataset.filename;
      if (els.tripIconName) els.tripIconName.textContent = '';
      return;
    }
    if (els.tripIcon) els.tripIcon.dataset.filename = iconPath;
    if (els.tripIconName) {
      try { els.tripIconName.textContent = iconPath.split('/').pop() || ''; }
      catch(_) { els.tripIconName.textContent = iconPath; }
    }
    const isSvg = /\.svg(\?|$)/i.test(iconPath);
    if (isSvg) {
      fetch(iconPath, { cache:'no-store' })
        .then((r)=>r.ok ? r.text() : Promise.reject(new Error('svg_fetch_failed')))
        .then((txt) => {
          const cleaned = txt.replace(/<\?xml[^>]*>/ig,'').replace(/<!DOCTYPE[^>]*>/ig,'');
          const div = document.createElement('div');
          div.innerHTML = cleaned;
          const svg = div.querySelector('svg');
          if (svg) {
            svg.removeAttribute('width');
            svg.removeAttribute('height');
            svg.classList.add('svg-icon');
            els.tripIconPreview.appendChild(svg);
          }
        })
        .catch(() => {
          const img = new Image();
          img.src = iconPath;
          img.alt = 'Icon';
          img.className = 'svg-icon';
          img.style.maxWidth = '48px';
          img.style.maxHeight = '48px';
          els.tripIconPreview.appendChild(img);
        });
    } else {
      const img = new Image();
      img.src = iconPath;
      img.alt = 'Icon';
      img.className = 'svg-icon';
      img.style.maxWidth = '48px';
      img.style.maxHeight = '48px';
      els.tripIconPreview.appendChild(img);
    }
  }

  function checkCategoryWarning(catSlug){
    if (!els.warning) return;
    if (!categories.length || categories.some((cat)=>(cat.slug||cat.id)===catSlug)) {
      els.warning.hidden = true;
    } else {
      els.warning.hidden = false;
    }
  }

  async function saveTrip(){
    showErrors([]);
    clearFieldErrors();
    if (els.tripsMessage) { els.tripsMessage.className=''; els.tripsMessage.textContent=''; }
    const formValues = formData();
    const validation = validateTripForm(formValues);
    if (!validation.ok){
      showErrors(validation.errors);
      if (els.tripsMessage){ els.tripsMessage.className='error'; els.tripsMessage.textContent='❌ Συμπλήρωσε όλα τα υποχρεωτικά πεδία.'; }
      focusFirstErrorElement(validation.firstInvalid);
      return;
    }
    if (els.tripsMessage) { els.tripsMessage.className=''; els.tripsMessage.textContent='Αποθήκευση...'; }
    try {
      let iconFilename = (els.tripIcon && els.tripIcon.dataset.filename) ? els.tripIcon.dataset.filename : '';
      if (els.tripIcon && els.tripIcon.files && els.tripIcon.files[0]) {
        const fd = new FormData();
        fd.append('tripIconFile', els.tripIcon.files[0]);
        const up = await fetch('/api/admin/upload-trip-icon', { method:'POST', body: fd });
        const uj = await up.json();
        if (up.ok && uj && uj.ok && uj.filename) iconFilename = `/uploads/trips/${uj.filename}`;
      }
      const payload = buildTripPayload(formValues);
      if (iconFilename) payload.iconPath = iconFilename;
      const res = await fetch('/api/admin/trips', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok || !json.ok){
        showErrors((json && json.errors) || ['save_failed']);
        if (els.tripsMessage){ els.tripsMessage.className='error'; els.tripsMessage.textContent='❌ Σφάλμα αποθήκευσης.'; }
        return;
      }
      if (els.tripsMessage){ els.tripsMessage.className='ok'; els.tripsMessage.textContent='✅ Αποθηκεύτηκε.'; }
      await fetchTrips();
      populateForm(json.trip);
    } catch(e){
      console.error('saveTrip error', e);
      showErrors(['network_error']);
      if (els.tripsMessage){ els.tripsMessage.className='error'; els.tripsMessage.textContent='❌ Σφάλμα δικτύου.'; }
    }
  }

  function showTripDeleteModal(slugOverride){
    if (slugOverride) editingSlug = slugOverride;
    if(!editingSlug) return;
    const m = document.getElementById('tripConfirmModal');
    const ok = document.getElementById('tripConfirmOk');
    const cancel = document.getElementById('tripConfirmCancel');
    if (!m || !ok || !cancel) return;
    m.hidden = false;
    setTimeout(()=>{ try { ok.focus(); } catch(_){ } }, 30);
    function close(){ m.hidden = true; ok.removeEventListener('click', onOk); cancel.removeEventListener('click', onCancel); document.removeEventListener('keydown', onKey); }
    async function onOk(){
      try {
        const r = await fetch('/api/admin/trips/' + encodeURIComponent(editingSlug), { method:'DELETE' });
        if (r.ok){ await fetchTrips(); resetForm(); }
      } catch(e){ console.warn('delete error', e); }
      close();
    }
    function onCancel(){ close(); }
    function onKey(ev){ if (ev.key === 'Escape'){ ev.preventDefault(); close(); } }
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);
  }

  function scheduleRowBinding(){
    if (rowBindScheduled) return;
    rowBindScheduled = true;
    runSoon(() => {
      rowBindScheduled = false;
      bindRowActionButtons();
    });
  }

  function bindRowActionButtons(){
    if (!els.tableBody) return;
    const editButtons = els.tableBody.querySelectorAll('.edit-btn');
    const deleteButtons = els.tableBody.querySelectorAll('.delete-row-btn');
    editButtons.forEach((btn) => {
      btn.removeEventListener('click', handleEditClick);
      btn.addEventListener('click', handleEditClick);
    });
    deleteButtons.forEach((btn) => {
      btn.removeEventListener('click', handleDeleteClick);
      btn.addEventListener('click', handleDeleteClick);
    });
  }

  function resolveActionTarget(event, selector){
    if (!event) return null;
    if (event.currentTarget && event.currentTarget.matches && event.currentTarget.matches(selector)) {
      return event.currentTarget;
    }
    const target = event.target && event.target.closest ? event.target.closest(selector) : null;
    return target || null;
  }

  function handleEditClick(event){
    event.preventDefault();
    const btn = resolveActionTarget(event, '.edit-btn');
    if (!btn) return;
    const slug = btn.getAttribute('data-slug');
    if (slug) loadTripForEdit(slug);
  }

  function handleDeleteClick(event){
    event.preventDefault();
    const btn = resolveActionTarget(event, '.delete-row-btn');
    if (!btn) return;
    const slug = btn.getAttribute('data-del');
    if (slug) showTripDeleteModal(slug);
  }

  function handleSaveClick(event){
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    saveTrip();
  }

  function handlePrimaryDeleteClick(event){
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    showTripDeleteModal();
  }

  function handleResetClick(event){
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    resetForm();
  }

  function handleCategoryChange(){
    if (!els.category) return;
    checkCategoryWarning(els.category.value);
  }

  function emitRenderEvent(rowCount){
    try {
      window.__gaTripsTableRendered = true;
      const detail = { rows: rowCount };
      let evt = null;
      if (typeof window.CustomEvent === 'function') {
        evt = new CustomEvent(TRIPS_RENDER_EVENT, { detail });
      } else if (document.createEvent) {
        evt = document.createEvent('CustomEvent');
        evt.initCustomEvent(TRIPS_RENDER_EVENT, false, false, detail);
      }
      if (evt) window.dispatchEvent(evt);
    } catch(err){ console.warn('Trips Admin: render event dispatch failed', err); }
  }

  async function init(){
    await fetchCategories();
    await fetchTrips();
    if (window.TripTemplateLoader && typeof window.TripTemplateLoader.ensure === 'function') {
      try { await window.TripTemplateLoader.ensure(); }
      catch(err){ console.warn('Trips Admin: template ensure failed', err); }
    }
    resetForm();
  }

  if (els.saveBtn) els.saveBtn.addEventListener('click', handleSaveClick);
  if (els.resetBtn) els.resetBtn.addEventListener('click', handleResetClick);
  if (els.deleteBtn) els.deleteBtn.addEventListener('click', handlePrimaryDeleteClick);
  if (els.category) els.category.addEventListener('change', handleCategoryChange);

  if (els.tripIcon) {
    els.tripIcon.addEventListener('change', () => {
      const f = els.tripIcon.files && els.tripIcon.files[0];
      els.tripIconPreview && (els.tripIconPreview.innerHTML = '');
      if (els.tripIconName) els.tripIconName.textContent = f ? (f.name || '') : '';
      if (!f) { delete els.tripIcon.dataset.filename; return; }
      const isSvg = /\.svg$/i.test(f.name) || f.type === 'image/svg+xml';
      if (isSvg) {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const txt = String(reader.result||'');
            const cleaned = txt.replace(/<\?xml[^>]*>/ig,'').replace(/<!DOCTYPE[^>]*>/ig,'');
            const div = document.createElement('div');
            div.innerHTML = cleaned;
            const svg = div.querySelector('svg');
            if (svg) {
              svg.removeAttribute('width');
              svg.removeAttribute('height');
              svg.classList.add('svg-icon');
              els.tripIconPreview && els.tripIconPreview.appendChild(svg);
            }
          } catch(_){ }
        };
        reader.readAsText(f);
      } else {
        const img = new Image();
        img.src = URL.createObjectURL(f);
        img.alt = 'Icon';
        img.className = 'svg-icon';
        img.style.maxWidth = '48px';
        img.style.maxHeight = '48px';
        els.tripIconPreview && els.tripIconPreview.appendChild(img);
      }
    });
  }

  init();
})();