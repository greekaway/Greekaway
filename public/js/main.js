// ==============================
// main.js — Greekaway (ενιαίο, τελικό διορθωμένο)
// ==============================

// Lightweight logger: set debug = true to enable console output during development.
const G = {
  debug: false,
  log: (...a) => { if (G.debug) console.log(...a); },
  warn: (...a) => { if (G.debug) console.warn(...a); },
  error: (...a) => { if (G.debug) console.error(...a); }
};

// Temporary flag to disable any flatpickr calendar initialization in the booking overlay
// Allow only the inline calendar inside the overlay; prevent other calendars/popups
const GW_DISABLE_BOOKING_CALENDAR = false;

// Global i18n helpers used by multiple blocks
function getCurrentLang() {
  return (window.currentI18n && window.currentI18n.lang) || localStorage.getItem('gw_lang') || 'el';
}

function getLocalized(field) {
  const currentLang = getCurrentLang();
  if (!field) return '';
  if (typeof field === 'string') return field; // legacy single-language
  if (typeof field === 'object') return field[currentLang] || field['el'] || Object.values(field)[0] || '';
  return '';
}

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

  fetch("/data/categories.json")
    .then(r => {
      if (!r.ok) throw new Error("Αποτυχία φόρτωσης categories.json");
      return r.json();
    })
    .then(cats => {
      categoriesContainer.innerHTML = "";
      cats.forEach(cat => {
        const btn = document.createElement("button");
        btn.className = "category-btn";

  // ΜΟΝΟ η εικόνα (ο τίτλος υπάρχει ήδη πάνω στην ίδια την εικόνα)
  const catTitle = getLocalized(cat.title) || '';
  btn.innerHTML = `<img src="${cat.image}" alt="${catTitle}"><span class="cat-label">${catTitle}</span>`;
  // expose category id for styling and accessibility
  btn.dataset.cat = cat.id;
  btn.classList.add(`cat-${cat.id}`);
  btn.title = catTitle;

        btn.addEventListener("click", () => {
          // Μετάβαση στη σελίδα της κατηγορίας
          window.location.href = `/categories/${cat.id}.html`;
        });

        // Apply cinematic entrance for the three main categories (sea, mountain, culture)
        categoriesContainer.appendChild(btn);
        if (['sea','mountain','culture'].includes(cat.id)) {
          // tiny stagger so entrance feels natural
          const delay = (['sea','mountain','culture'].indexOf(cat.id) * 100) + 90;
          setTimeout(() => btn.classList.add('cinematic'), delay);
        }
      });
    })
  .catch(err => G.error("Σφάλμα φόρτωσης κατηγοριών:", err));
});

// ---------- [B] Σελίδα Κατηγορίας (π.χ. /categories/culture.html) ----------
document.addEventListener("DOMContentLoaded", () => {
  const tripsContainer = document.getElementById("trips-container");
  if (!tripsContainer) return; // αν δεν είμαστε σε σελίδα κατηγορίας, πήγαινε στο [C]

  const category = document.body.dataset.category; // π.χ. "culture"
  // ensure view flag for listing pages
  document.body.dataset.view = 'category';
  if (!category) return;

  fetch("/data/tripindex.json")
    .then(r => r.json())
    .then(allTrips => {
      tripsContainer.innerHTML = "";
      allTrips
        .filter(t => t.category === category)
        .forEach(trip => {
          const card = document.createElement("div");
          card.className = "trip-card";
          // expose trip id so we can target specific cards (e.g. lefkas) with CSS
          card.dataset.tripId = trip.id;
          // If this is the Lefkada card, force the dark navy inline to avoid stylesheet overrides
          if (trip.id === 'lefkas') {
            // use setProperty with priority 'important' so it's inline-important
            card.style.setProperty('background-color', '#0E1520', 'important');
            card.style.setProperty('background-image', 'none', 'important');
            // inset 1px mask plus slightly stronger outer depth shadow to balance perceived tone
            card.style.setProperty('box-shadow', 'inset 0 0 0 1px #0E1520, 0 6px 18px rgba(0,0,0,0.48)', 'important');
            card.style.setProperty('filter', 'none', 'important');
            card.style.setProperty('backdrop-filter', 'none', 'important');
            card.style.setProperty('border', 'none', 'important');
            // (already applied above) subtle outer shadow + inset mask applied to blend perfectly
            card.style.setProperty('outline', 'none', 'important');
          }
          // If this is the olympia, lefkas, or parnassos trip, add the logo-pop animation class
          if (trip.id === 'olympia' || trip.id === 'lefkas' || trip.id === 'parnassos') card.classList.add('logo-pop');
          // add category metadata so we can style per-category
          card.dataset.cat = trip.category || category;
          card.classList.add(`cat-${trip.category || category}`);
          card.innerHTML = `<h3>${getLocalized(trip.title)}</h3>`;
          card.addEventListener("click", () => {
            // Mark this trip so the destination page can show a persistent highlight
            try { sessionStorage.setItem('highlightTrip', trip.id); } catch(e) {}
            // ΜΟΝΟ ΕΝΑ trip.html — δίνουμε id με query
            window.location.href = `/trips/trip.html?id=${trip.id}`;
          });
          tripsContainer.appendChild(card);
        });

      if (!tripsContainer.children.length) {
        const noTrips = (window.t && typeof window.t === 'function') ? window.t('trips.noneFound') : 'No trips found in this category.';
        tripsContainer.innerHTML = `<p>${noTrips}</p>`;
      }
    })
  .catch(err => G.error("Σφάλμα tripindex:", err));
});

