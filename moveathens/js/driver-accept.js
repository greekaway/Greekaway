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
  const nameError = document.getElementById('name-error');
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
    var phone = tripData.hotel_phone.replace(/[^0-9+]/g, '');
    if (!phone) return null;
    // Ensure country code: if starts with +30 strip +, if starts with 69… prepend 30
    if (phone.charAt(0) === '+') {
      phone = phone.substring(1);
    }
    if (/^69/.test(phone) || /^21/.test(phone) || /^22/.test(phone)) {
      phone = '30' + phone;
    }
    if (!phone) return null;

    var greeting = getGreeting();
    var details = [];
    if (tripData.passenger_name) details.push('Επιβάτη: ' + tripData.passenger_name);
    if (tripData.is_arrival) {
      details.push('Αφετηρία: ' + (tripData.destination_name || '—'));
      details.push('Προορισμό: ' + (tripData.hotel_name || '—'));
    } else {
      details.push('Προορισμό: ' + (tripData.destination_name || '—'));
    }
    if (tripData.room_number) details.push('Δωμάτιο: ' + tripData.room_number);
    var detailsText = details.join(' – ');

    var msg;
    if (tripData.is_arrival) {
      msg = greeting + '\n\n' +
        'Είμαι ο οδηγός που έχει αναλάβει ' + detailsText + '.\n\n' +
        'Έχω φτάσει στο σημείο παραλαβής (' + (tripData.destination_name || '—') + '). Βρίσκομαι εδώ κι έτοιμος να παραλάβω τον επιβάτη.\n\n' +
        'Ευχαριστώ πολύ.';
    } else {
      msg = greeting + '\n\n' +
        'Είμαι ο οδηγός που έχει αναλάβει ' + detailsText + '.\n\n' +
        'Έχω φτάσει στο σημείο παραλαβής. Βρίσκομαι έξω και είμαι έτοιμος για αναχώρηση.\n\n' +
        'Παρακαλώ ενημερώστε τον ότι τον περιμένω.\n\n' +
        'Ευχαριστώ πολύ.';
    }

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
        if (tripData && tripData.is_arrival) {
          primaryBtn.textContent = '🧭 Πλοήγηση προς Σημείο Παραλαβής';
        } else {
          primaryBtn.textContent = '🧭 Πλοήγηση προς Ξενοδοχείο';
        }
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
        // After "arrived" is pressed, primary becomes navigate to final point
        if (tripData && tripData.is_arrival) {
          primaryBtn.textContent = '🧭 Πλοήγηση προς Ξενοδοχείο';
        } else {
          primaryBtn.textContent = '🧭 Πλοήγηση προς Τελικό Προορισμό';
        }
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
    // If flight has ETA, ALWAYS override "Άμεσα" with the arrival time (regardless of landed status)
    if (data.flight_eta) {
      var etaDt = new Date(data.flight_eta);
      if (!isNaN(etaDt.getTime())) {
        var etaStr = etaDt.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Athens' });
        if (data.flight_status === 'landed') {
          schedule = '✅ Προσγειώθηκε — ETA: ' + etaStr;
        } else {
          schedule = '📅 ETA πτήσης: ' + etaStr;
        }
      }
    }
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

    // Driver must always enter their name manually – no pre-fill

    // ── Section: Route ──
    var sections = [];
    sections.push({ type: 'title', text: 'Διαδρομή' });
    if (data.is_arrival) {
      sections.push({ icon: '✈️', label: 'Παραλαβή', value: data.destination_name || '—' });
      sections.push({ icon: '🏨', label: 'Προορισμός', value: data.hotel_name || '—' });
    } else {
      sections.push({ icon: '🎯', label: 'Προορισμός', value: data.destination_name || '—' });
    }
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
    if (data.flight_number) {
      sections.push({ icon: '🛫', label: 'Δρομολόγιο', value: data.flight_number + (data.flight_airline ? ' (' + data.flight_airline + ')' : '') });
    }

    // ── Flight tracking live status (arrival only) — with progress bar ──
    if (data.flight_number && data.is_arrival) {
      sections.push({ type: 'divider' });
      sections.push({ type: 'title', text: '✈️ Live Πτήση' });

      // Build progress bar HTML (no extra API calls — pure math from departure+ETA times)
      var depISO = data.flight_departure || '';
      var etaISO = data.flight_eta || '';
      var originCode = data.flight_origin || '';
      var flightSt = data.flight_status || 'scheduled';

      // Status label
      var statusLabels = {
        scheduled: 'Προγρ/μένη', en_route: 'Σε πτήση ✈️',
        landed: 'Προσγειώθηκε ✅', cancelled: 'Ακυρώθηκε ❌', diverted: 'Εκτράπηκε ⚠️'
      };
      var statusLabel = statusLabels[flightSt] || 'Tracking';

      // Format times for display (Athens timezone)
      var depTimeStr = '—';
      var arrTimeStr = '—';
      if (depISO) {
        depTimeStr = new Date(depISO).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Athens' });
      }
      if (etaISO) {
        arrTimeStr = new Date(etaISO).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Athens' });
      }

      // Calculate progress percentage (simple math)
      var progressPct = 0;
      if (flightSt === 'landed') {
        progressPct = 100;
      } else if (flightSt === 'en_route' && depISO && etaISO) {
        var now = Date.now();
        var depMs = new Date(depISO).getTime();
        var etaMs = new Date(etaISO).getTime();
        var total = etaMs - depMs;
        if (total > 0) {
          progressPct = Math.min(98, Math.max(2, ((now - depMs) / total) * 100));
        }
      } else if (flightSt === 'cancelled') {
        progressPct = 0;
      }

      var gateInfo = '';
      if (data.flight_gate) gateInfo += 'Gate ' + data.flight_gate;
      if (data.flight_terminal) gateInfo += (gateInfo ? ' · ' : '') + 'Terminal ' + data.flight_terminal;

      // Format dates for FlightAware-style display
      var depDateStr = '—';
      var arrDateStr = '—';
      if (depISO) {
        var depDt = new Date(depISO);
        var depDay = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][depDt.getDay()];
        var depMon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][depDt.getMonth()];
        depDateStr = depDay + ', ' + String(depDt.getDate()).padStart(2,'0') + ' ' + depMon + ' ' + depDt.getFullYear();
      }
      if (etaISO) {
        var arrDtF = new Date(etaISO);
        var arrDay = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][arrDtF.getDay()];
        var arrMon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][arrDtF.getMonth()];
        arrDateStr = arrDay + ', ' + String(arrDtF.getDate()).padStart(2,'0') + ' ' + arrMon + ' ' + arrDtF.getFullYear();
      }

      // Origin airport name from flight_origin (e.g. "Corfu" or "Κέρκυρα")
      var originFullName = data.flight_origin || originCode || '—';
      var depGateStr = 'Gate --';  // We don't have origin gate info
      var arrGateStr = data.flight_gate ? 'Gate ' + data.flight_gate : 'Gate --';
      var arrTermStr = data.flight_terminal ? 'Terminal ' + data.flight_terminal : '';

      var progressHtml = '<div class="flight-progress-wrap" id="flight-progress-wrap">' +
        '<div class="fp-status-bar"><span class="fp-status ' + flightSt + '">' + statusLabel + '</span></div>' +
        '<div class="fp-route-label">' + (originCode || '—') + ' → ATH</div>' +
        '<div class="flight-progress-track" id="flight-progress-track">' +
          '<div class="flight-progress-fill" id="flight-progress-fill" style="width:' + progressPct + '%"></div>' +
          '<span class="flight-progress-plane" id="flight-progress-plane" style="left:' + progressPct + '%">✈️</span>' +
        '</div>' +
        '<div class="fp-details-grid">' +
          '<div class="fp-col fp-col-left">' +
            '<div class="fp-col-date">' + depDateStr + '</div>' +
            '<div class="fp-col-gate">' + depGateStr + '</div>' +
            '<div class="fp-col-time">' + depTimeStr + '</div>' +
            '<div class="fp-col-airport">' + originFullName + '</div>' +
            '<div class="fp-col-code">' + (originCode || '—') + '</div>' +
          '</div>' +
          '<div class="fp-col fp-col-right">' +
            '<div class="fp-col-date">' + arrDateStr + '</div>' +
            '<div class="fp-col-gate">' + (arrTermStr ? arrTermStr + ' · ' + arrGateStr : arrGateStr) + '</div>' +
            '<div class="fp-col-time">' + arrTimeStr + '</div>' +
            '<div class="fp-col-airport">Athens Int\'l, Eleftherios Venizelos</div>' +
            '<div class="fp-col-code">ATH</div>' +
          '</div>' +
        '</div>' +
      '</div>';

      sections.push({ type: 'custom', html: progressHtml });
    }

    if (data.room_number) {
      sections.push({ icon: '🚪', label: 'Δωμάτιο', value: data.room_number });
    }
    if (data.notes) {
      sections.push({ icon: '📝', label: 'Σημειώσεις', value: data.notes });
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
      if (r.type === 'custom') return r.html;
      var idAttr = r.id ? ' id="' + r.id + '"' : '';
      return '<div class="trip-row"' + idAttr + '>' +
        '<span class="icon">' + r.icon + '</span>' +
        '<span class="label">' + r.label + '</span>' +
        '<span class="value">' + r.value + '</span>' +
      '</div>';
    }).join('');

    // ── Update flight progress bar ──
    updateFlightProgress(data);

    // ── Start flight status polling (every 60s) for arrival flights ──
    if (data.is_arrival && data.flight_number) {
      startFlightPolling();
      startProgressAnimation(); // animate plane every 30s (no API calls)
    }

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
        '<div class="pc-label">🏨 Ξενοδοχείο</div>' +
        '<div class="pc-value">€' + hotelCut.toFixed(0) + '</div>' +
      '</div>' +
      '<div class="price-card service">' +
        '<div class="pc-label">🔧 Υπηρεσία</div>' +
        '<div class="pc-value">€' + serviceCut.toFixed(0) + '</div>' +
      '</div>' +
      '<div class="iris-notice" style="grid-column:1/-1">' +
        '<span class="iris-icon">🏦</span>' +
        '<div>' +
          'Η προμήθεια υπηρεσίας <strong>€' + serviceCut.toFixed(0) + '</strong> πληρώνεται με <strong>IRIS</strong> στο: ' +
          (function() {
            var ph = (data.iris_phone || '').replace(/[^0-9+]/g, '');
            var display = (data.iris_phone || '').trim();
            if (!ph) return '<em>Δεν έχει οριστεί</em>';
            return '<span class="iris-phone" id="iris-phone" onclick="(function(el){navigator.clipboard.writeText(\'' + ph + '\');var t=el.querySelector(\'.__cp\');if(t){t.style.opacity=1;setTimeout(function(){t.style.opacity=0},1500)}})(this)">' + display + '<span class="iris-copied __cp"> ✓ copied</span></span>';
          })() +
        '</div>' +
      '</div>';

    loading.classList.remove('show');
    tripContent.style.display = 'block';
  }

  // ── PRIMARY BUTTON handler ──
  primaryBtn.addEventListener('click', async function() {
    if (uiState === 'pending') {
      // ── Require name before accept ──
      if (!driverNameInput.value.trim()) {
        driverNameInput.classList.add('error-border', 'shake');
        nameError.classList.add('show');
        driverNameInput.focus();
        driverNameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(function() { driverNameInput.classList.remove('shake'); }, 600);
        return;
      }
      nameError.classList.remove('show');
      driverNameInput.classList.remove('error-border');

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
          if (tripData && tripData.is_arrival) {
            statusMsg.textContent = 'Αποδέχτηκες τη διαδρομή! Πάτα πλοήγηση για να πας στο σημείο παραλαβής.';
          } else {
            statusMsg.textContent = 'Αποδέχτηκες τη διαδρομή! Πάτα πλοήγηση για να πας στο ξενοδοχείο.';
          }
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
      // ── NAVIGATE TO FIRST POINT ──
      if (tripData.is_arrival) {
        // Arrival: navigate to destination (airport/port) first
        openNavigation(
          tripData.destination_lat,
          tripData.destination_lng,
          tripData.destination_name
        );
      } else {
        // Departure: navigate to hotel first
        var hotelAddr = '';
        if (tripData.hotel_name) hotelAddr += tripData.hotel_name;
        if (tripData.hotel_address) hotelAddr += ', ' + tripData.hotel_address;
        if (tripData.hotel_municipality) hotelAddr += ', ' + tripData.hotel_municipality;
        openNavigation(null, null, hotelAddr || 'Athens');
      }

    } else if (uiState === 'arrived') {
      // ── NAVIGATE TO SECOND POINT ──
      // Record navigating_dest_at on server (fire-and-forget)
      fetch('/api/moveathens/driver-navigating/' + token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(function() {});

      if (tripData.is_arrival) {
        // Arrival: second point is the hotel
        var hotelAddr2 = '';
        if (tripData.hotel_name) hotelAddr2 += tripData.hotel_name;
        if (tripData.hotel_address) hotelAddr2 += ', ' + tripData.hotel_address;
        if (tripData.hotel_municipality) hotelAddr2 += ', ' + tripData.hotel_municipality;
        openNavigation(null, null, hotelAddr2 || 'Athens');
      } else {
        // Departure: second point is the destination
        openNavigation(
          tripData.destination_lat,
          tripData.destination_lng,
          tripData.destination_name
        );
      }
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

      // Record arrived_at on server (fire-and-forget)
      fetch('/api/moveathens/driver-arrived/' + token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(function() {});

      // Transition to "arrived" state
      uiState = 'arrived';
      saveState();
      applyUIState();
      statusMsg.className = 'status ok';
      if (tripData && tripData.is_arrival) {
        statusMsg.textContent = 'Παρέλαβες τον επιβάτη! Πάτα πλοήγηση για το ξενοδοχείο.';
      } else {
        statusMsg.textContent = 'Ενημέρωσες τον ξενοδόχο! Πάτα πλοήγηση για τον τελικό προορισμό.';
      }

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

  // Clear name error when user starts typing
  driverNameInput.addEventListener('input', function() {
    if (driverNameInput.value.trim()) {
      nameError.classList.remove('show');
      driverNameInput.classList.remove('error-border');
    }
  });

  // ── Flight progress bar updater (no extra API calls — pure math) ──
  function updateFlightProgress(data) {
    var wrap = document.getElementById('flight-progress-wrap');
    if (!wrap) return;

    var st = data.flight_status || '';
    var depISO = data.flight_departure || '';
    var etaISO = data.flight_eta || '';

    // Update status badge
    var statusEl = wrap.querySelector('.fp-status');
    if (statusEl) {
      var statusLabels = {
        scheduled: 'Προγρ/μένη', en_route: 'Σε πτήση ✈️',
        landed: 'Προσγειώθηκε ✅', cancelled: 'Ακυρώθηκε ❌', diverted: 'Εκτράπηκε ⚠️'
      };
      statusEl.textContent = statusLabels[st] || 'Tracking';
      statusEl.className = 'fp-status ' + st;
    }

    // Calculate progress
    var progressPct = 0;
    if (st === 'landed') {
      progressPct = 100;
    } else if (st === 'en_route' && depISO && etaISO) {
      var now = Date.now();
      var depMs = new Date(depISO).getTime();
      var etaMs = new Date(etaISO).getTime();
      var total = etaMs - depMs;
      if (total > 0) {
        progressPct = Math.min(98, Math.max(2, ((now - depMs) / total) * 100));
      }
    }

    // Animate fill + plane
    var fill = document.getElementById('flight-progress-fill');
    var plane = document.getElementById('flight-progress-plane');
    if (fill) fill.style.width = progressPct + '%';
    if (plane) plane.style.left = progressPct + '%';

    // Update arrival time in right column
    var rightTimeEl = wrap.querySelector('.fp-col-right .fp-col-time');
    if (rightTimeEl && etaISO) {
      rightTimeEl.textContent = new Date(etaISO).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Athens' });
    }

    // Update departure time in left column
    var leftTimeEl = wrap.querySelector('.fp-col-left .fp-col-time');
    if (leftTimeEl && depISO) {
      leftTimeEl.textContent = new Date(depISO).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Athens' });
    }

    // Update gate info in right column
    var rightGateEl = wrap.querySelector('.fp-col-right .fp-col-gate');
    if (rightGateEl) {
      var gInfo = '';
      if (data.flight_terminal) gInfo += 'Terminal ' + data.flight_terminal;
      if (data.flight_gate) gInfo += (gInfo ? ' · ' : '') + 'Gate ' + data.flight_gate;
      if (gInfo) rightGateEl.textContent = gInfo;
    }
  }

  // ── Client-side progress animation (updates every 30s, no API calls) ──
  var progressAnimTimer = null;

  function startProgressAnimation() {
    if (progressAnimTimer) return;
    progressAnimTimer = setInterval(function() {
      if (!tripData) return;
      // Re-calculate progress using current time (no network calls)
      updateFlightProgress(tripData);
    }, 30 * 1000); // every 30s
  }

  // ── Flight status polling (every 60s) ──
  var flightPollTimer = null;

  function startFlightPolling() {
    if (flightPollTimer) return; // already running
    flightPollTimer = setInterval(pollFlightStatus, 60 * 1000);
  }

  async function pollFlightStatus() {
    if (!token) return;
    if (uiState === 'completed') {
      clearInterval(flightPollTimer);
      return;
    }
    try {
      var res = await fetch('/api/moveathens/flight-status/' + token);
      if (!res.ok) return;
      var data = await res.json();

      // Update progress bar
      updateFlightProgress(data);

      // Also update tripData so progress animation uses latest ETA
      if (tripData) {
        tripData.flight_status = data.flight_status;
        tripData.flight_eta = data.flight_eta;
        tripData.flight_departure = data.flight_departure;
        tripData.flight_actual_arrival = data.flight_actual_arrival;
        tripData.flight_gate = data.flight_gate;
        tripData.flight_terminal = data.flight_terminal;
      }

      // If landed, stop polling + animation
      if (data.flight_status === 'landed') {
        clearInterval(flightPollTimer);
        if (progressAnimTimer) { clearInterval(progressAnimTimer); progressAnimTimer = null; }
        flightPollTimer = null;
      }
    } catch (_) {
      // Silent fail — next poll will retry
    }
  }

  loadTrip();
})();
