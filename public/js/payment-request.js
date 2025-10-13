// payment-request.js
// Small helper to initialize Stripe Payment Request flows. Used by checkout.html

(function(){
  if (typeof window === 'undefined') return;
  window.GWPaymentRequest = {
    init: async function (publishableKey, options) {
      if (!publishableKey || publishableKey.indexOf('STRIPE') !== -1) return; // not configured
      const stripe = Stripe(publishableKey);
      const elements = stripe.elements();
      const paymentRequest = stripe.paymentRequest(Object.assign({
        country: 'GR',
        currency: 'eur',
        total: { label: 'Greekaway — Purchase', amount: (options && options.amount) || 1000 },
        requestPayerName: true,
        requestPayerEmail: true,
      }, options));

      try {
        const can = await paymentRequest.canMakePayment();
        if (!can) return null;
        const prButton = elements.create('paymentRequestButton', { paymentRequest });
        return { stripe, elements, paymentRequest, prButton };
      } catch (err) {
        console.warn('PaymentRequest init error', err);
        return null;
      }
    }
  };
})();
