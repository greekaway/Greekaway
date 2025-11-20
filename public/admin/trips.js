(function(){
  const MODE_KEYS = ['van','mercedes','bus'];
  const MODE_LABELS = {
    van: 'Premium Van',
    mercedes: 'Private Mercedes',
    bus: 'Classic Bus'
  };

  const els = {
    title: document.getElementById('title'),
    slug: document.getElementById('slug'),
    description: document.getElementById('description'),
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

  const modeForms = initModeForms();
  let categories = [];
  let trips = [];
  let editingSlug = null;
  let slugManuallyEdited = false;
  let currentTripDraft = null;

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
        durationHours: root.querySelector('[data-field="duration_hours"]'),
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
    });
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

  function linesToArray(val){
    if (val == null) return [];
    if (Array.isArray(val)) return val.map((v)=>String(v||'').trim()).filter(Boolean);
    return String(val).split(/\n/g).map((s)=>s.trim()).filter(Boolean);
  }
  function arrayToLines(arr){
    if (!Array.isArray(arr) || !arr.length) return '';
    return arr.map((s)=>String(s||'').trim()).filter(Boolean).join('\n');
  }
  function toPositiveInt(v){ const n = parseInt(v,10); return Number.isFinite(n) && n>=0 ? n : 0; }
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
      </label>
      <label>Videos (μία ανά γραμμή)
        <textarea class="stop-videos" rows="2" placeholder="https://youtu.be/...\nhttps://cdn..."></textarea>
      </label>
      <div class="inline-actions">
        <button type="button" class="btn danger small remove-stop-btn">Διαγραφή</button>
      </div>`;
    const titleInput = item.querySelector('.stop-title');
    const descInput = item.querySelector('.stop-description');
    const imagesInput = item.querySelector('.stop-images');
    const videosInput = item.querySelector('.stop-videos');
    if (titleInput) titleInput.value = stop && stop.title ? stop.title : '';
    if (descInput) descInput.value = stop && stop.description ? stop.description : '';
    if (imagesInput) imagesInput.value = arrayToLines(stop && stop.images);
    if (videosInput) videosInput.value = arrayToLines(stop && stop.videos);
    const removeBtn = item.querySelector('.remove-stop-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        const cfg = modeForms[modeKey];
        item.remove();
        ensureRepeatableHasRow(cfg && cfg.stopsList, (data)=>createStopItem(modeKey, data));
      });
    }
    return item;
  }

  function addStopRow(modeKey, stop){
    const cfg = modeForms[modeKey];
    if (!cfg || !cfg.stopsList) return;
    cfg.stopsList.appendChild(createStopItem(modeKey, stop || {}));
  }

  function renderStopsForMode(modeKey, stops){
    const cfg = modeForms[modeKey];
    if (!cfg || !cfg.stopsList) return;
    cfg.stopsList.innerHTML = '';
    const data = Array.isArray(stops) && stops.length ? stops : [{}];
    data.forEach((entry) => addStopRow(modeKey, entry));
  }

  function readStopsFromDom(modeKey){
    const cfg = modeForms[modeKey];
    if (!cfg || !cfg.stopsList) return [];
    return Array.from(cfg.stopsList.querySelectorAll('.stop-item')).map((item) => {
      const title = (item.querySelector('.stop-title')||{}).value || '';
      const description = (item.querySelector('.stop-description')||{}).value || '';
      const images = linesToArray((item.querySelector('.stop-images')||{}).value || '');
      const videos = linesToArray((item.querySelector('.stop-videos')||{}).value || '');
      return { title: title.trim(), description: description.trim(), images, videos };
    }).filter((stop) => stop.title || stop.description || stop.images.length || stop.videos.length);
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
      duration_hours: cfg.durationHours ? toPositiveInt(cfg.durationHours.value) : 0,
      duration_days: cfg.durationDays ? toPositiveInt(cfg.durationDays.value) : 0,
      price_per_person: eurosToNumber(cfg.pricePerPerson && cfg.pricePerPerson.value),
      price_total: eurosToNumber(cfg.priceTotal && cfg.priceTotal.value),
      charge_type: (cfg.chargeType && cfg.chargeType.value === 'per_vehicle') ? 'per_vehicle' : 'per_person',
      capacity: cfg.capacity ? Math.max(0, parseInt(cfg.capacity.value||'0',10) || 0) : 0,
      includes: linesToArray(cfg.includesInput && cfg.includesInput.value),
      excludes: linesToArray(cfg.excludesInput && cfg.excludesInput.value),
      sections: readSectionsFromDom(modeKey),
      faq: readFaqFromDom(modeKey),
      stops: readStopsFromDom(modeKey),
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
    if (cfg.durationHours) cfg.durationHours.value = mode.duration_hours != null ? String(mode.duration_hours) : '';
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
      const label = MODE_LABELS[modeKey] || modeKey;
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

  function formData(){
    const modes = {};
    MODE_KEYS.forEach((key) => { modes[key] = readModeForm(key); });
    const payload = {
      title: els.title ? els.title.value.trim() : '',
      slug: els.slug ? els.slug.value.trim() : '',
      subtitle: els.subtitle ? els.subtitle.value.trim() : '',
      description: els.description ? els.description.value.trim() : '',
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
    if (!trips.length){ els.tripsMessage && (els.tripsMessage.textContent = 'Δεν υπάρχουν εκδρομές.'); return; }
    trips.forEach((trip) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(trip.title || '')}</td>
        <td>${escapeHtml(trip.slug || '')}</td>
        <td>${escapeHtml(trip.category || '')}</td>
        <td>${escapeHtml(trip.duration || '')}</td>
        <td>${renderModeSummary(trip.modes)}</td>
        <td>${trip.iconPath ? '<span class="mono">yes</span>' : '—'}</td>
        <td>
          <button type="button" data-slug="${trip.slug}" class="btn secondary edit-btn">Edit</button>
          <button type="button" data-del="${trip.slug}" class="btn danger delete-row-btn">Delete</button>
        </td>`;
      const editBtn = tr.querySelector('.edit-btn');
      const delBtn = tr.querySelector('.delete-row-btn');
      if (editBtn) editBtn.addEventListener('click', () => loadTripForEdit(trip.slug));
      if (delBtn) delBtn.addEventListener('click', () => showTripDeleteModal(trip.slug));
      els.tableBody.appendChild(tr);
    });
  }

  function renderModeSummary(modes){
    const data = modes && typeof modes === 'object' ? modes : {};
    return MODE_KEYS.map((key) => {
      const block = data[key] || {};
      const active = block.active ? '✓' : '—';
      const charge = block.charge_type === 'per_vehicle' ? ' /vehicle' : ' /person';
      const price = block.charge_type === 'per_vehicle' ? block.price_total : block.price_per_person;
      const priceLabel = Number.isFinite(price) ? `${price.toFixed(2)}€${charge}` : '';
      return `<div><strong>${MODE_LABELS[key]}:</strong> ${active}${priceLabel ? ` • ${priceLabel}` : ''}</div>`;
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
    if (els.description) els.description.value = tripData.description || '';
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
    if (els.description) els.description.value = draft.description || '';
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
    if (els.tripsMessage) { els.tripsMessage.className=''; els.tripsMessage.textContent='Αποθήκευση...'; }
    const formValues = formData();
    const errs = [];
    if(!formValues.title) errs.push('missing_title');
    if(!formValues.slug) errs.push('missing_slug');
    if(!formValues.category) errs.push('missing_category');
    if (errs.length){ showErrors(errs); return; }
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

  async function init(){
    await fetchCategories();
    await fetchTrips();
    if (window.TripTemplateLoader && typeof window.TripTemplateLoader.ensure === 'function') {
      try { await window.TripTemplateLoader.ensure(); }
      catch(err){ console.warn('Trips Admin: template ensure failed', err); }
    }
    resetForm();
  }

  if (els.saveBtn) els.saveBtn.addEventListener('click', saveTrip);
  if (els.resetBtn) els.resetBtn.addEventListener('click', resetForm);
  if (els.deleteBtn) els.deleteBtn.addEventListener('click', () => showTripDeleteModal());
  if (els.category) els.category.addEventListener('change', ()=>checkCategoryWarning(els.category.value));

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
(function(){
  const els = {
    title: document.getElementById('title'),
    slug: document.getElementById('slug'),
    description: document.getElementById('description'),
    subtitle: document.getElementById('subtitle'),
    category: document.getElementById('category'),
    duration: document.getElementById('duration'),
    durationHours: document.getElementById('duration_hours'),
    durationDays: document.getElementById('duration_days'),
    stops: document.getElementById('stops'),
    errors: document.getElementById('formErrors'),
    warning: document.getElementById('categoryWarning'),
    saveBtn: document.getElementById('saveBtn'),
    resetBtn: document.getElementById('resetBtn'),
    deleteBtn: document.getElementById('deleteBtn'),
    tableBody: document.querySelector('#tripsTable tbody'),
    tripsMessage: document.getElementById('tripsMessage'),
    sectionsList: document.getElementById('sectionsList'),
    addSectionBtn: document.getElementById('addSectionBtn'),
    includesInput: document.getElementById('includesInput'),
    excludesInput: document.getElementById('excludesInput'),
    tagsInput: document.getElementById('tagsInput'),
    faqList: document.getElementById('faqList'),
    addFaqBtn: document.getElementById('addFaqBtn'),
    galleryInput: document.getElementById('galleryInput'),
    videoUrl: document.getElementById('videoUrl'),
    videoThumbnail: document.getElementById('videoThumbnail'),
    mapLat: document.getElementById('mapLat'),
    mapLng: document.getElementById('mapLng'),
    mapMarkers: document.getElementById('mapMarkers')
  };
  let categories = [];
  let trips = [];
  let editingSlug = null;
  let slugManuallyEdited = false;
  let currentTripDraft = null; // Keeps the full template-backed record currently being edited

  // Default mode_set scaffold
  const DEFAULT_MODE_SET = {
    bus:      { active:false, price_cents:0, charge_type:'per_person',  default_capacity:40 },
    van:      { active:false, price_cents:0, charge_type:'per_person',  default_capacity:7 },
    mercedes: { active:false, price_cents:0, charge_type:'per_vehicle', default_capacity:3 }
  };

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

  function buildTripPayload(formValues){
    const baseValues = formValues || formData();
    const draft = currentTripDraft ? { ...currentTripDraft } : {};
    const merged = { ...draft, ...baseValues };
    return mergeWithTemplate(merged);
  }

  function linesToArray(val){
    if (val == null) return [];
    return String(val).split(/\n/g).map(s=>s.trim()).filter(Boolean);
  }
  function arrayToLines(arr){
    if (!Array.isArray(arr) || !arr.length) return '';
    return arr.map(s=>String(s||'').trim()).filter(Boolean).join('\n');
  }
  function toPositiveInt(v){ const n = parseInt(v,10); return Number.isFinite(n) && n>=0 ? n : 0; }
  function toFloatOrNull(v){ const n = parseFloat(v); return Number.isFinite(n) ? n : null; }

  function ensureListHasRow(listEl, factory){
    if (!listEl) return;
    if (!listEl.children.length) listEl.appendChild(factory({}));
  }

  function createSectionItem(section){
    const item = document.createElement('div');
    item.className = 'repeatable-item section-item';
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
        item.remove();
        ensureListHasRow(els.sectionsList, createSectionItem);
      });
    }
    return item;
  }

  function addSectionRow(section){
    if (!els.sectionsList) return;
    els.sectionsList.appendChild(createSectionItem(section || {}));
  }

  function renderSections(sections){
    if (!els.sectionsList) return;
    els.sectionsList.innerHTML = '';
    const data = Array.isArray(sections) && sections.length ? sections : [{}];
    data.forEach(section => addSectionRow(section));
  }

  function readSectionsFromDom(){
    if (!els.sectionsList) return [];
    return Array.from(els.sectionsList.querySelectorAll('.section-item')).map(item => {
      const title = (item.querySelector('.section-title')||{}).value || '';
      const content = (item.querySelector('.section-content')||{}).value || '';
      return { title: title.trim(), content: content.trim() };
    }).filter(sec => sec.title || sec.content);
  }

  function createFaqItem(entry){
    const item = document.createElement('div');
    item.className = 'repeatable-item faq-item';
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
    const questionInput = item.querySelector('.faq-question');
    const answerInput = item.querySelector('.faq-answer');
    if (questionInput) questionInput.value = entry && entry.q ? entry.q : '';
    if (answerInput) answerInput.value = entry && entry.a ? entry.a : '';
    const removeBtn = item.querySelector('.remove-faq-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        item.remove();
        ensureListHasRow(els.faqList, createFaqItem);
      });
    }
    return item;
  }

  function addFaqRow(entry){
    if (!els.faqList) return;
    els.faqList.appendChild(createFaqItem(entry || {}));
  }

  function renderFaq(entries){
    if (!els.faqList) return;
    els.faqList.innerHTML = '';
    const data = Array.isArray(entries) && entries.length ? entries : [{}];
    data.forEach(entry => addFaqRow(entry));
  }

  function readFaqFromDom(){
    if (!els.faqList) return [];
    return Array.from(els.faqList.querySelectorAll('.faq-item')).map(item => {
      const q = (item.querySelector('.faq-question')||{}).value || '';
      const a = (item.querySelector('.faq-answer')||{}).value || '';
      return { q: q.trim(), a: a.trim() };
    }).filter(entry => entry.q || entry.a);
  }

  function getModeInputs(){
    return {
      bus: {
        active: !!(document.getElementById('mode_bus_active')||{}).checked,
        price_eur: (document.getElementById('mode_bus_price_eur')||{}).value,
        charge_type: (document.getElementById('mode_bus_charge_type')||{}).value,
        capacity: (document.getElementById('mode_bus_capacity')||{}).value
      },
      van: {
        active: !!(document.getElementById('mode_van_active')||{}).checked,
        price_eur: (document.getElementById('mode_van_price_eur')||{}).value,
        charge_type: (document.getElementById('mode_van_charge_type')||{}).value,
        capacity: (document.getElementById('mode_van_capacity')||{}).value
      },
      mercedes: {
        active: !!(document.getElementById('mode_mercedes_active')||{}).checked,
        price_eur: (document.getElementById('mode_mercedes_price_eur')||{}).value,
        charge_type: (document.getElementById('mode_mercedes_charge_type')||{}).value,
        capacity: (document.getElementById('mode_mercedes_capacity')||{}).value
      }
    };
  }

  function eurosToCents(v){ const n = parseFloat(String(v||'').replace(',','.')); return Number.isFinite(n) && n>=0 ? Math.round(n*100) : 0; }
  function centsToEuros(c){ const n = parseInt(c,10); return Number.isFinite(n) && n>0 ? (n/100).toFixed(2) : ''; }

  function autoSlugFromTitle(){
    if (slugManuallyEdited) return;
    const raw = els.title.value.trim().toLowerCase();
    const slug = generateSlugFromTitle(raw);
    if (slug) els.slug.value = slug;
  }
  els.title.addEventListener('input', autoSlugFromTitle);
  els.slug.addEventListener('input', ()=>{ slugManuallyEdited = true; if (!els.slug.value.trim()) slugManuallyEdited = false; });

  // Greek -> Latin transliteration for slugging with diacritics removal
  const GREEK_MAP = {
    'α':'a','ά':'a','β':'v','γ':'g','δ':'d','ε':'e','έ':'e','ζ':'z','η':'i','ή':'i','θ':'th','ι':'i','ί':'i','ϊ':'i','ΐ':'i','κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x','ο':'o','ό':'o','π':'p','ρ':'r','σ':'s','ς':'s','τ':'t','υ':'y','ύ':'y','ϋ':'y','ΰ':'y','φ':'f','χ':'ch','ψ':'ps','ω':'o','ώ':'o'
  };
  function transliterate(s){
    const noDiacritics = String(s||'')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'');
    return noDiacritics.split('').map(ch => GREEK_MAP[ch] || ch).join('');
  }
  function sanitizeSlug(raw){
    return String(raw||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }
  function generateSlugFromTitle(title){
    const base = transliterate(title).replace(/['"’]/g,'').replace(/&/g,'-and-');
    return sanitizeSlug(base);
  }

  function showErrors(list){
    if (!list || !list.length){ els.errors.textContent=''; return; }
    els.errors.innerHTML = list.map(e=>`<div>${humanError(e)}</div>`).join('');
  }
  function humanError(code){
    switch(code){
      case 'missing_title': return 'Απαιτείται Title';
      case 'missing_slug': return 'Απαιτείται Slug';
      case 'missing_description': return 'Απαιτείται Description';
      case 'missing_category': return 'Απαιτείται Category';
      case 'missing_duration': return 'Απαιτείται Duration';
      default: return code;
    }
  }
  function formData(){
    const modeInputs = getModeInputs();
    const mode_set = {
      bus: {
        active: !!modeInputs.bus.active,
        price_cents: eurosToCents(modeInputs.bus.price_eur),
        charge_type: (modeInputs.bus.charge_type==='per_vehicle')? 'per_vehicle':'per_person',
        default_capacity: Math.max(0, parseInt(modeInputs.bus.capacity||'0',10) || 0)
      },
      van: {
        active: !!modeInputs.van.active,
        price_cents: eurosToCents(modeInputs.van.price_eur),
        charge_type: (modeInputs.van.charge_type==='per_vehicle')? 'per_vehicle':'per_person',
        default_capacity: Math.max(0, parseInt(modeInputs.van.capacity||'0',10) || 0)
      },
      mercedes: {
        active: !!modeInputs.mercedes.active,
        price_cents: eurosToCents(modeInputs.mercedes.price_eur),
        charge_type: (modeInputs.mercedes.charge_type==='per_vehicle')? 'per_vehicle':'per_person',
        default_capacity: Math.max(0, parseInt(modeInputs.mercedes.capacity||'0',10) || 0)
      }
    };
    return {
      title: els.title.value.trim(),
      slug: els.slug.value.trim(),
      subtitle: (els.subtitle && els.subtitle.value || '').trim(),
      description: els.description.value.trim(),
      category: els.category.value.trim(),
      duration: els.duration.value.trim(),
      duration_hours: els.durationHours ? toPositiveInt(els.durationHours.value) : 0,
      duration_days: els.durationDays ? toPositiveInt(els.durationDays.value) : 0,
      stops: els.stops.value.trim().split(/\n/g).map(s=>s.trim()).filter(s=>s),
      sections: readSectionsFromDom(),
      includes: linesToArray(els.includesInput && els.includesInput.value),
      excludes: linesToArray(els.excludesInput && els.excludesInput.value),
      tags: linesToArray(els.tagsInput && els.tagsInput.value),
      faq: readFaqFromDom(),
      gallery: linesToArray(els.galleryInput && els.galleryInput.value),
      video: {
        url: (els.videoUrl && els.videoUrl.value || '').trim(),
        thumbnail: (els.videoThumbnail && els.videoThumbnail.value || '').trim()
      },
      map: {
        lat: toFloatOrNull(els.mapLat && els.mapLat.value),
        lng: toFloatOrNull(els.mapLng && els.mapLng.value),
        markers: linesToArray(els.mapMarkers && els.mapMarkers.value)
      },
      mode_set
    };
  }
  function populateForm(trip){
    const tripData = mergeWithTemplate(trip || {});
    currentTripDraft = tripData;
    editingSlug = tripData.slug;
    slugManuallyEdited = true;
    els.title.value = tripData.title||'';
    els.slug.value = tripData.slug||'';
    if (els.subtitle) els.subtitle.value = tripData.subtitle || '';
    els.description.value = tripData.description||'';
    els.category.value = tripData.category||'';
    els.duration.value = tripData.duration||'';
    if (els.durationHours) els.durationHours.value = (tripData.duration_hours!=null && tripData.duration_hours!=='') ? String(tripData.duration_hours) : '';
    if (els.durationDays) els.durationDays.value = (tripData.duration_days!=null && tripData.duration_days!=='') ? String(tripData.duration_days) : '';
    els.stops.value = (tripData.stops||[]).join('\n');
    if (els.includesInput) els.includesInput.value = arrayToLines(tripData.includes);
    if (els.excludesInput) els.excludesInput.value = arrayToLines(tripData.excludes);
    if (els.tagsInput) els.tagsInput.value = arrayToLines(tripData.tags);
    if (els.galleryInput) els.galleryInput.value = arrayToLines(tripData.gallery);
    if (els.videoUrl) els.videoUrl.value = (tripData.video && tripData.video.url) || '';
    if (els.videoThumbnail) els.videoThumbnail.value = (tripData.video && tripData.video.thumbnail) || '';
    if (els.mapLat) els.mapLat.value = (tripData.map && tripData.map.lat!=null) ? String(tripData.map.lat) : '';
    if (els.mapLng) els.mapLng.value = (tripData.map && tripData.map.lng!=null) ? String(tripData.map.lng) : '';
    if (els.mapMarkers) els.mapMarkers.value = arrayToLines(tripData.map && tripData.map.markers);
    renderSections(tripData.sections);
    renderFaq(tripData.faq);
    // Modes
    try {
      const modes = tripData.mode_set || DEFAULT_MODE_SET;
      const bus = modes.bus || DEFAULT_MODE_SET.bus;
      const van = modes.van || DEFAULT_MODE_SET.van;
      const mer = modes.mercedes || DEFAULT_MODE_SET.mercedes;
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      const setC = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
      setC('mode_bus_active', !!bus.active);
      set('mode_bus_price_eur', centsToEuros(bus.price_cents));
      set('mode_bus_charge_type', (bus.charge_type==='per_vehicle')?'per_vehicle':'per_person');
      set('mode_bus_capacity', String(bus.default_capacity||0));
      setC('mode_van_active', !!van.active);
      set('mode_van_price_eur', centsToEuros(van.price_cents));
      set('mode_van_charge_type', (van.charge_type==='per_vehicle')?'per_vehicle':'per_person');
      set('mode_van_capacity', String(van.default_capacity||0));
      setC('mode_mercedes_active', !!mer.active);
      set('mode_mercedes_price_eur', centsToEuros(mer.price_cents));
      set('mode_mercedes_charge_type', (mer.charge_type==='per_vehicle')?'per_vehicle':'per_person');
      set('mode_mercedes_capacity', String(mer.default_capacity||0));
    } catch(_){ }
    els.deleteBtn.disabled = false;
    checkCategoryWarning(tripData.category);
    // Trip icon preview (similar to categories)
    try {
      if (els.tripIconPreview) {
        els.tripIconPreview.innerHTML = '';
        const icon = tripData.iconPath || '';
        if (icon) {
          const isSvg = /\.svg(\?|$)/i.test(icon);
          if (isSvg) {
            fetch(icon, { cache:'no-store' })
              .then(r => r.ok ? r.text() : Promise.reject(new Error('svg_fetch_failed')))
              .then(txt => {
                const cleaned = txt.replace(/<\?xml[^>]*>/ig,'').replace(/<!DOCTYPE[^>]*>/ig,'');
                const div = document.createElement('div');
                div.innerHTML = cleaned;
                const svg = div.querySelector('svg');
                if (svg) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.classList.add('svg-icon'); els.tripIconPreview.appendChild(svg); }
              }).catch(()=>{
                const img = new Image(); img.src = icon; img.alt = 'Icon'; img.className = 'svg-icon'; img.style.maxWidth='48px'; img.style.maxHeight='48px'; els.tripIconPreview.appendChild(img);
              });
          } else {
            const img = new Image(); img.src = icon; img.alt = 'Icon'; img.className = 'svg-icon'; img.style.maxWidth='48px'; img.style.maxHeight='48px'; els.tripIconPreview.appendChild(img);
          }
          if (els.tripIcon) els.tripIcon.dataset.filename = icon;
          if (els.tripIconName) {
            try { const base = icon.split('/').pop(); els.tripIconName.textContent = base || ''; } catch(_) { els.tripIconName.textContent = ''; }
          }
        } else if (els.tripIcon) { delete els.tripIcon.dataset.filename; }
      }
    } catch(_) {}
  }

  function resetForm(){
    editingSlug = null;
    slugManuallyEdited = false;
    currentTripDraft = templateClone();
    const draft = currentTripDraft || {};
    els.title.value=''; els.slug.value=''; els.description.value='';
    if (els.subtitle) els.subtitle.value = draft.subtitle || '';
    els.category.value = categories.length? categories[0].slug : '';
    els.duration.value=''; els.stops.value='';
    if (els.durationHours) els.durationHours.value = draft.duration_hours!=null ? String(draft.duration_hours) : '';
    if (els.durationDays) els.durationDays.value = draft.duration_days!=null ? String(draft.duration_days) : '';
    if (els.includesInput) els.includesInput.value = arrayToLines(draft.includes);
    if (els.excludesInput) els.excludesInput.value = arrayToLines(draft.excludes);
    if (els.tagsInput) els.tagsInput.value = arrayToLines(draft.tags);
    if (els.galleryInput) els.galleryInput.value = arrayToLines(draft.gallery);
    if (els.videoUrl) els.videoUrl.value = (draft.video && draft.video.url) || '';
    if (els.videoThumbnail) els.videoThumbnail.value = (draft.video && draft.video.thumbnail) || '';
    if (els.mapLat) els.mapLat.value = (draft.map && draft.map.lat!=null) ? String(draft.map.lat) : '';
    if (els.mapLng) els.mapLng.value = (draft.map && draft.map.lng!=null) ? String(draft.map.lng) : '';
    if (els.mapMarkers) els.mapMarkers.value = arrayToLines(draft.map && draft.map.markers);
    renderSections(draft.sections);
    renderFaq(draft.faq);
    els.deleteBtn.disabled = true; showErrors([]); els.warning.hidden = true;
    try { if (els.tripIconName) els.tripIconName.textContent = ''; } catch(_){ }
    // Reset modes to defaults
    try {
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      const setC = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
      // Bus defaults
      setC('mode_bus_active', false);
      set('mode_bus_price_eur', '');
      set('mode_bus_charge_type', 'per_person');
      set('mode_bus_capacity', '40');
      // Van defaults
      setC('mode_van_active', false);
      set('mode_van_price_eur', '');
      set('mode_van_charge_type', 'per_person');
      set('mode_van_capacity', '7');
      // Mercedes defaults
      setC('mode_mercedes_active', false);
      set('mode_mercedes_price_eur', '');
      set('mode_mercedes_charge_type', 'per_vehicle');
      set('mode_mercedes_capacity', '3');
    } catch(_){ }
  }
  els.resetBtn.addEventListener('click', ()=>{ resetForm(); });

  // Mode Availability (admin) – simple per-date editor
  async function loadModeAvailability(){
    try {
      const trip = editingSlug || (els.slug && els.slug.value.trim());
      const date = (document.getElementById('mode_avail_date')||{}).value;
      const mode = (document.getElementById('mode_avail_mode')||{}).value || 'van';
      const msg = document.getElementById('mode_avail_msg');
      if (!trip || !date) { if (msg) msg.textContent = 'Ορίστε trip & ημερομηνία.'; return; }
      const q = new URLSearchParams({ trip_id: trip, date, mode });
      const r = await fetch('/api/availability?' + q.toString(), { cache:'no-store', credentials:'same-origin' });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || !j) { if (msg) msg.textContent = 'Σφάλμα φόρτωσης.'; return; }
      const capEl = document.getElementById('mode_avail_capacity');
      // New unified mode-aware shape: when mode param present expect { trip_id,date,mode,capacity,taken,available }
      const c = (typeof j.capacity === 'number') ? j.capacity : (j.modes && j.modes[mode] && j.modes[mode].capacity) || 0;
      if (capEl) capEl.value = String(c || 0);
      const avail = (j.available!=null) ? j.available : ((j.modes && j.modes[mode] && j.modes[mode].available) || 0);
      if (msg) msg.textContent = `Διαθέσιμες θέσεις (${mode}, ${date}): ${avail}`;
    } catch(_){ try { const msg=document.getElementById('mode_avail_msg'); if(msg) msg.textContent='Σφάλμα δικτύου.'; } catch(__){} }
  }
  async function saveModeAvailability(){
    const trip = editingSlug || (els.slug && els.slug.value.trim());
    const date = (document.getElementById('mode_avail_date')||{}).value;
    const mode = (document.getElementById('mode_avail_mode')||{}).value || 'van';
    const capEl = document.getElementById('mode_avail_capacity');
    const msg = document.getElementById('mode_avail_msg');
    const capacity = parseInt((capEl && capEl.value)||'0',10) || 0;
    if (!trip || !date) { if (msg) msg.textContent = 'Ορίστε trip & ημερομηνία.'; return; }
    try {
      const r = await fetch('/api/availability', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ trip_id: trip, date, mode, capacity }) });
      const j = await r.json().catch(()=>({}));
      if (r.ok && j && j.ok) { if (msg) { msg.style.color='#2a7'; msg.textContent='✅ Αποθηκεύτηκε.'; } }
      else { if (msg) { msg.style.color='#c22'; msg.textContent='❌ Σφάλμα αποθήκευσης.'; } }
    } catch(_){ if (msg) { msg.style.color='#c22'; msg.textContent='❌ Σφάλμα δικτύου.'; } }
  }

  function checkCategoryWarning(catSlug){
    if (!catSlug) { els.warning.hidden = true; return; }
    const exists = categories.some(c=>c.slug===catSlug);
    els.warning.hidden = exists;
  }

  async function fetchCategories(){
    const renderOptions = (arr) => {
      categories = Array.isArray(arr) ? arr : [];
      const has = categories.length > 0;
      const opts = categories.map(c=>{
        const t = (typeof c.title === 'string') ? c.title : (c.title && (c.title.el || c.title.en || (Object.values(c.title||{})[0]))) || c.slug;
        return `<option value="${c.slug}">${t}</option>`;
      }).join('');
      els.category.innerHTML = has ? (`<option value="" disabled selected>— Επιλέξτε κατηγορία —</option>` + opts) : `<option value="" disabled selected>(Δεν υπάρχουν κατηγορίες)</option>`;
      els.category.disabled = !has;
      // Προβολή προειδοποίησης όταν δεν υπάρχουν καθόλου κατηγορίες
      try { els.warning.hidden = has; } catch(_){}
    };
    try {
      // Προσπάθησε admin endpoint (πλήρης λίστα)
      const r1 = await fetch('/api/admin/categories', { credentials:'same-origin', cache:'no-store' });
      if (r1.ok) { const j = await r1.json(); renderOptions(j); return; }
    } catch(_){ /* fallback below */ }
    try {
      const r2 = await fetch('/api/categories?published=true', { cache:'no-store' });
      const j2 = r2.ok ? await r2.json() : [];
      renderOptions(j2);
    } catch(_){ renderOptions([]); }
  }

  function escapeHtml(str){ return String(str||'').replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[s])); }

  function renderTable(){
    els.tableBody.innerHTML='';
    if (!trips.length){
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="7" style="padding:12px;color:#666">(Δεν υπάρχουν εκδρομές)</td>';
      els.tableBody.appendChild(tr);
      if (els.tripsMessage) els.tripsMessage.textContent = '';
      return;
    }
    trips.forEach(trip => {
      const tr = document.createElement('tr');
      const iconBadge = trip.iconPath ? `<span class="icon-badge" title="icon">🖼</span>` : '—';
      // Modes display: show only active ones with check marks
      const ms = trip.mode_set || {};
      const activeLabels = ['bus','van','mercedes'].filter(k=>ms[k] && ms[k].active).map(k=>{
        const nameMap = { bus:'Bus', van:'Van', mercedes:'Mercedes' };
        return `✔ ${nameMap[k]}`;
      });
      const modesCell = activeLabels.length ? activeLabels.join(' | ') : '—';
      tr.innerHTML = `<td>${escapeHtml(trip.title)}</td>
        <td class="mono">${escapeHtml(trip.slug)}</td>
        <td>${escapeHtml(trip.category)}</td>
        <td>${escapeHtml(trip.duration || '')}</td>
        <td>${modesCell}</td>
        <td>${iconBadge}</td>
        <td>
          <button type="button" data-slug="${trip.slug}" class="btn secondary edit-btn">Edit</button>
          <button type="button" data-del="${trip.slug}" class="btn danger delete-row-btn">Delete</button>
        </td>`;
      els.tableBody.appendChild(tr);
    });
    if (els.tripsMessage) els.tripsMessage.textContent = '';
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
      const fallback = trips.find(t=>t.slug===slug);
      if (fallback) populateForm(fallback);
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
        trips = Array.isArray(data) ? data.map(t => ({
          title: t.title || t.id || '',
          slug: t.slug || t.id || '',
          category: t.category || '',
          duration: t.duration || t.time || '',
          stops: t.stops || [],
          iconPath: t.iconPath || '',
          mode_set: t.mode_set || DEFAULT_MODE_SET
        })) : [];
        renderTable();
        if (els.tripsMessage) els.tripsMessage.textContent = '';
      } else {
        if (els.tripsMessage) els.tripsMessage.textContent = 'Σφάλμα φόρτωσης.';
      }
    } catch(e){ console.error('fetchTrips error', e); }
  }

  async function saveTrip(){
    showErrors([]);
    try { if (els.tripsMessage) { els.tripsMessage.className=''; els.tripsMessage.textContent='Αποθήκευση...'; } } catch(_){ }
    const formValues = formData();
    const errs = [];
    if(!formValues.title) errs.push('missing_title');
    if(!formValues.slug) errs.push('missing_slug');
    if(!formValues.description) errs.push('missing_description');
    if(!formValues.category) errs.push('missing_category');
    if(!formValues.duration) errs.push('missing_duration');
    if (errs.length){ showErrors(errs); return; }
    try {
      // Upload icon αν υπάρχει νέο αρχείο
      let iconFilename = (els.tripIcon && els.tripIcon.dataset.filename) ? els.tripIcon.dataset.filename : '';
      try {
        if (els.tripIcon && els.tripIcon.files && els.tripIcon.files[0]) {
          const fd = new FormData();
          fd.append('tripIconFile', els.tripIcon.files[0]);
          const up = await fetch('/api/admin/upload-trip-icon', { method:'POST', body: fd });
          const uj = await up.json();
          if (up.ok && uj && uj.ok && uj.filename) iconFilename = `/uploads/trips/${uj.filename}`;
        }
      } catch(_){ }
      const payload = buildTripPayload(formValues);
      if (iconFilename) payload.iconPath = iconFilename;
      const r = await fetch('/api/admin/trips', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok || !j.ok){
        showErrors((j && j.errors)||['save_failed']);
        try { if (els.tripsMessage){ els.tripsMessage.className='error'; els.tripsMessage.textContent='❌ Σφάλμα αποθήκευσης.'; } } catch(_){ }
        return;
      }
      try { if (els.tripsMessage){ els.tripsMessage.className='ok'; els.tripsMessage.textContent='✅ Αποθηκεύτηκε.'; } } catch(_){ }
      await fetchTrips();
      populateForm(j.trip);
    } catch(e){
      showErrors(['network_error']);
      try { if (els.tripsMessage){ els.tripsMessage.className='error'; els.tripsMessage.textContent='❌ Σφάλμα δικτύου.'; } } catch(_){ }
    }
  }
  function showTripDeleteModal(slugOverride){
    if (slugOverride) editingSlug = slugOverride;
    if(!editingSlug) return;
    const m = document.getElementById('tripConfirmModal');
    const ok = document.getElementById('tripConfirmOk');
    const cancel = document.getElementById('tripConfirmCancel');
    if (!m || !ok || !cancel) return;
    try { console.debug('[Trips Admin] Opening delete modal for', editingSlug); } catch(_){ }
    m.hidden = false;
    // Accessibility: focus first actionable button
    setTimeout(()=>{ try { ok.focus(); } catch(_){ } }, 30);
    function close(){ m.hidden = true; ok.removeEventListener('click', onOk); cancel.removeEventListener('click', onCancel); }
    async function onOk(){
      try {
        const r = await fetch('/api/admin/trips/' + encodeURIComponent(editingSlug), { method:'DELETE' });
        if (r.ok){ await fetchTrips(); resetForm(); }
      } catch(e){ console.warn('delete error', e); }
      close();
    }
    function onCancel(){ close(); }
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    // ESC key handler
    const onKey = (ev)=>{ if (ev.key === 'Escape'){ ev.preventDefault(); close(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
  }

  els.saveBtn.addEventListener('click', saveTrip);
  els.deleteBtn.addEventListener('click', () => showTripDeleteModal());
  els.category.addEventListener('change', ()=>checkCategoryWarning(els.category.value));

  const panelBtn = document.getElementById('togglePanel');
  if (panelBtn) {
    panelBtn.addEventListener('click',()=>{
      const header=document.querySelector('header.sticky-bar');
      const cur=header && header.getAttribute('data-collapsed')==='true';
      if (header) header.setAttribute('data-collapsed',cur? 'false':'true');
      panelBtn.setAttribute('aria-expanded',cur? 'true':'false');
      panelBtn.textContent = (cur? '▲':'▼');
    });
  }

  async function init(){
    await fetchCategories();
    await fetchTrips();
    if (window.TripTemplateLoader && typeof window.TripTemplateLoader.ensure === 'function') {
      try { await window.TripTemplateLoader.ensure(); }
      catch(err){ console.warn('Trips Admin: template ensure failed', err); }
    }
    resetForm();
    if (els.addSectionBtn) els.addSectionBtn.addEventListener('click', ()=>{ addSectionRow({}); });
    if (els.addFaqBtn) els.addFaqBtn.addEventListener('click', ()=>{ addFaqRow({}); });
    // Trip icon input + preview
    els.tripIcon = document.getElementById('tripIcon');
    els.tripIconPreview = document.getElementById('tripIconPreview');
    els.tripIconName = document.getElementById('tripIconName');
    if (els.tripIcon && els.tripIconPreview) {
      els.tripIcon.addEventListener('change', () => {
        const f = els.tripIcon.files && els.tripIcon.files[0];
        els.tripIconPreview.innerHTML = '';
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
              if (svg) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.classList.add('svg-icon'); els.tripIconPreview.appendChild(svg); }
            } catch(_){ }
          };
          reader.readAsText(f);
        } else {
          const img = new Image();
          img.src = URL.createObjectURL(f);
          img.alt = 'Trip Icon Preview';
          img.className = 'svg-icon';
          img.style.maxWidth='48px'; img.style.maxHeight='48px';
          els.tripIconPreview.appendChild(img);
        }
      });
    }
    // Row-level delete buttons: delegate to modal
    els.tableBody.addEventListener('click', (ev) => {
      const delBtn = ev.target.closest && ev.target.closest('.delete-row-btn');
      if (delBtn){ const slug = delBtn.getAttribute('data-del'); if (slug) showTripDeleteModal(slug); }
    });
    els.tableBody.addEventListener('click', (ev) => {
      const editBtn = ev.target.closest && ev.target.closest('.edit-btn');
      if (editBtn){ const slug = editBtn.getAttribute('data-slug'); if (slug) loadTripForEdit(slug); }
    });
    // Wire mode availability buttons
    const btnLoad = document.getElementById('mode_avail_load'); if (btnLoad) btnLoad.addEventListener('click', loadModeAvailability);
    const btnSave = document.getElementById('mode_avail_save'); if (btnSave) btnSave.addEventListener('click', saveModeAvailability);
  }
  // Ensure init runs even if DOMContentLoaded has already fired (script loaded late or injected)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
