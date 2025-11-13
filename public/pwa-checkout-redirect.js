/*
  iOS PWA -> Open Checkout in Safari for Apple Pay
  Conditions for redirect:
  - iOS device
  - PWA standalone display-mode
  - Production domain contains "greekaway.com"
  - Do not impact Android or desktop

  Note: We also detect Safari user agent (for diagnostics),
  but the redirect is strictly gated by the conditions above per spec.
*/
(function(){
  try {
    var ua = (navigator && navigator.userAgent) ? navigator.userAgent : '';
    var isIOS = /iphone|ipad|ipod/i.test(ua);
    var isStandalone = (function(){
      try { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (window.navigator && window.navigator.standalone === true); } catch(_) { return false; }
    })();
    // Safari UA (not used to gate redirect, but detected as requested)
    var isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);

    var origin = (window && window.location && window.location.origin) ? window.location.origin : '';
    var isGreekawayProd = /greekaway\.com/i.test(origin);

    function shouldRedirect(){
      return isIOS && isStandalone && isGreekawayProd;
    }

    function performRedirect(){
      if (!shouldRedirect()) return;
      try {
        var current = String(window.location.href || '');
        // Per spec: ensure https. Replace only when needed to avoid needless reloads.
        var target = current.replace('http://', 'https://');
        if (target !== current) {
          window.location.href = target;
        }
        // If already https, no action is needed. We explicitly avoid setting the same href.
      } catch (e) { /* ignore */ }
    }

    // 1) On checkout page load, auto-redirect if conditions are met
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', performRedirect, { once: true });
    } else {
      // DOM already ready
      performRedirect();
    }

    // 2) On clicking a "Πληρωμή" (Pay) button in iOS PWA, open in Safari
    //    Apple Pay on the web is not available inside standalone PWA on iOS.
    //    We open the same checkout URL in Safari via window.open(..., '_blank')
    //    Note: Must be triggered by a user gesture (click), else popup blockers apply.
    document.addEventListener('click', function(ev){
      if (!shouldRedirect()) return;
      var el = ev.target;
      if (!el) return;
      var btn = el.closest ? el.closest('button, a, input[type="submit"], .btn') : null;
      if (!btn) return;
      var label = '';
      try { label = (btn.getAttribute('data-i18n') || btn.getAttribute('data-i18n-key') || '').toLowerCase(); } catch(_){}
      if (!label) {
        try { label = (btn.textContent || btn.value || '').trim().toLowerCase(); } catch(_) { label=''; }
      }
      // Greek "Πληρωμή" or i18n key includes checkout.pay
      var looksLikePay = label.includes('πληρωμή') || label.includes('checkout.pay') || label === 'pay';
      if (!looksLikePay) return;

      try {
        var current = String(window.location.href || '');
        var httpsUrl = current.replace('http://', 'https://');
        // Prefer opening in Safari (new tab) to escape standalone context
        // Add a lightweight marker to help analytics/diagnostics (no functional impact)
        var url = new URL(httpsUrl);
        if (!url.searchParams.has('fromPWA')) url.searchParams.set('fromPWA', '1');
        ev.preventDefault();
        ev.stopPropagation();
        // Open in external Safari tab; noopener prevents back-channel references
        window.open(url.toString(), '_blank', 'noopener,noreferrer');
      } catch (_) {
        // As a fallback, ensure https navigation in-place
        try { var cur = String(window.location.href||''); var tgt = cur.replace('http://','https://'); if (tgt !== cur) window.location.href = tgt; } catch(__){}
      }
    }, true);

    // Expose small debug hook for QA (no side effects if unused)
    try { window.__GW_PWA_CHECKOUT_DEBUG__ = { isIOS:isIOS, isStandalone:isStandalone, isSafari:isSafari, isGreekawayProd:isGreekawayProd }; } catch(_){ }
  } catch (err) {
    // Fail silently to avoid impacting checkout
  }
})();