// ---------- [C] Σελίδα Εκδρομής (/trips/trip.html?id=olympia) ----------
document.addEventListener("DOMContentLoaded", () => {
  const tripSection = document.getElementById("trip-section");
  if (!tripSection) return; // αν δεν είμαστε σε trip.html, τέλος

  const params = new URLSearchParams(window.location.search);
  const tripId = params.get("id");
  if (!tripId) {
    document.getElementById("trip-section").innerHTML =
      "<p>Δεν δόθηκε εκδρομή (λείπει το ?id=...).</p>";
    return;
  }

  // Try to set category early from tripindex so per-category background
  // appears as soon as possible (before the full trip JSON finishes loading).
  fetch('/data/tripindex.json')
    .then(r => r.json())
    .then(all => {
      const meta = (all || []).find(t => t.id === tripId);
      if (meta && meta.category) document.body.dataset.category = meta.category;
    })
    .catch(() => {});

  fetch(`/data/trips/${tripId}.json`)
    .then(r => {
      if (!r.ok) throw new Error("Αποτυχία φόρτωσης δεδομένων εκδρομής");
      return r.json();
    })
    .then(trip => {
  // If this is olympia or parnassos, give the trip page a navy background override
  if (trip.id === 'olympia' || trip.id === 'parnassos') document.body.classList.add('navy-bg');
      // If user clicked a trip card, keep a persistent highlight on arrival
      try {
        const h = sessionStorage.getItem('highlightTrip');
        if (h === tripId) document.body.classList.add('highlight-trip');
      } catch (e) {}

      const titleEl = document.getElementById("trip-title");
      const descEl = document.getElementById("trip-description");
      // set page category so background and styles match
        if (trip.category) {
          document.body.dataset.category = trip.category;
        } else {
          // fallback: find category from tripindex.json
          fetch('/data/tripindex.json')
            .then(r => r.json())
            .then(all => {
              const meta = (all || []).find(t => t.id === tripId);
              if (meta && meta.category) document.body.dataset.category = meta.category;
            })
            .catch(() => {});
        }
        // indicate this is an individual trip view so CSS can target it
        document.body.dataset.view = 'trip';

      // store loaded trip and render localized fields via a function so we can re-render on language change
      window.__loadedTrip = trip;

      function renderTripLocalized() {
        const t = window.__loadedTrip || trip;
        if (!t) return;
        if (titleEl) titleEl.textContent = getLocalized(t.title) || "";
        if (descEl) descEl.textContent = getLocalized(t.description) || "";

        const stopsWrap = document.getElementById("stops");
        if (!stopsWrap) return;
        stopsWrap.innerHTML = "";
        (t.stops || []).forEach((stop, i) => {
          const stopEl = document.createElement("div");
          // use video-card so CSS applies rounded card, padding and shadow
          stopEl.className = "trip-stop video-card";
          const stopLabelTemplate = (window.t && typeof window.t === 'function') ? window.t('stop.label') : 'Stop {n}';
          const stopLabel = stopLabelTemplate.replace('{n}', String(i + 1));
          stopEl.innerHTML = `
            <h3 class="stop-title">${stopLabel}: ${getLocalized(stop.name) || ""}</h3>
            <div class="video-wrap">
              <iframe
                src="${stop.video}"
                title="${getLocalized(stop.name) || "video"}"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen
                width="100%"
                height="315">
              </iframe>
            </div>
            <p class="stop-description">${getLocalized(stop.description) || ""}</p>
          `;
          stopsWrap.appendChild(stopEl);
        });

        // Render experience description below the last video on mobile
        if (t.experience) {
          const expEl = document.createElement('div');
          expEl.className = 'trip-experience card video-card';
          const expTitle = (window.t && typeof window.t === 'function') ? window.t('trip.experienceTitle') : 'Experience';
          expEl.innerHTML = `<h3 class="stop-title">${expTitle}</h3><p>${getLocalized(t.experience)}</p>`;
          stopsWrap.appendChild(expEl);
        }
      }

      // initial render
      renderTripLocalized();

      // listen for language changes and re-render localized content
      window.addEventListener('i18n:changed', () => {
        try{ renderTripLocalized(); } catch(e){ G.error('i18n render failed', e); }
      });

      if (trip.map && trip.map.waypoints && trip.map.waypoints.length >= 2) {
        ensureGoogleMaps(() => renderRoute(trip.map));
      }

      // Show back-to-categories button when on a trip page
      const backBtn = document.getElementById('backToCatsBtn');
      if (backBtn) {
        backBtn.style.display = 'flex';
        backBtn.addEventListener('click', () => {
          // If we know the category, go to that category page; otherwise go to trips listing
          const cat = document.body.dataset.category;
          if (cat) window.location.href = `/categories/${cat}.html`;
          else window.location.href = '/trips.html';
        });
      }
      // Ensure the footer central booking button opens the booking/calendar overlay for this trip
      try {
        const central = document.querySelector('footer a.central-btn');
        if (central && window.__loadedTrip && window.__loadedTrip.id) {
          // make the central button open the booking overlay instead of navigating directly to checkout
          central.setAttribute('href', 'javascript:void(0)');
          central.removeAttribute('onclick');
          central.addEventListener('click', (ev) => {
            try {
              ev.preventDefault();
              const tripId = window.__loadedTrip.id;
              const tripTitle = getLocalized(window.__loadedTrip.title) || tripId;
              const titleEl = document.getElementById('bookingOverlayTitle');
              if (titleEl) titleEl.textContent = `Κράτηση — ${tripTitle}`;
              const tripIdInput = document.getElementById('bookingTripId');
              if (tripIdInput) tripIdInput.value = tripId;
              // start multi-step flow at Step 1 (calendar)
              startBookingFlow();
            } catch (err) { G.warn('Failed to start booking flow', err); }
          }, { passive: true });
        }
      } catch (e) { G.warn('Failed to wire central booking button', e); }

      // Multi-step booking flow helpers
      function startBookingFlow() {
        try {
          openOverlay('bookingOverlay');
          try { document.getElementById('bookingOverlay').classList.add('step1-active'); } catch(e){}
          // transform overlay-inner into step container
          const overlayInner = document.querySelector('#bookingOverlay .overlay-inner');
          if (!overlayInner) return;
          const tripForHeader = window.__loadedTrip || {};
          const stepDesc = (typeof getLocalized === 'function') ? (getLocalized(tripForHeader.description) || '') : '';
          const stepTitle = (typeof getLocalized === 'function') ? (getLocalized(tripForHeader.title) || '') : '';
          overlayInner.innerHTML = `
            <div id="step1" class="booking-step">
              <div class="step-meta">
                <div class="step-indicator">Βήμα 1 από 3</div>
                <div class="trip-title">${stepTitle}</div>
                <div class="trip-desc">${stepDesc}</div>
              </div>
              <div class="trip-hero-title">${stepTitle}</div>
              <div class="calendar-card">
                <div class="calendar-full">
                  <input id="calendarFull" />
                </div>
              </div>
              <div id="occupancyIndicator" class="occupancy-indicator" aria-live="polite" style="text-align:center;margin-top:10px;"><span class="occ-pill">Πληρότητα: —/7</span></div>
              <div id="availabilityBlock" class="availability-block" style="display:none"></div>
              <div class="booking-actions">
                <button id="s1Cancel" class="btn btn-secondary">Πίσω</button>
                <button id="s1Next" class="btn btn-primary">Επόμενο</button>
              </div>
            </div>
            <div id="step2" class="booking-step" style="display:none"></div>
            <div id="step3" class="booking-step" style="display:none"></div>
          `;

          // init full-screen flatpickr on #calendarFull using trip unavailable_dates
          const calEl = document.getElementById('calendarFull');
          const trip = window.__loadedTrip || {};
          const disabledDates = trip.unavailable_dates || [];
          if (!GW_DISABLE_BOOKING_CALENDAR && window.flatpickr && calEl) {
            // Use Greek locale (gr) for month/day names and Monday-first week
            try { if (window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.gr) { /* locale loaded */ } } catch(_){}
            window.flatpickr(calEl, {
              inline: true,
              altInput: false,
              monthSelectorType: 'static',
              dateFormat: 'Y-m-d',
              defaultDate: (new Date()).toISOString().slice(0,10),
              minDate: (new Date()).toISOString().slice(0,10),
              disable: disabledDates,
              locale: (window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.gr) ? window.flatpickr.l10ns.gr : 'gr',
              onReady: function(selectedDates, dateStr, instance) {
                try {
                  const cal = instance && instance.calendarContainer;
                  if (!cal) return;
                  // Add persistent step indicator at top of calendar
                  if (!cal.querySelector('.cal-step-indicator')) {
                    const step = document.createElement('div');
                    step.className = 'cal-step-indicator';
                    step.textContent = 'Βήμα 1 από 3';
                    cal.insertBefore(step, cal.firstChild);
                  }
                  // Force month selector to static text (hide dropdown if theme injected one)
                  const monthSelect = cal.querySelector('select.flatpickr-monthDropdown-months');
                  const curMonthSpan = cal.querySelector('.cur-month');
                  if (monthSelect && curMonthSpan) {
                    const opt = monthSelect.options[monthSelect.selectedIndex];
                    if (opt) curMonthSpan.textContent = opt.textContent;
                    monthSelect.style.display = 'none';
                  }
                  // Make year non-interactive to avoid up/down changing year inadvertently
                  const yearInput = cal.querySelector('.cur-year');
                  const yearWrap = cal.querySelector('.numInputWrapper');
                  if (yearInput) {
                    yearInput.setAttribute('readonly', 'readonly');
                    yearInput.addEventListener('wheel', (e)=>{ e.preventDefault(); }, { passive: false });
                    yearInput.addEventListener('keydown', (e)=>{
                      if (['ArrowUp','ArrowDown','PageUp','PageDown'].includes(e.key)) e.preventDefault();
                    });
                  }
                  if (yearWrap) { yearWrap.style.pointerEvents = 'none'; }
                  // Ensure month nav chevrons are visible
                  const prev = cal.querySelector('.flatpickr-prev-month');
                  const next = cal.querySelector('.flatpickr-next-month');
                  if (prev) { prev.style.visibility = 'visible'; prev.style.opacity = '1'; }
                  if (next) { next.style.visibility = 'visible'; next.style.opacity = '1'; }
                } catch(_){}
              },
                onChange: (selectedDates, dateStr) => {
                  try { document.getElementById('bookingDate').value = dateStr; } catch(e){}
                  try { showAvailability(dateStr); } catch(e){}
                }
            });
          }

            // show availability for the default date immediately
            try { const def = (new Date()).toISOString().slice(0,10); document.getElementById('bookingDate').value = def; showAvailability(def); } catch(e){}

          // wire buttons
          document.getElementById('s1Next').addEventListener('click', () => {
            try { document.getElementById('bookingOverlay').classList.remove('step1-active'); } catch(e){}
            // Navigate in the SAME tab to avoid any browser opening extra Google/new-tab pages
            // Persist trip info for Step 2 header
            try {
              sessionStorage.setItem('gw_trip_title', stepTitle || '');
              sessionStorage.setItem('gw_trip_desc', stepDesc || '');
            } catch(_) {}
            const absUrl = new URL('/step2.html', window.location.origin).href;
            window.location.href = absUrl;
          });
          document.getElementById('s1Cancel').addEventListener('click', () => { try { document.getElementById('bookingOverlay').classList.remove('step1-active'); } catch(e){} closeOverlay('bookingOverlay'); renderOriginalOverlayInner(); });
        } catch (e) { G.warn('startBookingFlow failed', e); }
      }

      function renderOriginalOverlayInner() {
        const overlayInner = document.querySelector('#bookingOverlay .overlay-inner');
        if (!overlayInner) return;
        // Re-render the original form markup by reloading the page part — easiest is to reload the trip page
        // but to be lightweight, simply reload the window to reset overlay state
        window.location.reload();
      }

      function showStep2() {
        try {
          try { document.getElementById('bookingOverlay').classList.remove('step1-active'); } catch(e){}
          const step2 = document.getElementById('step2');
          const step1 = document.getElementById('step1');
          if (!step2 || !step1) return;
          step1.style.display = 'none';
          // render traveler detail form into step2
          step2.style.display = 'block';
          step2.innerHTML = `
            <div class="step-card form-narrow">
              <div class="progress-steps" style="margin-bottom:6px;font-size:13px;color:#c9a24a;">Βήμα 2 από 3</div>
              <h2>Στοιχεία Ταξιδιώτη</h2>
              <div style="margin-top:12px">
                <label>Θέσεις</label>
                <div class="seats-price" style="margin-top:6px;display:flex;align-items:center;gap:12px;">
                  <div class="seat-control"><button class="seat-dec">−</button><input id="bookingSeats2" type="number" value="1" min="1" max="10"><button class="seat-inc">+</button></div>
                  <div id="miniPrice" class="price-badge">—</div>
                </div>
              </div>
              <div style="margin-top:12px"><label>Όνομα</label><input id="bookingName2" type="text" /></div>
              <div style="margin-top:12px"><label>Email</label><input id="bookingEmail2" type="email" /></div>
              <div style="margin-top:12px"><label>Traveler Profile</label>
                <select id="travelerProfile2" class="profile-select">
                  <option value="explorer">🌍 Explorers</option>
                  <option value="relaxed">😌 Relaxed Travelers</option>
                  <option value="family">👨‍👩‍👧 Family Style</option>
                  <option value="solo">🚶 Solo Adventurers</option>
                </select>
              </div>
              <div style="margin-top:8px"><label>Travel Style</label>
                <select id="travelStyle2" class="profile-select">
                  <option value="sociable">👥 Sociable</option>
                  <option value="quiet">🤫 Quiet</option>
                  <option value="cultural">🏛️ Cultural</option>
                  <option value="nature">🌲 Nature-oriented</option>
                </select>
              </div>
              <div style="margin-top:8px"><label>Preferred Language</label>
                <select id="preferredLanguage2" class="profile-select">
                  <option value="en">🇬🇧 English</option>
                  <option value="fr">🇫🇷 Français</option>
                  <option value="de">🇩🇪 Deutsch</option>
                  <option value="el">🇬🇷 Ελληνικά</option>
                </select>
              </div>
              <div style="margin-top:8px"><label>Day Style</label>
                <select id="travelTempo2" class="profile-select">
                  <option value="early">🌅 Early riser</option>
                  <option value="night">🌙 Night type</option>
                  <option value="talkative">💬 Talkative</option>
                  <option value="reserved">🙊 Reserved</option>
                </select>
              </div>
              <div style="margin-top:12px;">
                <div class="booking-actions">
                  <button id="s2Back" class="btn btn-secondary">Πίσω</button>
                  <button id="s2Next" class="btn btn-primary">Επόμενο</button>
                </div>
              </div>
            </div>
          `;
          // copy any existing values from original hidden form to these new fields
          try { const seats = document.getElementById('bookingSeats'); if (seats) document.getElementById('bookingSeats2').value = seats.value; } catch(e){}
          try { const name = document.getElementById('bookingName'); if (name) document.getElementById('bookingName2').value = name.value; } catch(e){}
          try { const email = document.getElementById('bookingEmail'); if (email) document.getElementById('bookingEmail2').value = email.value; } catch(e){}
          // wire autofill for step2 fields (email -> name) and seat controls for step2
          try {
            const email2 = document.getElementById('bookingEmail2');
            const name2 = document.getElementById('bookingName2');
            if (email2 && name2) {
              email2.addEventListener('input', () => autofillNameFromEmail(email2, name2));
              email2.addEventListener('blur', () => autofillNameFromEmail(email2, name2));
            }
            const seats2 = document.getElementById('bookingSeats2');
            const dec2 = step2.querySelector('.seat-dec');
            const inc2 = step2.querySelector('.seat-inc');
            if (dec2 && inc2 && seats2) {
              dec2.addEventListener('click', (e) => { e.preventDefault(); const v = Math.max(parseInt(seats2.value || '1',10) - 1, parseInt(seats2.min || '1',10)); seats2.value = v; updateMiniPrice(); refreshProceedButtons(); });
              inc2.addEventListener('click', (e) => { e.preventDefault(); const v = Math.min(parseInt(seats2.value || '1',10) + 1, parseInt(seats2.max || '10',10)); seats2.value = v; updateMiniPrice(); refreshProceedButtons(); });
              seats2.addEventListener('input', () => { updateMiniPrice(); refreshProceedButtons(); });
            }
            // profile option wiring (toggle selected class and set hidden values)
            try {
              const wireProfile = (containerId, targetName) => {
                const container = document.getElementById(containerId);
                if (!container) return;
                // if this is a SELECT, just mirror value -> dataset.selected and restore from original
                if (container.tagName === 'SELECT') {
                  try {
                    const orig = document.getElementById(targetName);
                    if (orig && orig.value) container.value = orig.value;
                  } catch(e){}
                  container.dataset.selected = container.value || '';
                  container.addEventListener('change', () => { container.dataset.selected = container.value; });
                  return;
                }
                // legacy profile-card wiring (for any remaining card UI)
                container.querySelectorAll('.profile-option').forEach(opt => {
                  opt.addEventListener('click', (ev) => {
                    container.querySelectorAll('.profile-option').forEach(o => o.classList.remove('selected'));
                    opt.classList.add('selected');
                    container.dataset.selected = opt.dataset.value;
                  });
                });
                try {
                  const orig = document.getElementById(targetName);
                  if (orig && orig.value) {
                    const match = container.querySelector(`.profile-option[data-value="${orig.value}"]`);
                    if (match) match.classList.add('selected');
                    container.dataset.selected = orig.value;
                  }
                } catch(e){}
              };
              wireProfile('travelerProfile2', 'travelerProfile');
              wireProfile('travelStyle2', 'travelStyle');
              wireProfile('preferredLanguage2', 'preferredLanguage');
              wireProfile('travelTempo2', 'travelTempo');
            } catch(e){}
            // initial mini-price
            try { updateMiniPrice(); } catch(e){}
          } catch(e){}
          // wire step2 buttons
          document.getElementById('s2Back').addEventListener('click', () => { document.getElementById('step2').style.display='none'; document.getElementById('step1').style.display='block'; try { document.getElementById('bookingOverlay').classList.add('step1-active'); } catch(e){} });
          document.getElementById('s2Next').addEventListener('click', () => { showStep3(); });
        } catch (e) { G.warn('showStep2 failed', e); }
      }

      function showStep3() {
        try {
          try { document.getElementById('bookingOverlay').classList.remove('step1-active'); } catch(e){}
          const step2 = document.getElementById('step2');
          const step3 = document.getElementById('step3');
          if (!step3 || !step2) return;
          step2.style.display = 'none';
          step3.style.display = 'block';
          // read values and render summary
          const date = (document.querySelector('#calendarFull') && document.querySelector('#calendarFull').value) || document.getElementById('bookingDate') && document.getElementById('bookingDate').value;
          const seats = document.getElementById('bookingSeats2') ? document.getElementById('bookingSeats2').value : (document.getElementById('bookingSeats') ? document.getElementById('bookingSeats').value : 1);
          const name = document.getElementById('bookingName2') ? document.getElementById('bookingName2').value : (document.getElementById('bookingName') ? document.getElementById('bookingName').value : '');
          const email = document.getElementById('bookingEmail2') ? document.getElementById('bookingEmail2').value : (document.getElementById('bookingEmail') ? document.getElementById('bookingEmail').value : '');
          const trip = window.__loadedTrip || {};
          const base = trip.price_cents ? parseInt(trip.price_cents,10) : 5000;
          const total = (base * parseInt(seats || '1',10))/100;
          step3.innerHTML = `
            <div class="booking-confirmation step-card confirmation-view">
              <h2>Επιβεβαίωση Κράτησης</h2>
              <div class="progress-steps" style="margin-top:8px;margin-bottom:6px;font-size:13px;color:#c9a24a;">Βήμα 3 από 3</div>
              <div style="text-align:left;margin-top:12px;"> <strong>Εκδρομή:</strong> ${getLocalized(trip.title) || ''}</div>
              <div style="text-align:left;margin-top:6px;"> <strong>Ημερομηνία:</strong> ${date}</div>
              <div style="text-align:left;margin-top:6px;"> <strong>Θέσεις:</strong> ${seats}</div>
              <div style="text-align:left;margin-top:6px;"> <strong>Σύνολο:</strong> ${total.toLocaleString(getCurrentLang(), { style:'currency', currency:(trip.currency||'EUR').toUpperCase() })}</div>
              <div style="text-align:left;margin-top:6px;"> <strong>Όνομα:</strong> ${name}</div>
              <div style="text-align:left;margin-top:6px;"> <strong>Email:</strong> ${email}</div>
              <div style="margin-top:18px;">
                <div class="booking-actions">
                  <button id="s3Edit" class="btn btn-secondary">Edit</button>
                  <button id="s3Proceed" class="btn btn-primary">Proceed to Payment</button>
                </div>
              </div>
            </div>
          `;
          // mark overlay as confirmation-active to trigger high-specificity iOS fixes
          try { document.getElementById('bookingOverlay').classList.add('confirmation-active'); } catch(e){}
          document.getElementById('s3Edit').addEventListener('click', () => { document.getElementById('step3').style.display='none'; document.getElementById('step2').style.display='block'; try{ document.getElementById('bookingOverlay').classList.remove('confirmation-active'); }catch(e){} refreshProceedButtons(); });
          document.getElementById('s3Proceed').addEventListener('click', async () => {
            // build booking payload and POST to /api/bookings
            const payload = {};
            payload.trip_id = window.__loadedTrip && window.__loadedTrip.id;
            payload.date = date;
            payload.seats = parseInt(seats || '1',10);
            payload.user_name = name;
            payload.user_email = email;
            try {
              const p2 = document.getElementById('travelerProfile2');
              payload.travelerProfile = p2 ? ((p2.dataset && p2.dataset.selected) || p2.value || '') : (document.getElementById('travelerProfile') ? document.getElementById('travelerProfile').value : '');
              const t2 = document.getElementById('travelStyle2');
              payload.travelStyle = t2 ? ((t2.dataset && t2.dataset.selected) || t2.value || '') : (document.getElementById('travelStyle') ? document.getElementById('travelStyle').value : '');
              const l2 = document.getElementById('preferredLanguage2');
              payload.preferredLanguage = l2 ? ((l2.dataset && l2.dataset.selected) || l2.value || '') : (document.getElementById('preferredLanguage') ? document.getElementById('preferredLanguage').value : '');
              const tempo2 = document.getElementById('travelTempo2');
              payload.travelTempo = tempo2 ? ((tempo2.dataset && tempo2.dataset.selected) || tempo2.value || '') : (document.getElementById('travelTempo') ? document.getElementById('travelTempo').value : '');
            } catch(e) {
              payload.travelerProfile = document.getElementById('travelerProfile') ? document.getElementById('travelerProfile').value : '';
              payload.travelStyle = document.getElementById('travelStyle') ? document.getElementById('travelStyle').value : '';
              payload.preferredLanguage = document.getElementById('preferredLanguage') ? document.getElementById('preferredLanguage').value : '';
              payload.travelTempo = document.getElementById('travelTempo') ? document.getElementById('travelTempo').value : '';
            }
            const trip = window.__loadedTrip || {};
            const baseCents = trip.price_cents ? parseInt(trip.price_cents,10) : 5000;
            payload.price_cents = Math.max(0, baseCents * payload.seats);
            try {
              const resp = await fetch('/api/bookings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
              const j = await resp.json();
              if (resp.ok && j.bookingId) {
                // redirect to checkout with bookingId
                window.location.href = `/checkout.html?trip=${encodeURIComponent(window.__loadedTrip.id)}&bookingId=${encodeURIComponent(j.bookingId)}`;
              } else {
                alert('Failed to create booking');
              }
            } catch (e) { alert('Network error'); }
          });
        } catch (e) { G.warn('showStep3 failed', e); }
      }

      // Attach booking form handlers (extracted so we can re-attach after in-place overlay re-renders)
      try { attachBookingFormHandlers(); } catch (e) { G.warn('Failed to attach booking form handler (initial)', e); }

      // Rebuild the original booking overlay inner HTML in-place and reattach handlers
      function renderOriginalOverlayInner() {
        const overlayInner = document.querySelector('#bookingOverlay .overlay-inner');
        if (!overlayInner) return;
        // reconstruct the original booking form markup (must match /public/trips/trip.html structure)
        overlayInner.innerHTML = `
      <h2 id="bookingOverlayTitle">Κράτηση</h2>
      <form id="bookingForm" class="booking-form">
        <input type="hidden" name="trip_id" id="bookingTripId">

        <div class="row">
          <label for="bookingDate">Ημερομηνία</label>
          <input id="bookingDate" name="date" type="date" required />
        </div>

        <div class="row two-col">
          <div>
            <label for="bookingSeats">Θέσεις</label>
            <div class="seat-control">
              <button type="button" class="seat-dec" aria-label="Μείωση">−</button>
              <input id="bookingSeats" name="seats" type="number" value="1" min="1" max="10" required />
              <button type="button" class="seat-inc" aria-label="Αύξηση">+</button>
            </div>
          </div>

          <div>
            <label for="bookingPrice">Σύνολο</label>
            <div id="bookingPrice" class="price-tag">—</div>
          </div>
        </div>

        <div class="row">
          <label for="bookingName">Όνομα</label>
          <input id="bookingName" name="user_name" type="text" placeholder="Όνομα και επώνυμο" required />
        </div>

        <div class="row">
          <label for="bookingEmail">Email</label>
          <input id="bookingEmail" name="user_email" type="email" placeholder="name@example.com" required />
        </div>

        <div class="row section-title"><h3>Προφίλ Ταξιδιώτη</h3></div>
        <div class="row two-col">
          <div>
            <label for="travelerProfile">Traveler Type</label>
            <select id="travelerProfile" name="travelerProfile">
              <option value="explorer">🌍 Explorers</option>
              <option value="relaxed">😌 Relaxed Travelers</option>
              <option value="family">👨‍👩‍👧 Family Style</option>
              <option value="solo">🚶 Solo Adventurers</option>
            </select>
          </div>
          <div>
            <label for="travelStyle">Travel Style</label>
            <select id="travelStyle" name="travelStyle">
              <option value="sociable">👥 Sociable</option>
              <option value="quiet">🤫 Quiet</option>
              <option value="cultural">🏛️ Cultural</option>
              <option value="nature">🌲 Nature-oriented</option>
            </select>
          </div>
        </div>

        <div class="row two-col">
          <div>
            <label for="preferredLanguage">Προτιμώμενη Γλώσσα</label>
            <select id="preferredLanguage" name="preferredLanguage">
              <option value="en">🇬🇧 English</option>
              <option value="fr">🇫🇷 Français</option>
              <option value="de">🇩🇪 Deutsch</option>
              <option value="el">🇬🇷 Ελληνικά</option>
            </select>
          </div>
          <div>
            <label for="travelTempo">Στυλ Ώρας / Ημέρας</label>
            <select id="travelTempo" name="travelTempo">
              <option value="early">🌅 Early riser</option>
              <option value="night">🌙 Night type</option>
              <option value="talkative">💬 Talkative</option>
              <option value="reserved">🙊 Reserved</option>
            </select>
          </div>
        </div>

        <div class="row actions">
          <button class="btn" type="submit">Δημιούργησε κράτηση</button>
          <button type="button" class="btn ghost" onclick="closeOverlay('bookingOverlay')">Άκυρο</button>
        </div>
      </form>

      <div id="bookingResult" class="booking-result" style="display:none"></div>
        `;

        // if we have a loaded trip id, set it
        try { const tripIdInput = document.getElementById('bookingTripId'); if (tripIdInput && window.__loadedTrip && window.__loadedTrip.id) tripIdInput.value = window.__loadedTrip.id; } catch(e){}
        // reattach handlers for the newly inserted form
        try { attachBookingFormHandlers(); } catch(e) { G.warn('Failed to reattach booking form handlers after render', e); }
      }

      // Utility: update displayed price based on seats and trip data
      function updatePrice() {
        try {
          const seatsEl = document.getElementById('bookingSeats');
          const priceEl = document.getElementById('bookingPrice');
          const seats = seatsEl ? Math.max(1, parseInt(seatsEl.value || '1',10)) : 1;
          const trip = window.__loadedTrip || null;
          let baseCents = 5000;
          if (trip && trip.price_cents) baseCents = parseInt(trip.price_cents,10) || baseCents;
          const total = Math.max(0, baseCents * seats);
          if (priceEl) {
            priceEl.textContent = (total / 100).toLocaleString(getCurrentLang(), { style: 'currency', currency: (trip && trip.currency) ? trip.currency.toUpperCase() : 'EUR' });
            // animate price gently
            priceEl.classList.remove('animate');
            // reflow to restart animation
            void priceEl.offsetWidth;
            priceEl.classList.add('animate');
            setTimeout(() => { priceEl.classList.remove('animate'); }, 600);
          }
        } catch (e) { /* ignore */ }
      }

      // Attach booking form handlers (idempotent) — wires flatpickr, seat controls, submit and autofill
      function attachBookingFormHandlers() {
        try {
          const bookingForm = document.getElementById('bookingForm');
          if (!bookingForm) return;
          // avoid double-binding handlers on the same element
          if (bookingForm.dataset.handlersAttached === '1') return;
          bookingForm.dataset.handlersAttached = '1';

          // set trip id if available
          try { const tripIdInput = document.getElementById('bookingTripId'); if (tripIdInput && window.__loadedTrip && window.__loadedTrip.id) tripIdInput.value = window.__loadedTrip.id; } catch(e){}

          // Prepare UI: set min date to today and wire flatpickr if available
          try {
            const dateEl = document.getElementById('bookingDate');
            if (dateEl) {
              const today = new Date();
              const iso = today.toISOString().slice(0,10);
              dateEl.setAttribute('min', iso);
              // init flatpickr for a modern calendar picker (dark theme)
              try {
                if (!GW_DISABLE_BOOKING_CALENDAR && window.flatpickr) {
                  window.flatpickr(dateEl, {
                    altInput: true,
                    altFormat: 'd F Y',
                    dateFormat: 'Y-m-d',
                    defaultDate: iso,
                    minDate: iso,
                    locale: (window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.gr) ? window.flatpickr.l10ns.gr : 'gr',
                    theme: 'dark',
                    animate: true,
                    onOpen: function() { dateEl.classList.add('fp-open'); },
                    onClose: function() { dateEl.classList.remove('fp-open'); }
                  });
                }
              } catch (e) { /* ignore flatpickr init errors */ }
            }

            const seatsEl = document.getElementById('bookingSeats');
            const dec = bookingForm.querySelector('.seat-dec');
            const inc = bookingForm.querySelector('.seat-inc');
            if (dec && inc && seatsEl) {
              dec.addEventListener('click', (e) => { e.preventDefault(); const v = Math.max(parseInt(seatsEl.value || '1',10) - 1, parseInt(seatsEl.min || '1',10)); seatsEl.value = v; updatePrice(true); });
              inc.addEventListener('click', (e) => { e.preventDefault(); const v = Math.min(parseInt(seatsEl.value || '1',10) + 1, parseInt(seatsEl.max || '10',10)); seatsEl.value = v; updatePrice(true); });
              seatsEl.addEventListener('input', () => { const v = Math.max(parseInt(seatsEl.min || '1',10), Math.min(parseInt(seatsEl.value || '1',10), parseInt(seatsEl.max || '10',10))); seatsEl.value = v; updatePrice(true); refreshProceedButtons(); });
            }
          } catch (e) { /* ignore UI setup errors */ }

          bookingForm.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const data = {};
            new FormData(bookingForm).forEach((v,k) => { data[k] = v; });
            // ensure numeric seats and compute price_cents client-side when possible
            data.seats = parseInt(data.seats || '1', 10) || 1;
            // compute price from loaded trip if available: prefer trip.price_cents or fallback
            try {
              const trip = window.__loadedTrip;
              let baseCents = null;
              if (trip && trip.price_cents) baseCents = parseInt(trip.price_cents,10);
              // If trip has no explicit price, assume a default (e.g. 5000 cents = €50) — keep conservative
              if (!baseCents) baseCents = 5000;
              data.price_cents = Math.max(0, baseCents * data.seats);
            } catch (e) { data.price_cents = 0; }
            // include traveler profile fields if present
            try {
              const profile = document.getElementById('travelerProfile'); if (profile) data.travelerProfile = profile.value;
              const style = document.getElementById('travelStyle'); if (style) data.travelStyle = style.value;
              const lang = document.getElementById('preferredLanguage'); if (lang) data.preferredLanguage = lang.value;
              const tempo = document.getElementById('travelTempo'); if (tempo) data.travelTempo = tempo.value;
            } catch (e) { /* ignore */ }
            try {
              const resp = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
              const json = await resp.json();
              const result = document.getElementById('bookingResult');
              if (!resp.ok) {
                if (result) { result.style.display = 'block'; result.style.background = '#ffe6e6'; result.textContent = json && json.error ? json.error : 'Σφάλμα κατά τη δημιουργία της κράτησης'; }
                return;
              }
              // success: show link to proceed to checkout with booking id attached
              if (result) {
                result.style.display = 'block';
                result.style.background = '#e6ffe6';
                const bookingId = json && json.bookingId ? json.bookingId : null;
                if (bookingId) {
                  const href = `/checkout.html?trip=${encodeURIComponent(window.__loadedTrip.id)}&bookingId=${encodeURIComponent(bookingId)}`;
                  result.innerHTML = `Κράτηση δημιουργήθηκε (ID: ${bookingId}). <div style="margin-top:10px;"><a class="btn" href="${href}">Μετάβαση στο Ταμείο</a></div>`;
                } else {
                  result.textContent = 'Κράτηση δημιουργήθηκε.';
                }
              }
            } catch (err) {
              G.error('Booking submit error', err);
              const result = document.getElementById('bookingResult');
              if (result) { result.style.display = 'block'; result.style.background = '#ffe6e6'; result.textContent = 'Σφάλμα δικτύου κατά τη δημιουργία της κράτησης'; }
            }
          });

          // wire email -> name autofill for original form
          try {
            const emailOrig = document.getElementById('bookingEmail');
            const nameOrig = document.getElementById('bookingName');
            if (emailOrig && nameOrig) {
              emailOrig.addEventListener('input', () => autofillNameFromEmail(emailOrig, nameOrig));
              emailOrig.addEventListener('blur', () => autofillNameFromEmail(emailOrig, nameOrig));
            }
          } catch(e){}

          // initial price update
          try { updatePrice(); } catch(e){}
        } catch (e) { G.warn('Failed to attach booking form handler', e); }
      }

      // Auto-complete name from email heuristics (simple local-part split)
      function autofillNameFromEmail(emailEl, nameEl) {
        try {
          const val = (emailEl && emailEl.value) || '';
          if (!val) return;
          if (nameEl && nameEl.value && nameEl.value.trim().length > 1) return; // don't override real names
          const local = val.split('@')[0] || '';
          // try to split on common separators and numbers; remove digits, handle lastname-like parts
          const cleaned = local.replace(/[0-9]+/g, '').replace(/(^|\.|_|-)([a-z])/g, (m,p,l) => ' ' + l).trim();
          const parts = cleaned.split(/\s+/).filter(Boolean).map(p => p.charAt(0).toUpperCase() + p.slice(1));
          if (parts.length) {
            // join into a two-part name if many parts (first + rest)
            const out = parts.length > 2 ? `${parts[0]} ${parts.slice(1).join(' ')}` : parts.join(' ');
            if (nameEl) nameEl.value = out;
          }
        } catch (e) {}
      }

      // update the mini price in step2 based on seats and trip.price_cents
      function updateMiniPrice() {
        try {
          const seats2 = document.getElementById('bookingSeats2');
          const mini = document.getElementById('miniPrice');
          const trip = window.__loadedTrip || {};
          const base = trip.price_cents ? parseInt(trip.price_cents,10) : 5000;
          const s = seats2 ? Math.max(1, parseInt(seats2.value || '1',10)) : 1;
          const total = (base * s) / 100;
          if (mini) mini.textContent = total.toLocaleString(getCurrentLang(), { style:'currency', currency: (trip.currency||'EUR').toUpperCase() });
          try { if (mini) { mini.classList.remove('pulse'); void mini.offsetWidth; mini.classList.add('pulse'); setTimeout(()=>{ mini.classList.remove('pulse'); }, 700); } } catch(e){}
        } catch(e){}
      }

      // Fetch availability for a trip/date and render into the availability block under the calendar
      async function showAvailability(dateStr) {
        try {
          const trip = window.__loadedTrip || {};
          if (!trip.id || !dateStr) {
            const el = document.getElementById('availabilityBlock'); if (el) { el.style.display='none'; }
            return;
          }
          const el = document.getElementById('availabilityBlock');
          const occ = document.getElementById('occupancyIndicator');
          if (!el) return;
          el.style.display = 'block';
          el.textContent = 'Φόρτωση διαθεσιμότητας...';
          const q = new URLSearchParams({ trip_id: trip.id, date: dateStr });
          let capacity = 7, taken = 0, avail = 0;
          try {
            const resp = await fetch('/api/availability?' + q.toString());
            if (resp.ok) {
              const j = await resp.json();
              capacity = j.capacity || 7;
              taken = j.taken || 0;
              avail = Math.max(0, capacity - taken);
            }
          } catch(_) {}
          // Render compact occupancy “x/y” above the buttons
          try {
            if (occ) {
              const pill = occ.querySelector('.occ-pill');
              const txt = `Πληρότητα: ${taken}/${capacity}`;
              if (pill) pill.textContent = txt; else occ.textContent = txt;
              occ.dataset.taken = String(taken);
              occ.dataset.capacity = String(capacity);
            }
          } catch(e) {}
          // Show compact message only with DD-MM-YYYY format as requested.
          // Try to format ISO (YYYY-MM-DD) to DD-MM-YYYY; fallback to the original if parsing fails.
          const formattedDate = (() => {
            try {
              if (typeof dateStr === 'string') {
                const parts = dateStr.split('-');
                if (parts.length === 3) {
                  const [yy, mm, dd] = parts;
                  if (yy && mm && dd) return `${dd.padStart(2,'0')}-${mm.padStart(2,'0')}-${yy}`;
                }
                const d = new Date(dateStr);
                if (!isNaN(d)) {
                  const dd = String(d.getDate()).padStart(2,'0');
                  const mm = String(d.getMonth()+1).padStart(2,'0');
                  const yy = d.getFullYear();
                  return `${dd}-${mm}-${yy}`;
                }
              }
            } catch(_) {}
            return dateStr;
          })();
          el.textContent = `Διαθεσιμότητα για ${formattedDate}: σύνολο ${capacity}, κρατημένες ${taken}`;
          // store last known availability on the block for other logic
          el.dataset.avail = String(avail);
          el.dataset.capacity = String(capacity);
          el.dataset.taken = String(taken);
          // enable/disable step1 Next button when availability is zero
          try { const btn = document.getElementById('s1Next'); if (btn) btn.disabled = (avail <= 0); } catch(e){}
        } catch (e) {
          try { const el = document.getElementById('availabilityBlock'); if (el) el.textContent = 'Σφάλμα κατά τον έλεγχο διαθεσιμότητας'; } catch(_){}
        }
      }

      // helper: refresh Next/Proceed buttons based on availability vs requested seats
      function refreshProceedButtons() {
        try {
          const availEl = document.getElementById('availabilityBlock');
          const avail = availEl && availEl.dataset && parseInt(availEl.dataset.avail || '-1',10) >= 0 ? parseInt(availEl.dataset.avail || '-1',10) : null;
          const seatsRequested = (() => {
            const s2 = document.getElementById('bookingSeats2'); if (s2) return parseInt(s2.value||'1',10);
            const s1 = document.getElementById('bookingSeats'); if (s1) return parseInt(s1.value||'1',10);
            return 1;
          })();
          // s2Next should be disabled if seatsRequested > avail (when avail is known)
          const s2Next = document.getElementById('s2Next'); if (s2Next && avail !== null) s2Next.disabled = (seatsRequested > avail);
          const s3Proceed = document.getElementById('s3Proceed'); if (s3Proceed && avail !== null) s3Proceed.disabled = (seatsRequested > avail);
        } catch (e) {}
      }

      // wire email -> name autofill for original and step2 forms
      try {
        const emailOrig = document.getElementById('bookingEmail');
        const nameOrig = document.getElementById('bookingName');
        if (emailOrig && nameOrig) {
          emailOrig.addEventListener('input', () => autofillNameFromEmail(emailOrig, nameOrig));
          emailOrig.addEventListener('blur', () => autofillNameFromEmail(emailOrig, nameOrig));
        }
      } catch(e){}

      // ensure price updates when overlay opens (observer set earlier in overlay open path)
      try { document.addEventListener('click', (ev) => { if (ev.target && ev.target.closest && ev.target.closest('a.central-btn')) setTimeout(updatePrice,150); }); } catch (e) {}
    })
    .catch(err => {
      G.error("Σφάλμα εκδρομής:", err);
      document.getElementById("trip-section").innerHTML =
        "<p>Σφάλμα φόρτωσης δεδομένων εκδρομής.</p>";
    });
});

