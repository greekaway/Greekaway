/**
 * MoveAthens Driver Accept — Hybrid Button Flow
 * 
 * Button flow:
 *   PRIMARY:   ✅ Αποδοχή → 🧭 Πλοήγηση (ξενοδοχείο) → 🧭 Πλοήγηση (τελικός προορισμός)
 *   SECONDARY: (hidden)   → 📍 Έφτασα (sends WhatsApp to hotel) → 🏁 Ολοκλήρωση Διαδρομής
 *
 * States: 'pending' → 'accepted' → 'arrived' → 'navigating_dest' → 'completed'
 */
(function() {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  const loading = document.getElementById('loading');
  const tripContent = document.getElementById('trip-content');
  const expiredContent = document.getElementById('expired-content');
  const tripDetails = document.getElementById('trip-details');
  const primaryBtn = document.getElementById('primary-btn');
  const secondaryBtn = document.getElementById('secondary-btn');
  const driverNameInput = document.getElementById('driver-name');
  const statusMsg = document.getElementById('status-msg');

  // Trip data stored after load
  let tripData = null;
  // Local UI state (persisted in sessionStorage per token)
  let uiState = 'pending'; // pending | accepted | arrived | navigating_dest | completed

  const STORAGE_KEY = 'ma_driver_state_' + token;

  function saveState() {
    try { sessionStorage.setItem(STORAGE_KEY, uiState); } catch (_) {}
  }
  function loadState() {
    try { return sessionStorage.getItem(STORAGE_KEY) || null; } catch (_) { return null; }
  }

  if (!token) {
    loading.classList.remove('show');
    expiredContent.style.display = 'block';
    return;
  }

  // ── Greeting based on local device time ──
  function getGreeting() {
    var h = new Date().getHours();
    if (h >= 5 && h < 12) return 'Καλημέρα σας,';
    return 'Καλησπέρα σας,';
  }

  // ── Open Google Maps navigation to coordinates or address ──
  function openNavigation(lat, lng, fallbackAddress) {
    var url;
    if (lat && lng) {
      url = 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng + '&travelmode=driving';
    } else if (fallbackAddress) {
      url = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(fallbackAddress) + '&travelmode=driving';
    } else {
      statusMsg.className = 'status error';
      statusMsg.textContent = 'Δεν υπάρχουν στοιχεία πλοήγησης.';
      return;
    }
    window.open(url, '_blank');
  }

  // ── Build WhatsApp "arrived" message to hotel ──
  function buildArrivedWhatsAppUrl() {
    if (!tripData || !tripData.hotel_phone) return null;
    var phone = tripData.hotel_phone.replace(/[^0-9+]/g, '').replace(/^\+/, '');
    if (!phone) return null;

    var greeting = getGreeting();
    var details = [];
    if (tripData.passenger_name) details.push('Επιβάτη: ' + tripData.passenger_name);
    details.push('Προορισμό: ' + (tripData.destination_name || '—'));
    if (tripData.room_number) details.push('Δωμάτιο: ' + tripData.room_number);
    var detailsText = details.join(' – ');

    var msg = greeting + '\n\n' +
      'Είμαι ο οδηγός που έχει αναλάβει ' + detailsText + '.\n\n' +
      'Έχω φτάσει στο σημείο παραλαβής. Βρίσκομαι έξω και είμαι έτοιμος για αναχώρηση.\n\n' +
      'Παρακαλώ ενημερώστε τον ότι τον περιμένω.\n\n' +
      'Ευχαριστώ πολύ.';

    return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(msg);
  }

  // ── Update button states ──
  function applyUIState() {
    switch (uiState) {
      case 'pending':
        primaryBtn.textContent = '✅ Αποδοχή Διαδρομής';
        primaryBtn.className = 'btn btn-accept';
        primaryBtn.disabled = false;
        primaryBtn.style.cssText = '';
        driverNameInput.style.display = '';
        secondaryBtn.style.display = 'none';
        break;

      case 'accepted':
        primaryBtn.textContent = '🧭 Πλοήγηση προς Ξενοδοχείο';
        primaryBtn.className = 'btn btn-navigate';
        primaryBtn.disabled = false;
        primaryBtn.style.cssText = '';
        driverNameInput.style.display = 'none';
        secondaryBtn.style.display = 'block';
        secondaryBtn.textContent = '📍 Έφτασα';
        secondaryBtn.className = 'btn btn-arrived';
        secondaryBtn.disabled = false;
        break;

      case 'arrived':
        // After "arrived" is pressed, primary becomes "navigate to destination"
        primaryBtn.textContent = '🧭 Πλοήγηση προς Τελικό Προορισμό';
        primaryBtn.className = 'btn btn-navigate';
        primaryBtn.disabled = false;
        primaryBtn.style.cssText = '';
        driverNameInput.style.display = 'none';
        secondaryBtn.style.display = 'block';
        secondaryBtn.textContent = '🏁 Ολοκλήρωση Διαδρομής';
        secondaryBtn.className = 'btn btn-complete';
        secondaryBtn.style.display = 'block';
        secondaryBtn.disabled = false;
        break;

      case 'completed':
        primaryBtn.textContent = '🧭 Πλοήγηση (ολοκληρωμένη)';
        primaryBtn.className = 'btn btn-navigate';
        primaryBtn.disabled = true;
        primaryBtn.style.background = '#dbeafe';
        primaryBtn.style.color = '#1e40af';
        driverNameInput.style.display = 'none';
        secondaryBtn.style.display = 'block';
        secondaryBtn.textContent = '🏁 Ολοκληρωμένη';
        secondaryBtn.className = 'btn btn-complete btn-completed';
        secondaryBtn.disabled = true;
        break;
    }
  }

  // ── Load trip data ──
  async function loadTrip() {
    try {
      var res = await fetch('/api/moveathens/driver-accept/' + token);
      if (res.status === 404 || res.status === 410) {
        loading.classList.remove('show');
        expiredContent.style.display = 'block';
        return;
      }
      var data = await res.json();
      if (!res.ok) {
        loading.classList.remove('show');
        expiredContent.style.display = 'block';
        return;
      }

      tripData = data;

      // Determine initial UI state from server status + local storage
      var savedState = loadState();

      if (data.status === 'completed') {
        uiState = 'completed';
      } else if (data.status === 'accepted' || data.status === 'confirmed') {
        // Server says accepted — check if driver had progressed further locally
        if (savedState === 'arrived' || savedState === 'navigating_dest') {
          uiState = savedState;
        } else {
          uiState = 'accepted';
        }
      } else {
        uiState = 'pending';
      }

      renderTrip(data);
      applyUIState();

      if (uiState === 'accepted' || uiState === 'arrived') {
        statusMsg.className = 'status ok';
        statusMsg.textContent = 'Καλή διαδρομή!';
      }
    } catch (err) {
      loading.classList.remove('show');
      statusMsg.className = 'status error';
      statusMsg.textContent = 'Σφάλμα φόρτωσης. Δοκίμασε ξανά.';
    }
  }

  // ── Render trip details ──
  function renderTrip(data) {
    var tariffLabel = data.tariff === 'night' ? '🌙 Νυχτερινή' : '☀️ Ημερήσια';
    var schedule = data.booking_type === 'instant' ? '⚡ Άμεσα' : '';
    if (data.scheduled_date) {
      var dayNames = ['Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο'];
      var monthNames = ['Ιανουαρίου','Φεβρουαρίου','Μαρτίου','Απριλίου','Μαΐου','Ιουνίου','Ιουλίου','Αυγούστου','Σεπτεμβρίου','Οκτωβρίου','Νοεμβρίου','Δεκεμβρίου'];
      var dt = new Date(data.scheduled_date + 'T' + (data.scheduled_time || '00:00'));
      var dayName = dayNames[dt.getDay()];
      var monthName = monthNames[dt.getMonth()];
      var tStr = '';
      if (data.scheduled_time) {
        var parts = data.scheduled_time.split(':');
        var h = parseInt(parts[0], 10);
        var mm = parts[1];
        var suffix = h < 12 ? 'πμ' : 'μμ';
        var h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        tStr = ' ώρα ' + h12 + ':' + mm + ' ' + suffix;
      }
      schedule = '📅 ' + dayName + ' ' + dt.getDate() + ', ' + monthName + tStr;
    }

    // ── Section: Route ──
    var sections = [];
    sections.push({ type: 'title', text: 'Διαδρομή' });
    sections.push({ icon: '🎯', label: 'Προορισμός', value: data.destination_name || '—' });
    sections.push({ icon: '🚘', label: 'Όχημα', value: data.vehicle_name || '—' });
    sections.push({ icon: '⏰', label: 'Χρόνος', value: schedule || tariffLabel });
    sections.push({ icon: '💳', label: 'Πληρωμή', value: data.payment_method === 'pos' ? 'POS' : 'Μετρητά' });

    // ── Section: Hotel ──
    sections.push({ type: 'divider' });
    sections.push({ type: 'title', text: 'Ξενοδοχείο' });
    sections.push({ icon: '🏨', label: 'Όνομα', value: data.hotel_name || '—' });
    if (data.hotel_municipality) {
      sections.push({ icon: '📌', label: 'Δήμος', value: data.hotel_municipality });
    }
    if (data.hotel_address) {
      sections.push({ icon: '📍', label: 'Διεύθυνση', value: data.hotel_address });
    }

    // ── Section: Passengers ──
    sections.push({ type: 'divider' });
    sections.push({ type: 'title', text: 'Επιβάτες & Αποσκευές' });
    if (data.passenger_name) {
      sections.push({ icon: '👤', label: 'Όνομα', value: data.passenger_name });
    }
    if (data.room_number) {
      sections.push({ icon: '🚪', label: 'Δωμάτιο', value: data.room_number });
    }
    sections.push({ icon: '👥', label: 'Άτομα', value: data.passengers || '—' });
    var luggageParts = [];
    if (data.luggage_large > 0) luggageParts.push(data.luggage_large + ' μεγάλ.');
    if (data.luggage_medium > 0) luggageParts.push(data.luggage_medium + ' μεσαί.');
    if (data.luggage_cabin > 0) luggageParts.push(data.luggage_cabin + ' χειρ.');
    sections.push({ icon: '🧳', label: 'Αποσκευές', value: luggageParts.length ? luggageParts.join(', ') : '—' });

    // Render rows
    tripDetails.innerHTML = sections.map(function(r) {
      if (r.type === 'divider') return '<div class="section-divider"></div>';
      if (r.type === 'title') return '<div class="section-title">' + r.text + '</div>';
      return '<div class="trip-row">' +
        '<span class="icon">' + r.icon + '</span>' +
        '<span class="label">' + r.label + '</span>' +
        '<span class="value">' + r.value + '</span>' +
      '</div>';
    }).join('');

    // ── Price cards ──
    var price = parseFloat(data.price || 0);
    var driverCut = parseFloat(data.commission_driver || 0);
    var hotelCut = parseFloat(data.commission_hotel || 0);
    var serviceCut = parseFloat(data.commission_service || 0);

    document.getElementById('price-grid').innerHTML =
      '<div class="price-card driver" style="grid-column:1/-1">' +
        '<div class="pc-label">💶 Η αμοιβή σου</div>' +
        '<div class="pc-value">€' + driverCut.toFixed(0) + '</div>' +
      '</div>' +
      '<div class="price-card">' +
        '<div class="pc-label">💰 Συνολ. Χρέωση</div>' +
        '<div class="pc-value">€' + price.toFixed(0) + '</div>' +
      '</div>' +
      '<div class="price-card hotel">' +
        '<div class="pc-label">🏨 Ξενοδόχος</div>' +
        '<div class="pc-value">€' + hotelCut.toFixed(0) + '</div>' +
      '</div>' +
      '<div class="price-card service">' +
        '<div class="pc-label">🔧 Υπηρεσία</div>' +
        '<div class="pc-value">€' + serviceCut.toFixed(0) + '</div>' +
      '</div>';

    loading.classList.remove('show');
    tripContent.style.display = 'block';
  }

  // ── PRIMARY BUTTON handler ──
  primaryBtn.addEventListener('click', async function() {
    if (uiState === 'pending') {
      // ── ACCEPT the trip ──
      primaryBtn.disabled = true;
      primaryBtn.textContent = 'Αποστολή…';
      statusMsg.className = 'status';
      statusMsg.textContent = '';

      try {
        var res = await fetch('/api/moveathens/driver-accept/' + token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driver_name: driverNameInput.value.trim() })
        });
        var data = await res.json();

        if (res.ok && (data.ok || data.already)) {
          uiState = 'accepted';
          saveState();
          applyUIState();
          statusMsg.className = 'status ok';
          statusMsg.textContent = 'Αποδέχτηκες τη διαδρομή! Πάτα πλοήγηση για να πας στο ξενοδοχείο.';
        } else {
          statusMsg.className = 'status error';
          statusMsg.textContent = data.error || 'Σφάλμα. Δοκίμασε ξανά.';
          primaryBtn.disabled = false;
          primaryBtn.textContent = '✅ Αποδοχή Διαδρομής';
        }
      } catch (err) {
        statusMsg.className = 'status error';
        statusMsg.textContent = 'Σφάλμα σύνδεσης.';
        primaryBtn.disabled = false;
        primaryBtn.textContent = '✅ Αποδοχή Διαδρομής';
      }

    } else if (uiState === 'accepted') {
      // ── NAVIGATE TO HOTEL ──
      // Use hotel address for navigation (hotels don't have lat/lng yet)
      var hotelAddr = '';
      if (tripData.hotel_name) hotelAddr += tripData.hotel_name;
      if (tripData.hotel_address) hotelAddr += ', ' + tripData.hotel_address;
      if (tripData.hotel_municipality) hotelAddr += ', ' + tripData.hotel_municipality;
      openNavigation(null, null, hotelAddr || 'Athens');

    } else if (uiState === 'arrived') {
      // ── NAVIGATE TO FINAL DESTINATION ──
      openNavigation(
        tripData.destination_lat,
        tripData.destination_lng,
        tripData.destination_name
      );
    }
  });

  // ── SECONDARY BUTTON handler ──
  secondaryBtn.addEventListener('click', async function() {
    if (uiState === 'accepted') {
      // ── ARRIVED at hotel → send WhatsApp to hotel ──
      var waUrl = buildArrivedWhatsAppUrl();
      if (waUrl) {
        window.open(waUrl, '_blank');
      } else {
        statusMsg.className = 'status info';
        statusMsg.textContent = 'Δεν βρέθηκε τηλέφωνο ξενοδοχείου για WhatsApp.';
      }

      // Transition to "arrived" state
      uiState = 'arrived';
      saveState();
      applyUIState();
      statusMsg.className = 'status ok';
      statusMsg.textContent = 'Ενημέρωσες τον ξενοδόχο! Πάτα πλοήγηση για τον τελικό προορισμό.';

    } else if (uiState === 'arrived') {
      // ── COMPLETE the trip ──
      secondaryBtn.disabled = true;
      secondaryBtn.textContent = 'Αποστολή…';

      try {
        var res = await fetch('/api/moveathens/driver-complete/' + token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        var data = await res.json();

        if (res.ok && data.ok) {
          uiState = 'completed';
          saveState();
          applyUIState();
          statusMsg.className = 'status ok';
          statusMsg.textContent = 'Η διαδρομή ολοκληρώθηκε. Ευχαριστούμε!';
        } else {
          statusMsg.className = 'status error';
          statusMsg.textContent = data.error || 'Σφάλμα. Δοκίμασε ξανά.';
          secondaryBtn.disabled = false;
          secondaryBtn.textContent = '🏁 Ολοκλήρωση Διαδρομής';
        }
      } catch (err) {
        statusMsg.className = 'status error';
        statusMsg.textContent = 'Σφάλμα σύνδεσης.';
        secondaryBtn.disabled = false;
        secondaryBtn.textContent = '🏁 Ολοκλήρωση Διαδρομής';
      }
    }
  });

  loadTrip();
})();
