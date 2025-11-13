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

    // 2) On clicking a "Πληρωμή" (Pay) button, also attempt redirect before continuing
    //    We keep it unobtrusive: only in iOS PWA on greekaway.com. We prevent default
    //    only when we're actually changing http->https; otherwise we let the click proceed.
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

      var current = String(window.location.href || '');
      var target = current.replace('http://', 'https://');
      if (target !== current) {
        try { ev.preventDefault(); ev.stopPropagation(); } catch(_){ }
        window.location.href = target;
      }
    }, true);

    // Expose small debug hook for QA (no side effects if unused)
    try { window.__GW_PWA_CHECKOUT_DEBUG__ = { isIOS:isIOS, isStandalone:isStandalone, isSafari:isSafari, isGreekawayProd:isGreekawayProd }; } catch(_){ }
  } catch (err) {
    // Fail silently to avoid impacting checkout
  }
})();