// ---------- Google Maps helpers ----------
function ensureGoogleMaps(cb) {
  if (window.google && window.google.maps) return cb();
  const maxWaitMs = 7000;
  const t0 = Date.now();
  const timer = setInterval(() => {
    if (window.google && window.google.maps) {
      clearInterval(timer);
      cb();
    } else if (Date.now() - t0 > maxWaitMs) {
      clearInterval(timer);
  G.error("Google Maps δεν φορτώθηκε εγκαίρως.");
    }
  }, 120);
}

let map, directionsService, directionsRenderer;

function renderRoute(mapData) {
  const mapEl = document.getElementById("map");
  if (!mapEl) return;

  // Create the map centered on the provided coordinates
  map = new google.maps.Map(mapEl, {
    center: mapData.center || { lat: 38.0, lng: 23.7 },
    zoom: mapData.zoom || 7,
    mapTypeId: "roadmap",
  });

  // default map appearance (no initial styled dark theme)

  directionsService = new google.maps.DirectionsService();
  // Use default markers so origin/destination pins are visible to the user
  directionsRenderer = new google.maps.DirectionsRenderer({ map });

  const wps = mapData.waypoints;
  const origin = wps[0];
  const destination = wps[wps.length - 1];
  const midStops = wps
    .slice(1, wps.length - 1)
    .map((loc) => ({ location: loc, stopover: true }));

  const req = {
    origin,
    destination,
    waypoints: midStops,
    travelMode: google.maps.TravelMode.DRIVING,
  };

  directionsService.route(req, (res, status) => {
    if (status === "OK") {
      // simply render the directions on the map; do not auto-fit or force zoom.
      directionsRenderer.setDirections(res);
    } else {
      G.error("Σφάλμα διαδρομής:", status);
    }
  });
}