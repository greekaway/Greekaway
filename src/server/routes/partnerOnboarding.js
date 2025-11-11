'use strict';
// Phase 7: Partner Stripe onboarding callback + JSON redirect shim
// registerPartnerOnboarding(app, { stripe })

function registerPartnerOnboarding(app, deps) {
  const { stripe } = deps;

  // HTML callback that validates account then shows success page
  app.get('/partner-stripe-onboarding/callback', async (req, res) => {
    try {
      if (!stripe) {
        res.status(500).send('<!doctype html><html><body><h2>Stripe onboarding failed, please retry</h2><p>Stripe is not configured on the server.</p></body></html>');
        return;
      }
      const accountId = String((req.query && req.query.account) || '').trim();
      if (!accountId) {
        res.status(400).send('<!doctype html><html><body><h2>Stripe onboarding failed, please retry</h2><p>Missing account id.</p></body></html>');
        return;
      }
      try { await stripe.accounts.retrieve(accountId); } catch (e) {
        const msg = (e && e.message) ? e.message : 'Failed to verify account';
        res.status(500).send(`<!doctype html><html><body><h2>Stripe onboarding failed, please retry</h2><p>${msg}</p></body></html>`);
        return;
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send('<!doctype html><html><body><h2>Stripe connection successful</h2><p>You can close this tab and return to the admin.</p></body></html>');
    } catch (e) {
      const msg = (e && e.message) ? e.message : 'Unexpected error';
      res.status(500).send(`<!doctype html><html><body><h2>Stripe onboarding failed, please retry</h2><p>${msg}</p></body></html>`);
    }
  });

  // JSON callback redirect shim (preserves original behavior)
  app.get('/api/partners/connect-callback', (req, res, next) => {
    try {
      const accept = String(req.headers && req.headers.accept || '');
      if (/text\/html/i.test(accept)) {
        const qsIndex = req.url.indexOf('?');
        const qs = qsIndex >= 0 ? req.url.slice(qsIndex) : '';
        return res.redirect('/partner-stripe-onboarding/callback' + qs);
      }
    } catch (_) {}
    next();
  });
}

module.exports = { registerPartnerOnboarding };
