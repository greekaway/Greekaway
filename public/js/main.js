// ==============================
// main.js — Greekaway (ενιαίο, τελικό διορθωμένο)
// ==============================

// PWA detection: add a body class when running as installed PWA
document.addEventListener('DOMContentLoaded', () => {
  try {
    const isStandalone = (
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (window.navigator && window.navigator.standalone === true)
    );
    if (isStandalone) document.body.classList.add('pwa');
  } catch(_) {}
});

// Ensure admin bottom-nav has Categories/Trips; append if missing, label by href (EN), keep stable order
document.addEventListener('DOMContentLoaded', () => {
  try {
    const navs = document.querySelectorAll('nav.bottom-nav');
    if (!navs || !navs.length) return;
    navs.forEach(nav => {
      const ensureLink = (href, label) => {
        let a = nav.querySelector(`a[href="${href}"]`);
        if (!a) {
          a = document.createElement('a');
          a.setAttribute('href', href);
          a.textContent = label;
          nav.appendChild(a);
        }
        // Always normalize label by href (no index dependence)
        a.textContent = label;
        return a;
      };
      const cat = ensureLink('/admin/categories.html', 'Categories');
      const trips = ensureLink('/admin-trips.html', 'Trips');
      // Keep order stable: ... Availability, Categories, Trips
      try {
        if (cat && cat.parentNode === nav) nav.appendChild(cat);
        if (trips && trips.parentNode === nav) nav.appendChild(trips);
      } catch(_) { /* ignore */ }
    });
  } catch(_) { /* silent */ }
});

// Lightweight logger: set debug = true to enable console output during development.
const G = {
  debug: false,
  log: (...a) => { if (G.debug) console.log(...a); },
  warn: (...a) => { if (G.debug) console.warn(...a); },
  error: (...a) => { if (G.debug) console.error(...a); }
};

// Selected trip mode helpers
const AVAILABLE_MODES = ['van','mercedes','bus'];

function canonicalMode(mode){
  const value = String(mode || '').toLowerCase();
  if (value === 'private' || value === 'mercedes/private') return 'mercedes';
  if (value === 'multi' || value === 'shared') return 'van';
  if (AVAILABLE_MODES.includes(value)) return value;
  return 'van';
}

function navModeFromCanonical(mode){
  return mode === 'mercedes' ? 'private' : mode;
}

function persistTripModeFromCanonical(mode){
  if (!mode) return;
  const navMode = navModeFromCanonical(mode);
  if (!navMode) return;
  try { localStorage.setItem('trip_mode', navMode); } catch(_){ }
}

function getSelectedMode(){
  try {
    const params = new URLSearchParams(window.location.search);
    const queryMode = params.get('mode');
    if (queryMode) {
      const canonical = canonicalMode(queryMode);
      persistTripModeFromCanonical(canonical);
      return canonical;
    }
    let storedMode = null;
    try { storedMode = localStorage.getItem('trip_mode'); } catch(_){ storedMode = null; }
    const canonicalStored = canonicalMode(storedMode || 'van');
    const expectedNav = navModeFromCanonical(canonicalStored);
    if (!storedMode || storedMode !== expectedNav) {
      persistTripModeFromCanonical(canonicalStored);
    }
    return canonicalStored;
  } catch(_) {
    return 'van';
  }
}

function resolveModeActive(primary, fallback){
  const value = (typeof primary !== 'undefined') ? primary : fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return true;
    if (['false','0','no','inactive','disabled'].includes(normalized)) return false;
    if (['true','1','yes','active','enabled'].includes(normalized)) return true;
  }
  return true;
}

