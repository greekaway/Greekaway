/**
 * MoveAthens Transfer Flow
 * Step 1: Categories → Step 2: Destinations → Step 3: Booking Type → Step 4: Vehicles → Step 5: Confirm
 * Tariff (day/night) is auto-calculated based on time + admin buffer rules.
 */
(() => {
  'use strict';

  // ========================================
  // STATE
  // ========================================
  let CONFIG = null;
  let hotelContext = null;  // { origin_zone_id, ... }
  let selectedCategory = null;
  let selectedDestination = null;
  let selectedTariff = null; // 'day' or 'night' — auto-calculated, never user-chosen
  let selectedVehicle = null;
  let selectedBookingType = null; // 'instant' or 'scheduled'
  let selectedDateTime = null; // { date: 'YYYY-MM-DD', time: 'HH:MM' }
  let sessionTariffTime = null; // locked tariff-calculation timestamp

  // Passenger & Luggage selection state
  let selectedPassengers = 0;
  let selectedLuggageLarge = 0;
  let selectedLuggageMedium = 0;
  let selectedLuggageCabin = 0;
  let selectedPaymentMethod = null; // 'cash' or 'pos'
  let passengerName = ''; // Name of passenger (required for non-taxi vehicles)
  let roomNumber = ''; // Room number (optional)
  let bookingNotes = ''; // Notes (optional)
  let flightNumber = ''; // Flight/ferry number (required for arrivals)
  let lastFlightData = null; // Cached flight lookup result from AeroAPI

  // Tariff labels for UI
  const TARIFF_LABELS = {
    day: '☀️ Ημερήσια (05:00 - 00:00)',
    night: '🌙 Νυχτερινή (00:00 - 05:00)'
  };

  // ========================================
  // TARIFF AUTO-CALCULATION (client-side mirror of server logic)
  // ========================================
  const calculateTariffClient = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return 'day';
    const nightStartBuffer = parseInt(CONFIG?.nightStartBufferMins, 10) || 30;
    const nightEndBuffer = parseInt(CONFIG?.nightEndBufferMins, 10) || 30;
    const totalMinutes = d.getHours() * 60 + d.getMinutes();
    const nightEffectiveStart = 24 * 60 - nightStartBuffer;
    const nightEffectiveEnd = 5 * 60 - nightEndBuffer;
    if (nightEffectiveEnd <= 0) return 'day';
    if (totalMinutes >= nightEffectiveStart || totalMinutes < nightEffectiveEnd) return 'night';
    return 'day';
  };

  // ========================================
  // DOM
  // ========================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const steps = {
    categories: $('#step-categories'),
    destinations: $('#step-destinations'),
    bookingType: $('#step-booking-type'),
    vehicles: $('#step-vehicles'),
    confirm: $('#step-confirm'),
    sentSuccess: $('#step-sent-success')
  };

  const categoriesGrid = $('#categories-grid');
  const destinationsList = $('#destinations-list');
  const vehiclesGrid = $('#vehicles-grid');
  const selectedCategoryName = $('#selected-category-name');
  const selectedDestinationName = $('#selected-destination-name');
  const selectedTariffIndicator = $('#selected-tariff-indicator');

  // Confirm step
  const confirmDestination = $('#confirm-destination');
  const confirmTariff = $('#confirm-tariff');
  const confirmVehicle = $('#confirm-vehicle');
  const confirmPrice = $('#confirm-price');
  const ctaWhatsapp = $('#cta-whatsapp');
  const ctaPhone = $('#cta-phone');

  // ========================================
  // NAVIGATION
  // ========================================
  const showStep = (stepName) => {
    Object.values(steps).forEach(s => s?.classList.remove('active'));
    steps[stepName]?.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Full state reset — returns everything to initial values
  const resetAllState = () => {
    selectedCategory = null;
    selectedDestination = null;
    selectedTariff = null;
    selectedVehicle = null;
    selectedBookingType = null;
    selectedDateTime = null;
    sessionTariffTime = null;
    selectedPassengers = 0;
    selectedLuggageLarge = 0;
    selectedLuggageMedium = 0;
    selectedLuggageCabin = 0;
    selectedPaymentMethod = null;
    passengerName = '';
    roomNumber = '';
    bookingNotes = '';
    flightNumber = '';
    lastFlightData = null;
    // Clear form inputs
    const nameInput = $('#passenger-name-input');
    if (nameInput) nameInput.value = '';
    const roomInput = $('#room-number-input');
    if (roomInput) roomInput.value = '';
    const notesInput = $('#booking-notes-input');
    if (notesInput) notesInput.value = '';
    const flightInput = $('#flight-number-input');
    if (flightInput) flightInput.value = '';
    // Reset datetime picker
    const datetimePicker = $('#booking-datetime-picker');
    if (datetimePicker) datetimePicker.hidden = true;
    // Reset payment buttons
    const payBtns = document.querySelectorAll('.ma-payment-btn');
    payBtns.forEach(b => b.classList.remove('active'));
  };

  // ========================================
  // API
  // ========================================
  const api = async (url) => {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.error('API error:', e);
      return null;
    }
  };

  // ========================================
  // HOTEL CONTEXT
  // ========================================
  const loadHotelContext = () => {
    // Try to get from localStorage or cookie (set by hotel-context page)
    try {
      const stored = localStorage.getItem('moveathens_hotel');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.origin_zone_id) {
          return parsed;
        }
      }
    } catch (e) {}
    return null;
  };

  // ========================================
  // RENDER FUNCTIONS
  // ========================================
  
  // Helper: render category icon (can be URL or emoji)
  const renderCategoryIcon = (icon) => {
    if (!icon) return '<span class="ma-category-emoji">📍</span>';
    // If it starts with / or http, it's an image URL
    if (icon.startsWith('/') || icon.startsWith('http')) {
      return `<img src="${icon}" alt="" class="ma-category-icon-img">`;
    }
    // Otherwise it's an emoji or text
    return `<span class="ma-category-emoji">${icon}</span>`;
  };

  const renderCategories = async () => {
    const data = await api('/api/moveathens/categories');
    if (!data || !data.categories || !data.categories.length) {
      categoriesGrid.innerHTML = '<p class="ma-empty">Δεν υπάρχουν διαθέσιμες κατηγορίες.</p>';
      return;
    }

    categoriesGrid.innerHTML = data.categories.map(cat => {
      const bgColor = cat.color || '#1a73e8';
      return `
      <button class="ma-category-card" data-id="${cat.id}" data-name="${cat.name}" data-arrival="${cat.is_arrival ? '1' : '0'}">
        <span class="ma-category-icon" style="background:${bgColor}">${renderCategoryIcon(cat.icon)}</span>
        <span class="ma-category-name">${cat.name}</span>
      </button>`;
    }).join('');

    // Event listeners
    categoriesGrid.querySelectorAll('.ma-category-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedCategory = {
          id: card.dataset.id,
          name: card.dataset.name,
          is_arrival: card.dataset.arrival === '1'
        };
        loadDestinations();
      });
    });
  };

  const loadDestinations = async () => {
    if (!selectedCategory) return;
    selectedCategoryName.textContent = selectedCategory.name;
    destinationsList.innerHTML = '<div class="ma-loading">Φόρτωση...</div>';
    showStep('destinations');

    const data = await api(`/api/moveathens/destinations?category_id=${encodeURIComponent(selectedCategory.id)}`);
    if (!data || !data.destinations || !data.destinations.length) {
      destinationsList.innerHTML = '<p class="ma-empty">Δεν υπάρχουν διαθέσιμοι προορισμοί.</p>';
      return;
    }

    destinationsList.innerHTML = data.destinations.map(dest => `
      <button class="ma-destination-item" data-id="${dest.id}" data-name="${dest.name}">
        <span class="ma-destination-name">${dest.name}</span>
        ${dest.description ? `<span class="ma-destination-desc">${dest.description}</span>` : ''}
        <span class="ma-destination-arrow">→</span>
      </button>
    `).join('');

    // Event listeners - goes to booking type selection
    destinationsList.querySelectorAll('.ma-destination-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedDestination = {
          id: item.dataset.id,
          name: item.dataset.name
        };
        showBookingTypeStep();
      });
    });
  };

  // ========================================
  // BOOKING TYPE STEP (now Step 3 — before vehicles)
  // ========================================
  const showBookingTypeStep = () => {
    if (!selectedDestination) return;

    // Reset booking state
    selectedBookingType = null;
    selectedDateTime = null;
    selectedVehicle = null;
    selectedTariff = null;

    // Update destination subtitle
    const destNameEl = $('#booking-destination-name');
    if (destNameEl) destNameEl.textContent = `Προορισμός: ${selectedDestination.name}`;

    // Hide datetime picker initially
    const datetimePicker = $('#booking-datetime-picker');
    if (datetimePicker) datetimePicker.hidden = true;

    showStep('bookingType');
  };

  const setupBookingTypeListeners = () => {
    const btnInstant = $('#btn-book-instant');
    const btnScheduled = $('#btn-book-scheduled');
    const datetimePicker = $('#booking-datetime-picker');
    const dateInput = $('#booking-date');
    const timeInput = $('#booking-time');
    const btnConfirmDatetime = $('#btn-confirm-datetime');
    const errorEl = $('#booking-datetime-error');
    const backBtn = $('#back-to-destinations-from-booking');

    // Back button → go to destinations (or categories if came from search)
    backBtn?.addEventListener('click', () => {
      selectedDestination = null;
      selectedBookingType = null;
      selectedDateTime = null;
      sessionTariffTime = null;
      if (datetimePicker) datetimePicker.hidden = true;
      if (cameFromSearch) {
        cameFromSearch = false;
        showStep('categories');
      } else {
        showStep('destinations');
      }
    });

    // Instant booking → lock session time, auto-calc tariff, load vehicles
    btnInstant?.addEventListener('click', () => {
      sessionTariffTime = new Date();
      selectedBookingType = 'instant';
      selectedDateTime = null;
      selectedTariff = calculateTariffClient(sessionTariffTime);
      loadVehicles();
    });

    // Scheduled booking - show datetime picker
    btnScheduled?.addEventListener('click', () => {
      if (datetimePicker) {
        datetimePicker.hidden = false;
        const now = new Date();
        if (dateInput) {
          dateInput.min = now.toISOString().split('T')[0];
          const maxDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          dateInput.max = maxDate.toISOString().split('T')[0];
          dateInput.value = now.toISOString().split('T')[0];
        }
        if (timeInput) {
          const roundedMins = Math.ceil(now.getMinutes() / 30) * 30;
          const tmpDate = new Date(now);
          tmpDate.setMinutes(roundedMins);
          const hours = String(tmpDate.getHours()).padStart(2, '0');
          const minutes = String(tmpDate.getMinutes()).padStart(2, '0');
          timeInput.value = `${hours}:${minutes}`;
        }
      }
      if (errorEl) errorEl.hidden = true;
    });

    // Confirm datetime → calc tariff from scheduled time, load vehicles
    btnConfirmDatetime?.addEventListener('click', () => {
      const date = dateInput?.value;
      const time = timeInput?.value;

      if (!date || !time) {
        if (errorEl) {
          errorEl.textContent = 'Παρακαλώ επιλέξτε ημερομηνία και ώρα';
          errorEl.hidden = false;
        }
        return;
      }

      // Basic future check
      const selectedDT = new Date(`${date}T${time}`);
      const now = new Date();
      if (selectedDT <= now) {
        if (errorEl) {
          errorEl.textContent = 'Η ώρα πρέπει να είναι στο μέλλον';
          errorEl.hidden = false;
        }
        return;
      }

      // Valid — set scheduled booking, calc tariff from SCHEDULED time
      selectedBookingType = 'scheduled';
      selectedDateTime = { date, time };
      sessionTariffTime = selectedDT;
      selectedTariff = calculateTariffClient(sessionTariffTime);
      loadVehicles();
    });
  };

  const loadVehicles = async () => {
    if (!selectedDestination || !hotelContext?.origin_zone_id || !selectedTariff) return;
    selectedDestinationName.textContent = selectedDestination.name;
    
    // Show tariff indicator
    if (selectedTariffIndicator) {
      selectedTariffIndicator.textContent = TARIFF_LABELS[selectedTariff] || selectedTariff;
    }
    
    vehiclesGrid.innerHTML = '<div class="ma-loading">Φόρτωση...</div>';
    showStep('vehicles');

    // Pass ref_time so server can verify tariff; tariff=auto lets server recalculate
    const refTimeISO = sessionTariffTime ? sessionTariffTime.toISOString() : new Date().toISOString();
    const url = `/api/moveathens/vehicles?origin_zone_id=${encodeURIComponent(hotelContext.origin_zone_id)}&destination_id=${encodeURIComponent(selectedDestination.id)}&tariff=${encodeURIComponent(selectedTariff)}&ref_time=${encodeURIComponent(refTimeISO)}`;
    const data = await api(url);

    if (!data || !data.vehicles || !data.vehicles.length) {
      vehiclesGrid.innerHTML = '<p class="ma-empty">Δεν υπάρχουν διαθέσιμα οχήματα για αυτή τη διαδρομή.</p>';
      return;
    }

    // Use server-authoritative tariff
    if (data.tariff) selectedTariff = data.tariff;
    if (selectedTariffIndicator) {
      selectedTariffIndicator.textContent = TARIFF_LABELS[selectedTariff] || selectedTariff;
    }

    // Split vehicles into instant-available and scheduled-only
    const instantVehicles = data.vehicles.filter(v => v.allow_instant !== false);
    const scheduledOnlyVehicles = data.vehicles.filter(v => v.allow_instant === false);

    const renderVehicleCard = (v, isScheduledSection) => {
      // For instant bookings, scheduled-only vehicles show advance notice
      const advanceLabel = (isScheduledSection && selectedBookingType === 'instant' && v.min_advance_minutes > 0)
        ? (() => {
            const hours = Math.floor(v.min_advance_minutes / 60);
            const mins = v.min_advance_minutes % 60;
            let t = '';
            if (hours > 0) t += `${hours} ώρ${hours === 1 ? 'α' : 'ες'}`;
            if (mins > 0) t += `${hours > 0 ? ' και ' : ''}${mins}\'`;
            return `<div class="ma-vehicle-scheduled-only">📅 Κράτηση από ${t}</div>`;
          })()
        : '';

      return `
      <button class="ma-vehicle-card${isScheduledSection && selectedBookingType === 'instant' ? ' ma-vehicle-card--scheduled-hint' : ''}"
              data-id="${v.id}" data-name="${v.name}" data-price="${v.price}" 
              data-pax="${v.max_passengers}" data-large="${v.luggage_large}" 
              data-medium="${v.luggage_medium}" data-cabin="${v.luggage_cabin}"
              data-allow-instant="${v.allow_instant !== false}" data-min-advance="${v.min_advance_minutes || 0}">
        ${v.imageUrl ? `<img src="${v.imageUrl}" alt="${v.name}" class="ma-vehicle-img">` : '<div class="ma-vehicle-placeholder">🚗</div>'}
        <div class="ma-vehicle-info">
          <h3 class="ma-vehicle-name">${v.name}</h3>
          <div class="ma-vehicle-specs">
            <span class="ma-spec">👤 ${v.max_passengers}</span>
            ${v.luggage_large ? `<span class="ma-spec">🧳L ${v.luggage_large}</span>` : ''}
            ${v.luggage_medium ? `<span class="ma-spec">🧳M ${v.luggage_medium}</span>` : ''}
            ${v.luggage_cabin ? `<span class="ma-spec">🎒 ${v.luggage_cabin}</span>` : ''}
          </div>
          ${advanceLabel}
        </div>
        <div class="ma-vehicle-price">€${v.price.toFixed(0)}</div>
      </button>`;
    };

    let html = '';

    if (selectedBookingType === 'instant') {
      // Instant: show available-now section, then scheduled-only section
      if (instantVehicles.length) {
        html += `<div class="ma-vehicles-section-label">Διαθέσιμα τώρα</div>`;
        html += instantVehicles.map(v => renderVehicleCard(v, false)).join('');
      }
      if (scheduledOnlyVehicles.length) {
        html += `<div class="ma-vehicles-section-label ma-vehicles-section-label--alt">Διαθέσιμα με κράτηση</div>`;
        html += scheduledOnlyVehicles.map(v => renderVehicleCard(v, true)).join('');
      }
    } else {
      // Scheduled: show all vehicles equal
      html = data.vehicles.map(v => renderVehicleCard(v, false)).join('');
    }

    vehiclesGrid.innerHTML = html;

    // Event listeners
    vehiclesGrid.querySelectorAll('.ma-vehicle-card').forEach(card => {
      card.addEventListener('click', () => {
        const vehicleData = {
          id: card.dataset.id,
          name: card.dataset.name,
          price: parseFloat(card.dataset.price),
          max_passengers: parseInt(card.dataset.pax, 10),
          luggage_large: parseInt(card.dataset.large, 10),
          luggage_medium: parseInt(card.dataset.medium, 10),
          luggage_cabin: parseInt(card.dataset.cabin, 10),
          allow_instant: card.dataset.allowInstant === 'true',
          min_advance_minutes: parseInt(card.dataset.minAdvance, 10) || 0
        };

        // If user chose instant but clicks a scheduled-only vehicle → auto-switch to scheduled
        if (selectedBookingType === 'instant' && !vehicleData.allow_instant) {
          // Switch to scheduled mode — show inline datetime picker in a prompt
          selectedBookingType = 'scheduled';
          selectedVehicle = vehicleData;
          showScheduledPromptForVehicle(vehicleData);
          return;
        }

        // For scheduled bookings, validate min_advance_minutes
        if (selectedBookingType === 'scheduled' && vehicleData.min_advance_minutes > 0 && selectedDateTime) {
          const scheduledDt = new Date(`${selectedDateTime.date}T${selectedDateTime.time}`);
          const minAllowed = new Date(Date.now() + vehicleData.min_advance_minutes * 60000);
          if (scheduledDt < minAllowed) {
            const hours = Math.floor(vehicleData.min_advance_minutes / 60);
            const mins = vehicleData.min_advance_minutes % 60;
            let timeText = '';
            if (hours > 0) timeText += `${hours} ώρ${hours === 1 ? 'α' : 'ες'}`;
            if (mins > 0) timeText += `${hours > 0 ? ' και ' : ''}${mins} λεπτά`;
            alert(`Αυτό το όχημα απαιτεί κράτηση τουλάχιστον ${timeText} πριν. Παρακαλώ επιλέξτε αργότερη ώρα.`);
            return;
          }
        }

        selectedVehicle = vehicleData;
        showConfirmation();
      });
    });
  };

  // Inline scheduled prompt — when user chose instant but taps a scheduled-only vehicle
  const showScheduledPromptForVehicle = (vehicle) => {
    // Create a modal-like datetime picker overlay on the vehicles step
    let overlay = document.getElementById('ma-schedule-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ma-schedule-overlay';
      overlay.className = 'ma-schedule-overlay';
      overlay.innerHTML = `
        <div class="ma-schedule-overlay__card">
          <h3 class="ma-schedule-overlay__title">📅 Κράτηση για <span id="ma-schedule-overlay-name"></span></h3>
          <p class="ma-schedule-overlay__notice" id="ma-schedule-overlay-notice"></p>
          <div class="ma-datetime-inputs">
            <label class="ma-datetime-label"><span>Ημερομηνία</span>
              <input type="date" id="ma-schedule-overlay-date" class="ma-datetime-input" required>
            </label>
            <label class="ma-datetime-label"><span>Ώρα</span>
              <input type="time" id="ma-schedule-overlay-time" class="ma-datetime-input" required>
            </label>
          </div>
          <p id="ma-schedule-overlay-error" class="ma-datetime-error" hidden></p>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button id="ma-schedule-overlay-confirm" class="ma-btn-confirm-datetime" type="button">Συνέχεια</button>
            <button id="ma-schedule-overlay-cancel" class="ma-btn-confirm-datetime" type="button" style="background:#6b7280">Ακύρωση</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
    }

    overlay.hidden = false;
    const nameEl = document.getElementById('ma-schedule-overlay-name');
    const noticeEl = document.getElementById('ma-schedule-overlay-notice');
    const dateInput = document.getElementById('ma-schedule-overlay-date');
    const timeInput = document.getElementById('ma-schedule-overlay-time');
    const errorEl = document.getElementById('ma-schedule-overlay-error');

    if (nameEl) nameEl.textContent = vehicle.name;
    const minAdv = vehicle.min_advance_minutes || 0;
    if (noticeEl && minAdv > 0) {
      const hours = Math.floor(minAdv / 60);
      const mins = minAdv % 60;
      let t = '';
      if (hours > 0) t += `${hours} ώρ${hours === 1 ? 'α' : 'ες'}`;
      if (mins > 0) t += `${hours > 0 ? ' και ' : ''}${mins} λεπτά`;
      noticeEl.textContent = `Ελάχιστος χρόνος κράτησης: ${t} πριν`;
    } else if (noticeEl) {
      noticeEl.textContent = '';
    }

    const now = new Date();
    const minDate = new Date(now.getTime() + minAdv * 60000);
    if (dateInput) {
      dateInput.min = now.toISOString().split('T')[0];
      const maxDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      dateInput.max = maxDate.toISOString().split('T')[0];
      dateInput.value = minDate.toISOString().split('T')[0];
    }
    if (timeInput) {
      const roundedMins = Math.ceil(minDate.getMinutes() / 30) * 30;
      minDate.setMinutes(roundedMins);
      const hh = String(minDate.getHours()).padStart(2, '0');
      const mm = String(minDate.getMinutes()).padStart(2, '0');
      timeInput.value = `${hh}:${mm}`;
    }
    if (errorEl) errorEl.hidden = true;

    // Confirm
    const confirmBtn = document.getElementById('ma-schedule-overlay-confirm');
    const cancelBtn = document.getElementById('ma-schedule-overlay-cancel');

    const cleanup = () => { overlay.hidden = true; };

    const onConfirm = () => {
      if (errorEl) errorEl.hidden = true;
      const date = dateInput?.value;
      const time = timeInput?.value;
      if (!date || !time) {
        if (errorEl) { errorEl.textContent = 'Παρακαλώ επιλέξτε ημερομηνία και ώρα'; errorEl.hidden = false; }
        return;
      }
      const selectedDT = new Date(`${date}T${time}`);
      const minAllowed = new Date(Date.now() + minAdv * 60000);
      if (selectedDT < minAllowed) {
        const hours = Math.floor(minAdv / 60);
        const mins = minAdv % 60;
        let t = '';
        if (hours > 0) t += `${hours} ώρ${hours === 1 ? 'α' : 'ες'}`;
        if (mins > 0) t += `${hours > 0 ? ' και ' : ''}${mins} λεπτά`;
        if (errorEl) { errorEl.textContent = `Η ώρα πρέπει να είναι τουλάχιστον ${t} από τώρα`; errorEl.hidden = false; }
        return;
      }
      selectedDateTime = { date, time };
      sessionTariffTime = selectedDT;
      selectedTariff = calculateTariffClient(sessionTariffTime);
      // Update tariff indicator in case it changed
      if (selectedTariffIndicator) {
        selectedTariffIndicator.textContent = TARIFF_LABELS[selectedTariff] || selectedTariff;
      }
      cleanup();
      // Need to reload vehicles with new tariff if it changed, then go to confirm
      showConfirmation();
    };
    const onCancel = () => {
      // Revert to instant
      selectedBookingType = 'instant';
      selectedVehicle = null;
      cleanup();
    };

    // Replace listeners (clone trick)
    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    newConfirm.addEventListener('click', onConfirm);

    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    newCancel.addEventListener('click', onCancel);
  };

  const showConfirmation = () => {
    if (!selectedDestination || !selectedVehicle || !selectedTariff) return;

    confirmDestination.textContent = selectedDestination.name;
    if (confirmTariff) {
      confirmTariff.textContent = TARIFF_LABELS[selectedTariff] || selectedTariff;
    }
    confirmVehicle.textContent = selectedVehicle.name;
    confirmPrice.textContent = `€${selectedVehicle.price.toFixed(0)}`;

    // Update booking type display
    const confirmBookingType = $('#confirm-booking-type');
    const confirmBookingTypeRow = $('#confirm-booking-type-row');
    if (confirmBookingType && confirmBookingTypeRow) {
      if (selectedBookingType === 'instant') {
        confirmBookingType.textContent = '⚡ Άμεσα';
      } else if (selectedBookingType === 'scheduled' && selectedDateTime) {
        // Format date nicely in Greek
        const dt = new Date(`${selectedDateTime.date}T${selectedDateTime.time}`);
        const dayNames = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
        const monthNames = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
        const dayName = dayNames[dt.getDay()];
        const day = dt.getDate();
        const month = monthNames[dt.getMonth()];
        const time = selectedDateTime.time;
        confirmBookingType.textContent = `📅 ${dayName} ${day} ${month}, ${time}`;
      } else {
        confirmBookingTypeRow.style.display = 'none';
      }
      confirmBookingTypeRow.style.display = 'flex';
    }

    // Reset passenger & luggage selections
    selectedPassengers = 0;
    selectedLuggageLarge = 0;
    selectedLuggageMedium = 0;
    selectedLuggageCabin = 0;
    selectedPaymentMethod = null;
    passengerName = '';
    roomNumber = '';
    bookingNotes = '';
    flightNumber = '';

    // Setup passenger name field
    const passengerNameInput = $('#passenger-name');
    const passengerNameRequired = $('#passenger-name-required');
    const passengerNameError = $('#passenger-name-error');
    
    // Show required indicator for non-taxi vehicles
    const isNonTaxi = !selectedVehicle.allow_instant;
    if (passengerNameRequired) {
      passengerNameRequired.hidden = !isNonTaxi;
    }
    if (passengerNameInput) {
      passengerNameInput.value = '';
      passengerNameInput.classList.remove('ma-input-error-state');
    }
    if (passengerNameError) {
      passengerNameError.hidden = true;
    }

    // Flight number field — show only for arrivals
    const isArrivalCategory = selectedCategory && selectedCategory.is_arrival;
    const flightRow = $('#flight-number-row');
    const flightInput = $('#flight-number');
    const flightError = $('#flight-number-error');
    if (flightRow) flightRow.hidden = !isArrivalCategory;
    if (flightInput) {
      flightInput.value = '';
      flightInput.classList.remove('ma-input-error-state');
    }
    if (flightError) flightError.hidden = true;

    // For arrivals, passenger name is ALWAYS required (regardless of vehicle type)
    if (isArrivalCategory && passengerNameRequired) {
      passengerNameRequired.hidden = false;
    }

    // Reset room number field
    const roomNumberInput = $('#room-number');
    if (roomNumberInput) roomNumberInput.value = '';

    // Reset notes field
    const notesInput = $('#booking-notes');
    if (notesInput) notesInput.value = '';

    // Update max values display
    $('#passengers-max').textContent = `(μέγ. ${selectedVehicle.max_passengers})`;
    $('#luggage-large-max').textContent = `(μέγ. ${selectedVehicle.luggage_large || 0})`;
    $('#luggage-medium-max').textContent = `(μέγ. ${selectedVehicle.luggage_medium || 0})`;
    $('#luggage-cabin-max').textContent = `(μέγ. ${selectedVehicle.luggage_cabin || 0})`;

    // Reset counter displays
    $('#passengers-count').textContent = '0';
    $('#luggage-large-count').textContent = '0';
    $('#luggage-medium-count').textContent = '0';
    $('#luggage-cabin-count').textContent = '0';

    // Reset payment buttons
    $$('.ma-payment-btn').forEach(btn => btn.classList.remove('active'));

    // Setup payment button listeners
    setupPaymentListeners();
    
    // Setup passenger name input listener
    setupPassengerNameListener();

    // Setup room number input listener
    setupRoomNumberListener();

    // Setup notes listener
    setupNotesListener();

    // Setup flight number listener
    setupFlightNumberListener();

    // Reset button states
    updateCounterButtons();

    // Setup counter event listeners
    setupCounterListeners();

    const hotelName = hotelContext.origin_zone_name || hotelContext.hotelName || 'Ξενοδοχείο';
    const hotelAddress = hotelContext.address || '';
    const hotelMunicipality = hotelContext.municipality || '';
    
    // Build location info (zone + municipality + address)
    let locationInfo = `🏨 Ξενοδοχείο: ${hotelName}`;
    if (hotelMunicipality) {
      locationInfo += `\n📌 Δήμος: ${hotelMunicipality}`;
    }
    if (hotelAddress) {
      locationInfo += `\n📍 Διεύθυνση: ${hotelAddress}`;
    }

    // Update CTA links with message
    updateCtaLinks(locationInfo);

    showStep('confirm');
  };

  // ========================================
  // COUNTER LOGIC
  // ========================================
  const updateCounterButtons = () => {
    // Passengers
    $('#passengers-minus').disabled = selectedPassengers <= 0;
    $('#passengers-plus').disabled = selectedPassengers >= selectedVehicle.max_passengers;

    // Large luggage
    const maxLarge = selectedVehicle.luggage_large || 0;
    $('#luggage-large-minus').disabled = selectedLuggageLarge <= 0;
    $('#luggage-large-plus').disabled = selectedLuggageLarge >= maxLarge || maxLarge === 0;
    if (maxLarge === 0) {
      $('#luggage-large-plus').classList.add('ma-counter-disabled');
      $('#luggage-large-minus').classList.add('ma-counter-disabled');
    } else {
      $('#luggage-large-plus').classList.remove('ma-counter-disabled');
      $('#luggage-large-minus').classList.remove('ma-counter-disabled');
    }

    // Medium luggage
    const maxMedium = selectedVehicle.luggage_medium || 0;
    $('#luggage-medium-minus').disabled = selectedLuggageMedium <= 0;
    $('#luggage-medium-plus').disabled = selectedLuggageMedium >= maxMedium || maxMedium === 0;
    if (maxMedium === 0) {
      $('#luggage-medium-plus').classList.add('ma-counter-disabled');
      $('#luggage-medium-minus').classList.add('ma-counter-disabled');
    } else {
      $('#luggage-medium-plus').classList.remove('ma-counter-disabled');
      $('#luggage-medium-minus').classList.remove('ma-counter-disabled');
    }

    // Cabin luggage
    const maxCabin = selectedVehicle.luggage_cabin || 0;
    $('#luggage-cabin-minus').disabled = selectedLuggageCabin <= 0;
    $('#luggage-cabin-plus').disabled = selectedLuggageCabin >= maxCabin || maxCabin === 0;
    if (maxCabin === 0) {
      $('#luggage-cabin-plus').classList.add('ma-counter-disabled');
      $('#luggage-cabin-minus').classList.add('ma-counter-disabled');
    } else {
      $('#luggage-cabin-plus').classList.remove('ma-counter-disabled');
      $('#luggage-cabin-minus').classList.remove('ma-counter-disabled');
    }
  };

  // Setup passenger name input listener
  const setupPassengerNameListener = () => {
    const input = $('#passenger-name');
    const errorEl = $('#passenger-name-error');
    
    if (!input) return;
    
    // Clone to remove old listeners
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    
    // Add input listener
    newInput.addEventListener('input', (e) => {
      passengerName = e.target.value.trim();
      
      // Clear error state on input
      newInput.classList.remove('ma-input-error-state');
      if (errorEl) errorEl.hidden = true;
      
      // Update CTA links with new name
      updateCtaLinks();
    });
    
    // Add blur listener for validation feedback
    newInput.addEventListener('blur', () => {
      const isNonTaxi = selectedVehicle && !selectedVehicle.allow_instant;
      if (isNonTaxi && !passengerName) {
        newInput.classList.add('ma-input-error-state');
        if (errorEl) errorEl.hidden = false;
      }
    });
  };

  // Setup room number input listener
  const setupRoomNumberListener = () => {
    const input = $('#room-number');
    if (!input) return;
    
    // Clone to remove old listeners
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    
    newInput.addEventListener('input', (e) => {
      roomNumber = e.target.value.trim();
      updateCtaLinks();
    });
  };

  // Setup notes input listener
  const setupNotesListener = () => {
    const input = $('#booking-notes');
    if (!input) return;
    
    // Clone to remove old listeners
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    
    newInput.addEventListener('input', (e) => {
      bookingNotes = e.target.value.trim();
      updateCtaLinks();
    });
  };

  // Setup flight number input listener — with live AeroAPI validation
  let flightLookupTimer = null;
  let lastFlightLookup = '';

  const setupFlightNumberListener = () => {
    const input = $('#flight-number');
    const errorEl = $('#flight-number-error');
    if (!input) return;

    // Clone to remove old listeners (same pattern as other inputs)
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    // Create (or reuse) feedback element below the input — AFTER clone to stay in DOM
    let feedbackEl = document.getElementById('flight-lookup-feedback');
    if (!feedbackEl) {
      feedbackEl = document.createElement('p');
      feedbackEl.id = 'flight-lookup-feedback';
      feedbackEl.style.cssText = 'margin-top:4px;font-size:0.82rem;transition:opacity .2s';
      feedbackEl.hidden = true;
      const errEl = document.getElementById('flight-number-error');
      if (errEl && errEl.parentNode) {
        errEl.parentNode.insertBefore(feedbackEl, errEl.nextSibling);
      } else {
        newInput.parentNode.appendChild(feedbackEl);
      }
    }
    // Reset lookup cache so same flight can be re-checked
    lastFlightLookup = '';

    newInput.addEventListener('input', (e) => {
      // Uppercase normalization + strip spaces: "oa 123" → "OA123"
      const raw = e.target.value;
      const normalised = raw.toUpperCase().replace(/\s+/g, '');
      if (normalised !== raw) {
        e.target.value = normalised;
      }
      flightNumber = normalised;
      newInput.classList.remove('ma-input-error-state');
      if (errorEl) errorEl.hidden = true;
      updateCtaLinks();

      // Debounced AeroAPI lookup (1 second after user stops typing)
      if (flightLookupTimer) clearTimeout(flightLookupTimer);
      feedbackEl.hidden = true;

      if (normalised.length >= 4 && normalised !== lastFlightLookup) {
        flightLookupTimer = setTimeout(() => doFlightLookup(normalised, feedbackEl, newInput), 1000);
      }
    });

    newInput.addEventListener('blur', () => {
      const isArrival = selectedCategory && selectedCategory.is_arrival;
      if (isArrival && !flightNumber) {
        newInput.classList.add('ma-input-error-state');
        if (errorEl) errorEl.hidden = false;
      }
    });
  };

  // AeroAPI live lookup — called after debounce
  const doFlightLookup = async (ident, feedbackEl, inputEl) => {
    if (!feedbackEl) return;
    feedbackEl.hidden = false;
    feedbackEl.style.color = '#6b7280';
    feedbackEl.textContent = '🔍 Αναζήτηση πτήσης…';

    try {
      const dateParam = selectedDateTime?.date || '';
      const res = await fetch(`/api/moveathens/flight-lookup/${encodeURIComponent(ident)}${dateParam ? '?date=' + dateParam : ''}`);
      const data = await res.json();

      if (data.ok && data.flight) {
        const f = data.flight;
        lastFlightLookup = ident;
        lastFlightData = f; // Store for WhatsApp message & time override
        feedbackEl.style.color = '#059669';
        let text = `✅ ${f.airline || ident}`;
        if (f.origin) text += ` | Από: ${f.origin}`;
        if (f.eta) {
          const etaTime = new Date(f.eta).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
          text += ` | ETA: ${etaTime}`;
        }
        if (f.status === 'en_route') text += ' ✈️';
        else if (f.status === 'landed') text += ' (Προσγειώθηκε ✅)';
        feedbackEl.textContent = text;
        inputEl.classList.remove('ma-input-error-state');
        updateCtaLinks(); // Refresh WhatsApp message with flight info
      } else {
        feedbackEl.style.color = '#dc2626';
        feedbackEl.textContent = '⚠️ Δεν βρέθηκε πτήση — ελέγξτε τον αριθμό';
        lastFlightLookup = '';
        lastFlightData = null;
      }
    } catch (err) {
      feedbackEl.style.color = '#9ca3af';
      feedbackEl.textContent = '⚠️ Αδυναμία ελέγχου — η καταχώρηση θα γίνει χωρίς live tracking';
      lastFlightLookup = '';
      lastFlightData = null;
    }
  };

  // Validate passenger name before allowing CTA actions
  const validatePassengerName = () => {
    const isNonTaxi = selectedVehicle && !selectedVehicle.allow_instant;
    const isArrival = selectedCategory && selectedCategory.is_arrival;
    // Required for non-taxi vehicles OR for arrivals
    if (!isNonTaxi && !isArrival) return true;
    
    const input = $('#passenger-name');
    const errorEl = $('#passenger-name-error');
    
    if (!passengerName) {
      if (input) {
        input.classList.add('ma-input-error-state');
        input.focus();
      }
      if (errorEl) errorEl.hidden = false;
      return false;
    }
    return true;
  };

  // Validate flight number (required for arrivals)
  const validateFlightNumber = () => {
    const isArrival = selectedCategory && selectedCategory.is_arrival;
    if (!isArrival) return true;

    const input = $('#flight-number');
    const errorEl = $('#flight-number-error');

    if (!flightNumber) {
      if (input) {
        input.classList.add('ma-input-error-state');
        input.focus();
      }
      if (errorEl) errorEl.hidden = false;
      return false;
    }
    return true;
  };

  // Setup payment method listeners
  const setupPaymentListeners = () => {
    const paymentBtns = document.querySelectorAll('.ma-payment-btn');
    paymentBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        // Toggle selection - if clicking the active one, deselect it
        if (btn.classList.contains('active')) {
          btn.classList.remove('active');
          selectedPaymentMethod = null;
        } else {
          // Remove active from all, then add to clicked
          paymentBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          selectedPaymentMethod = btn.dataset.payment;
        }
        updateCtaLinks();
      });
    });
  };

  const updateCtaLinks = (locationInfo) => {
    const hotelName = hotelContext.origin_zone_name || hotelContext.hotelName || 'Ξενοδοχείο';
    const hotelAddress = hotelContext.address || '';
    const hotelMunicipality = hotelContext.municipality || '';
    
    if (!locationInfo) {
      locationInfo = `🏨 Ξενοδοχείο: ${hotelName}`;
      if (hotelMunicipality) {
        locationInfo += `\n📌 Δήμος: ${hotelMunicipality}`;
      }
      if (hotelAddress) {
        locationInfo += `\n📍 Διεύθυνση: ${hotelAddress}`;
      }
    }

    // Get tariff label
    const tariffLabel = TARIFF_LABELS[selectedTariff] || selectedTariff;

    // Build booking time text — MUST be computed before travelDetails (flight ETA dedup check)
    let bookingTimeText = '';
    if (selectedBookingType === 'instant') {
      // If flight data has a future ETA, override "ΑΜΕΣΑ" with the real arrival time
      if (lastFlightData && lastFlightData.eta && lastFlightData.status !== 'landed') {
        const etaDt = new Date(lastFlightData.eta);
        if (etaDt.getTime() > Date.now()) {
          const etaH = etaDt.getHours();
          const etaM = String(etaDt.getMinutes()).padStart(2, '0');
          const etaSuffix = etaH < 12 ? 'πμ' : 'μμ';
          const etaH12 = etaH === 0 ? 12 : etaH > 12 ? etaH - 12 : etaH;
          const dayNames = ['Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο'];
          const monthNames = ['Ιαν','Φεβ','Μαρ','Απρ','Μάι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
          bookingTimeText = `📅 ${dayNames[etaDt.getDay()]} ${etaDt.getDate()} ${monthNames[etaDt.getMonth()]}, ώρα ${etaH12}:${etaM} ${etaSuffix} (ETA πτήσης)`;
        } else {
          bookingTimeText = '⚡ ΑΜΕΣΑ (πτήση προσγειώθηκε)';
        }
      } else {
        bookingTimeText = '⚡ ΑΜΕΣΑ';
      }
    } else if (selectedBookingType === 'scheduled' && selectedDateTime) {
      const dt = new Date(`${selectedDateTime.date}T${selectedDateTime.time}`);
      const dayNames = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
      const monthNames = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
      const hh = parseInt(selectedDateTime.time.split(':')[0], 10);
      const mm = selectedDateTime.time.split(':')[1];
      const ampm = hh < 12 ? 'πμ' : 'μμ';
      const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
      bookingTimeText = `📅 ${dayNames[dt.getDay()]} ${dt.getDate()} ${monthNames[dt.getMonth()]}, ώρα ${h12}:${mm} ${ampm}`;
    }

    // Build passenger/luggage info only if selected
    let travelDetails = '';
    if (passengerName) {
      travelDetails += `👤 Όνομα επιβάτη: ${passengerName}\n`;
    }
    if (roomNumber) {
      travelDetails += `🚪 Δωμάτιο: ${roomNumber}\n`;
    }
    if (selectedPassengers > 0) {
      travelDetails += `👥 Επιβάτες: ${selectedPassengers}\n`;
    }
    if (selectedLuggageLarge > 0) {
      travelDetails += `🧳 Μεγάλες αποσκευές: ${selectedLuggageLarge}\n`;
    }
    if (selectedLuggageMedium > 0) {
      travelDetails += `💼 Μεσαίες αποσκευές: ${selectedLuggageMedium}\n`;
    }
    if (selectedLuggageCabin > 0) {
      travelDetails += `🎒 Χειραποσκευές: ${selectedLuggageCabin}\n`;
    }
    if (selectedPaymentMethod) {
      const paymentLabel = selectedPaymentMethod === 'cash' ? 'Μετρητά' : 'POS';
      travelDetails += `💳 Πληρωμή: ${paymentLabel}\n`;
    }
    if (flightNumber) {
      let flightLine = `🛫 Αρ. Δρομολογίου: ${flightNumber}`;
      if (lastFlightData) {
        if (lastFlightData.airline) flightLine += ` (${lastFlightData.airline})`;
        if (lastFlightData.origin) flightLine += `\n📍 Από: ${lastFlightData.origin}`;
        // Only show ETA here if bookingTimeText didn't already include it
        if (lastFlightData.eta && !bookingTimeText.includes('ETA')) {
          const etaT = new Date(lastFlightData.eta).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
          flightLine += `\n⏱️ ETA: ${etaT}`;
          if (lastFlightData.status === 'en_route') flightLine += ' ✈️ (σε πτήση)';
          else if (lastFlightData.status === 'landed') flightLine += ' ✅ (προσγειώθηκε)';
          else if (lastFlightData.status === 'scheduled') flightLine += ' (προγρ/μένη)';
        }
      }
      travelDetails += flightLine + '\n';
    }
    if (bookingNotes) {
      travelDetails += `📝 Σημειώσεις: ${bookingNotes}\n`;
    }

    // Build message content — ordered: destination, time, vehicle, hotel, passenger details, price
    const parts = [];
    const isArrival = selectedCategory && selectedCategory.is_arrival;

    // Build Google Maps pickup link
    let pickupMapsUrl = '';
    if (isArrival) {
      // Arrival: pickup at destination (airport etc.)
      if (selectedDestination.lat && selectedDestination.lng) {
        pickupMapsUrl = `https://maps.google.com/?q=${selectedDestination.lat},${selectedDestination.lng}`;
      } else {
        pickupMapsUrl = `https://maps.google.com/?q=${encodeURIComponent(selectedDestination.name)}`;
      }
    } else {
      // Departure: pickup at hotel
      if (hotelContext && hotelContext.lat && hotelContext.lng) {
        pickupMapsUrl = `https://maps.google.com/?q=${hotelContext.lat},${hotelContext.lng}`;
      } else {
        const addrQuery = hotelAddress ? `${hotelAddress}, ${hotelMunicipality}`.trim().replace(/,\s*$/, '') : hotelName;
        if (addrQuery) {
          pickupMapsUrl = `https://maps.google.com/?q=${encodeURIComponent(addrQuery)}`;
        }
      }
    }

    if (isArrival) {
      // Arrival: pickup FROM destination → hotel
      parts.push(`✈️ Άφιξη : ${selectedDestination.name}`);
      parts.push(`🏨 Προορισμός: ${hotelName}`);
    } else {
      // Departure: hotel → destination (default)
      parts.push(`🎯 Προορισμός: ${selectedDestination.name}`);
    }
    if (bookingTimeText) parts.push(bookingTimeText);
    parts.push(`🚗 Όχημα: ${selectedVehicle.name}`);

    // Hotel address section — only for departures (arrivals already show hotel as destination)
    // For arrivals, put address inline
    if (isArrival) {
      if (hotelMunicipality) parts.push(`📌 Δήμος: ${hotelMunicipality}`);
      if (hotelAddress) parts.push(`📍 Διεύθυνση: ${hotelAddress}`);
    } else {
      parts.push('');
      parts.push(locationInfo);
    }
    // Google Maps link for pickup point (auto-clickable in WhatsApp)
    if (pickupMapsUrl) parts.push(`🗺️ Χάρτης: ${pickupMapsUrl}`);
    if (travelDetails) parts.push(`\n${travelDetails.trim()}`);
    // Price — only if admin has enabled it
    const showPrice = CONFIG?.showPriceInMessage !== false;
    if (showPrice) parts.push(`\n💰 Τιμή: €${selectedVehicle.price.toFixed(0)}`);

    const messageText = parts.join('\n');

    // WhatsApp link with pre-filled message
    const whatsappMsg = encodeURIComponent(messageText);
    const phone = CONFIG?.whatsappNumber?.replace(/[^0-9+]/g, '') || '';
    ctaWhatsapp.href = `https://wa.me/${phone}?text=${whatsappMsg}`;
    
    // Phone link
    ctaPhone.href = `tel:${CONFIG?.phoneNumber || ''}`;
    
    // Setup CTA validation for non-taxi vehicles
    setupCtaValidation();
  };
  
  // Auto-create transfer request on server before WhatsApp opens
  const createTransferRequest = async () => {
    if (!selectedDestination || !selectedVehicle || !hotelContext) return;
    try {
      const body = {
        origin_zone_id:    hotelContext.origin_zone_id || '',
        origin_zone_name:  hotelContext.origin_zone_name || '',
        hotel_name:        hotelContext.hotelName || hotelContext.origin_zone_name || '',
        hotel_address:     hotelContext.address || '',
        hotel_municipality: hotelContext.municipality || '',
        destination_id:    selectedDestination.id || '',
        destination_name:  selectedDestination.name || '',
        vehicle_id:        selectedVehicle.id || '',
        vehicle_name:      selectedVehicle.name || '',
        tariff:            selectedTariff || 'day',
        booking_type:      selectedBookingType || 'instant',
        scheduled_date:    selectedDateTime?.date || '',
        scheduled_time:    selectedDateTime?.time || '',
        passengers:        selectedPassengers || 1,
        luggage_large:     selectedLuggageLarge || 0,
        luggage_medium:    selectedLuggageMedium || 0,
        luggage_cabin:     selectedLuggageCabin || 0,
        passenger_name:    passengerName || '',
        room_number:       roomNumber || '',
        notes:             bookingNotes || '',
        flight_number:     flightNumber || '',
        price:             selectedVehicle.price || 0,
        payment_method:    selectedPaymentMethod || 'cash',
        orderer_phone:     hotelContext.orderer_phone || hotelContext.phone || '',
        is_arrival:        selectedCategory?.is_arrival || false
      };
      await fetch('/api/moveathens/transfer-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      console.log('[MoveAthens] transfer request created');
    } catch (err) {
      console.warn('[MoveAthens] failed to create request:', err);
      // Don't block the WhatsApp link — fire & forget
    }
  };

  // Setup CTA click validation (block if passenger name is required but missing)
  const setupCtaValidation = () => {
    const ctaIds = ['#cta-whatsapp', '#cta-phone'];
    
    ctaIds.forEach(id => {
      const link = $(id);
      if (!link) return;
      
      // Remove existing validation listeners by setting onclick
      link.onclick = (e) => {
        if (!validatePassengerName()) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        if (!validateFlightNumber()) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        // Auto-create transfer request for WhatsApp clicks
        if (id === '#cta-whatsapp') {
          createTransferRequest();
          // Show success screen after short delay so WhatsApp opens first
          setTimeout(() => showStep('sentSuccess'), 1500);
        }
      };
    });
  };

  const setupCounterListeners = () => {
    // Remove old listeners by cloning elements
    const counters = [
      { minus: '#passengers-minus', plus: '#passengers-plus', count: '#passengers-count', 
        getValue: () => selectedPassengers, setValue: (v) => selectedPassengers = v, max: () => selectedVehicle.max_passengers },
      { minus: '#luggage-large-minus', plus: '#luggage-large-plus', count: '#luggage-large-count',
        getValue: () => selectedLuggageLarge, setValue: (v) => selectedLuggageLarge = v, max: () => selectedVehicle.luggage_large || 0 },
      { minus: '#luggage-medium-minus', plus: '#luggage-medium-plus', count: '#luggage-medium-count',
        getValue: () => selectedLuggageMedium, setValue: (v) => selectedLuggageMedium = v, max: () => selectedVehicle.luggage_medium || 0 },
      { minus: '#luggage-cabin-minus', plus: '#luggage-cabin-plus', count: '#luggage-cabin-count',
        getValue: () => selectedLuggageCabin, setValue: (v) => selectedLuggageCabin = v, max: () => selectedVehicle.luggage_cabin || 0 }
    ];

    counters.forEach(c => {
      const minusBtn = $(c.minus);
      const plusBtn = $(c.plus);
      const countEl = $(c.count);

      // Clone to remove old listeners
      const newMinus = minusBtn.cloneNode(true);
      const newPlus = plusBtn.cloneNode(true);
      minusBtn.parentNode.replaceChild(newMinus, minusBtn);
      plusBtn.parentNode.replaceChild(newPlus, plusBtn);

      // Add new listeners
      newMinus.addEventListener('click', () => {
        const val = c.getValue();
        if (val > 0) {
          c.setValue(val - 1);
          countEl.textContent = c.getValue();
          updateCounterButtons();
          updateCtaLinks();
        }
      });

      newPlus.addEventListener('click', () => {
        const val = c.getValue();
        const maxVal = c.max();
        if (val < maxVal) {
          c.setValue(val + 1);
          countEl.textContent = c.getValue();
          updateCounterButtons();
          updateCtaLinks();
        }
      });
    });
  };

  // ========================================
  // SEARCH OVERLAY
  // ========================================
  let allDestinations = []; // cached list for search
  let cameFromSearch = false; // track if user bypassed categories via search

  const RECENT_SEARCHES_KEY = 'ma_recent_searches';
  const MAX_RECENT = 5;

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function getRecentSearches() {
    try {
      return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY)) || [];
    } catch { return []; }
  }

  function saveRecentSearch(dest) {
    const recents = getRecentSearches().filter(r => r.id !== dest.id);
    recents.unshift({ id: dest.id, name: dest.name });
    if (recents.length > MAX_RECENT) recents.length = MAX_RECENT;
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recents));
  }

  const initSearchOverlay = async () => {
    const overlay = $('#search-overlay');
    const overlayInput = $('#search-overlay-input');
    const closeBtn = $('#search-overlay-close');
    const recentSection = $('#search-recent');
    const recentList = $('#search-recent-list');
    const suggestionsSection = $('#search-suggestions');
    const suggestionsList = $('#search-suggestions-list');
    if (!overlay || !overlayInput) return;

    // Fetch all destinations for search
    const data = await api('/api/moveathens/destinations');
    if (data?.destinations) allDestinations = data.destinations;

    // Build category map
    const catMap = {};
    (CONFIG?.destinationCategories || []).forEach(c => { catMap[c.id] = c.name; });

    function openOverlay() {
      overlay.hidden = false;
      overlayInput.value = '';
      renderRecent();
      if (suggestionsSection) suggestionsSection.hidden = true;
      setTimeout(() => overlayInput.focus(), 50);
    }

    function closeOverlay() {
      overlay.hidden = true;
      overlayInput.blur();
    }

    function selectDestination(dest) {
      saveRecentSearch(dest);
      selectedDestination = dest;
      cameFromSearch = true;
      closeOverlay();
      showBookingTypeStep();
    }

    function renderRecent() {
      const recents = getRecentSearches();
      if (!recents.length) {
        if (recentSection) recentSection.hidden = true;
        return;
      }
      if (recentSection) recentSection.hidden = false;
      recentList.innerHTML = recents.map(r =>
        `<li data-id="${r.id}" data-name="${r.name}"><span>🕐</span> ${r.name}</li>`
      ).join('');
      recentList.querySelectorAll('li[data-id]').forEach(li => {
        li.addEventListener('click', () => {
          selectDestination({ id: li.dataset.id, name: li.dataset.name });
        });
      });
    }

    function renderSuggestions(items, query) {
      if (!items.length) {
        if (suggestionsSection) suggestionsSection.hidden = false;
        suggestionsList.innerHTML = `<li class="ma-search-empty">Δεν βρέθηκε «${escapeHtml(query)}»</li>`;
        return;
      }
      if (suggestionsSection) suggestionsSection.hidden = false;
      suggestionsList.innerHTML = items.map(d =>
        `<li data-id="${d.id}" data-name="${d.name}">
          <span>${d.name}</span>
          ${catMap[d.category_id] ? `<small class="ma-search-overlay__cat">${catMap[d.category_id]}</small>` : ''}
        </li>`
      ).join('');
      suggestionsList.querySelectorAll('li[data-id]').forEach(li => {
        li.addEventListener('click', () => {
          selectDestination({ id: li.dataset.id, name: li.dataset.name });
        });
      });
    }

    // Input filtering
    overlayInput.addEventListener('input', () => {
      const q = overlayInput.value.trim().toLowerCase();
      if (!q) {
        if (suggestionsSection) suggestionsSection.hidden = true;
        renderRecent();
        return;
      }
      if (recentSection) recentSection.hidden = true;
      const filtered = allDestinations.filter(d =>
        d.name.toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q)
      );
      renderSuggestions(filtered, overlayInput.value.trim());
    });

    // Close handlers
    closeBtn?.addEventListener('click', closeOverlay);
    // All search trigger buttons open the overlay
    $$('[id^="search-trigger"]').forEach(btn => {
      btn.addEventListener('click', openOverlay);
    });
  };

  // ========================================
  // INIT
  // ========================================
  const init = async () => {
    // Load config
    CONFIG = await api('/api/moveathens/ui-config');
    if (!CONFIG) {
      categoriesGrid.innerHTML = '<p class="ma-empty">Σφάλμα φόρτωσης.</p>';
      return;
    }

    // Fallback CTAs
    const phone = CONFIG?.whatsappNumber?.replace(/[^0-9+]/g, '') || '';

    // Load hotel context
    hotelContext = loadHotelContext();

    // Show categories
    await renderCategories();

    // Init search overlay for destinations
    await initSearchOverlay();

    // Back buttons
    $('#back-to-categories')?.addEventListener('click', () => {
      selectedCategory = null;
      sessionTariffTime = null;
      showStep('categories');
    });

    // From vehicles back to booking type
    $('#back-to-booking-from-vehicles')?.addEventListener('click', () => {
      selectedVehicle = null;
      selectedTariff = null;
      showStep('bookingType');
    });

    $('#back-to-vehicles')?.addEventListener('click', () => {
      // Coming from confirm → go back to vehicles
      selectedVehicle = null;
      showStep('vehicles');
    });

    // "New Route" button on success screen → full reset
    $('#btn-new-route')?.addEventListener('click', () => {
      resetAllState();
      showStep('categories');
    });

    // Setup booking type listeners
    setupBookingTypeListeners();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
