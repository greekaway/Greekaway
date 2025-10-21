// Centralized client-side i18n loader using /locales
(function(){
  'use strict';

  const DEFAULT = 'el';
  const FLAGS = { el: '🇬🇷', en: '🇬🇧', fr: '🇫🇷', de: '🇩🇪', he: '🇮🇱' };
  const RTL_LANGS = ['he', 'ar', 'fa', 'ur'];
  let AVAILABLE = null; // discovered languages from /locales/index.json
  const CACHE = {}; // lang -> messages

  async function discoverLanguages(){
    if (Array.isArray(AVAILABLE) && AVAILABLE.length) return AVAILABLE;
    try {
      const res = await fetch('/locales/index.json', { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.languages)) {
          AVAILABLE = data.languages;
          return AVAILABLE;
        }
      }
    } catch(_){ }
    // Try optional fallback index under /i18n if present
    try {
      const res2 = await fetch('/i18n/index.json', { cache: 'no-cache' });
      if (res2.ok) {
        const data2 = await res2.json();
        if (data2 && Array.isArray(data2.languages)) {
          AVAILABLE = data2.languages;
          return AVAILABLE;
        }
      }
    } catch(_){ }
    // fallback to common set
    AVAILABLE = ['el','en','fr','de','he'];
    return AVAILABLE;
  }

  function detectLang(){
    const stored = localStorage.getItem('gw_lang');
    const nav = (navigator.language||navigator.userLanguage||'').slice(0,2);
    const pick = stored || nav || DEFAULT;
    if (!AVAILABLE || AVAILABLE.indexOf(pick) === -1) return DEFAULT;
    return pick;
  }

  async function loadMessages(lang){
    if (CACHE[lang]) return CACHE[lang];
    // Try primary /locales path, then fallback to /i18n path
    const tryPaths = [`/locales/${lang}.json`, `/i18n/${lang}.json`];
    for (const url of tryPaths) {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error('not-ok');
        const json = await res.json();
        CACHE[lang] = json || {};
        return CACHE[lang];
      } catch (e) {
        try { if (window.gwI18nDebug) console.warn('[i18n] failed to load', url); } catch(_){}
      }
    }
    if (lang !== DEFAULT) return loadMessages(DEFAULT);
    return {};
  }

  function lookup(obj, path){
    if(!path) return '';
    const parts = path.split('.');
    let cur = obj;
    for(const p of parts){
      if(cur && Object.prototype.hasOwnProperty.call(cur,p)) cur = cur[p];
      else return '';
    }
    return (cur === null || cur === undefined) ? '' : String(cur);
  }

  function applyTranslations(msgs){
    try { if (window.gwI18nDebug) console.info('[i18n] applyTranslations'); } catch(_) {}
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const text = lookup(msgs, key);
      if(text) el.textContent = text;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const text = lookup(msgs, key);
      if(text) el.setAttribute('placeholder', text);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const text = lookup(msgs, key);
      if(text) el.setAttribute('title', text);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      const text = lookup(msgs, key);
      if(text) el.setAttribute('aria-label', text);
    });
    document.querySelectorAll('[data-i18n-value]').forEach(el => {
      const key = el.getAttribute('data-i18n-value');
      const text = lookup(msgs, key);
      if(text) el.value = text;
    });
  }

  async function setLanguage(lang){
    try { if (window.gwI18nDebug) console.info('[i18n] setLanguage', lang); } catch(_) {}
    try { localStorage.setItem('gw_lang', lang); } catch(_){ }
    try { sessionStorage.setItem('gw_lang', lang); } catch(_){ }
    const msgs = await loadMessages(lang);
    applyTranslations(msgs);
    const sel = document.getElementById('langSelect');
    if(sel) sel.value = lang;
    const isRtl = RTL_LANGS.includes(lang);
    try{ 
      document.documentElement.dir = isRtl ? 'rtl' : 'ltr'; 
      document.documentElement.lang = lang || 'el';
      document.body.classList.toggle('rtl', isRtl); 
    } catch(e){}
    window.currentI18n = { lang, msgs };
    try{ window.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang, msgs } })); }catch(e){}
  }

  async function populateSelector(lang){
    const sel = document.getElementById('langSelect');
    if(!sel) return;
    if (sel.children.length === 0) {
      const labelMap = { el:'Ελληνικά', en:'English', fr:'Français', de:'Deutsch', he:'עברית' };
      for (const code of AVAILABLE) {
        const opt = document.createElement('option');
        opt.value = code;
        const flag = FLAGS[code] ? FLAGS[code] + ' ' : '';
        opt.textContent = flag + (labelMap[code] || code.toUpperCase());
        sel.appendChild(opt);
        // Try to refine label from the locale file meta.languageName without blocking UI
        loadMessages(code).then(m => {
          try {
            const name = m && m.meta && m.meta.languageName;
            if (name) opt.textContent = flag + name;
          } catch(_){}
        }).catch(()=>{});
      }
    }
    sel.value = lang;
    if (!sel.__gwBound) {
      sel.addEventListener('change', e => setLanguage(e.target.value));
      sel.style.fontSize = '14px'; sel.style.padding = '4px 8px'; sel.style.height = '34px';
      sel.__gwBound = true;
    }
  }

  // init on DOM ready
  async function initI18n(){
    await discoverLanguages();
    const lang = detectLang();
    await populateSelector(lang);
    const msgs = await loadMessages(lang);
    applyTranslations(msgs);
    // Observe DOM mutations and re-apply translations (debounced) to catch injected content (e.g., footer)
    try {
      if (!window.__gwI18nObserver) {
        let moTimer = null;
        const observer = new MutationObserver(() => {
          if (moTimer) clearTimeout(moTimer);
          moTimer = setTimeout(() => {
            try { applyTranslations(window.currentI18n && window.currentI18n.msgs || msgs); } catch(_) {}
          }, 50);
        });
        observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
        window.__gwI18nObserver = observer;
        try { if (window.gwI18nDebug) console.info('[i18n] MutationObserver attached'); } catch(_) {}
      }
    } catch(_) {}
    try {
      const isRtl = RTL_LANGS.includes(lang);
      document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
      document.documentElement.lang = lang || 'el';
      document.body.classList.toggle('rtl', isRtl);
    } catch(_){ }
  window.currentI18n = { lang, msgs };
  window.setLanguage = setLanguage;
  window.loadLanguage = setLanguage; // alias per API contract
    try{ window.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang, msgs } })); }catch(e){}
    try { if (window.gwI18nDebug) console.info('[i18n] init done', lang); } catch(_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initI18n);
  else initI18n();

  // helper to translate programmatically
  window.t = function(key){
    try{ return lookup(window.currentI18n && window.currentI18n.msgs || {}, key) || key; } catch(e){ return key; }
  };
})();
