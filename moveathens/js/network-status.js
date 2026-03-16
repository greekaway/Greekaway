/* ═══════════════════════════════════════════════════════
   Network Status Banner – MoveAthens
   
   Shows a top banner when the device goes offline (red)
   and when it comes back online (green, auto-hides).
   ═══════════════════════════════════════════════════════ */

(() => {
  /* ── Create banner element ── */
  const banner = document.createElement('div');
  banner.className = 'ma-network-banner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  document.body.prepend(banner);

  let hideTimer = null;

  function show(text, type) {
    clearTimeout(hideTimer);
    banner.textContent = text;
    banner.classList.remove('ma-network-banner--offline', 'ma-network-banner--online', 'ma-network-banner--hidden');
    banner.classList.add(`ma-network-banner--${type}`);

    if (type === 'online') {
      hideTimer = setTimeout(() => {
        banner.classList.add('ma-network-banner--hidden');
      }, 3000);
    }
  }

  function hide() {
    clearTimeout(hideTimer);
    banner.classList.remove('ma-network-banner--offline', 'ma-network-banner--online');
    banner.classList.add('ma-network-banner--hidden');
  }

  /* ── Listen for connectivity changes ── */
  window.addEventListener('offline', () => {
    show('Δεν υπάρχει σύνδεση στο διαδίκτυο', 'offline');
  });

  window.addEventListener('online', () => {
    show('Η σύνδεση αποκαταστάθηκε', 'online');
  });

  /* ── If already offline on load, show immediately ── */
  if (!navigator.onLine) {
    show('Δεν υπάρχει σύνδεση στο διαδίκτυο', 'offline');
  }
})();
