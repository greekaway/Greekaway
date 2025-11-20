(function(){
  const els = {
    title: document.getElementById('title'),
    slug: document.getElementById('slug'),
    description: document.getElementById('description'),
    category: document.getElementById('category'),
    duration: document.getElementById('duration'),
    stops: document.getElementById('stops'),
    errors: document.getElementById('formErrors'),
    warning: document.getElementById('categoryWarning'),
    saveBtn: document.getElementById('saveBtn'),
    resetBtn: document.getElementById('resetBtn'),
    deleteBtn: document.getElementById('deleteBtn'),
    tableBody: document.querySelector('#tripsTable tbody'),
    tripsMessage: document.getElementById('tripsMessage')
  };
  let categories = [];
  let trips = [];
  let editingSlug = null;
  let slugManuallyEdited = false;

  // Default mode_set scaffold
  const DEFAULT_MODE_SET = {
    bus:      { active:false, price_cents:0, charge_type:'per_person',  default_capacity:40 },
    van:      { active:false, price_cents:0, charge_type:'per_person',  default_capacity:7 },
    mercedes: { active:false, price_cents:0, charge_type:'per_vehicle', default_capacity:3 }
  };

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
      description: els.description.value.trim(),
      category: els.category.value.trim(),
      duration: els.duration.value.trim(),
      stops: els.stops.value.trim().split(/\n/g).map(s=>s.trim()).filter(s=>s),
      mode_set
    };
  }
  function populateForm(trip){
    editingSlug = trip.slug;
    slugManuallyEdited = true;
    els.title.value = trip.title||'';
    els.slug.value = trip.slug||'';
    els.description.value = trip.description||'';
    els.category.value = trip.category||'';
    els.duration.value = trip.duration||'';
    els.stops.value = (trip.stops||[]).join('\n');
    // Modes
    try {
      const modes = trip.mode_set || DEFAULT_MODE_SET;
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
    checkCategoryWarning(trip.category);
    // Trip icon preview (similar to categories)
    try {
      if (els.tripIconPreview) {
        els.tripIconPreview.innerHTML = '';
        const icon = trip.iconPath || '';
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
    els.title.value=''; els.slug.value=''; els.description.value='';
    els.category.value = categories.length? categories[0].slug : '';
    els.duration.value=''; els.stops.value='';
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
      const r1 = await fetch('/api/categories', { credentials:'same-origin', cache:'no-store' });
      if (r1.ok) { const j = await r1.json(); renderOptions(j); return; }
    } catch(_){ /* fallback below */ }
    try {
      // Fallback σε public (δημοσιευμένες)
      const r2 = await fetch('/api/public/categories', { cache:'no-store' });
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
    const data = formData();
    const errs = [];
    if(!data.title) errs.push('missing_title');
    if(!data.slug) errs.push('missing_slug');
    if(!data.description) errs.push('missing_description');
    if(!data.category) errs.push('missing_category');
    if(!data.duration) errs.push('missing_duration');
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
      if (iconFilename) data.iconPath = iconFilename;
      const r = await fetch('/api/admin/trips', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(data) });
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
  els.resetBtn.addEventListener('click', ()=>{ resetForm(); });

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
    resetForm();
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
      if (editBtn){ const slug = editBtn.getAttribute('data-slug'); const trip = trips.find(t=>t.slug===slug); if (trip) populateForm(trip); }
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
