/* ═══════════════════════════════════════════════════════
   Auth Gate – DriversSystem
   
   Runs BEFORE any page script. If the driver is not
   logged in (no ds_driver_phone in localStorage), this
   creates a full-screen login wall that covers ALL
   content — including footer, hero, etc.
   
   Works exactly like the admin panel: nothing visible
   until authenticated.

   On login success it saves the phone, removes the gate,
   and reloads so the page JS initialises normally.
   ═══════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const STORAGE_KEY = 'ds_driver_phone';
  const savedPhone = localStorage.getItem(STORAGE_KEY);

  /* ── Already logged in → nothing to do ── */
  if (savedPhone) return;

  /* ── Lock the page ── */
  document.documentElement.classList.add('ds-gate-active');
  document.body.classList.add('ds-gate-locked');

  /* ── Build the gate overlay ── */
  const gate = document.createElement('div');
  gate.className = 'ds-gate';
  gate.id = 'dsAuthGate';

  // Determine the logo URL (we'll try to load it from the config API)
  gate.innerHTML = `
    <div class="ds-gate__card">
      <div class="ds-gate__icon">🔒</div>
      <img class="ds-gate__logo" data-ds-gate-logo src="" alt="DriversSystem" />
      <h1 class="ds-gate__title">Σύνδεση Οδηγού</h1>
      <p class="ds-gate__desc">Εισάγετε τον αριθμό τηλεφώνου σας<br>για να αποκτήσετε πρόσβαση.</p>
      <form class="ds-gate__form" data-ds-gate-form>
        <div>
          <label class="ds-gate__label" for="ds-gate-phone">Τηλέφωνο</label>
          <input class="ds-gate__input" type="tel" id="ds-gate-phone"
                 placeholder="π.χ. 6912345678" autocomplete="tel"
                 inputmode="tel" data-ds-gate-phone />
        </div>
        <button class="ds-gate__btn" type="submit">Σύνδεση</button>
        <p class="ds-gate__error" data-ds-gate-error></p>
      </form>
    </div>`;

  /* Insert gate as FIRST child of body so it's on top */
  document.body.prepend(gate);

  /* ── Try to load logo from config ── */
  const loadLogo = async () => {
    try {
      const host = window.location.hostname || '';
      const isDev = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
      const url = isDev ? `/api/driverssystem/ui-config?cb=${Date.now()}` : '/api/driverssystem/ui-config';
      const res = await fetch(url);
      if (!res.ok) return;
      const cfg = await res.json();
      const logoEl = gate.querySelector('[data-ds-gate-logo]');
      if (logoEl && cfg.heroLogoUrl) {
        logoEl.src = cfg.heroLogoUrl;
      }
    } catch (_) { /* ignore */ }
  };
  loadLogo();

  /* ── Handle login submit ── */
  const form = gate.querySelector('[data-ds-gate-form]');
  const phoneInput = gate.querySelector('[data-ds-gate-phone]');
  const errorEl = gate.querySelector('[data-ds-gate-error]');
  const btn = gate.querySelector('.ds-gate__btn');

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
      const res = await fetch(`/api/driverssystem/drivers/me?phone=${encodeURIComponent(phone)}`);

      if (!res.ok) {
        btn.disabled = false;
        if (res.status === 404) {
          showError('Δεν βρέθηκε οδηγός με αυτό το τηλέφωνο.');
        } else {
          showError('Σφάλμα σύνδεσης. Δοκιμάστε ξανά.');
        }
        return;
      }

      /* Verified — save and reload */
      localStorage.setItem(STORAGE_KEY, phone);

      /* Remove gate classes */
      document.documentElement.classList.remove('ds-gate-pending');
      document.body.classList.remove('ds-gate-locked');

      gate.classList.add('ds-gate--hidden');
      setTimeout(() => {
        window.location.reload();
      }, 300);

    } catch (err) {
      btn.disabled = false;
      showError('Σφάλμα δικτύου. Δοκιμάστε ξανά.');
    }
  });
})();
