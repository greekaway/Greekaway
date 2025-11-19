(function(){
  const rowsEl = document.getElementById('catRows');
  const msgEl = document.getElementById('catMessage');
  const saveBtn = document.getElementById('saveCategory');
  const resetBtn = document.getElementById('resetForm');
  const fTitle = document.getElementById('catTitle');
  const fSlug = document.getElementById('catSlug');
  const fOrder = document.getElementById('catOrder');
  const fPublished = document.getElementById('catPublished');
  const fIcon = document.getElementById('catIcon');
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
  const GREEK_MAP = {
    'α':'a','ά':'a','β':'b','γ':'g','δ':'d','ε':'e','έ':'e','ζ':'z','η':'i','ή':'i','θ':'th','ι':'i','ί':'i','ϊ':'i','ΐ':'i','κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x','ο':'o','ό':'o','π':'p','ρ':'r','σ':'s','ς':'s','τ':'t','υ':'y','ύ':'y','ϋ':'y','ΰ':'y','φ':'f','χ':'ch','ψ':'ps','ω':'o','ώ':'o'
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
        <td>${c.iconPath? `<span class="icon-badge" title="icon">SVG</span>`:'—'}</td>
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
    msg('Edit mode: '+(c.slug||c.id));
  }

  function upsert(){
    const title = fTitle ? fTitle.value.trim() : '';
    let slug = fSlug ? fSlug.value.trim() : '';
    const order = parseInt(fOrder ? fOrder.value : '0',10)||0;
    const published = !!(fPublished && fPublished.checked);
    const iconSvg = fIcon ? fIcon.value.trim() : '';
    if (!slug) slug = sanitizeSlug(title);
    if (!title){ msg('Απαιτείται τίτλος.', 'error'); return; }
    if (!slug){ msg('Απαιτείται slug.', 'error'); return; }
    msg('Αποθήκευση...', '');
    fetch('/api/categories', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      credentials:'same-origin',
      body: JSON.stringify({ title, slug, order, published, iconSvg: iconSvg || undefined })
    })
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
      fSlug.addEventListener('input', () => { userTouchedSlug = true; });
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
  }

  wire();
  load();
})();
