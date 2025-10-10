// Overlay Manager
// Handles: only-one-open, focus-trap, aria-hidden on background, ESC to close, click-outside-to-close
(function(){
  const selectorsFocusable = 'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';
  let overlays = [];
  let lastActive = null;
  let current = null;

  function updateOverlays(){ overlays = Array.from(document.querySelectorAll('.overlay')); }

  function setBackgroundHidden(hidden){
    Array.from(document.body.children).forEach(child => {
      if (child.classList && child.classList.contains('overlay')) return;
      if (hidden) child.setAttribute('aria-hidden','true');
      else child.removeAttribute('aria-hidden');
    });
  }

  function focusFirst(el){
    if(!el) return;
    const f = el.querySelector(selectorsFocusable);
    if(f) f.focus(); else el.focus();
  }

  function trapTab(e){
    if(!current) return;
    if(e.key !== 'Tab') return;
    const focusables = Array.from(current.querySelectorAll(selectorsFocusable)).filter(n => n.offsetParent !== null);
    if(focusables.length === 0){ e.preventDefault(); return; }
    const first = focusables[0];
    const last = focusables[focusables.length -1];
    if(e.shiftKey){ if(document.activeElement === first){ last.focus(); e.preventDefault(); } }
    else { if(document.activeElement === last){ first.focus(); e.preventDefault(); } }
  }

  function openOverlay(id){
    updateOverlays();
    overlays.forEach(o => { if(o.id !== id) o.classList.remove('active'); });
    const el = document.getElementById(id);
    if(!el) return;
    lastActive = document.activeElement;
    el.classList.add('active');
    current = el;
    setBackgroundHidden(true);
    document.body.classList.add('overlay-open');
    focusFirst(el);
    document.addEventListener('keydown', onKeydown);
  }

  function closeOverlay(id){
    updateOverlays();
    if(id){
      const el = document.getElementById(id);
      if(el) el.classList.remove('active');
    } else {
      overlays.forEach(o => o.classList.remove('active'));
    }
    document.body.classList.remove('overlay-open');
    setBackgroundHidden(false);
    if(lastActive && lastActive.focus) try{ lastActive.focus(); } catch(e){}
    current = null;
    document.removeEventListener('keydown', onKeydown);
  }

  function onKeydown(e){
    if(!current) return;
    if(e.key === 'Escape') { closeOverlay(); return; }
    if(e.key === 'Tab') trapTab(e);
  }

  function setup(){
    updateOverlays();
    overlays.forEach(o => {
      o.addEventListener('click', function(e){ if(e.target === o) closeOverlay(o.id); });
      // ensure overlay is focusable for accessibility
      if(!o.hasAttribute('tabindex')) o.setAttribute('tabindex','-1');
    });
    // expose
    window.openOverlay = openOverlay;
    window.closeOverlay = closeOverlay;
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
