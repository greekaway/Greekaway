(function(){
  function normalizeMode(value){
    return (value || '').trim().toLowerCase();
  }

  function ready(fn){
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  ready(() => {
    const tabs = Array.from(document.querySelectorAll('.modes-tabs [data-mode]'));
    const modeCards = Array.from(document.querySelectorAll('.mode-card[data-mode-form]'));
    if (!tabs.length || !modeCards.length) return;

    const cardMap = new Map();
    modeCards.forEach((card) => {
      const modeKey = normalizeMode(card.dataset.modeForm || card.getAttribute('data-mode-form'));
      if (modeKey) {
        cardMap.set(modeKey, card);
      }
    });

    if (!cardMap.size) return;

    function applyActiveMode(targetMode){
      const mode = normalizeMode(targetMode);
      if (!mode || !cardMap.has(mode)) return;

      tabs.forEach((tab) => {
        const isActive = normalizeMode(tab.dataset.mode) === mode;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        tab.setAttribute('tabindex', isActive ? '0' : '-1');
      });

      cardMap.forEach((card, key) => {
        const isActive = key === mode;
        card.classList.toggle('is-active', isActive);
        card.classList.toggle('is-hidden', !isActive);
      });
    }

    const params = new URLSearchParams(window.location.search || '');
    const requestedMode = normalizeMode(params.get('mode'));
    let defaultMode = normalizeMode(tabs[0] && tabs[0].dataset.mode);
    if (requestedMode && cardMap.has(requestedMode)) {
      defaultMode = requestedMode;
    }

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const nextMode = normalizeMode(tab.dataset.mode);
        if (!nextMode || !cardMap.has(nextMode)) return;
        applyActiveMode(nextMode);
      });
    });

    if (defaultMode && cardMap.has(defaultMode)) {
      applyActiveMode(defaultMode);
    }
  });
})();
