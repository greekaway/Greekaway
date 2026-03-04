/* ═══════════════════════════════════════════════════════
   Auth Gate – MoveAthens
   
   Runs BEFORE any page script. If the hotel user is not
   logged in (no moveathens_hotel in localStorage AND no
   ma_hotel_phone cookie), this creates a full-screen
   login wall that covers ALL content.
   
   On login success it:
   1. Saves hotel data to localStorage (moveathens_hotel)
   2. Sets a cookie (ma_hotel_phone) with 1-year expiry
   3. Removes the gate and reloads so page JS initialises
   
   If localStorage is cleared but the cookie survives,
   the gate auto-restores the session silently.
   ═══════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const LS_KEY  = 'moveathens_hotel';
  const CK_NAME = 'ma_hotel_phone';
  const CK_DAYS = 365;

  /* ── Cookie helpers ── */
  const getCookie = (name) => {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  };

  const setCookie = (name, value, days) => {
    const d = new Date();
    d.setTime(d.getTime() + days * 86400000);
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
  };

  const clearCookie = (name) => {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
  };

  /* ── Check existing session ── */
  const stored = (() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
  })();
  const cookiePhone = getCookie(CK_NAME);

  // Case 1: localStorage has valid session → already logged in
  if (stored && stored.orderer_phone && stored.origin_zone_id) {
    // Ensure cookie is in sync
    if (!cookiePhone) setCookie(CK_NAME, stored.orderer_phone, CK_DAYS);
    return; // page loads normally
  }

  // Case 2: localStorage lost but cookie has phone → restore silently
  if (cookiePhone && !stored) {
    // We'll try to restore after DOM is ready. For now, show the gate
    // but attempt auto-login immediately.
    const tryAutoRestore = async () => {
      try {
        const res = await fetch(`/api/moveathens/hotel-by-phone?phone=${encodeURIComponent(cookiePhone)}`);
        if (res.ok) {
          const data = await res.json();
          const zone = data.zone;
          const obj = {
            origin_zone_id:   zone.origin_zone_id || zone.id,
            origin_zone_name: zone.origin_zone_name || zone.name,
            hotelName:        zone.hotelName || zone.hotel_name || '',
            municipality:     zone.municipality || '',
            address:          zone.address || '',
            phone:            cookiePhone,
            email:            zone.email || '',
            accommodation_type: zone.accommodation_type || '',
            lat:              zone.lat != null ? zone.lat : null,
            lng:              zone.lng != null ? zone.lng : null,
            orderer_phone:    cookiePhone
          };
          localStorage.setItem(LS_KEY, JSON.stringify(obj));
          // Legacy keys
          localStorage.setItem('moveathens_hotel_zone_id', obj.origin_zone_id);
          localStorage.setItem('moveathens_hotel_zone', obj.origin_zone_name);
          localStorage.setItem('moveathens_hotel_address', obj.address);
          localStorage.setItem('moveathens_hotel_email', obj.email);
          // Reload to let page JS pick up the session
          window.location.reload();
          return;
        }
      } catch (_) { /* network error — fall through to gate */ }
      // Cookie phone no longer valid → clear it
      clearCookie(CK_NAME);
    };
    tryAutoRestore();
    // While auto-restore runs, the gate is displayed (prevents flash)
  }

  /* ── Lock the page ── */
  document.documentElement.classList.add('ma-gate-active');
  document.body.classList.add('ma-gate-locked');

  /* ── Build the gate overlay ── */
  const gate = document.createElement('div');
  gate.className = 'ma-gate';
  gate.id = 'maAuthGate';

  gate.innerHTML = `
    <div class="ma-gate__card">
      <div class="ma-gate__icon">🔒</div>
      <img class="ma-gate__logo" src="/moveathens/videos/hero-logo.png" alt="MoveAthens" />
      <h1 class="ma-gate__title">Σύνδεση</h1>
      <p class="ma-gate__desc">Εισάγετε τον αριθμό τηλεφώνου<br>του ξενοδοχείου σας για πρόσβαση.</p>
      <form class="ma-gate__form" data-ma-gate-form>
        <div>
          <label class="ma-gate__label" for="ma-gate-phone">Τηλέφωνο</label>
          <input class="ma-gate__input" type="tel" id="ma-gate-phone"
                 placeholder="π.χ. 6912345678" autocomplete="tel"
                 inputmode="tel" data-ma-gate-phone />
        </div>
        <button class="ma-gate__btn" type="submit">Σύνδεση</button>
        <p class="ma-gate__error" data-ma-gate-error></p>
      </form>
    </div>`;

  /* Insert gate as FIRST child of body so it's on top */
  document.body.prepend(gate);

  /* ── Handle login submit ── */
  const form      = gate.querySelector('[data-ma-gate-form]');
  const phoneInput = gate.querySelector('[data-ma-gate-phone]');
  const errorEl   = gate.querySelector('[data-ma-gate-error]');
  const btn       = gate.querySelector('.ma-gate__btn');

  const showError = (msg) => {
    if (errorEl) errorEl.textContent = msg;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = (phoneInput.value || '').trim();
    if (!phone) {
      showError('Εισάγετε τον αριθμό τηλεφώνου σας.');
      return;
    }

    btn.disabled = true;
    showError('');

    try {
      const res = await fetch(`/api/moveathens/hotel-by-phone?phone=${encodeURIComponent(phone)}`);

      if (!res.ok) {
        btn.disabled = false;
        if (res.status === 404) {
          showError('Το τηλέφωνο δεν βρέθηκε. Επικοινωνήστε με τη διαχείριση.');
        } else {
          showError('Σφάλμα σύνδεσης. Δοκιμάστε ξανά.');
        }
        return;
      }

      const data = await res.json();
      const zone = data.zone;

      /* Persist to localStorage (same structure as hotel-context.js) */
      const obj = {
        origin_zone_id:   zone.origin_zone_id || zone.id,
        origin_zone_name: zone.origin_zone_name || zone.name,
        hotelName:        zone.hotelName || zone.hotel_name || '',
        municipality:     zone.municipality || '',
        address:          zone.address || '',
        phone:            phone,
        email:            zone.email || '',
        accommodation_type: zone.accommodation_type || '',
        lat:              zone.lat != null ? zone.lat : null,
        lng:              zone.lng != null ? zone.lng : null,
        orderer_phone:    phone
      };
      localStorage.setItem(LS_KEY, JSON.stringify(obj));
      // Legacy keys for compatibility
      localStorage.setItem('moveathens_hotel_zone_id', obj.origin_zone_id);
      localStorage.setItem('moveathens_hotel_zone', obj.origin_zone_name);
      localStorage.setItem('moveathens_hotel_address', obj.address);
      localStorage.setItem('moveathens_hotel_email', obj.email);

      /* Set cookie backup (1 year) */
      setCookie(CK_NAME, phone, CK_DAYS);

      /* Remove gate and reload */
      document.documentElement.classList.remove('ma-gate-pending');
      document.body.classList.remove('ma-gate-locked');

      gate.classList.add('ma-gate--hidden');
      setTimeout(() => {
        window.location.reload();
      }, 300);

    } catch (err) {
      btn.disabled = false;
      showError('Σφάλμα δικτύου. Δοκιμάστε ξανά.');
    }
  });
})();
