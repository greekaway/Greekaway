(function () {
  const state = {
    modal: null,
    panels: [],
    statusEl: null,
    config: null,
    googleReady: false
  };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    state.modal = document.querySelector('[data-auth-modal]');
    state.statusEl = document.querySelector('[data-auth-status]');
    state.panels = Array.from(document.querySelectorAll('[data-auth-panel]'));
    wireModalTriggers();
    wireOptionButtons();
    wireForms();
    hydrateFromQuery();
    fetchConfig();
  }

  function wireModalTriggers() {
    const openers = document.querySelectorAll('[data-auth-open]');
    const closers = document.querySelectorAll('[data-auth-close]');
    openers.forEach((btn) => btn.addEventListener('click', openModal));
    closers.forEach((btn) => btn.addEventListener('click', closeModal));
    document.addEventListener('keydown', (evt) => {
      if (evt.key === 'Escape') closeModal();
    });
  }

  function wireOptionButtons() {
    document.querySelectorAll('[data-auth-method]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const method = btn.getAttribute('data-auth-method');
        handleMethodSelection(method, btn);
      });
    });
  }

  function wireForms() {
    const emailSendForm = document.getElementById('email-login-form');
    if (emailSendForm) {
      emailSendForm.addEventListener('submit', async (evt) => {
        evt.preventDefault();
        const email = emailSendForm.email.value.trim();
        if (!email) return showStatus('Παρακαλώ γράψτε το email σας.', 'error');
        await submitAndRedirect('/auth/email/send', { email }, '/auth/email-verify', { email });
      });
    }
    const smsSendForm = document.getElementById('sms-login-form');
    if (smsSendForm) {
      smsSendForm.addEventListener('submit', async (evt) => {
        evt.preventDefault();
        const phone = smsSendForm.phone.value.trim();
        if (!phone) return showStatus('Παρακαλώ γράψτε τον αριθμό σας.', 'error');
        await submitAndRedirect('/auth/sms/send', { phone }, '/auth/sms-verify', { phone });
      });
    }
    const emailVerifyForm = document.getElementById('email-verify-form');
    if (emailVerifyForm) {
      emailVerifyForm.addEventListener('submit', async (evt) => {
        evt.preventDefault();
        const email = emailVerifyForm.email.value.trim();
        const code = emailVerifyForm.code.value.trim();
        await finalizeLogin('/auth/email/verify', { email, code });
      });
    }
    const smsVerifyForm = document.getElementById('sms-verify-form');
    if (smsVerifyForm) {
      smsVerifyForm.addEventListener('submit', async (evt) => {
        evt.preventDefault();
        const phone = smsVerifyForm.phone.value.trim();
        const code = smsVerifyForm.code.value.trim();
        await finalizeLogin('/auth/sms/verify', { phone, code });
      });
    }
  }

  async function fetchConfig() {
    try {
      const res = await fetch('/auth/config');
      state.config = await res.json();
    } catch (_) {
      state.config = { emailEnabled: true, smsEnabled: false, googleClientId: null };
    }
  }

  function hydrateFromQuery() {
    const params = new URLSearchParams(window.location.search || '');
    const email = params.get('email');
    if (email) {
      const emailInputs = document.querySelectorAll('input[name="email"]');
      emailInputs.forEach((input) => { if (!input.value) input.value = email; });
    }
    const phone = params.get('phone');
    if (phone) {
      const phoneInputs = document.querySelectorAll('input[name="phone"]');
      phoneInputs.forEach((input) => { if (!input.value) input.value = phone; });
    }
  }

  async function submitAndRedirect(endpoint, payload, redirectPath, query) {
    try {
      showStatus('Αποστολή κωδικού...', 'loading');
      await postJson(endpoint, payload);
      showStatus('Στείλαμε τον κωδικό. Ελέγξτε τα μηνύματά σας.', 'success');
      const target = new URL(redirectPath, window.location.origin);
      Object.entries(query || {}).forEach(([key, value]) => {
        if (value) target.searchParams.set(key, value);
      });
      const next = getQueryParam('next');
      if (next) target.searchParams.set('next', next);
      setTimeout(() => { window.location.assign(target.toString()); }, 800);
    } catch (err) {
      showStatus(formatError(err), 'error');
    }
  }

  async function finalizeLogin(endpoint, payload) {
    try {
      showStatus('Επιβεβαιώνουμε τον κωδικό...', 'loading');
      const response = await postJson(endpoint, payload);
      rememberSession(response.token, response.expiresIn);
      showStatus('Συνδεθήκατε επιτυχώς!', 'success');
      setTimeout(redirectAfterLogin, 800);
    } catch (err) {
      showStatus(formatError(err), 'error');
    }
  }

  async function handleGoogleSignIn() {
    if (!state.config || !state.config.googleClientId) {
      return showStatus('Το Google login δεν είναι διαθέσιμο.', 'error');
    }
    try {
      await ensureGoogleSdk();
      if (!window.google || !window.google.accounts || !window.google.accounts.id) {
        throw new Error('google_sdk_unavailable');
      }
      if (!state.googleReady) {
        window.google.accounts.id.initialize({
          client_id: state.config.googleClientId,
          callback: onGoogleCredential,
          auto_select: false,
        });
        state.googleReady = true;
      }
      window.google.accounts.id.prompt();
      showStatus('Ανοίγει το Google login...', 'info');
    } catch (err) {
      showStatus(formatError(err), 'error');
    }
  }

  async function ensureGoogleSdk() {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      return true;
    }
    if (document.querySelector('script[data-google-identity]')) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('google_sdk_timeout')), 5000);
        document.addEventListener('google-sdk-ready', () => {
          clearTimeout(timer);
          resolve(true);
        }, { once: true });
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = '1';
      const timer = setTimeout(() => {
        reject(new Error('google_sdk_timeout'));
      }, 6000);
      script.onload = () => {
        clearTimeout(timer);
        document.dispatchEvent(new CustomEvent('google-sdk-ready'));
        resolve(true);
      };
      script.onerror = () => {
        clearTimeout(timer);
        reject(new Error('google_sdk_failed'));
      };
      document.head.appendChild(script);
    });
  }

  async function onGoogleCredential(response) {
    if (!response || !response.credential) {
      return showStatus('Δεν λάβαμε απάντηση από την Google.', 'error');
    }
    try {
      showStatus('Επιβεβαιώνουμε το Google token...', 'loading');
      const payload = await postJson('/auth/google', { credential: response.credential });
      rememberSession(payload.token, payload.expiresIn);
      showStatus('Συνδεθήκατε με Google!', 'success');
      setTimeout(redirectAfterLogin, 800);
    } catch (err) {
      showStatus(formatError(err), 'error');
    }
  }

  function rememberSession(token, ttlSeconds) {
    if (!token) return;
    const ttl = Math.max(60, Math.min(parseInt(ttlSeconds, 10) || (7 * 24 * 60 * 60), 30 * 24 * 60 * 60));
    const cookie = `ga_session=${encodeURIComponent(token)}; path=/; max-age=${ttl}; SameSite=Lax`;
    document.cookie = cookie;
    try { localStorage.setItem('ga_session_token', token); } catch (_) {}
  }

  function redirectAfterLogin() {
    const next = getQueryParam('next');
    if (next) {
      window.location.assign(next);
    } else {
      window.location.assign('/');
    }
  }

  async function postJson(endpoint, payload) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data && data.error ? data.error : 'request_failed');
      error.response = data;
      throw error;
    }
    return data;
  }

  function handleMethodSelection(method, btn) {
    document.querySelectorAll('[data-auth-method]').forEach((el) => {
      if (el === btn) el.classList.add('is-active');
      else el.classList.remove('is-active');
    });
    switch (method) {
      case 'email':
        activatePanel('email');
        break;
      case 'sms':
        activatePanel('sms');
        break;
      case 'google':
        activatePanel(null);
        handleGoogleSignIn();
        break;
      case 'apple':
        showStatus('Το Apple login θα ενεργοποιηθεί σύντομα.', 'info');
        activatePanel(null);
        break;
      default:
        activatePanel(null);
    }
  }

  function activatePanel(panelName) {
    state.panels.forEach((panel) => {
      const shouldShow = panel.dataset.authPanel === panelName;
      panel.classList.toggle('is-hidden', !shouldShow);
    });
  }

  function openModal() {
    if (!state.modal) return;
    state.modal.classList.add('is-visible');
  }

  function closeModal() {
    if (!state.modal) return;
    state.modal.classList.remove('is-visible');
  }

  function showStatus(message, type) {
    if (!state.statusEl || !message) return;
    state.statusEl.textContent = message;
    state.statusEl.dataset.state = type || 'info';
  }

  function getQueryParam(key) {
    try {
      const params = new URLSearchParams(window.location.search || '');
      return params.get(key);
    } catch (_) {
      return null;
    }
  }

  function formatError(error) {
    const message = error && error.message ? error.message : String(error || 'Σφάλμα');
    const map = {
      invalid_email: 'Το email δεν είναι έγκυρο.',
      invalid_phone: 'Ο αριθμός δεν είναι έγκυρος.',
      email_failed: 'Αποτυχία αποστολής email. Προσπαθήστε ξανά.',
      email_config_error: 'Το email login δεν είναι διαθέσιμο.',
      sms_failed: 'Αποτυχία αποστολής SMS. Δοκιμάστε ξανά.',
      config_error: 'Δεν έχει ρυθμιστεί το SMS login.',
      invalid_code: 'Ο κωδικός δεν είναι σωστός.',
      expired: 'Ο κωδικός έληξε. Ζητήστε νέο.',
      locked: 'Πάρα πολλές προσπάθειες. Ξεκινήστε ξανά.',
      missing_fields: 'Συμπληρώστε όλα τα πεδία.',
      google_config_missing: 'Το Google login δεν είναι διαθέσιμο.',
      google_sdk_failed: 'Η βιβλιοθήκη Google δεν φορτώθηκε.',
      google_sdk_unavailable: 'Η βιβλιοθήκη Google δεν είναι διαθέσιμη.',
      google_sdk_timeout: 'Άργησε η Google να απαντήσει. Δοκιμάστε ξανά.'
    };
    return map[message] || 'Παρουσιάστηκε σφάλμα. Προσπαθήστε ξανά.';
  }
})();
