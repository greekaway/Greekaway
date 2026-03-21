/**
 * MoveAthens Hotel Hub — Menu page logic
 * Displays hotel identity header + navigaion cards + logout
 */
(async () => {
  const CK_NAME = 'ma_hotel_phone';
  const clearCookie = (name) => {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
  };

  // ── DOM refs ──
  const avatar     = document.getElementById('hub-avatar');
  const nameEl     = document.getElementById('hub-hotel-name');
  const phoneEl    = document.getElementById('hub-hotel-phone');
  const emailEl    = document.getElementById('hub-hotel-email');
  const logoutBtn  = document.getElementById('hotel-logout-btn');

  // ── Load stored hotel data ──
  const stored = (() => {
    try { return JSON.parse(localStorage.getItem('moveathens_hotel') || 'null'); } catch { return null; }
  })();

  if (stored) {
    const hotelName = stored.hotelName || stored.origin_zone_name || '';

    // Avatar initials (first 2 chars of hotel name)
    if (avatar) {
      const initials = hotelName.trim().substring(0, 2).toUpperCase();
      avatar.textContent = initials || '🏨';
    }

    if (nameEl) nameEl.textContent = hotelName;
    if (phoneEl) {
      const phone = stored.orderer_phone || stored.phone || '';
      phoneEl.textContent = phone ? `📱 Συνδεδεμένος: ${phone}` : '';
    }
    if (emailEl) emailEl.textContent = stored.email || '';

    // Hide email line if empty
    if (emailEl && !stored.email) emailEl.style.display = 'none';
  }

  // ── Logout ──
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('moveathens_hotel');
      localStorage.removeItem('moveathens_hotel_zone_id');
      localStorage.removeItem('moveathens_hotel_zone');
      localStorage.removeItem('moveathens_hotel_address');
      localStorage.removeItem('moveathens_hotel_email');
      clearCookie(CK_NAME);
      window.location.reload();
    });
  }

  // ── Version badge ──
  try {
    const vRes = await fetch('/version.json');
    if (vRes.ok) {
      const vData = await vRes.json();
      const verEl = document.getElementById('ma-version-value');
      const buildEl = document.getElementById('ma-version-build');
      if (verEl && vData.version) verEl.textContent = vData.version;
      if (buildEl && vData.build) buildEl.textContent = `(${vData.build})`;
    }
  } catch (_) {}
})();
