(function(){
  const READY_EVENT = 'ga:trips:rendered';
  const FALLBACK_BOOT_DELAY = 5000;
  const MAX_FILES_PER_BATCH = 12;
  const STOP_ITEM_SELECTOR = '.stop-item';
  const STOP_IMAGES_SELECTOR = '.stop-images';
  const STOP_LIST_SELECTOR = '[data-field="stopsList"]';
  const CLASS_STOP_FIELD = 'stop-images-field';
  const CLASS_STOP_ROW = 'stop-images-row';
  const CLASS_STOP_TOOLS = 'stop-images-tools';
  const CLASS_STOP_PICKER = 'stop-images-picker';
  const CLASS_STOP_STATUS = 'stop-images-status';
  let announcer = null;
  let observer = null;
  let bootstrapped = false;
  let fallbackTimer = null;

  function supportsUploads(){
    return typeof window !== 'undefined' && window.FormData && window.fetch;
  }

  function sanitizeSlug(raw){
    return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }

  function getCurrentSlug(){
    const slugInput = document.getElementById('slug');
    const titleInput = document.getElementById('title');
    const fromSlug = slugInput && slugInput.value ? sanitizeSlug(slugInput.value) : '';
    if (fromSlug) return fromSlug;
    const fromTitle = titleInput && titleInput.value ? sanitizeSlug(titleInput.value) : '';
    return fromTitle || 'trip';
  }

  function announce(message){
    if (!announcer) announcer = document.getElementById('stopImageUploadAnnouncer');
    if (!announcer) return;
    announcer.textContent = message || '';
  }

  function updateStatus(el, message, state){
    if (!el) return;
    if (el.__timer){
      clearTimeout(el.__timer);
      el.__timer = null;
    }
    if (typeof state === 'string' && state.length) {
      el.dataset.state = state;
    } else {
      delete el.dataset.state;
    }
    el.textContent = message || '';
    if (message && state !== 'uploading'){
      el.__timer = setTimeout(() => {
        el.textContent = '';
        delete el.dataset.state;
        el.__timer = null;
      }, 6000);
    }
  }

  function appendPaths(textarea, urls){
    if (!textarea || !Array.isArray(urls) || !urls.length) return;
    let content = textarea.value || '';
    urls.forEach((url) => {
      if (!url) return;
      if (content && !content.endsWith('\n')) content += '\n';
      content += url;
    });
    textarea.value = content;
    try { textarea.dispatchEvent(new Event('input', { bubbles:true })); } catch(_){ }
  }

  async function uploadFiles(files, meta){
    const fd = new FormData();
    files.forEach((file) => fd.append('images', file));
    if (meta.slug) fd.append('slug', meta.slug);
    if (meta.modeKey) fd.append('modeKey', meta.modeKey);
    if (meta.stopTitle) fd.append('stopTitle', meta.stopTitle);
    let res;
    try {
      res = await fetch('/api/upload-trip-image', { method:'POST', body: fd, credentials:'same-origin' });
    } catch(err){
      console.warn('TripImageUploader: network error', err);
      return { ok:false, error:'Αποτυχία δικτύου.' };
    }
    let data = null;
    try { data = await res.json(); } catch(err){ console.warn('TripImageUploader: invalid JSON', err); }
    if (!res.ok || !data || !data.ok) {
      const detail = data && (data.detail || data.error);
      console.warn('TripImageUploader: upload failed', detail || res.status);
      return { ok:false, error: detail || 'Αποτυχία μεταφόρτωσης.' };
    }
    const urls = Array.isArray(data.files)
      ? data.files.map((file) => file && (file.url || (file.filename ? `/uploads/trips/${file.filename}` : ''))).filter(Boolean)
      : [];
    if (!urls.length) {
      console.warn('TripImageUploader: response missing files');
      return { ok:false, error:'Δεν επιστράφηκαν αρχεία.' };
    }
    return { ok:true, urls };
  }

  function handleFilesChange(event){
    const input = event.currentTarget;
    const stopItem = input && input.closest(STOP_ITEM_SELECTOR);
    if (!stopItem) return;
    const textarea = stopItem.querySelector(STOP_IMAGES_SELECTOR);
    const statusEl = stopItem.querySelector(`.${CLASS_STOP_STATUS}`);
    if (!textarea) return;
    const files = Array.from((input && input.files) || []).filter((file) => file && file.size).slice(0, MAX_FILES_PER_BATCH);
    if (!files.length) return;
    const meta = {
      slug: getCurrentSlug(),
      stopTitle: (stopItem.querySelector('.stop-title') && stopItem.querySelector('.stop-title').value.trim()) || '',
      modeKey: stopItem.dataset.mode || ''
    };
    updateStatus(statusEl, 'Μεταφόρτωση...', 'uploading');
    input.disabled = true;
    uploadFiles(files, meta)
      .then((result) => {
        if (!result || !result.ok || !Array.isArray(result.urls)) {
          const msg = (result && result.error) || 'Αποτυχία μεταφόρτωσης.';
          updateStatus(statusEl, msg, 'error');
          announce(msg);
          return;
        }
        appendPaths(textarea, result.urls);
        try {
          if (window.TripStopsDraftBridge && typeof window.TripStopsDraftBridge.syncFromTextarea === 'function') {
            window.TripStopsDraftBridge.syncFromTextarea(textarea);
          }
        } catch(_){ }
        updateStatus(statusEl, `Προστέθηκαν ${result.urls.length} εικόνες.`, 'success');
        announce(`Προστέθηκαν ${result.urls.length} εικόνες${meta.stopTitle ? ` στη στάση ${meta.stopTitle}` : ''}.`);
      })
      .catch((err) => {
        console.warn('TripImageUploader: unexpected error', err);
        const msg = err && err.message ? err.message : 'Αποτυχία μεταφόρτωσης.';
        updateStatus(statusEl, msg, 'error');
        announce(msg);
      })
      .finally(() => {
        input.disabled = false;
        input.value = '';
      });
  }

  function ensureLayout(stopItem){
    const textarea = stopItem.querySelector(STOP_IMAGES_SELECTOR);
    if (!textarea) return null;
    const label = textarea.closest('label');
    if (!label) return null;
    label.classList.add(CLASS_STOP_FIELD);
    let row = label.querySelector(`.${CLASS_STOP_ROW}`);
    if (!row){
      row = document.createElement('div');
      row.className = CLASS_STOP_ROW;
      label.appendChild(row);
    }
    if (textarea.parentElement !== row) {
      row.insertBefore(textarea, row.firstChild);
    }
    let tools = row.querySelector(`.${CLASS_STOP_TOOLS}`);
    if (!tools){
      tools = document.createElement('div');
      tools.className = CLASS_STOP_TOOLS;
      row.appendChild(tools);
    }
    let picker = tools.querySelector(`.${CLASS_STOP_PICKER}`);
    if (!picker){
      picker = document.createElement('input');
      picker.type = 'file';
      picker.multiple = true;
      picker.accept = 'image/*';
      picker.className = CLASS_STOP_PICKER;
      picker.setAttribute('aria-label', 'Επιλογή εικόνων στάσης');
      tools.appendChild(picker);
    }
    let status = tools.querySelector(`.${CLASS_STOP_STATUS}`);
    if (!status){
      status = document.createElement('div');
      status.className = `${CLASS_STOP_STATUS} hint small`;
      status.setAttribute('aria-live', 'polite');
      tools.appendChild(status);
    }
    return { textarea, picker, status };
  }

  function enhanceStopItem(stopItem){
    if (!stopItem || stopItem.dataset.imagePickerBound === '1') return;
    const controls = ensureLayout(stopItem);
    if (!controls || !controls.picker) return;
    controls.picker.addEventListener('change', handleFilesChange);
    stopItem.dataset.imagePickerBound = '1';
  }

  function enhanceAllStopItems(){
    document.querySelectorAll(STOP_ITEM_SELECTOR).forEach(enhanceStopItem);
  }

  function observeStopLists(){
    if (typeof MutationObserver !== 'function') {
      console.warn('TripImageUploader: MutationObserver unavailable; automatic watch disabled.');
      return;
    }
    if (observer) observer.disconnect();
    observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.matches && node.matches(STOP_ITEM_SELECTOR)) {
            enhanceStopItem(node);
          } else if (node.querySelectorAll) {
            node.querySelectorAll(STOP_ITEM_SELECTOR).forEach(enhanceStopItem);
          }
        });
      });
    });
    document.querySelectorAll(STOP_LIST_SELECTOR).forEach((list) => {
      try {
        observer.observe(list, { childList: true });
      } catch(err){
        console.warn('TripImageUploader: failed to observe stop list', err);
      }
    });
  }

  function init(){
    try {
      enhanceAllStopItems();
      observeStopLists();
    } catch(err){ console.warn('TripImageUploader: init failed', err); }
  }

  function start(){
    if (bootstrapped) return;
    bootstrapped = true;
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    announcer = announcer || document.getElementById('stopImageUploadAnnouncer');
    if (!supportsUploads()) {
      if (announcer) announcer.textContent = '';
      window.TripImageUploader = { refresh: function(){} };
      return;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  }

  function waitForTrips(){
    if (window.__gaTripsTableRendered) {
      start();
      return;
    }
    const onRendered = () => {
      window.removeEventListener(READY_EVENT, onRendered);
      start();
    };
    window.addEventListener(READY_EVENT, onRendered);
    fallbackTimer = setTimeout(() => {
      if (!bootstrapped) start();
    }, FALLBACK_BOOT_DELAY);
  }

  window.TripImageUploader = {
    refresh(){
      if (!bootstrapped) start();
      try {
        enhanceAllStopItems();
      } catch(err){ console.warn('TripImageUploader.refresh failed', err); }
    }
  };

  waitForTrips();
})();
