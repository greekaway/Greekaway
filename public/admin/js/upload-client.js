(function(){
  const RAW_BASE = window.UPLOADS_BASE_URL || window.PUBLIC_BASE_URL || (window.location && window.location.origin) || 'https://greekaway.com';
  const UPLOADS_BASE = String(RAW_BASE || '').replace(/\/+$/, '') || 'https://greekaway.com';
  const KNOWN_UPLOAD_HOSTS = new Set(['greekaway.com','www.greekaway.com','localhost','127.0.0.1','0.0.0.0']);

  function stripSlashes(value){
    return String(value || '').replace(/^\/+|\/+$/g, '');
  }

  function toRelativeUploadsPath(value){
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('uploads/')) return raw;
    if (raw.startsWith('/uploads/')) return raw.replace(/^\/+/, '');
    if (/^https?:\/\//i.test(raw)) {
      try {
        const url = new URL(raw);
        const path = stripSlashes(url.pathname || '');
        if (!path.startsWith('uploads/')) return raw;
        const host = (url.hostname || '').toLowerCase();
        if (KNOWN_UPLOAD_HOSTS.has(host)) return path;
        try {
          const allowedHost = new URL(UPLOADS_BASE).hostname.toLowerCase();
          if (allowedHost && allowedHost === host) return path;
        } catch (_) {
          // ignore origin parsing errors
        }
        return raw;
      } catch (_) {
        return raw;
      }
    }
    return raw;
  }

  function absolutizeUploadsPath(value){
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    const rel = raw.startsWith('uploads/') ? raw : (raw.startsWith('/uploads/') ? raw.slice(1) : '');
    if (!rel) return raw;
    return `${UPLOADS_BASE}/${rel}`;
  }

  async function uploadFile(file, options){
    if (!file) throw new Error('no_file');
    const fd = new FormData();
    fd.append('file', file);
    const folder = options && typeof options.folder === 'string' ? options.folder.trim() : '';
    if (folder) fd.append('folder', folder);
    let response;
    try {
      response = await fetch('/api/admin/upload', {
        method: 'POST',
        body: fd,
        credentials: 'same-origin'
      });
    } catch (err) {
      throw new Error('network_error');
    }
    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }
    if (!response.ok || !data || !data.success) {
      const detail = data && (data.detail || data.error);
      throw new Error(detail || 'upload_failed');
    }
    const relativePath = toRelativeUploadsPath(data.filename || data.path || '');
    const absoluteUrl = data.absoluteUrl || absolutizeUploadsPath(relativePath || data.filename);
    return {
      relativePath,
      absoluteUrl,
      response: data
    };
  }

  window.GAUploadClient = {
    uploadFile,
    toRelativeUploadsPath,
    absolutizeUploadsPath,
    UPLOADS_BASE
  };
})();
