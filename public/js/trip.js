(function(){
  function ready(fn){
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function openOverlaySafe(id){
    if (typeof window.openOverlay === 'function') {
      window.openOverlay(id);
      return;
    }
    const overlay = document.getElementById(id);
    if (overlay) {
      overlay.classList.add('active');
      document.body.classList.add('overlay-open');
    }
  }

  ready(function(){
    const tabsRoot = document.getElementById('tripInfoTabs');
    const overlay = document.getElementById('tripInfoOverlay');
    const overlayTitle = document.getElementById('tripInfoOverlayTitle');
    const overlayBody = document.getElementById('tripInfoOverlayBody');
    const assistantOverlayId = 'aiOverlay';
    if (!tabsRoot || !overlay || !overlayTitle || !overlayBody) return;

    const buttons = Array.from(tabsRoot.querySelectorAll('.trip-info-tab'));
    const KEY_META = {
      includes: { title: 'Περιλαμβάνεται' },
      excludes: { title: 'Δεν Περιλαμβάνεται' },
      experience: { title: 'Εμπειρία' },
      faq: { title: 'Συχνές Ερωτήσεις' }
    };

    let activeKey = null;

    function setActiveKey(key){
      activeKey = key;
      buttons.forEach(btn => {
        const match = btn.dataset.infoKey === key;
        btn.classList.toggle('is-active', match);
        btn.setAttribute('aria-pressed', match ? 'true' : 'false');
      });
      tabsRoot.classList.toggle('is-floating', Boolean(key));
    }

    function clearActive(){ setActiveKey(null); }

    if (overlay) {
      const observer = new MutationObserver(() => {
        if (!overlay.classList.contains('active')) {
          clearActive();
        }
      });
      observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    }

    function openAssistant(){
      closeOverlaySafe('tripInfoOverlay');
      clearActive();
      openOverlaySafe(assistantOverlayId);
    }

    function goHome(){
      closeOverlaySafe('tripInfoOverlay');
      clearActive();
      const titleEl = document.getElementById('trip-title');
      if (titleEl && typeof titleEl.scrollIntoView === 'function') {
        titleEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    function wrapCard(inner){
      return `<article class="trip-info-card">${inner}</article>`;
    }

    function buildListFromColumn(selector){
      const column = document.querySelector(selector);
      if (!column) return '';
      const listItems = Array.from(column.querySelectorAll('li'));
      if (!listItems.length) return '';
      const heading = column.querySelector('h4') ? column.querySelector('h4').textContent.trim() : '';
      const listHtml = `<ul>${listItems.map(li => `<li>${li.innerHTML.trim()}</li>`).join('')}</ul>`;
      const headingHtml = heading ? `<h4>${heading}</h4>` : '';
      return wrapCard(`${headingHtml}${listHtml}`);
    }

    function buildExperience(){
      const cards = Array.from(document.querySelectorAll('#trip-sections .trip-card'));
      if (!cards.length) return '';
      return cards.map(card => {
        const title = card.querySelector('h3') ? card.querySelector('h3').textContent.trim() : '';
        const bodyEl = card.querySelector('p');
        const bodyHtml = bodyEl ? bodyEl.innerHTML : card.innerHTML;
        const titleHtml = title ? `<h3>${title}</h3>` : '';
        return wrapCard(`${titleHtml}${bodyHtml}`);
      }).join('');
    }

    function buildFaq(){
      const items = Array.from(document.querySelectorAll('#trip-faq .trip-faq-item'));
      if (!items.length) return '';
      return items.map(item => {
        const question = item.querySelector('strong') ? item.querySelector('strong').textContent.trim() : '';
        const answerEl = item.querySelector('p');
        const answerHtml = answerEl ? answerEl.innerHTML : '';
        const questionHtml = question ? `<h3>${question}</h3>` : '';
        return wrapCard(`${questionHtml}${answerHtml}`);
      }).join('');
    }

    function getContentPayload(key){
      if (key === 'assistant') {
        return { title: '', html: '' };
      }
      switch (key) {
        case 'includes':
          return { title: KEY_META.includes.title, html: buildListFromColumn('#trip-includes .trip-inclusions-column:not(.is-excludes)') };
        case 'excludes':
          return { title: KEY_META.excludes.title, html: buildListFromColumn('#trip-includes .trip-inclusions-column.is-excludes') };
        case 'experience':
          return { title: KEY_META.experience.title, html: buildExperience() };
        case 'faq':
          return { title: KEY_META.faq.title, html: buildFaq() };
        default:
          return { title: '', html: '' };
      }
    }

    function showContent(key){
      const payload = getContentPayload(key);
      overlayTitle.textContent = payload.title || 'Πληροφορίες';
      overlayBody.innerHTML = payload.html || '<div class="trip-info-empty">Δεν υπάρχουν διαθέσιμα δεδομένα για αυτή την ενότητα.</div>';
      openOverlaySafe('tripInfoOverlay');
      setActiveKey(key);
    }

    function closeOverlaySafe(id){
      if (typeof window.closeOverlay === 'function') {
        window.closeOverlay(id);
      } else {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
        document.body.classList.remove('overlay-open');
      }
    }

    function refreshActiveContent(){
      if (!activeKey) return;
      const payload = getContentPayload(activeKey);
      if (!payload.html) {
        clearActive();
        if (overlay.classList.contains('active')) closeOverlaySafe('tripInfoOverlay');
        return;
      }
      overlayTitle.textContent = payload.title || 'Πληροφορίες';
      overlayBody.innerHTML = payload.html;
    }

    function updateAvailability(){
      buttons.forEach(btn => {
        const key = btn.dataset.infoKey;
        if (!key || key === 'assistant' || key === 'home') {
          btn.disabled = false;
          btn.classList.remove('is-disabled');
          return;
        }
        const hasContent = !!getContentPayload(key).html;
        btn.disabled = !hasContent;
        btn.classList.toggle('is-disabled', !hasContent);
      });
    }

    buttons.forEach(btn => {
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', function(){
        const key = btn.dataset.infoKey;
        if (!key) return;
        if (key === 'assistant') {
          openAssistant();
          return;
        }
        if (key === 'home') {
          goHome();
          return;
        }
        if (btn.disabled) return;
        if (key === activeKey) {
          closeOverlaySafe('tripInfoOverlay');
          clearActive();
          return;
        }
        showContent(key);
      });
    });

    ['#trip-includes', '#trip-sections', '#trip-faq'].forEach(selector => {
      const el = document.querySelector(selector);
      if (!el) return;
      const observer = new MutationObserver(() => {
        updateAvailability();
        refreshActiveContent();
      });
      observer.observe(el, { childList: true, subtree: true, attributes: true });
    });

    updateAvailability();
    setTimeout(updateAvailability, 1200);
  });
})();
