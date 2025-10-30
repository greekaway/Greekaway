(function(){
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const state = {
    creds: { user: '', pass: '' },
    loaded: { home: true, bookings: false, payments: false, partners: false, settings: false },
    active: 'home'
  };

  function setStatus(msg){ const el = $('#ahLoginStatus'); if (el) el.textContent = msg || ''; }

  function attachLoginBar(){
    const btn = $('#ahLoginBtn'); if (!btn) return;
    btn.addEventListener('click', async () => {
      const u = $('#ahUser').value.trim();
      const p = $('#ahPass').value.trim();
      state.creds.user = u; state.creds.pass = p;
      // Show loading indication
      setLoading(true, 'Επαλήθευση…');
      // Find iframes that require login (admin.html instances)
      const frames = $$('#adminContent iframe').filter(f => {
        try { return f && f.contentWindow && /\/admin\.html(\?|$)/.test(f.getAttribute('src')||''); } catch(_) { return false; }
      });
      // If active iframe exists, ensure we inject there immediately
      const activeView = $('#adminContent .view.active iframe');
      if (activeView) { try { await tryInjectLogin(activeView); } catch(_) {} }
      // Inject into the rest in parallel (if already loaded)
      const promises = frames.map(f => tryInjectLogin(f));
      try { await Promise.allSettled(promises); } catch(_) {}
      // Done → hide form with a small fade-out and show success
      onLoginSuccess();
    });
  }

  function switchTab(tab){
    if (!tab || state.active === tab) return;
    // update active tab button
    $$('.tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    // views
    const prev = state.active; const prevView = $(`#view-${prev}`);
    const nextView = ensureView(tab);
    if (prevView) prevView.classList.remove('active');
    if (nextView) nextView.classList.add('active');
    state.active = tab;

    // lazy load content for frames
    if ((tab === 'bookings' || tab === 'payments' || tab === 'partners') && !state.loaded[tab]) {
      const frame = $(`#view-${tab} iframe`);
      if (frame) {
        frame.addEventListener('load', () => tryInjectLogin(frame), { once: true });
        // src already set in ensureView
      }
      state.loaded[tab] = true;
    }
  }

  function ensureView(tab){
    let view = $(`#view-${tab}`);
    if (view) return view;
    view = document.createElement('section');
    view.id = `view-${tab}`; view.className = 'view'; view.dataset.tab = tab;
    if (tab === 'bookings') {
      view.innerHTML = `<iframe id="tab-bookings" title="Bookings" src="/admin.html"></iframe>`;
    } else if (tab === 'payments') {
      view.innerHTML = `<iframe id="tab-payments" title="Payments" src="/admin.html?view=payments"></iframe>`;
    } else if (tab === 'partners') {
      view.innerHTML = `<iframe id="tab-partners" title="Partners" src="/admin-groups.html"></iframe>`;
    } else if (tab === 'settings') {
      view.innerHTML = `<div class="settings-wrap"><h2>Settings</h2><p>Coming soon.</p></div>`;
    }
    $('#adminContent').appendChild(view);
    return view;
  }

  function tryInjectLogin(frame){
    return new Promise((resolve) => {
      try {
        if (!frame || !frame.contentWindow || !state.creds.user) return resolve(false);
        const doc = frame.contentWindow.document;
        const attempt = () => {
          try {
            const authForm = doc.getElementById('auth');
            const user = doc.getElementById('user');
            const pass = doc.getElementById('pass');
            const login = doc.getElementById('login');
            if (authForm && user && pass && login) {
              user.value = state.creds.user; pass.value = state.creds.pass;
              login.click();
            }
          } catch(_) {}
        };
        attempt();
        // Poll until #main visible or #auth hidden
        const t0 = Date.now();
        const timer = setInterval(() => {
          try {
            const main = doc.getElementById('main');
            const auth = doc.getElementById('auth');
            const ok = (main && getComputedStyle(main).display !== 'none') || (auth && getComputedStyle(auth).display === 'none');
            if (ok) { clearInterval(timer); return resolve(true); }
          } catch(_) {}
          if (Date.now() - t0 > 5000) { clearInterval(timer); return resolve(false); }
        }, 200);
      } catch (_) { return resolve(false); }
    });
  }

  function setLoading(isLoading, msg){
    const bar = $('#adminLoginBar');
    const btn = $('#ahLoginBtn');
    if (!bar || !btn) return;
    if (typeof msg === 'string') setStatus(msg);
    const inputs = [$('#ahUser'), $('#ahPass')].filter(Boolean);
    inputs.forEach(i => i.disabled = !!isLoading);
    btn.disabled = !!isLoading;
  }

  function onLoginSuccess(){
    setStatus('Συνδέθηκες επιτυχώς');
    const bar = $('#adminLoginBar');
    if (!bar) return;
    try {
      // Smooth fade-out then hide
      bar.style.transition = 'opacity 220ms ease, height 220ms ease, margin 220ms ease, padding 220ms ease';
      const h = bar.getBoundingClientRect().height + 'px';
      bar.style.height = h; // lock height first to animate
      requestAnimationFrame(() => {
        bar.style.opacity = '0';
        bar.style.height = '0px';
        bar.style.margin = '0';
        bar.style.paddingTop = '0';
        bar.style.paddingBottom = '0';
        setTimeout(() => { bar.style.display = 'none'; }, 260);
      });
      // Optional toast in content area
      showToast('Συνδέθηκες επιτυχώς');
    } catch(_){ bar.style.display = 'none'; }
  }

  function showToast(message){
    try {
      const div = document.createElement('div');
      div.textContent = message;
      div.style.position = 'fixed';
      div.style.top = '8px';
      div.style.left = '50%';
      div.style.transform = 'translateX(-50%)';
      div.style.background = 'rgba(10,18,28,0.85)';
      div.style.color = '#fff';
      div.style.border = '1px solid rgba(255,255,255,0.2)';
      div.style.borderRadius = '10px';
      div.style.padding = '8px 12px';
      div.style.zIndex = '1000';
      div.style.boxShadow = '0 6px 16px rgba(0,0,0,0.35)';
      div.style.opacity = '0';
      div.style.transition = 'opacity 200ms ease';
      document.body.appendChild(div);
      requestAnimationFrame(() => { div.style.opacity = '1'; });
      setTimeout(() => {
        div.style.opacity = '0';
        setTimeout(() => div.remove(), 220);
      }, 1600);
    } catch(_) {}
  }

  function wireTabs(){
    $$('.tabs .tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  }

  function init(){
    attachLoginBar();
    wireTabs();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
