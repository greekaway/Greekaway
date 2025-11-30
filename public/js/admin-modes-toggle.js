(function(){
  function ready(fn){
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function dispatchChange(node){
    if (!node) return;
    const events = ['input', 'change'];
    events.forEach((type) => {
      try {
        node.dispatchEvent(new Event(type, { bubbles: true }));
      } catch (_) {
        const evt = document.createEvent('Event');
        evt.initEvent(type, true, true);
        node.dispatchEvent(evt);
      }
    });
  }

  ready(() => {
    const controls = document.querySelectorAll('.mode-active-control');
    controls.forEach((control) => {
      const button = control.querySelector('.mode-active-toggle');
      const stateLabel = control.querySelector('.mode-active-state');
      const activeText = stateLabel && stateLabel.querySelector('.state-text-active');
      const inactiveText = stateLabel && stateLabel.querySelector('.state-text-inactive');
      const symbol = control.querySelector('.mode-active-symbol');
      const input = control.querySelector('[data-field="active"]');
      if (!button || !stateLabel || !symbol || !input) return;

      function render(isActive){
        const nextState = !!isActive;
        button.classList.toggle('is-active', nextState);
        button.setAttribute('aria-pressed', nextState ? 'true' : 'false');
        control.dataset.state = nextState ? 'active' : 'inactive';
        if (activeText) activeText.hidden = !nextState;
        if (inactiveText) inactiveText.hidden = nextState;
        symbol.textContent = nextState ? '✓' : '';
      }

      function setState(next){
        const normalized = !!next;
        input.checked = normalized;
        render(normalized);
        dispatchChange(input);
      }

      button.addEventListener('click', () => {
        setState(!input.checked);
      });

      setState(input.checked);
    });
  });
})();
