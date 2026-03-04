/**
 * MoveAthens Transfer Flow
 * Step 1: Categories → Step 2: Destinations → Step 3: Tariff → Step 4: Vehicles → Step 4b: Booking Type → Step 5: Confirm
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
  let selectedTariff = null; // 'day' or 'night'
  let selectedVehicle = null;
  let selectedBookingType = null; // 'instant' or 'scheduled'
  let selectedDateTime = null; // { date: 'YYYY-MM-DD', time: 'HH:MM' }
  
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
  // DOM
  // ========================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const steps = {
    categories: $('#step-categories'),
    destinations: $('#step-destinations'),
    tariff: $('#step-tariff'),
    vehicles: $('#step-vehicles'),
    bookingType: $('#step-booking-type'),
    confirm: $('#step-confirm'),
    noZone: $('#step-no-zone'),
    sentSuccess: $('#step-sent-success')
  };

  const categoriesGrid = $('#categories-grid');
  const destinationsList = $('#destinations-list');
  const vehiclesGrid = $('#vehicles-grid');
  const selectedCategoryName = $('#selected-category-name');
  const selectedDestinationName = $('#selected-destination-name');
  const selectedDestinationForTariff = $('#selected-destination-for-tariff');
  const selectedTariffIndicator = $('#selected-tariff-indicator');

  // Confirm step
  const confirmDestination = $('#confirm-destination');
  const confirmTariff = $('#confirm-tariff');
  const confirmVehicle = $('#confirm-vehicle');
  const confirmPrice = $('#confirm-price');
  const ctaWhatsapp = $('#cta-whatsapp');
  const ctaPhone = $('#cta-phone');
  const ctaWhatsappFallback = $('#cta-whatsapp-fallback');
  const ctaPhoneFallback = $('#cta-phone-fallback');

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

    categoriesGrid.innerHTML = data.categories.map(cat => `
      <button class="ma-category-card" data-id="${cat.id}" data-name="${cat.name}" data-arrival="${cat.is_arrival ? '1' : '0'}">
        <span class="ma-category-icon">${renderCategoryIcon(cat.icon)}</span>
        <span class="ma-category-name">${cat.name}</span>
      </button>
    `).join('');

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

    // Event listeners - now goes to tariff selection instead of vehicles
    destinationsList.querySelectorAll('.ma-destination-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedDestination = {
          id: item.dataset.id,
          name: item.dataset.name
        };
        showTariffSelection();
      });
    });
  };

  // ========================================
  // TARIFF SELECTION STEP
  // ========================================
  const showTariffSelection = () => {
    if (!selectedDestination) return;
    
    // Update subtitle with destination name
    if (selectedDestinationForTariff) {
      selectedDestinationForTariff.textContent = `Προορισμός: ${selectedDestination.name}`;
    }
    
    showStep('tariff');
    
    // Setup tariff card listeners
    const tariffCards = document.querySelectorAll('.ma-tariff-card');
    tariffCards.forEach(card => {
      // Remove old listeners by cloning
      const newCard = card.cloneNode(true);
      card.parentNode.replaceChild(newCard, card);
    });
    
    // Add fresh listeners
    document.querySelectorAll('.ma-tariff-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedTariff = card.dataset.tariff;
        loadVehicles();
      });
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

    const url = `/api/moveathens/vehicles?origin_zone_id=${encodeURIComponent(hotelContext.origin_zone_id)}&destination_id=${encodeURIComponent(selectedDestination.id)}&tariff=${encodeURIComponent(selectedTariff)}`;
    const data = await api(url);

    if (!data || !data.vehicles || !data.vehicles.length) {
      vehiclesGrid.innerHTML = '<p class="ma-empty">Δεν υπάρχουν διαθέσιμα οχήματα για αυτή τη διαδρομή.</p>';
      return;
    }

    vehiclesGrid.innerHTML = data.vehicles.map(v => `
      <button class="ma-vehicle-card" data-id="${v.id}" data-name="${v.name}" data-price="${v.price}" 
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
          ${v.allow_instant === false ? '<div class="ma-vehicle-scheduled-only">📅 Μόνο με κράτηση</div>' : ''}
        </div>
        <div class="ma-vehicle-price">€${v.price.toFixed(0)}</div>
      </button>
    `).join('');

    // Event listeners
    vehiclesGrid.querySelectorAll('.ma-vehicle-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedVehicle = {
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
        showBookingTypeStep();
      });
    });
  };

  // ========================================
  // BOOKING TYPE STEP
  // ========================================
  const showBookingTypeStep = () => {
    if (!selectedVehicle) return;

    // Reset booking state
    selectedBookingType = null;
    selectedDateTime = null;

    // Update vehicle name display
    const vehicleNameEl = $('#booking-vehicle-name');
    if (vehicleNameEl) vehicleNameEl.textContent = `${selectedVehicle.name} - €${selectedVehicle.price.toFixed(0)}`;

    // Show/hide instant option based on vehicle settings
    const instantOption = $('#booking-instant-option');
    const scheduledOption = $('#booking-scheduled-option');
    const datetimePicker = $('#booking-datetime-picker');
    const minNotice = $('#booking-min-notice');
    const nonTaxiWarning = $('#booking-non-taxi-warning');

    // Hide datetime picker initially
    if (datetimePicker) datetimePicker.hidden = true;

    // Always show instant option (so user can click it and see the warning if not allowed)
    if (instantOption) {
      instantOption.hidden = false;
    }

    // Always hide warning initially - will show only when user tries to click instant
    if (nonTaxiWarning) {
      nonTaxiWarning.hidden = true;
    }

    // Update scheduled notice text
    if (minNotice) {
      if (selectedVehicle.min_advance_minutes > 0) {
        const hours = Math.floor(selectedVehicle.min_advance_minutes / 60);
        const mins = selectedVehicle.min_advance_minutes % 60;
        let timeText = '';
        if (hours > 0) timeText += `${hours} ώρ${hours === 1 ? 'α' : 'ες'}`;
        if (mins > 0) timeText += `${hours > 0 ? ' και ' : ''}${mins} λεπτά`;
        minNotice.textContent = `Ελάχιστος χρόνος: ${timeText} πριν`;
      } else {
        minNotice.textContent = 'Επιλέξτε ημερομηνία & ώρα';
      }
    }

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
    const backBtn = $('#back-to-vehicles-from-booking');

    // Back button
    backBtn?.addEventListener('click', () => {
      // Hide warning when going back
      const nonTaxiWarning = $('#booking-non-taxi-warning');
      if (nonTaxiWarning) nonTaxiWarning.hidden = true;
      showStep('vehicles');
    });

    // Instant booking
    btnInstant?.addEventListener('click', () => {
      // Check if vehicle allows instant booking
      if (!selectedVehicle?.allow_instant) {
        // Show warning instead of proceeding
        const nonTaxiWarning = $('#booking-non-taxi-warning');
        if (nonTaxiWarning) {
          nonTaxiWarning.hidden = false;
          // Scroll to warning
          nonTaxiWarning.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
      selectedBookingType = 'instant';
      selectedDateTime = null;
      showConfirmation();
    });

    // Scheduled booking - show datetime picker
    btnScheduled?.addEventListener('click', () => {
      if (datetimePicker) {
        datetimePicker.hidden = false;
        
        // Set minimum date/time
        const now = new Date();
        const minAdvance = selectedVehicle?.min_advance_minutes || 0;
        const minDate = new Date(now.getTime() + minAdvance * 60000);
        
        // Set date input min to today
        if (dateInput) {
          dateInput.min = now.toISOString().split('T')[0];
          // Max date: 30 days from now
          const maxDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          dateInput.max = maxDate.toISOString().split('T')[0];
          dateInput.value = minDate.toISOString().split('T')[0];
        }
        
        // Set default time (rounded to next 30 min)
        if (timeInput) {
          const roundedMins = Math.ceil(minDate.getMinutes() / 30) * 30;
          minDate.setMinutes(roundedMins);
          const hours = String(minDate.getHours()).padStart(2, '0');
          const minutes = String(minDate.getMinutes()).padStart(2, '0');
          timeInput.value = `${hours}:${minutes}`;
        }
      }
      if (errorEl) errorEl.hidden = true;
    });

    // Confirm datetime
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

      // Validate minimum advance time
      const selectedDT = new Date(`${date}T${time}`);
      const now = new Date();
      const minAdvance = selectedVehicle?.min_advance_minutes || 0;
      const minAllowedTime = new Date(now.getTime() + minAdvance * 60000);

      if (selectedDT < minAllowedTime) {
        if (errorEl) {
          const hours = Math.floor(minAdvance / 60);
          const mins = minAdvance % 60;
          let timeText = '';
          if (hours > 0) timeText += `${hours} ώρ${hours === 1 ? 'α' : 'ες'}`;
          if (mins > 0) timeText += `${hours > 0 ? ' και ' : ''}${mins} λεπτά`;
          errorEl.textContent = `Η ώρα πρέπει να είναι τουλάχιστον ${timeText} από τώρα`;
          errorEl.hidden = false;
        }
        return;
      }

      // Valid - proceed
      selectedBookingType = 'scheduled';
      selectedDateTime = { date, time };
      showConfirmation();
    });
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
      const addrQuery = hotelAddress ? `${hotelAddress}, ${hotelMunicipality}`.trim().replace(/,\s*$/, '') : hotelName;
      if (addrQuery) {
        pickupMapsUrl = `https://maps.google.com/?q=${encodeURIComponent(addrQuery)}`;
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
  // DESTINATION QUICK-SEARCH
  // ========================================
  let allDestinations = []; // cached list for search
  let cameFromSearch = false; // track if user bypassed categories via search

  const initDestinationSearch = async () => {
    const searchInput = $('#dest-quick-search');
    const clearBtn = $('#dest-search-clear');
    const resultsList = $('#dest-search-results');
    if (!searchInput || !resultsList) return;

    // Fetch ALL active destinations (no category filter)
    const data = await api('/api/moveathens/destinations');
    if (!data?.destinations) return;
    allDestinations = data.destinations;

    // Build a category-id → name map from CONFIG
    const catMap = {};
    (CONFIG?.destinationCategories || []).forEach(c => { catMap[c.id] = c.name; });

    const showResults = (items, query) => {
      if (!items.length) {
        resultsList.innerHTML = `<li class="ma-dest-search-empty">Δεν βρέθηκε προορισμός για «${query}»</li>`;
        resultsList.hidden = false;
        return;
      }
      resultsList.innerHTML = items.map(d => `
        <li data-id="${d.id}" data-name="${d.name}">
          <span class="ma-dest-search-result-name">${d.name}</span>
          ${catMap[d.category_id] ? `<span class="ma-dest-search-result-cat">${catMap[d.category_id]}</span>` : ''}
        </li>
      `).join('');
      resultsList.hidden = false;

      // Click handlers
      resultsList.querySelectorAll('li[data-id]').forEach(li => {
        li.addEventListener('click', () => {
          selectedDestination = { id: li.dataset.id, name: li.dataset.name };
          cameFromSearch = true;
          // Clear search UI
          searchInput.value = '';
          clearBtn.hidden = true;
          resultsList.hidden = true;
          // Skip straight to tariff selection
          showTariffSelection();
        });
      });
    };

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      clearBtn.hidden = !q;
      if (!q) { resultsList.hidden = true; return; }
      const filtered = allDestinations.filter(d =>
        d.name.toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q)
      );
      showResults(filtered, searchInput.value.trim());
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.hidden = true;
      resultsList.hidden = true;
      searchInput.focus();
    });

    // Close results when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.ma-dest-search-wrapper')) {
        resultsList.hidden = true;
      }
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

    // Fallback CTAs (for no-zone warning)
    const phone = CONFIG?.whatsappNumber?.replace(/[^0-9+]/g, '') || '';
    const fallbackMessage = encodeURIComponent(
      'Χρειάζομαι βοήθεια — δεν έχω καταχωρήσει ακόμα το ξενοδοχείο μου στο MoveAthens.\n\n' +
      'Πώς μπορώ να περάσω το όνομα του ξενοδοχείου μου;'
    );
    if (ctaWhatsappFallback) ctaWhatsappFallback.href = `https://wa.me/${phone}?text=${fallbackMessage}`;
    if (ctaPhoneFallback) ctaPhoneFallback.href = `tel:${CONFIG?.phoneNumber || ''}`;

    // Load hotel context
    hotelContext = loadHotelContext();
    
    // Apply domain-aware home links
    if (window.MoveAthensConfig?.applyHomeLinks) {
      window.MoveAthensConfig.applyHomeLinks();
    }
    
    if (!hotelContext?.origin_zone_id) {
      // No zone - show warning
      showStep('noZone');
      return;
    }

    // Show categories
    await renderCategories();

    // Init quick-search for destinations
    await initDestinationSearch();

    // Back buttons
    $('#back-to-categories')?.addEventListener('click', () => {
      selectedCategory = null;
      showStep('categories');
    });

    // From tariff back: if user came from search, go back to categories (where the search is)
    $('#back-to-destinations-from-tariff')?.addEventListener('click', () => {
      selectedDestination = null;
      selectedTariff = null;
      if (cameFromSearch) {
        cameFromSearch = false;
        showStep('categories');
      } else {
        showStep('destinations');
      }
    });

    // From vehicles back to tariff
    $('#back-to-tariff')?.addEventListener('click', () => {
      selectedTariff = null;
      showStep('tariff');
    });

    $('#back-to-vehicles')?.addEventListener('click', () => {
      // Coming from confirm -> go back to booking type
      selectedBookingType = null;
      selectedDateTime = null;
      // Reset datetime picker state
      const datetimePicker = $('#booking-datetime-picker');
      if (datetimePicker) datetimePicker.hidden = true;
      showStep('bookingType');
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
