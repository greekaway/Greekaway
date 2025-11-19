(function(){
  // Ensure bottom-nav has Categories/Trips; append if missing, label by href (EN), keep order stable
  try {
    const nav = document.querySelector('nav.bottom-nav');
    if (nav) {
      const ensureLink = (href, label) => {
        let el = nav.querySelector(`a[href="${href}"]`);
        if (!el) {
          el = document.createElement('a');
          el.setAttribute('href', href);
          el.textContent = label;
          nav.appendChild(el);
        }
        el.textContent = label;
        return el;
      };
      const cat = ensureLink('/admin/categories.html', 'Categories');
      const trips = ensureLink('/admin-trips.html', 'Trips');
      try {
        if (cat && cat.parentNode === nav) nav.appendChild(cat);
        if (trips && trips.parentNode === nav) nav.appendChild(trips);
      } catch(_) { /* ignore */ }
    }
  } catch(_) { /* ignore */ }

  const rowsEl = document.getElementById('catRows');
  const msgEl = document.getElementById('catMessage');
  const saveBtn = document.getElementById('saveCategory');
  const resetBtn = document.getElementById('resetForm');
  const fTitle = document.getElementById('catTitle');
  const fSlug = document.getElementById('catSlug');
  const fOrder = document.getElementById('catOrder');
  const fPublished = document.getElementById('catPublished');
  const fIcon = document.getElementById('catIcon');
  const previewEl = document.getElementById('catIconPreview');
  let userTouchedSlug = false;

  let categories = [];

  function msg(text, kind){
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.className = kind ? kind : '';
  }

  function sanitizeSlug(raw){
    return String(raw||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }

  // Basic Greek -> Latin transliteration map (extendable)
    // Unified Greek -> Latin transliteration map (matches Trips CMS)
    const GREEK_MAP = {
      'α':'a','ά':'a','β':'v','γ':'g','δ':'d','ε':'e','έ':'e','ζ':'z','η':'i','ή':'i','θ':'th','ι':'i','ί':'i','ϊ':'i','ΐ':'i','κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x','ο':'o','ό':'o','π':'p','ρ':'r','σ':'s','ς':'s','τ':'t','υ':'y','ύ':'y','ϋ':'y','ΰ':'y','φ':'f','χ':'ch','ψ':'ps','ω':'o','ώ':'o'
  };
  function transliterate(str){
    return String(str||'').toLowerCase().split('').map(ch => GREEK_MAP[ch] || ch).join('');
  }
  function generateSlugFromTitle(title){
    const base = transliterate(title).replace(/['"’]/g,'').replace(/&/g,'-and-');
    return sanitizeSlug(base);
  }

  let pendingDeleteSlug = null;

  function showConfirm(slug){
    const m = document.getElementById('confirmModal');
    const ok = document.getElementById('confirmOk');
    const cancel = document.getElementById('confirmCancel');
    pendingDeleteSlug = slug;
    if (!m || !ok || !cancel) { if (slug) doDelete(slug); return; }
    m.hidden = false;
    function close(){ m.hidden = true; ok.removeEventListener('click', onOk); cancel.removeEventListener('click', onCancel); }
    function onOk(){ const s = pendingDeleteSlug; pendingDeleteSlug = null; close(); if (s) doDelete(s); }
    function onCancel(){ pendingDeleteSlug = null; close(); }
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
  }

  function doDelete(slug){
    if (!slug) return;
    msg('Διαγραφή...', '');
    fetch(`/api/categories/${encodeURIComponent(slug)}`, { method:'DELETE', credentials:'same-origin' })
      .then(r => r.json().then(j => ({ ok:r.ok, j })) )
      .then(({ok,j}) => {
        if (!ok || !j || j.success!==true) throw new Error(j && j.error ? j.error : 'delete_failed');
        categories = categories.filter(c => c.slug !== slug);
        render();
        msg('✅ Διαγράφηκε.', 'ok');
      })
      .catch(_ => { msg('❌ Σφάλμα διαγραφής.', 'error'); });
  }

  function render(){
    if (!rowsEl) return;
    rowsEl.innerHTML = '';
    if (!categories.length){
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="6" style="padding:12px;color:#666">(Δεν υπάρχουν κατηγορίες)</td>';
      rowsEl.appendChild(tr);
      return;
    }
    categories.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${c.title||''}</td>
        <td class="mono">${c.slug}</td>
        <td class="num">${c.order||0}</td>
        <td>${c.published? '✅':'—'}</td>
        <td>${c.iconPath? `<span class="icon-badge" title="icon">🖼</span>`:'—'}</td>
        <td>
          <button class="btn secondary" data-edit="${c.id}" type="button">Edit</button>
          <button class="btn danger" data-del="${c.slug}" type="button">Delete</button>
        </td>`;
      rowsEl.appendChild(tr);
    });
  }

  function load(){
    msg('Φόρτωση...');
    fetch('/api/categories', { cache:'no-store', credentials:'same-origin' })
      .then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(arr => { categories = Array.isArray(arr)? arr : []; render(); msg(''); })
      .catch(_ => { msg('Σφάλμα φόρτωσης.', 'error'); });
  }

  function resetForm(){
    if (fTitle) fTitle.value='';
    if (fSlug) fSlug.value='';
    if (fOrder) fOrder.value='0';
    if (fPublished) fPublished.checked=false;
    if (fIcon) fIcon.value='';
    msg('Φόρμα μηδενίστηκε');
  }

  function editCategory(id){
    const c = categories.find(x => x.id === id);
    if (!c) return;
    if (fTitle) fTitle.value = c.title || '';
    if (fSlug) fSlug.value = c.slug || '';
    userTouchedSlug = true; // prevent auto overwrite while editing existing
    if (fOrder) fOrder.value = c.order || 0;
    if (fPublished) fPublished.checked = !!c.published;
    // Show existing icon preview if available
    try {
      if (previewEl) {
        previewEl.innerHTML = '';
        const icon = c.iconPath || '';
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
                if (svg) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.classList.add('svg-icon'); previewEl.appendChild(svg); }
              }).catch(()=>{
                const img = new Image(); img.src = icon; img.alt = 'Icon'; img.className = 'svg-icon'; previewEl.appendChild(img);
              });
          } else {
            const img = new Image(); img.src = icon; img.alt = 'Icon'; img.className = 'svg-icon'; previewEl.appendChild(img);
          }
        }
      }
    } catch(_) { /* ignore */ }
    msg('Edit mode: '+(c.slug||c.id));
  }

  function upsert(){
    const title = fTitle ? fTitle.value.trim() : '';
    let slug = fSlug ? fSlug.value.trim() : '';
    const order = parseInt(fOrder ? fOrder.value : '0',10)||0;
    const published = !!(fPublished && fPublished.checked);
    if (!slug) slug = sanitizeSlug(title);
    if (!title){ msg('Απαιτείται τίτλος.', 'error'); return; }
    if (!slug){ msg('Απαιτείται slug.', 'error'); return; }
    msg('Αποθήκευση...', '');
    const fd = new FormData();
    fd.append('title', title);
    fd.append('slug', slug);
    fd.append('order', String(order));
    fd.append('published', published ? 'true' : '');
    if (fIcon && fIcon.files && fIcon.files[0]) {
      fd.append('iconFile', fIcon.files[0]);
    }
    fetch('/api/categories', { method:'POST', credentials:'same-origin', body: fd })
      .then(r => r.json().then(j => ({ ok:r.ok, j })))
      .then(({ok,j}) => {
        if (!ok || !j || !j.ok){ throw new Error(j && j.error ? j.error : 'save_failed'); }
        msg('✅ Αποθηκεύτηκε.', 'ok');
        load();
      })
      .catch(_ => { msg('❌ Σφάλμα αποθήκευσης.', 'error'); });
  }

  function wire(){
    if (saveBtn) saveBtn.addEventListener('click', upsert);
    if (resetBtn) resetBtn.addEventListener('click', resetForm);
    if (rowsEl) rowsEl.addEventListener('click', (ev) => {
      const t = ev.target;
      if (t && t.dataset && t.dataset.edit){ editCategory(t.dataset.edit); }
      if (t && t.dataset && t.dataset.del){ showConfirm(t.dataset.del); }
    });
    if (fSlug) {
      fSlug.addEventListener('input', () => { userTouchedSlug = true; if (!fSlug.value.trim()) userTouchedSlug = false; });
    }
    if (fTitle) {
      fTitle.addEventListener('input', () => {
        if (userTouchedSlug) return; // do not overwrite manual edits
        const proposed = generateSlugFromTitle(fTitle.value);
        if (fSlug) fSlug.value = proposed;
      });
      fTitle.addEventListener('blur', () => {
        if (!userTouchedSlug && fTitle && fSlug && !fSlug.value.trim()) {
          fSlug.value = generateSlugFromTitle(fTitle.value);
        }
      });
    }
    if (fIcon && previewEl) {
      const renderPreview = (file) => {
        previewEl.innerHTML = '';
        if (!file) return;
        const isSvg = /\.svg$/i.test(file.name) || file.type === 'image/svg+xml';
        if (isSvg) {
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const txt = String(reader.result||'');
              const cleaned = txt.replace(/<\?xml[^>]*>/ig,'').replace(/<!DOCTYPE[^>]*>/ig,'');
              const tmp = document.createElement('div');
              tmp.innerHTML = cleaned;
              const svg = tmp.querySelector('svg');
              if (svg) {
                svg.removeAttribute('width');
                svg.removeAttribute('height');
                svg.classList.add('svg-icon');
                previewEl.appendChild(svg);
              }
            } catch(_) { /* ignore */ }
          };
          reader.readAsText(file);
        } else {
          const img = new Image();
          img.className = 'svg-icon';
          img.onload = () => { /* no-op */ };
          img.src = URL.createObjectURL(file);
          previewEl.appendChild(img);
        }
      };
      fIcon.addEventListener('change', () => {
        const f = fIcon.files && fIcon.files[0];
        renderPreview(f || null);
      });
    }
  }

  wire();
  load();
})();
