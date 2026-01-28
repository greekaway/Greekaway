(async () => {
  const slot = document.querySelector('[data-ma-modal-slot]');
  if (slot) {
    const cacheBust = window.MoveAthensConfig.isDevHost() ? `?cb=${Date.now()}` : '';
    const res = await fetch(`/moveathens/partials/contact-modal.html${cacheBust}`);
    slot.innerHTML = await res.text();
  }

  const cfg = await window.MoveAthensConfig.load();
  window.MoveAthensConfig.applyModalLabels(document, cfg);

  const phone = cfg.phoneNumber || '';
  const whatsapp = cfg.whatsappNumber || '';
  const waDigits = window.MoveAthensConfig.normalizePhone(whatsapp);

  document.querySelectorAll('[data-ma-cta-value]').forEach((el) => {
    const key = el.getAttribute('data-ma-cta-value');
    if (key === 'phone') el.textContent = phone || '';
    if (key === 'whatsapp') el.textContent = whatsapp || '';
  });

  document.querySelectorAll('[data-ma-cta-link]').forEach((el) => {
    const key = el.getAttribute('data-ma-cta-link');
    if (key === 'phone') el.setAttribute('href', phone ? `tel:${phone}` : '#');
    if (key === 'whatsapp') el.setAttribute('href', waDigits ? `https://wa.me/${waDigits}` : '#');
  });

  const modal = document.querySelector('[data-ma-modal]');
  const open = () => {
    if (modal) modal.setAttribute('data-open', 'true');
  };
  const close = () => {
    if (modal) modal.removeAttribute('data-open');
  };

  document.addEventListener('moveathens:open-cta', open);
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (target && target.closest('[data-ma-modal-close]')) close();
    if (target && target.matches('[data-ma-modal]')) close();
  });
})();
