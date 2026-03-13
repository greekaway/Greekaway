(async () => {
  // ── Cookie helpers (sync with auth-gate.js) ──
  const CK_NAME = 'ma_hotel_phone';
  const CK_DAYS = 365;
  const setCookie = (name, value, days) => {
    const d = new Date(); d.setTime(d.getTime() + days * 86400000);
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
  };
  const clearCookie = (name) => {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
  };

  const cfg = await window.MoveAthensConfig.load();

  // DOM refs (login section removed — auth gate handles login)
  const infoSection  = document.getElementById('hotel-info-section');
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

  // ── Show hotel info (auth gate guarantees user is logged in) ──
  const showInfo = (zone, phones, myPhone) => {
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
        `<span style="background:rgba(13,110,253,0.15);border:1px solid rgba(13,110,253,0.35);color:var(--ma-text,#1a1a2e);padding:0.4rem 0.75rem;border-radius:20px;font-size:0.9rem;font-weight:600;">📱 ${p.phone}${p.label ? ' <small style="opacity:0.75;font-weight:400;">('+p.label+')</small>' : ''}</span>`
      ).join('');
    }
  };

  // ── Persist hotel to localStorage (for transfer flow + auth gate cookie) ──
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
    // Sync cookie backup
    setCookie(CK_NAME, myPhone, CK_DAYS);
  };

  // ── Logout (clears session, reload triggers auth gate) ──
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('moveathens_hotel');
      localStorage.removeItem('moveathens_hotel_zone_id');
      localStorage.removeItem('moveathens_hotel_zone');
      localStorage.removeItem('moveathens_hotel_address');
      localStorage.removeItem('moveathens_hotel_email');
      clearCookie(CK_NAME);
      window.location.reload();
    });
  }

  // ── Load hotel data on page open (auth gate guarantees session exists) ──
  const stored = (() => {
    try { return JSON.parse(localStorage.getItem('moveathens_hotel') || 'null'); } catch { return null; }
  })();

  if (stored && stored.orderer_phone && stored.origin_zone_id) {
    // Re-verify phone & get latest data from server
    try {
      const res = await fetch(`/api/moveathens/hotel-by-phone?phone=${encodeURIComponent(stored.orderer_phone)}`);
      if (res.ok) {
        const data = await res.json();
        persistHotel(data.zone, stored.orderer_phone);
        showInfo(data.zone, data.phones, stored.orderer_phone);
      } else {
        // Phone no longer valid — clear and reload (gate handles re-login)
        localStorage.removeItem('moveathens_hotel');
        clearCookie(CK_NAME);
        window.location.reload();
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
