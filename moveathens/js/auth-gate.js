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

   PIN support:
   - After phone is entered, checks if PIN is required
   - If yes, shows PIN field before completing login
   - If no PIN set, logs in immediately (backward compatible)
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
    const tryAutoRestore = async () => {
      try {
        // Check if phone has PIN — if it does, we can't auto-restore
        const checkRes = await fetch(`/api/moveathens/check-pin?phone=${encodeURIComponent(cookiePhone)}`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.has_pin) {
            // PIN required — can't auto-restore, clear cookie and show gate
            clearCookie(CK_NAME);
            return;
          }
        }
        const res = await fetch(`/api/moveathens/hotel-by-phone?phone=${encodeURIComponent(cookiePhone)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.has_pin) {
            clearCookie(CK_NAME);
            return;
          }
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
          localStorage.setItem('moveathens_hotel_zone_id', obj.origin_zone_id);
          localStorage.setItem('moveathens_hotel_zone', obj.origin_zone_name);
          localStorage.setItem('moveathens_hotel_address', obj.address);
          localStorage.setItem('moveathens_hotel_email', obj.email);
          window.location.reload();
          return;
        }
      } catch (_) { /* network error — fall through to gate */ }
      clearCookie(CK_NAME);
    };
    tryAutoRestore();
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
      <img class="ma-gate__logo" src="/moveathens/videos/hero-logo.webp" alt="MoveAthens" />
      <div class="ma-gate__icon">🔒</div>
      <h1 class="ma-gate__title">Σύνδεση</h1>
      <p class="ma-gate__desc">Εισάγετε τον αριθμό τηλεφώνου<br>του ξενοδοχείου σας για πρόσβαση.</p>
      <form class="ma-gate__form" data-ma-gate-form>
        <div>
          <label class="ma-gate__label" for="ma-gate-phone">Τηλέφωνο</label>
          <input class="ma-gate__input" type="tel" id="ma-gate-phone"
                 placeholder="π.χ. 6912345678" autocomplete="tel"
                 inputmode="tel" data-ma-gate-phone />
        </div>
        <div class="ma-gate__pin-wrap" data-ma-gate-pin-wrap style="display:none">
          <label class="ma-gate__label" for="ma-gate-pin">Κωδικός (PIN)</label>
          <input class="ma-gate__input" type="password" id="ma-gate-pin"
                 placeholder="Εισάγετε τον κωδικό σας" autocomplete="current-password"
                 inputmode="numeric" data-ma-gate-pin />
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
  const pinWrap   = gate.querySelector('[data-ma-gate-pin-wrap]');
  const pinInput  = gate.querySelector('[data-ma-gate-pin]');
  const errorEl   = gate.querySelector('[data-ma-gate-error]');
  const btn       = gate.querySelector('.ma-gate__btn');

  let pinRequired = false;
  let pinChecked = false;

  const showError = (msg) => {
    if (errorEl) errorEl.textContent = msg;
  };

  const showPinField = () => {
    pinRequired = true;
    pinWrap.style.display = '';
    pinInput.focus();
  };

  const completeLogin = (zone, phone) => {
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
    localStorage.setItem('moveathens_hotel_zone_id', obj.origin_zone_id);
    localStorage.setItem('moveathens_hotel_zone', obj.origin_zone_name);
    localStorage.setItem('moveathens_hotel_address', obj.address);
    localStorage.setItem('moveathens_hotel_email', obj.email);

    setCookie(CK_NAME, phone, CK_DAYS);

    document.documentElement.classList.remove('ma-gate-pending');
    document.body.classList.remove('ma-gate-locked');
    gate.classList.add('ma-gate--hidden');
    setTimeout(() => { window.location.reload(); }, 300);
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
      // Step 1: Check if phone exists and if PIN is required
      if (!pinChecked) {
        const checkRes = await fetch(`/api/moveathens/hotel-by-phone?phone=${encodeURIComponent(phone)}`);
        if (!checkRes.ok) {
          btn.disabled = false;
          if (checkRes.status === 404) {
            showError('Το τηλέφωνο δεν βρέθηκε. Επικοινωνήστε με τη διαχείριση.');
          } else {
            showError('Σφάλμα σύνδεσης. Δοκιμάστε ξανά.');
          }
          return;
        }
        const checkData = await checkRes.json();
        pinChecked = true;

        if (checkData.has_pin) {
          // PIN required — show PIN field, don't log in yet
          btn.disabled = false;
          showPinField();
          return;
        }

        // No PIN → login directly with the data we already have
        completeLogin(checkData.zone, phone);
        return;
      }

      // Step 2: PIN was required — verify phone + PIN
      const pin = (pinInput.value || '').trim();
      if (!pin) {
        btn.disabled = false;
        showError('Εισάγετε τον κωδικό σας.');
        return;
      }

      const res = await fetch('/api/moveathens/verify-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin })
      });

      if (!res.ok) {
        btn.disabled = false;
        const errData = await res.json().catch(() => ({}));
        if (res.status === 401) {
          showError('Λάθος κωδικός. Δοκιμάστε ξανά.');
        } else if (res.status === 404) {
          showError('Το τηλέφωνο δεν βρέθηκε.');
        } else {
          showError(errData.error || 'Σφάλμα σύνδεσης.');
        }
        return;
      }

      const data = await res.json();
      completeLogin(data.zone, phone);

    } catch (err) {
      btn.disabled = false;
      showError('Σφάλμα δικτύου. Δοκιμάστε ξανά.');
    }
  });

  // Reset PIN state when phone changes
  phoneInput.addEventListener('input', () => {
    if (pinChecked) {
      pinChecked = false;
      pinRequired = false;
      pinWrap.style.display = 'none';
      pinInput.value = '';
    }
  });
})();
