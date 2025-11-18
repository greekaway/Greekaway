// checkout.js: Stripe Elements + Payment Request initialization
// Expects window.STRIPE_PUBLISHABLE to be injected in HTML.
(function(){
  const STRIPE_PUBLISHABLE = window.STRIPE_PUBLISHABLE;
  const form = document.getElementById('checkoutForm');
  const resultEl = document.getElementById('result');
  function resolveI18n(m){
    if (typeof m === 'string' && m.indexOf('i18n:') === 0) {
      const key = m.slice(5);
      try { return window.t ? window.t(key) : key; } catch(e) { return key; }
    }
    return m;
  }
  function showResult(msg, success){
    const text = resolveI18n(msg);
    resultEl.style.display='block'; resultEl.textContent=text; resultEl.style.background = success ? '#e6ffe6' : '#ffe6e6';
  }
  try {
    const updateDocTitle = () => { try { document.title = (window.t ? (window.t('checkout.title') || 'Checkout — Greekaway') : 'Checkout — Greekaway'); } catch(_){ } };
    document.addEventListener('DOMContentLoaded', updateDocTitle);
    window.addEventListener('i18n:changed', updateDocTitle);
  } catch(_){ }
  (async function(){
    let CHECKOUT_AMOUNT_CENTS = null;
    let CHECKOUT_CURRENCY = 'eur';
    let CHECKOUT_TRIP_ID = null;
    let CHECKOUT_DURATION = null;
    let CHECKOUT_VEHICLE_TYPE = null;
    let CHECKOUT_SEATS = 1;
    let CHECKOUT_VEHICLE_OVERRIDE_FINAL = false;
    let CHECKOUT_BOOKING_ID = null;
    const CHECKOUT_DEBUG = (typeof window !== 'undefined') && (window.location.search.includes('debugCheckout=1') || window.DEBUG_CHECKOUT == 1);
    const amountEl = document.getElementById('checkoutAmount');
    const getLang = () => (window.currentI18n && window.currentI18n.lang) || (navigator.language || 'el');
    const showAmount = () => { try { if (!amountEl) return; if (CHECKOUT_AMOUNT_CENTS != null) { const cur = (CHECKOUT_CURRENCY || 'eur').toUpperCase(); const val = (CHECKOUT_AMOUNT_CENTS/100).toLocaleString(getLang(), { style:'currency', currency: cur }); amountEl.textContent = val; amountEl.style.display='inline-block'; } else { amountEl.style.display='none'; } } catch(_){ } };
    try { window.addEventListener('i18n:changed', showAmount); } catch(_){ }
    try {
      const st = (window.GWBookingState && window.GWBookingState.get && window.GWBookingState.get()) || null;
      let PR_AMOUNT_CENTS = null;
      try {
        const summaryBox = document.getElementById('checkoutSummary');
        if (summaryBox) {
          const fmtPrice = (typeof st.price_cents === 'number') ? (st.price_cents/100).toLocaleString(getLang(), { style:'currency', currency: (st.currency||'eur').toUpperCase() }) : '—';
          document.getElementById('coTripId').textContent = st.trip_id || '—';
          if (typeof st.price_cents === 'number' && st.price_cents > 0) PR_AMOUNT_CENTS = st.price_cents;
          document.getElementById('coDate').textContent = st.date || '—';
          document.getElementById('coMode').textContent = st.mode || '—';
          document.getElementById('coSeats').textContent = st.seats || '—';
          const pu = st.pickup && st.pickup.address ? st.pickup.address : '—';
          document.getElementById('coPickup').textContent = pu;
          document.getElementById('coPrice').textContent = fmtPrice;
          summaryBox.style.display='block';
        }
      } catch(_){ }
      CHECKOUT_TRIP_ID = st.trip_id || null;
      CHECKOUT_SEATS = st.seats || 1;
      if (PR_AMOUNT_CENTS == null) PR_AMOUNT_CENTS = CHECKOUT_AMOUNT_CENTS;
      CHECKOUT_CURRENCY = (st.currency || 'eur');
      const resp = await fetch('/api/bookings/create', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(st) });
      const data = await resp.json().catch(()=>({}));
      if (resp.ok && data && data.bookingId) {
        CHECKOUT_BOOKING_ID = data.bookingId;
        if (typeof data.amount_cents === 'number') CHECKOUT_AMOUNT_CENTS = data.amount_cents;
        if (typeof data.currency === 'string') CHECKOUT_CURRENCY = String(data.currency).toLowerCase();
      } else { if (typeof st.price_cents === 'number') CHECKOUT_AMOUNT_CENTS = st.price_cents; }
      showAmount();
    } catch(_){ }
    try {
      const qs = new URLSearchParams(window.location.search);
      const bid = qs.get('bookingId');
      if (!CHECKOUT_TRIP_ID) CHECKOUT_TRIP_ID = qs.get('trip') || null;
      if (bid) {
        const bk = await fetch('/api/bookings/' + encodeURIComponent(bid));
        if (bk && bk.ok) {
          const jb = await bk.json();
          try { if (jb.user_name) form.name.value = jb.user_name; } catch(e){}
          try { if (jb.user_email) form.email.value = jb.user_email; } catch(e){}
          try { if (typeof jb.price_cents === 'number') CHECKOUT_AMOUNT_CENTS = jb.price_cents; } catch(_){ }
          try { if (jb.currency) CHECKOUT_CURRENCY = String(jb.currency).toLowerCase(); } catch(_){ }
          try { if (jb.trip_id) CHECKOUT_TRIP_ID = jb.trip_id; } catch(_){ }
          showAmount();
        }
        CHECKOUT_BOOKING_ID = bid;
      }
    } catch(_){ }
    if (!STRIPE_PUBLISHABLE || STRIPE_PUBLISHABLE.includes('STRIPE')) { console.warn('[checkout] Stripe publishable key missing or placeholder; card flow disabled'); }
    if (STRIPE_PUBLISHABLE && !STRIPE_PUBLISHABLE.includes('STRIPE')) {
      const stripe = Stripe(STRIPE_PUBLISHABLE);
      const elements = stripe.elements();
      let cardNumber, cardExpiry, cardCvc;
      try {
        const cardInput = document.querySelector('input[name="card"]');
        const formParent = cardInput ? cardInput.parentNode : form;
        const cardWrapper = document.createElement('div'); cardWrapper.style.marginBottom='1rem'; cardWrapper.className='card-elements-wrapper';
        const numberLabel = document.createElement('label'); numberLabel.setAttribute('data-i18n','checkout.cardPlaceholder'); numberLabel.textContent = (window.t ? window.t('checkout.cardPlaceholder') : 'Card number'); numberLabel.className='card-field-label';
        const cardNumberMount = document.createElement('div'); cardNumberMount.className='card-number-mount stripe-mount'; cardWrapper.appendChild(numberLabel); cardWrapper.appendChild(cardNumberMount);
        const smallRow = document.createElement('div'); smallRow.style.display='flex'; smallRow.style.gap='12px';
        const expiryLabel = document.createElement('label'); expiryLabel.setAttribute('data-i18n','checkout.expiry'); expiryLabel.textContent=(window.t ? (window.t('checkout.expiry')||'MM / YY') : 'MM / YY'); expiryLabel.className='card-field-label';
        const cvcLabel = document.createElement('label'); cvcLabel.setAttribute('data-i18n','checkout.cvc'); cvcLabel.textContent=(window.t ? (window.t('checkout.cvc')||'CVC') : 'CVC'); cvcLabel.className='card-field-label small';
        const cardExpiryMount = document.createElement('div'); cardExpiryMount.className='card-expiry-mount stripe-mount'; cardExpiryMount.style.flex='1';
        const cardCvcMount = document.createElement('div'); cardCvcMount.className='card-cvc-mount stripe-mount'; cardCvcMount.style.width='120px';
        const expiryWrapper = document.createElement('div'); expiryWrapper.style.flex='1'; expiryWrapper.appendChild(expiryLabel); expiryWrapper.appendChild(cardExpiryMount);
        const cvcWrapper = document.createElement('div'); cvcWrapper.style.width='120px'; cvcWrapper.appendChild(cvcLabel); cvcWrapper.appendChild(cardCvcMount);
        smallRow.appendChild(expiryWrapper); smallRow.appendChild(cvcWrapper); cardWrapper.appendChild(smallRow);
        formParent.insertBefore(cardWrapper, formParent.querySelector('.btn'));
        cardNumber = elements.create('cardNumber', { showIcon: true }); cardExpiry = elements.create('cardExpiry'); cardCvc = elements.create('cardCvc');
        cardNumber.mount(cardNumberMount); cardExpiry.mount(cardExpiryMount); cardCvc.mount(cardCvcMount);
        if (cardInput) cardInput.style.display='none';
      } catch (mountErr) { console.error('[checkout] Failed to mount Stripe Elements', mountErr); }
      try { if (window.GWPaymentRequest && window.GWPaymentRequest.init) {
        const rawTitle = (window.t ? (window.t('siteTitle') || '') : '');
        const merchantLabel = (rawTitle && rawTitle !== 'siteTitle') ? rawTitle : 'Greekaway';
        const prAmount = (CHECKOUT_AMOUNT_CENTS != null ? CHECKOUT_AMOUNT_CENTS : 0);
        const pr = await window.GWPaymentRequest.init(STRIPE_PUBLISHABLE, { total: { label: merchantLabel, amount: prAmount } });
        if (pr && pr.prButton) { document.getElementById('payment-request-container').style.display='block'; try { pr.prButton.mount('#payment-request-container'); } catch(err){ console.error('[checkout] mount prButton failed', err); }
          pr.paymentRequest.on('paymentmethod', async (ev) => {
            try {
              const reqBody = { price_cents: (CHECKOUT_AMOUNT_CENTS != null ? CHECKOUT_AMOUNT_CENTS : 0), currency: (CHECKOUT_CURRENCY || 'eur'), tripId: CHECKOUT_TRIP_ID, duration: CHECKOUT_DURATION, vehicleType: CHECKOUT_VEHICLE_TYPE, seats: (CHECKOUT_SEATS || 1) };
              let resp; try { resp = await fetch('/api/partners/create-payment-intent', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(reqBody) }); } catch(netErr){ console.error('[checkout:PR] fetch error', netErr); ev.complete('fail'); return showResult('i18n:checkout.payment_error', false); }
              const data = await resp.json().catch(()=>({})); if (!resp.ok || !data.clientSecret){ console.error('[checkout] create-payment-intent failed', data); ev.complete('fail'); return showResult('i18n:checkout.payment_error', false); }
              const confirm = await pr.stripe.confirmCardPayment(data.clientSecret, { payment_method: ev.paymentMethod.id }, { handleActions: false });
              if (confirm.error){ ev.complete('fail'); return showResult(confirm.error.message || 'i18n:checkout.payment_failed', false); }
              if (confirm.paymentIntent && confirm.paymentIntent.status === 'requires_action') {
                const res2 = await pr.stripe.confirmCardPayment(data.clientSecret); if (res2.error){ ev.complete('fail'); return showResult(res2.error.message || 'i18n:checkout.payment_failed', false); }
              }
              ev.complete('success'); showResult('i18n:checkout.payment_success_test', true);
            } catch(err){ console.error('paymentRequest handler error', err); ev.complete('fail'); showResult('i18n:checkout.payment_error', false); }
          });
        }
      } } catch(e){ console.warn('Payment Request init failed', e); }
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = form.name.value; const email = form.email.value;
        if (!CHECKOUT_BOOKING_ID) {
          try { const st = (window.GWBookingState && window.GWBookingState.get && window.GWBookingState.get()) || null; if (st) { const r = await fetch('/api/bookings/create', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(st) }); const j = await r.json().catch(()=>({})); if (r.ok && j.bookingId){ CHECKOUT_BOOKING_ID = j.bookingId; if (typeof j.amount_cents==='number') CHECKOUT_AMOUNT_CENTS = j.amount_cents; } } } catch(err){ }
        }
        const body = { price_cents: (CHECKOUT_AMOUNT_CENTS != null ? CHECKOUT_AMOUNT_CENTS : 0), currency: (CHECKOUT_CURRENCY || 'eur'), tripId: CHECKOUT_TRIP_ID, duration: CHECKOUT_DURATION, vehicleType: CHECKOUT_VEHICLE_TYPE, seats: (CHECKOUT_SEATS || 1) };
        try { const stFull = (window.GWBookingState && window.GWBookingState.get && window.GWBookingState.get()) || null; if (stFull){ body.trip_id = stFull.trip_id || CHECKOUT_TRIP_ID || null; body.mode = stFull.mode || null; body.date = stFull.date || null; body.seats = stFull.seats || CHECKOUT_SEATS || 1; body.pickup = stFull.pickup || null; body.traveler_profile = stFull.traveler_profile || null; if (typeof stFull.price_cents === 'number') body.price_cents = stFull.price_cents; } } catch(_){ }
        if (CHECKOUT_BOOKING_ID) body.booking_id = CHECKOUT_BOOKING_ID;
        let resp, data; try { resp = await fetch('/api/partners/create-payment-intent', { method:'POST', cache:'no-store', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); } catch(err){ console.error('[checkout] network error', err); return showResult('i18n:checkout.payment_error', false); }
        try { data = await resp.json(); } catch(_){ data = {}; }
        if(!resp.ok || !data.clientSecret){ console.error('[checkout] create-payment-intent failed', data); return showResult('i18n:checkout.payment_error', false); }
        const { error, paymentIntent } = await stripe.confirmCardPayment(data.clientSecret, { payment_method: { card: cardNumber || undefined, billing_details: { name, email } } });
        if(error){ showResult(error.message || 'i18n:checkout.payment_failed', false); } else {
          try { if (CHECKOUT_BOOKING_ID) { await fetch('/api/bookings/confirm', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ bookingId: CHECKOUT_BOOKING_ID, payment_intent_id: paymentIntent && paymentIntent.id }) }); } } catch(_){ }
          try { if (window.GWBookingState && window.GWBookingState.clear) window.GWBookingState.clear(); } catch(_){ }
          showResult('i18n:checkout.payment_success_test', true);
        }
      });
    } else {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = { price_cents: (CHECKOUT_AMOUNT_CENTS != null ? CHECKOUT_AMOUNT_CENTS : 0), currency: (CHECKOUT_CURRENCY || 'eur'), tripId: CHECKOUT_TRIP_ID, duration: CHECKOUT_DURATION, vehicleType: CHECKOUT_VEHICLE_TYPE, seats: (CHECKOUT_SEATS || 1) };
        let resp, data; try { resp = await fetch('/api/partners/create-payment-intent', { method:'POST', cache:'no-store', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); } catch(err){ console.error('[checkout:fallback] network error', err); return showResult('i18n:checkout.payment_error', false); }
        try { data = await resp.json(); } catch(_){ data = {}; }
        if(!resp.ok || !data.clientSecret){ console.error('[checkout:fallback] failed', data); return showResult('i18n:checkout.payment_error', false); }
        return showResult('i18n:checkout.payment_success_test', true);
      });
    }
  })();
  try { window.GWFeedbackPrompt && window.GWFeedbackPrompt.init && window.GWFeedbackPrompt.init(); } catch(e){}
})();