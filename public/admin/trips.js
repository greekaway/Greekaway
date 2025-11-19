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
    tableEmpty: document.getElementById('tableEmpty')
  };
  let categories = [];
  let trips = [];
  let editingSlug = null;
  let slugManuallyEdited = false;

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
    return {
      title: els.title.value.trim(),
      slug: els.slug.value.trim(),
      description: els.description.value.trim(),
      category: els.category.value.trim(),
      duration: els.duration.value.trim(),
      stops: els.stops.value.trim().split(/\n/g).map(s=>s.trim()).filter(s=>s)
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
    els.deleteBtn.disabled = false;
    checkCategoryWarning(trip.category);
    // No cover image preview (single file input UX)
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
    try {
      if (els.tripIconName) els.tripIconName.textContent = '';
    } catch(_){ }
  }
  els.resetBtn.addEventListener('click', ()=>{ resetForm(); });

  function showTripDeleteModal(slugOverride){
    if (slugOverride) editingSlug = slugOverride;
    if(!editingSlug) return;
    const m = document.getElementById('tripConfirmModal');
    const ok = document.getElementById('tripConfirmOk');
    const cancel = document.getElementById('tripConfirmCancel');
    if (!m || !ok || !cancel) return;
    m.hidden = false;
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
  }
  document.addEventListener('DOMContentLoaded', init);
})();
