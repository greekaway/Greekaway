(async () => {
  // Apply domain-aware home links
  if (window.MoveAthensConfig?.applyHomeLinks) {
    window.MoveAthensConfig.applyHomeLinks();
  }

  const cfg = await window.MoveAthensConfig.load();

  // DOM refs
  const loginSection = document.getElementById('hotel-login-section');
  const infoSection  = document.getElementById('hotel-info-section');
  const phoneLogin   = document.getElementById('hotel-phone-login');
  const loginBtn     = document.getElementById('hotel-login-btn');
  const loginError   = document.getElementById('hotel-login-error');
  const logoutBtn    = document.getElementById('hotel-logout-btn');
  const displayName  = document.getElementById('hotel-display-name');
  const connectedPhone = document.getElementById('hotel-connected-phone');
  const phonesList   = document.getElementById('hotel-phones-list');
  const municipalityInput = document.querySelector('[data-ma-hotel-input="municipality"]');
  const addressInput      = document.querySelector('[data-ma-hotel-input="address"]');
  const emailInput        = document.querySelector('[data-ma-hotel-input="email"]');
  const accTypeInput      = document.querySelector('[data-ma-hotel-input="accommodation_type"]');

  const accommodationLabels = {
    hotel: 'Ξενοδοχείο',
    rental_rooms: 'Ενοικιαζόμενα Δωμάτια'
  };

  // ── Show login or info based on stored session ──
  const showLogin = () => {
    if (loginSection) loginSection.style.display = '';
    if (infoSection) infoSection.style.display = 'none';
    if (loginError) { loginError.style.display = 'none'; loginError.textContent = ''; }
  };

  const showInfo = (zone, phones, myPhone) => {
    if (loginSection) loginSection.style.display = 'none';
    if (infoSection) infoSection.style.display = '';
    if (displayName) displayName.textContent = zone.name || '';
    if (municipalityInput) municipalityInput.value = zone.municipality || '';
    if (addressInput) addressInput.value = zone.address || '';
    if (emailInput) emailInput.value = zone.email || '';
    if (accTypeInput) accTypeInput.value = accommodationLabels[zone.accommodation_type] || 'Ξενοδοχείο';
    if (connectedPhone) connectedPhone.value = myPhone || '';

    // Show all phones (read-only)
    if (phonesList) {
      phonesList.innerHTML = (phones || []).map(p =>
        `<span style="background:rgba(255,255,255,0.1);padding:0.4rem 0.75rem;border-radius:20px;font-size:0.9rem;">📱 ${p.phone}${p.label ? ' <small style="opacity:0.6;">(' + p.label + ')</small>' : ''}</span>`
      ).join('');
    }
  };

  // ── Persist hotel to localStorage (for transfer flow) ──
  const persistHotel = (zone, myPhone) => {
    const obj = {
      origin_zone_id:     zone.id || '',
      origin_zone_name:   zone.name || '',
      hotelName:          zone.name || '',
      municipality:       zone.municipality || '',
      address:            zone.address || '',
      phone:              myPhone || '',
      email:              zone.email || '',
      accommodation_type: zone.accommodation_type || '',
      lat:                zone.lat != null ? zone.lat : null,
      lng:                zone.lng != null ? zone.lng : null,
      orderer_phone:      myPhone || ''
    };
    localStorage.setItem('moveathens_hotel', JSON.stringify(obj));
    // Legacy keys for compatibility
    localStorage.setItem('moveathens_hotel_zone_id', obj.origin_zone_id);
    localStorage.setItem('moveathens_hotel_zone', obj.origin_zone_name);
    localStorage.setItem('moveathens_hotel_address', obj.address);
    localStorage.setItem('moveathens_hotel_email', obj.email);
  };

  // ── Login via phone ──
  const doLogin = async (phone) => {
    if (!phone || phone.length < 5) {
      if (loginError) { loginError.textContent = 'Εισάγετε ένα έγκυρο τηλέφωνο.'; loginError.style.display = ''; }
      return;
    }
    try {
      const res = await fetch(`/api/moveathens/hotel-by-phone?phone=${encodeURIComponent(phone)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 404) {
          if (loginError) { loginError.textContent = 'Το τηλέφωνο δεν βρέθηκε. Επικοινωνήστε με τη διαχείριση.'; loginError.style.display = ''; }
        } else {
          if (loginError) { loginError.textContent = err.error || 'Σφάλμα σύνδεσης.'; loginError.style.display = ''; }
        }
        return;
      }
      const data = await res.json();
      persistHotel(data.zone, phone);
      showInfo(data.zone, data.phones, phone);
    } catch (e) {
      if (loginError) { loginError.textContent = 'Σφάλμα σύνδεσης. Δοκιμάστε ξανά.'; loginError.style.display = ''; }
    }
  };

  // ── Login button ──
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      const phone = (phoneLogin?.value || '').trim();
      doLogin(phone);
    });
  }

  // ── Enter key on phone input ──
  if (phoneLogin) {
    phoneLogin.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const phone = phoneLogin.value.trim();
        doLogin(phone);
      }
    });
  }

  // ── Logout ──
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('moveathens_hotel');
      localStorage.removeItem('moveathens_hotel_zone_id');
      localStorage.removeItem('moveathens_hotel_zone');
      localStorage.removeItem('moveathens_hotel_address');
      localStorage.removeItem('moveathens_hotel_email');
      if (phoneLogin) phoneLogin.value = '';
      showLogin();
    });
  }

  // ── Restore session from localStorage on load ──
  const stored = (() => {
    try { return JSON.parse(localStorage.getItem('moveathens_hotel') || 'null'); } catch { return null; }
  })();

  if (stored && stored.orderer_phone && stored.origin_zone_id) {
    // Re-verify phone is still valid
    try {
      const res = await fetch(`/api/moveathens/hotel-by-phone?phone=${encodeURIComponent(stored.orderer_phone)}`);
      if (res.ok) {
        const data = await res.json();
        // Refresh stored data with latest from server
        persistHotel(data.zone, stored.orderer_phone);
        showInfo(data.zone, data.phones, stored.orderer_phone);
      } else {
        // Phone no longer valid — force re-login
        showLogin();
      }
    } catch {
      // Offline — show stored data
      showInfo({
        name: stored.hotelName || stored.origin_zone_name,
        municipality: stored.municipality,
        address: stored.address,
        email: stored.email,
        accommodation_type: stored.accommodation_type
      }, [], stored.orderer_phone);
    }
  } else {
    showLogin();
  }

  // ── Version badge ──
  try {
    const vRes = await fetch('/version.json');
    if (vRes.ok) {
      const vData = await vRes.json();
      const verEl = document.getElementById('ma-version-value');
      const buildEl = document.getElementById('ma-version-build');
      if (verEl && vData.version) verEl.textContent = vData.version;
      if (buildEl && vData.build) buildEl.textContent = `(${vData.build})`;
    }
  } catch (_) {}
})();
