'use strict';

// Injects a version query (?v=NNN) into local CSS/JS and manifest links inside HTML.
// - Preserves existing query strings by replacing any existing v= value
// - Skips absolute URLs (http/https or protocol-relative //)
function applyAssetVersion(html, version) {
  if (!html || !version) return html;
  const v = String(version).trim();

  // Helper to add/replace v= query in a URL (without touching external URLs)
  const addOrReplaceV = (url) => {
    const u = String(url || '').trim();
    if (!u) return u;
    // Skip absolute/external
    if (/^(?:https?:)?\/\//i.test(u)) return u;
    // Only target .css and .js and manifest.json
    if (!/(\.css|\.js|manifest\.json)(?:$|[?#])/i.test(u)) return u;
    // Replace existing v=number
    if (/(\?|&)v=\d+/i.test(u)) return u.replace(/(\?|&)v=\d+/i, `$1v=${v}`);
    // Append with correct separator
    return u + (u.includes('?') ? `&v=${v}` : `?v=${v}`);
  };

  // Replace href/src attributes that point to targeted assets
  let out = html.replace(/(href\s*=\s*\")(.*?)(\"\s*[^>]*>)/gi, (m, p1, url, p3) => {
    const newUrl = addOrReplaceV(url);
    return p1 + newUrl + p3;
  });
  out = out.replace(/(src\s*=\s*\")(.*?)(\")/gi, (m, p1, url, p3) => {
    const newUrl = addOrReplaceV(url);
    return p1 + newUrl + p3;
  });

  return out;
}

module.exports = { applyAssetVersion };
