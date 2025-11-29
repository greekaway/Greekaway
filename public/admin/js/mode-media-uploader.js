(function(){
  const READY_EVENT = 'ga:trips:rendered';
  const GALLERY_SELECTOR = '.mode-card textarea[data-field="gallery"]';
  const HERO_THUMB_SELECTOR = '.mode-card input[data-field="video_thumbnail"]';
  const MAX_BYTES = 10 * 1024 * 1024;
  let bootstrapped = false;

  function init(){
    enhanceGalleryFields();
    enhanceHeroThumbnailFields();
  }

  function enhanceGalleryFields(){
    document.querySelectorAll(GALLERY_SELECTOR).forEach((textarea) => {
      if (!textarea || textarea.dataset.modeGalleryBound === '1') return;
      textarea.dataset.modeGalleryBound = '1';
      const tools = buildToolsRow(textarea, { multiple:true, accept:'.jpg,.jpeg,.png' });
      const { picker, status, button } = tools;
      picker.addEventListener('change', () => handleGalleryFiles(textarea, picker, status, button));
      button.textContent = 'Μεταφόρτωση εικόνων';
    });
  }

  function enhanceHeroThumbnailFields(){
    document.querySelectorAll(HERO_THUMB_SELECTOR).forEach((input) => {
      if (!input || input.dataset.modeHeroBound === '1') return;
      input.dataset.modeHeroBound = '1';
      const tools = buildToolsRow(input, { multiple:false, accept:'.jpg,.jpeg,.png' });
      const { picker, status, button, clearButton } = tools;
      button.textContent = 'Μεταφόρτωση thumbnail';
      picker.addEventListener('change', () => handleHeroThumbnailFile(input, picker, status, button));
      if (clearButton) {
        clearButton.addEventListener('click', (event) => {
          event.preventDefault();
          input.value = '';
          dispatchInput(input);
          setStatus(status, 'Το thumbnail αφαιρέθηκε.', 'info');
        });
      }
    });
  }

  function buildToolsRow(target, { multiple, accept }){
    const wrapper = document.createElement('div');
    wrapper.className = 'mode-media-tools';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn secondary small';
    button.textContent = 'Επιλογή αρχείων';
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = accept;
    picker.multiple = multiple;
    picker.hidden = true;
    const status = document.createElement('div');
    status.className = 'mode-media-status';
    status.setAttribute('aria-live', 'polite');
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'btn danger small';
    clearButton.textContent = 'Καθαρισμός';
    clearButton.hidden = !target.matches(HERO_THUMB_SELECTOR);
    wrapper.appendChild(button);
    if (target.matches(HERO_THUMB_SELECTOR)) wrapper.appendChild(clearButton);
    wrapper.appendChild(status);
    target.insertAdjacentElement('afterend', wrapper);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (!picker.disabled) picker.click();
    });
    document.body.appendChild(picker);
    return { picker, status, button, clearButton: clearButton.hidden ? null : clearButton };
  }

  function handleGalleryFiles(textarea, picker, status, button){
    const files = Array.from(picker.files || []);
    picker.value = '';
    if (!files.length) return;
    const invalid = files.map(validateImageFile).find(Boolean);
    if (invalid) {
      setStatus(status, invalid, 'error');
      return;
    }
    setStatus(status, 'Μεταφόρτωση...', 'uploading');
    disableControls(true, picker, button);
    uploadMedia(files)
      .then((uploaded) => {
        const urls = (uploaded || []).map((file) => file && file.url).filter(Boolean);
        appendPaths(textarea, urls);
        setStatus(status, `Προστέθηκαν ${urls.length} εικόνες.`, 'success');
      })
      .catch((err) => {
        setStatus(status, err && err.message ? err.message : 'Αποτυχία μεταφόρτωσης.', 'error');
      })
      .finally(() => disableControls(false, picker, button));
  }

  function handleHeroThumbnailFile(input, picker, status, button){
    const file = (picker.files || [])[0];
    picker.value = '';
    if (!file) return;
    const validation = validateImageFile(file);
    if (validation) {
      setStatus(status, validation, 'error');
      return;
    }
    setStatus(status, 'Μεταφόρτωση...', 'uploading');
    disableControls(true, picker, button);
    uploadMedia([file])
      .then((uploaded) => {
        const url = uploaded && uploaded[0] && uploaded[0].url;
        if (!url) throw new Error('Αποτυχία μεταφόρτωσης.');
        input.value = url;
        dispatchInput(input);
        setStatus(status, 'Το thumbnail ανέβηκε.', 'success');
      })
      .catch((err) => {
        setStatus(status, err && err.message ? err.message : 'Αποτυχία μεταφόρτωσης.', 'error');
      })
      .finally(() => disableControls(false, picker, button));
  }

  function validateImageFile(file){
    if (!file) return 'Η επιλογή απέτυχε.';
    const type = String(file.type || '').toLowerCase();
    const name = String(file.name || '').toLowerCase();
    const isJpg = type === 'image/jpeg' || type === 'image/jpg' || /\.jpe?g$/i.test(name);
    const isPng = type === 'image/png' || /\.png$/i.test(name);
    if (!isJpg && !isPng) return 'Μόνο JPG/PNG επιτρέπονται.';
    if (file.size > MAX_BYTES) return 'Μέγιστο 10MB ανά αρχείο.';
    return '';
  }

  function uploadMedia(files){
    const fd = new FormData();
    fd.append('slug', currentSlug());
    files.forEach((file) => fd.append('tripMediaFiles', file));
    return fetch('/api/upload-trip-media', {
      method: 'POST',
      body: fd,
      credentials: 'same-origin'
    })
      .then(async (res) => {
        let data = null;
        try { data = await res.json(); } catch (_) {}
        if (!res.ok || !data || !data.ok) {
          const detail = data && (data.detail || data.error);
          throw new Error(detail || 'Αποτυχία μεταφόρτωσης.');
        }
        return data.files || [];
      });
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
    dispatchInput(textarea);
  }

  function dispatchInput(element){
    try {
      element.dispatchEvent(new Event('input', { bubbles:true }));
    } catch (_) {
      const evt = document.createEvent('Event');
      evt.initEvent('input', true, true);
      element.dispatchEvent(evt);
    }
  }

  function setStatus(el, text, state){
    if (!el) return;
    el.textContent = text || '';
    if (state) el.dataset.state = state;
    else delete el.dataset.state;
  }

  function disableControls(disabled, picker, button){
    if (picker) picker.disabled = disabled;
    if (button) button.disabled = disabled;
  }

  function currentSlug(){
    const slugInput = document.getElementById('slug');
    const titleInput = document.getElementById('title');
    const slug = slugInput && slugInput.value ? sanitize(slugInput.value) : '';
    if (slug) return slug;
    const title = titleInput && titleInput.value ? sanitize(titleInput.value) : '';
    return title || 'trip';
  }

  function sanitize(value){
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function start(){
    if (bootstrapped) return;
    bootstrapped = true;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
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
    setTimeout(start, 5000);
  }

  waitForTrips();
})();
