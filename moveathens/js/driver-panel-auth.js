/**
 * MoveAthens Driver Panel — Auth Gate
 * Phone-based login + optional PIN.
 * Same pattern as MoveAthens hotel auth-gate.
 * localStorage: moveathens_driver | Cookie: ma_driver_phone
 */
(() => {
  'use strict';

  const LS_KEY  = 'moveathens_driver';
  const CK_NAME = 'ma_driver_phone';
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

  // Already logged in
  if (stored && stored.phone && stored.id) {
    if (!cookiePhone) setCookie(CK_NAME, stored.phone, CK_DAYS);
    return;
  }

  // Cookie survives but localStorage cleared → try auto-restore
  if (cookiePhone && !stored) {
    const tryRestore = async () => {
      try {
        const res = await fetch(`/api/driver-panel/check-phone?phone=${encodeURIComponent(cookiePhone)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.has_pin) { clearCookie(CK_NAME); return; } // needs PIN, can't auto-restore
          // Auto-login
          const loginRes = await fetch('/api/driver-panel/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: cookiePhone })
          });
          if (loginRes.ok) {
            const driver = await loginRes.json();
            localStorage.setItem(LS_KEY, JSON.stringify(driver));
            window.location.reload();
            return;
          }
        }
      } catch { /* fall through to gate */ }
      clearCookie(CK_NAME);
    };
    tryRestore();
  }

  /* ── Lock the page ── */
  document.documentElement.classList.add('ma-dp-gate-active');
  document.body.classList.add('ma-dp-gate-locked');

  /* ── Build gate overlay ── */
  const gate = document.createElement('div');
  gate.className = 'ma-dp-gate';
  gate.id = 'maDpAuthGate';

  gate.innerHTML = `
    <div class="ma-dp-gate__card">
      <img class="ma-dp-gate__logo" src="/moveathens/videos/hero-logo.webp" alt="MoveAthens" />
      <div class="ma-dp-gate__icon">🔒</div>
      <h1 class="ma-dp-gate__title">Σύνδεση Οδηγού</h1>
      <p class="ma-dp-gate__desc">Εισάγετε τον αριθμό τηλεφώνου<br>που είναι καταχωρημένος στο σύστημα.</p>
      <form class="ma-dp-gate__form" id="maDpGateForm">
        <div>
          <label class="ma-dp-gate__label" for="ma-dp-phone">Τηλέφωνο</label>
          <input class="ma-dp-gate__input" type="tel" id="ma-dp-phone"
                 placeholder="π.χ. 6912345678" autocomplete="tel"
                 inputmode="tel" />
        </div>
        <div class="ma-dp-gate__pin-wrap" id="maDpPinWrap" style="display:none">
          <label class="ma-dp-gate__label" for="ma-dp-pin">Κωδικός (PIN)</label>
          <input class="ma-dp-gate__input" type="password" id="ma-dp-pin"
                 placeholder="Εισάγετε τον κωδικό σας" autocomplete="current-password"
                 inputmode="numeric" />
        </div>
        <button class="ma-dp-gate__btn" type="submit">Σύνδεση</button>
        <p class="ma-dp-gate__error" id="maDpGateError"></p>
      </form>
    </div>`;

  document.body.prepend(gate);

  /* ── Handle login ── */
  const form      = document.getElementById('maDpGateForm');
  const phoneInput = document.getElementById('ma-dp-phone');
  const pinWrap   = document.getElementById('maDpPinWrap');
  const pinInput  = document.getElementById('ma-dp-pin');
  const errorEl   = document.getElementById('maDpGateError');
  const btn       = gate.querySelector('.ma-dp-gate__btn');

  let pinRequired = false;
  let phoneChecked = false;

  if (cookiePhone) phoneInput.value = cookiePhone;

  const showError = (msg) => { if (errorEl) errorEl.textContent = msg; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let phone = (phoneInput.value || '').replace(/[\s\-\(\)\.]/g, '').trim();
    if (/^69\d{8}$/.test(phone)) phone = '+30' + phone;
    if (/^30\d{10}$/.test(phone)) phone = '+' + phone;
    if (!phone) { showError('Εισάγετε τον αριθμό τηλεφώνου.'); return; }

    btn.disabled = true;
    showError('');

    try {
      // Step 1: Check phone
      if (!phoneChecked) {
        const checkRes = await fetch(`/api/driver-panel/check-phone?phone=${encodeURIComponent(phone)}`);
        if (!checkRes.ok) {
          btn.disabled = false;
          if (checkRes.status === 404) showError('Το τηλέφωνο δεν βρέθηκε στο σύστημα.');
          else if (checkRes.status === 403) showError('Ο λογαριασμός είναι ανενεργός.');
          else showError('Σφάλμα σύνδεσης.');
          return;
        }
        const checkData = await checkRes.json();
        phoneChecked = true;

        if (checkData.has_pin) {
          btn.disabled = false;
          pinRequired = true;
          pinWrap.style.display = '';
          pinInput.focus();
          return;
        }
        // No PIN → login directly
      }

      // Step 2: Login
      const pin = pinRequired ? (pinInput.value || '').trim() : '';
      if (pinRequired && !pin) {
        btn.disabled = false;
        showError('Εισάγετε τον κωδικό σας.');
        return;
      }

      const loginRes = await fetch('/api/driver-panel/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin: pin || undefined })
      });

      if (!loginRes.ok) {
        btn.disabled = false;
        if (loginRes.status === 401) showError('Λάθος κωδικός.');
        else if (loginRes.status === 404) showError('Το τηλέφωνο δεν βρέθηκε.');
        else if (loginRes.status === 403) showError('Ο λογαριασμός είναι ανενεργός.');
        else showError('Σφάλμα σύνδεσης.');
        return;
      }

      const driver = await loginRes.json();
      localStorage.setItem(LS_KEY, JSON.stringify(driver));
      setCookie(CK_NAME, phone, CK_DAYS);

      document.documentElement.classList.remove('ma-dp-gate-active');
      document.body.classList.remove('ma-dp-gate-locked');
      gate.classList.add('ma-dp-gate--hidden');
      setTimeout(() => window.location.reload(), 300);

    } catch {
      btn.disabled = false;
      showError('Σφάλμα δικτύου. Δοκιμάστε ξανά.');
    }
  });

  // Reset on phone change
  phoneInput.addEventListener('input', () => {
    if (phoneChecked) {
      phoneChecked = false;
      pinRequired = false;
      pinWrap.style.display = 'none';
      pinInput.value = '';
    }
  });

  /* ── Logout helper ── */
  window.DpAuth = {
    logout() {
      localStorage.removeItem(LS_KEY);
      clearCookie(CK_NAME);
      window.location.reload();
    }
  };
})();
