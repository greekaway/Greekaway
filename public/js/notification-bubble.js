(function () {
  // Avoid duplicate scheduling if script loaded twice
  if (window.__gaBubbleScheduled) return;
  window.__gaBubbleScheduled = true;

  var MESSAGE_KEY = 'notifications.trip_viewers_now';
  var DEFAULT_MESSAGE = 'Άλλοι χρήστες κοιτούν αυτή την εκδρομή τώρα 👀';
  var APPEAR_DELAY_MS = 5000; // show 5s after load
  var LIFETIME_MS = 4600; // ~0.6s fade-in + ~3.4s hold + 0.6s fade-out ≈ 4.6s total

  function getMessage() {
    try {
      if (typeof window.t === 'function') {
        var m = window.t(MESSAGE_KEY);
        if (m && m !== MESSAGE_KEY) return m;
      }
      var msgs = (window.currentI18n && window.currentI18n.msgs) || null;
      if (msgs && msgs.notifications && msgs.notifications.trip_viewers_now) {
        return String(msgs.notifications.trip_viewers_now);
      }
    } catch (_) {}
    return DEFAULT_MESSAGE;
  }

  function injectBubble() {
    if (document.querySelector('.notification-bubble')) return; // already visible
    var bubble = document.createElement('div');
    bubble.className = 'notification-bubble';
  var text = getMessage();
  bubble.setAttribute('role', 'status');
  bubble.setAttribute('aria-live', 'polite');
  bubble.setAttribute('aria-label', text);
  bubble.textContent = text;

    document.body.appendChild(bubble);

    // Remove after CSS animations complete
    setTimeout(function () {
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
    }, LIFETIME_MS);
  }

  function onReady(cb) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', cb, { once: true });
    } else cb();
  }

  onReady(function () {
    setTimeout(injectBubble, APPEAR_DELAY_MS);
  });
})();
