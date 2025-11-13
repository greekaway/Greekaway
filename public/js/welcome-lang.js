(function(){
  // Welcome-only custom dropdown that uses the existing #langSelect options
  function init(){
    try {
      if (!document.body || !document.body.classList.contains('has-bg-video')) return;
      const wrap = document.querySelector('#langSelect')?.parentElement;
      const sel = document.getElementById('langSelect');
      if (!wrap || !sel) return;
      // Ensure wrapper can anchor absolute dropdown
      if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
      // Build list once
      let list = wrap.querySelector('.ga-lang-list');
      if (!list) {
        list = document.createElement('div');
        list.className = 'ga-lang-list';
        list.setAttribute('role','listbox');
        list.hidden = true;
        wrap.appendChild(list);
      }
      function build(){
        list.innerHTML = '';
        Array.from(sel.options || []).forEach(o => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.setAttribute('role','option');
          btn.dataset.code = o.value;
          btn.textContent = o.textContent;
          btn.addEventListener('click', () => {
            try { sel.value = o.value; } catch(_){}
            try { window.setLanguage && window.setLanguage(o.value); } catch(_){}
            list.hidden = true;
          });
          list.appendChild(btn);
        });
      }
      build();
      function open(){ list.hidden = false; }
      function close(){ list.hidden = true; }
      // Toggle: open instantly on mousedown/touchstart (no fancy animation)
      const openHandler = (ev) => {
        try { ev.preventDefault(); ev.stopPropagation(); } catch(_){}
        if (list.hidden) open(); else close();
      };
      sel.addEventListener('mousedown', openHandler);
      sel.addEventListener('touchstart', openHandler, { passive: false });
      // Close on outside click / ESC / scroll
      document.addEventListener('click', (e)=>{ if (!list.hidden){ if (!wrap.contains(e.target)) close(); } }, true);
      document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') close(); });
      window.addEventListener('scroll', close, { passive: true });
      // Rebuild if options ever change (rare)
      const mo = new MutationObserver(()=>build());
      mo.observe(sel, { childList: true });
    } catch(_){ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
