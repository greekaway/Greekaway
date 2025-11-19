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

  let categories = [];

  function msg(text, kind){
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.className = kind ? kind : '';
  }

  function sanitizeSlug(raw){
    return String(raw||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
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
        <td><button class="btn secondary" data-edit="${c.id}" type="button">Edit</button></td>`;
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
    });
  }

  wire();
  load();
})();