function resolveModePrice(modeSet, rawMode){
  if (modeSet && typeof modeSet.price_cents === 'number') return modeSet.price_cents / 100;
  const candidates = [
    rawMode && rawMode.price_per_person,
    rawMode && rawMode.price_total,
    rawMode && rawMode.price
  ];
  for (const value of candidates) {
    if (value == null || value === '') continue;
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function resolveModeChargeType(modeSet, rawMode){
  const raw = (modeSet && modeSet.charge_type) || (rawMode && (rawMode.charge_type || rawMode.charging_type)) || 'per_person';
  const lowered = String(raw).toLowerCase();
  if (lowered === 'per_vehicle' || lowered === 'flat') return 'per_vehicle';
  return 'per_person';
}

function resolveModeCapacity(modeSet, rawMode){
  const candidates = [
    modeSet && modeSet.default_capacity,
    rawMode && rawMode.default_capacity,
    rawMode && rawMode.capacity
  ];
  for (const value of candidates) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return null;
}

function getTripModeInfo(tripData, modeKey){
  if (!tripData) return null;
  const canonical = canonicalMode(modeKey || getSelectedMode());
  const legacyModes = (tripData.modes && typeof tripData.modes === 'object') ? tripData.modes : {};
  const rawMode = legacyModes[canonical] || null;
  const modeSet = (tripData.mode_set && typeof tripData.mode_set === 'object') ? tripData.mode_set[canonical] : null;
  const isActive = resolveModeActive(modeSet && modeSet.active, rawMode && rawMode.active);
  if (!isActive) return null;
  const price = resolveModePrice(modeSet, rawMode);
  if (price == null) return null;
  const chargeType = resolveModeChargeType(modeSet, rawMode);
  const capacity = resolveModeCapacity(modeSet, rawMode);
  const currency = (tripData.currency || 'EUR').toUpperCase();
  const description = rawMode && rawMode.description ? rawMode.description : '';
  return { key: canonical, price, chargeType, capacity, currency, description };
}

// Temporary flag to disable any flatpickr calendar initialization in the booking overlay
// Allow only the inline calendar inside the overlay; prevent other calendars/popups
const GW_DISABLE_BOOKING_CALENDAR = false;

// Return translation for key if available; otherwise, return fallback
function tSafe(key, fallback){
  try {
    const v = (typeof window.t === 'function') ? window.t(key) : '';
    if (v && v !== key) return v;
  } catch(_){ }
  return fallback;
}

// Map current language to flatpickr locale pack key
function getFlatpickrLocale() {
  try {
    const lang = getCurrentLang();
    const l10n = (window.flatpickr && window.flatpickr.l10ns) ? window.flatpickr.l10ns : null;
    if (!l10n) return 'default';
    if (lang === 'el') return l10n.gr || 'gr';
    if (lang === 'en') return 'default';
    if (l10n[lang]) return l10n[lang];
    return 'default';
  } catch(_) { return 'default'; }
}

function getCurrentLang() {
  return (window.currentI18n && window.currentI18n.lang) || localStorage.getItem('gw_lang') || 'el';
}

function getLocalized(field) {
  const currentLang = getCurrentLang();
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'object') return field[currentLang] || field['el'] || Object.values(field)[0] || '';
  return '';
}

let __gwCategoryCache = null;
let __gwCategoryCachePromise = null;

async function fetchCategoriesFromAdmin(){
  const res = await fetch('/api/admin/categories', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new Error('categories_admin_load_failed');
  const json = await res.json();
  const arr = Array.isArray(json) ? json : [];
  return arr.filter(cat => cat && cat.published);
}

async function fetchCategoriesFromCms(){
  const res = await fetch('/api/categories?published=true', { cache: 'no-store' });
  if (!res.ok) throw new Error('categories_cms_load_failed');
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

function fetchPublishedCategoriesOnce(){
  if (__gwCategoryCache) return Promise.resolve(__gwCategoryCache);
  if (!__gwCategoryCachePromise) {
    __gwCategoryCachePromise = (async () => {
      try {
        const published = await fetchCategoriesFromCms();
        if (published && published.length) {
          __gwCategoryCache = published;
          try { window.__gwCategories = published; } catch(_){ }
          return published;
        }
      } catch(_){ }
      try {
        const adminList = await fetchCategoriesFromAdmin();
        if (adminList && adminList.length) {
          __gwCategoryCache = adminList;
          try { window.__gwCategories = adminList; } catch(_){ }
          return adminList;
        }
      } catch(_){ }
      __gwCategoryCache = [];
      return [];
    })();
  }
  return __gwCategoryCachePromise;
}

async function getCategoryMetaBySlug(slug){
  if (!slug) return null;
  try {
    const cached = Array.isArray(window.__gwCategories) ? window.__gwCategories : __gwCategoryCache;
    if (cached && cached.length) {
      const match = cached.find(cat => (cat.slug || cat.id) === slug);
      if (match) return match;
    }
  } catch(_){ }
  const list = await fetchPublishedCategoriesOnce();
  return (list || []).find(cat => (cat.slug || cat.id) === slug) || null;
}

async function getDataVersionEnsure(){
  if (typeof window.__GW_DATA_VER !== 'undefined' && window.__GW_DATA_VER !== null && window.__GW_DATA_VER !== '') return window.__GW_DATA_VER;
  try {
    const r = await fetch('/version.json', { cache: 'no-cache' });
    if (r.ok) {
      const j = await r.json();
      window.__GW_DATA_VER = (j && j.dataVersion) ? String(j.dataVersion) : '';
      return window.__GW_DATA_VER;
    }
  } catch(_){ }
  window.__GW_DATA_VER = '';
  return '';
}

window.__GW_DATA_VER = '';
const RAW_UPLOADS_BASE = (window.UPLOADS_BASE_URL || window.PUBLIC_BASE_URL || (window.location && window.location.origin) || 'https://greekaway.com');
const UPLOADS_BASE = String(RAW_UPLOADS_BASE || '').replace(/\/+$, '') || 'https://greekaway.com';
const DEFAULT_CATEGORY_ICON = `${UPLOADS_BASE}/uploads/icons/default.svg`;

// ---------- [A] Λίστα Κατηγοριών (trips.html) ----------
document.addEventListener("DOMContentLoaded", () => {
  try {
    const url = new URL(window.location.href);
    const smoke = url.searchParams.get('smoke');
    if ((typeof navigator !== 'undefined' && navigator.webdriver) || smoke === '1') {
      document.body.classList.add('booking-testing');
    }
  } catch(_) {}
  const categoriesContainer = document.getElementById("categories-container");
  if (!categoriesContainer) return; // αν δεν είμαστε σε trips.html συνέχισε στα επόμενα μπλοκ
  // indicate this is the category-listing view
  document.body.dataset.view = 'category';

  function renderCategories(cats){
    const container = document.getElementById("categories-container");
    if (!container) return;
    container.innerHTML = "";
    if (!Array.isArray(cats) || cats.length === 0) {
      // Use translation key with fallback without showing raw key
      const fallback = 'Δεν υπάρχουν διαθέσιμες κατηγορίες.';
      let msg = fallback;
      try {
        if (typeof window.t === 'function') {
          const maybe = window.t('trips.no_categories');
          if (maybe && maybe !== 'trips.no_categories') msg = maybe;
        }
      } catch(_) {}
      container.innerHTML = `<p class="no-categories">${msg}</p>`;
      return;
    }
      cats.forEach(cat => {
        const slug = cat.slug || cat.id;
        const catTitle = getLocalized(cat.title) || '';
        let iconPath = cat.iconPath || (`/categories/${slug}/icon.svg`);
        if (!iconPath) iconPath = DEFAULT_CATEGORY_ICON;
        const tile = document.createElement('div');
        tile.className = 'category-tile';
        const btn = document.createElement('button');
        btn.className = 'category-btn ga-card';
        btn.dataset.cat = slug;
        btn.classList.add(`cat-${slug}`);
        btn.title = catTitle;
        // Route all categories through a single template with slug param
        btn.addEventListener('click', () => { window.location.href = `/category.html?slug=${encodeURIComponent(slug)}`; });
        // Icon wrapper
        const iconWrapper = document.createElement('div');
        iconWrapper.className = 'category-icon';
        // Inject inline SVG to enforce gold color via CSS; fallback to <img> for non-SVG
        const isSvg = /\.svg(\?|$)/i.test(iconPath);
        if (isSvg) {
          fetch(iconPath, { cache:'no-store' })
            .then(r => r.ok ? r.text() : Promise.reject(new Error('svg_fetch_failed_'+r.status)))
            .then(txt => {
              try {
                const cleaned = txt.replace(/<\?xml[^>]*>/ig,'').replace(/<!DOCTYPE[^>]*>/ig,'');
                const tmp = document.createElement('div');
                tmp.innerHTML = cleaned;
                const svg = tmp.querySelector('svg');
                if (svg) {
                  svg.removeAttribute('width');
                  svg.removeAttribute('height');
                  svg.setAttribute('role','img');
                  svg.setAttribute('aria-label', catTitle);
                  svg.classList.add('svg-icon');
                  iconWrapper.appendChild(svg);
                } else {
                  throw new Error('no_svg_tag');
                }
              } catch(e){
                const imgFallback = document.createElement('img');
                imgFallback.src = iconPath;
                imgFallback.alt = catTitle;
                imgFallback.className = 'svg-icon';
                iconWrapper.appendChild(imgFallback);
              }
            })
            .catch(_ => {
              const imgFallback = document.createElement('img');
              imgFallback.src = iconPath;
              imgFallback.alt = catTitle;
              imgFallback.className = 'svg-icon';
              iconWrapper.appendChild(imgFallback);
            });
        } else {
          const imgEl = document.createElement('img');
          imgEl.src = iconPath;
          imgEl.alt = catTitle;
          imgEl.className = 'svg-icon';
          iconWrapper.appendChild(imgEl);
        }
        btn.appendChild(iconWrapper);
        const caption = document.createElement('div');
        caption.className = 'category-caption';
        caption.textContent = catTitle;
        tile.appendChild(btn);
        tile.appendChild(caption);
        container.appendChild(tile);
      });
  }

  fetchPublishedCategoriesOnce()
    .then(cats => {
      const list = Array.isArray(cats) ? cats : [];
      window.__gwCategories = list;
      renderCategories(list);
      window.addEventListener('i18n:changed', () => {
        try { renderCategories(window.__gwCategories || list); } catch(_) {}
      });
    })
  .catch(err => {
    G.error("Σφάλμα φόρτωσης κατηγοριών:", err);
    renderCategories([]);
  });
});

// Trip view logic moved to /public/js/trip-core.js.
