// Simple client-side i18n loader
(function(){
  'use strict';

  const DEFAULT = 'el';
  const SUPPORTED = ['el','en','fr','de','he'];
  const FLAGS = { el: '🇬🇷', en: '🇬🇧', fr: '🇫🇷', de: '🇩🇪', he: '🇮🇱' };
  const RTL_LANGS = ['he', 'ar', 'fa', 'ur'];

  function detectLang(){
    const stored = localStorage.getItem('gw_lang');
    if(stored && SUPPORTED.includes(stored)) return stored;
    const nav = (navigator.language||navigator.userLanguage||'').slice(0,2);
    if(SUPPORTED.includes(nav)) return nav;
    return DEFAULT;
  }

  async function loadMessages(lang){
    try{
      const res = await fetch('/i18n/' + lang + '.json');
      if(!res.ok) throw new Error('Not found');
      return await res.json();
    }catch(e){
      if(lang !== DEFAULT) return loadMessages(DEFAULT);
      return {};
    }
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
    // data-i18n => innerText
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const text = lookup(msgs, key);
      if(text) el.textContent = text;
    });
    // placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const text = lookup(msgs, key);
      if(text) el.setAttribute('placeholder', text);
    });
    // title attributes
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const text = lookup(msgs, key);
      if(text) el.setAttribute('title', text);
    });
    // value for buttons/inputs
    document.querySelectorAll('[data-i18n-value]').forEach(el => {
      const key = el.getAttribute('data-i18n-value');
      const text = lookup(msgs, key);
      if(text) el.value = text;
    });
  }

  async function setLanguage(lang){
    if(!SUPPORTED.includes(lang)) return;
    localStorage.setItem('gw_lang', lang);
    const msgs = await loadMessages(lang);
    applyTranslations(msgs);
    // update selector if exists
    const sel = document.getElementById('langSelect');
    if(sel) sel.value = lang;
    // set document direction for rtl languages
    const isRtl = RTL_LANGS.includes(lang);
    try{ document.documentElement.dir = isRtl ? 'rtl' : 'ltr'; document.body.classList.toggle('rtl', isRtl); } catch(e){}
    window.currentI18n = { lang, msgs };
  }

  // init on DOM ready (run immediately if DOM already loaded)
  async function initI18n(){
    const lang = detectLang();
    // populate selector if present (with flags)
    const sel = document.getElementById('langSelect');
    if(sel){
      // if no options, add defaults
      if(sel.children.length === 0){
        const map = { el:'Ελληνικά', en:'English', fr:'Français', de:'Deutsch', he:'עברית' };
        for(const code of SUPPORTED){
          const opt = document.createElement('option');
          opt.value = code;
          const flag = FLAGS[code] ? FLAGS[code] + ' ' : '';
          opt.textContent = flag + (map[code]||code);
          sel.appendChild(opt);
        }
      }
      sel.value = lang;
      // attach the change listener explicitly after the element exists
      document.getElementById('langSelect').addEventListener('change', e => setLanguage(e.target.value));
      sel.style.fontSize = '14px'; sel.style.padding = '4px 8px'; sel.style.height = '34px';
    }
    const msgs = await loadMessages(lang);
    applyTranslations(msgs);
    window.currentI18n = { lang, msgs };
    // expose setter
    window.setLanguage = setLanguage;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initI18n);
  else initI18n();

  // helper to translate programmatically
  window.t = function(key){
    try{ return lookup(window.currentI18n && window.currentI18n.msgs || {}, key) || key; } catch(e){ return key; }
  };
})();
