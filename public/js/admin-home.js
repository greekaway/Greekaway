(function(){
  // Build/version marker for cache verification
  try { window.__AH_VERSION = '20251031-1'; console.info('Admin Home build', window.__AH_VERSION); } catch(_) {}
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (ch) => {
      switch (ch) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return ch;
      }
    });
  }

  const state = {
    creds: { user: '', pass: '' },
    authHeader: null,
    loaded: { home: true, bookings: false, payments: false, partners: false, manual: false, settings: false },
    active: 'home',
    lastActivity: Date.now(),
    idleMs: 15 * 60 * 1000, // 15 minutes
    idleTimer: null,
    expired: false
  };

  function setStatus(msg){ const el = $('#ahLoginStatus'); if (el) el.textContent = msg || ''; }

  function bumpActivity(){
    state.lastActivity = Date.now();
  }

  function ensureIdleWatcher(){
    if (state.idleTimer) return;
    state.idleTimer = setInterval(() => {
      if (!state.authHeader) return; // not logged in
      if (Date.now() - state.lastActivity > state.idleMs) {
        // expire session
        state.expired = true;
        state.creds = { user: '', pass: '' };
        state.authHeader = null;
        showLoginBar('Η συνεδρία έληξε, παρακαλώ συνδεθείτε ξανά');
      }
    }, 30000);
  }

  function attachLoginBar(){
    const btn = $('#ahLoginBtn'); if (!btn) return;
    btn.addEventListener('click', async () => {
      const u = $('#ahUser').value.trim();
      const p = $('#ahPass').value.trim();
      state.creds.user = u; state.creds.pass = p;
      state.authHeader = 'Basic ' + btoa(u + ':' + p);
      bumpActivity();
      // Show loading indication
      setLoading(true, 'Επαλήθευση…');
      // Quick preflight to validate credentials against a protected endpoint
      try {
        const r = await fetch('/admin/backup-status', { headers: { Authorization: state.authHeader } });
        if (!r.ok) {
          setStatus('Λάθος διαπιστευτήρια (401)');
          setLoading(false);
          return;
        }
      } catch (e) {
        setStatus('Σφάλμα σύνδεσης');
        setLoading(false);
        return;
      }
      state.expired = false;
      ensureIdleWatcher();
      // Find iframes that require login (admin.html instances)
      const frames = $$('#adminContent iframe').filter(f => {
        try { return f && f.contentWindow && /\/admin\.html(\?|$)/.test(f.getAttribute('src')||''); } catch(_) { return false; }
      });
      // If active iframe exists, ensure we inject there immediately
      const activeView = $('#adminContent .view.active iframe');
      if (activeView) {
        try {
          const mode = activeView.id && activeView.id.includes('payments') ? 'payments' : (activeView.id && activeView.id.includes('bookings') ? 'bookings' : undefined);
          await tryInjectLogin(activeView, mode);
        } catch(_) {}
      }
      // Inject into the rest in parallel (if already loaded)
      const promises = frames.map(f => {
        const id = f.id || '';
        const mode = id.includes('payments') ? 'payments' : (id.includes('bookings') ? 'bookings' : undefined);
        return tryInjectLogin(f, mode);
      });
      // Also update partners iframe to include auth param if present
      const partnersFrame = $('#tab-partners');
      if (partnersFrame && u && p) {
        try {
          const url = new URL(partnersFrame.src, window.location.origin);
          url.searchParams.set('auth', btoa(u + ':' + p));
          partnersFrame.src = url.toString();
        } catch(_) {}
      }
      try { await Promise.allSettled(promises); } catch(_) {}
      // Done → hide form with a small fade-out and show success
      onLoginSuccess();
    });
  }

  function switchTab(tab){
    if (!tab || state.active === tab) return;
    bumpActivity();
    // update active tab button
    $$('.tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    // views
    const prev = state.active; const prevView = $(`#view-${prev}`);
    const nextView = ensureView(tab);
    // Only toggle visibility; keep iframes alive to preserve login/session state
    if (prevView) {
      prevView.classList.remove('active');
    }
    if (nextView) nextView.classList.add('active');
    state.active = tab;

    // lazy load content for frames
    if ((tab === 'bookings' || tab === 'payments' || tab === 'partners' || tab === 'manual')) {
      let frame = $(`#view-${tab} iframe`);
      if (!frame) {
        // ensure iframe exists if view was created earlier but iframe was missing
        ensureView(tab); frame = $(`#view-${tab} iframe`);
      }
      if (frame && !frame.dataset.ahWired) {
        const mode = tab === 'bookings' ? 'bookings' : (tab === 'payments' ? 'payments' : (tab === 'partners' ? 'partners' : 'manual'));
        frame.addEventListener('load', () => tryInjectLogin(frame, mode), { once: true });
        frame.dataset.ahWired = '1';
      }
    }
    // Also attempt immediate re-injection for the now-active iframe (if it already existed)
    const nowFrame = $(`#view-${tab} iframe`);
    if (nowFrame && state.authHeader) {
      const mode = tab === 'bookings' ? 'bookings' : (tab === 'payments' ? 'payments' : (tab === 'partners' ? 'partners' : 'manual'));
      try { tryInjectLogin(nowFrame, mode); } catch(_) {}
    }
  }

  function ensureView(tab){
    let view = $(`#view-${tab}`);
    const cb = `cb=${Date.now()}`;
    if (!view) {
      view = document.createElement('section');
      view.id = `view-${tab}`; view.className = 'view'; view.dataset.tab = tab;
      if (tab === 'bookings') {
        view.innerHTML = `<iframe id="tab-bookings" title="Bookings" src="/admin.html?view=bookings&${cb}"></iframe>`;
      } else if (tab === 'payments') {
        view.innerHTML = `<iframe id="tab-payments" title="Payments" src="/admin-payments.html?${cb}"></iframe>`;
      } else if (tab === 'partners') {
        const qp = [];
        if (state.creds.user && state.creds.pass) qp.push(`auth=${encodeURIComponent(btoa(state.creds.user + ':' + state.creds.pass))}`);
        qp.push(cb);
        view.innerHTML = `<iframe id="tab-partners" title="Partners" src="/admin-groups.html${qp.length ? ('?' + qp.join('&')) : ''}"></iframe>`;
      } else if (tab === 'manual') {
        view.innerHTML = `<iframe id="tab-manual" title="Manual Payments" src="/manual-payments.html?${cb}"></iframe>`;
      } else if (tab === 'settings') {
        view.innerHTML = `<div class="settings-wrap"><h2>Settings</h2><p>Coming soon.</p></div>`;
      }
      $('#adminContent').appendChild(view);
      return view;
    }
    // View exists: ensure iframe present
    let frame = view.querySelector('iframe');
    if (!frame) {
      if (tab === 'bookings') {
        frame = document.createElement('iframe');
        frame.id = 'tab-bookings'; frame.title = 'Bookings';
        frame.src = `/admin.html?view=bookings&${cb}`;
      } else if (tab === 'payments') {
        frame = document.createElement('iframe');
        frame.id = 'tab-payments'; frame.title = 'Payments';
        frame.src = `/admin-payments.html?${cb}`;
      } else if (tab === 'partners') {
        frame = document.createElement('iframe');
        frame.id = 'tab-partners'; frame.title = 'Partners';
        const qp = [];
        if (state.creds.user && state.creds.pass) qp.push(`auth=${encodeURIComponent(btoa(state.creds.user + ':' + state.creds.pass))}`);
        qp.push(cb);
        frame.src = `/admin-groups.html${qp.length ? ('?' + qp.join('&')) : ''}`;
      } else if (tab === 'manual') {
        frame = document.createElement('iframe');
        frame.id = 'tab-manual'; frame.title = 'Manual Payments';
        frame.src = `/manual-payments.html?${cb}`;
      }
      if (frame) view.appendChild(frame);
    }
    return view;
  }

  // Backups compact box on Home
  async function fetchBackupHome(){
    try {
      const box = document.getElementById('backup');
      if (!box || !state.authHeader) return;
      box.textContent = 'Φόρτωση…';
      const r = await fetch('/admin/backup-status', { headers: { Authorization: state.authHeader } });
      if (!r.ok) throw new Error('HTTP '+r.status);
      const j = await r.json();
      const count = (j && (j.count ?? j.backupsCount ?? j.total)) || 0;
      const latestObj = j && (j.latestDb || j.latest || j.latestZip || j.latestLog) || null;
      const latestAt = j && (j.lastRunAt || j.latestAt || j.latestDate || (latestObj && latestObj.mtime) || '');
      const when = latestAt ? new Date(latestAt) : null;
      const dd = when ? String(when.getDate()).padStart(2,'0') : '';
      const mm = when ? String(when.getMonth()+1).padStart(2,'0') : '';
      const yyyy = when ? when.getFullYear() : '';
      const hh = when ? String(when.getHours()).padStart(2,'0') : '';
      const min = when ? String(when.getMinutes()).padStart(2,'0') : '';
      const whenPretty = (when && !isNaN(when.getTime())) ? `${dd}/${mm}/${yyyy} – ${hh}:${min}` : '—';
      const size = latestObj && typeof latestObj === 'object' ? latestObj.size : undefined;
      let sizeStr = '';
      if (typeof size === 'number') {
        let n = size; const units = ['B','KB','MB','GB','TB']; let i=0; while(n>=1024 && i<units.length-1){ n/=1024; i++; }
        sizeStr = Math.round(n) + ' ' + units[i];
      }
      const dir = (j && j.backupsDir) ? String(j.backupsDir) : '';
      const line1 = 'Σύνολο αντιγράφων: ' + String(count || '—');
      let line2 = 'Τελευταίο αντίγραφο: ' + whenPretty;
      if (sizeStr) line2 += ' (' + sizeStr + ')';
      let line3 = '';
      if (count === 0) {
        line3 = '<div style="opacity:0.85;font-size:12px">Δεν βρέθηκαν αντίγραφα στον φάκελο: ' + (dir ? '<code>'+escapeHtml(dir)+'</code>' : '—') + '</div>';
      } else if (dir) {
        line3 = '<div style="opacity:0.7;font-size:12px">Φάκελος: <code>'+escapeHtml(dir)+'</code></div>';
      }
      box.innerHTML = '<div>'+line1+'</div><div>'+line2+'</div>' + line3;
    } catch (e) {
      const box = document.getElementById('backup'); if (box) box.textContent = 'Σφάλμα';
    }
  }

  function tryInjectLogin(frame, mode){
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
              bumpActivity();
            }
            // Partners view uses standalone page without auth form; reload with auth param if needed
            if (!authForm && /admin-groups\.html/.test(frame.src)) {
              const authParam = btoa(state.creds.user + ':' + state.creds.pass);
              const url = new URL(frame.src, window.location.origin);
              if (url.searchParams.get('auth') !== authParam) {
                url.searchParams.set('auth', authParam);
                frame.src = url.toString();
              }
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
            if (ok) {
              // Adjust visible panels depending on desired mode (bookings vs payments)
              try {
                if (mode === 'bookings') {
                  const bookingsPanel = doc.getElementById('bookingsPanel');
                  const paymentsContainer = doc.getElementById('paymentsContainer');
                  if (bookingsPanel) bookingsPanel.style.display = 'block';
                  if (paymentsContainer) paymentsContainer.style.display = 'none';
                } else if (mode === 'payments') {
                  const bookingsPanel = doc.getElementById('bookingsPanel');
                  const paymentsContainer = doc.getElementById('paymentsContainer');
                  if (bookingsPanel) bookingsPanel.style.display = 'none';
                  if (paymentsContainer) paymentsContainer.style.display = 'block';
                }
              } catch(_) {}
              bumpActivity();
              clearInterval(timer); return resolve(true);
            }
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
    // Refresh backups box on Home
    fetchBackupHome();
  }

  function showLoginBar(message){
    const bar = $('#adminLoginBar');
    if (!bar) return;
    // Reset inline styles from fade-out
    bar.style.display = 'flex';
    bar.style.opacity = '1';
    bar.style.height = '';
    bar.style.margin = '';
    bar.style.paddingTop = '';
    bar.style.paddingBottom = '';
    setLoading(false);
    setStatus(message || '');
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

  function wireNavTouchGuard(){
    const nav = document.getElementById('adminNav');
    if (!nav) return;
    let sx = 0, sy = 0;
    nav.addEventListener('touchstart', (e) => {
      const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
      if (!t) return;
      sx = t.clientX; sy = t.clientY;
    }, { passive: true });
    nav.addEventListener('touchmove', (e) => {
      const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
      if (!t) return;
      const dx = Math.abs(t.clientX - sx);
      const dy = Math.abs(t.clientY - sy);
      // If gesture tends vertical, prevent starting page scroll from the nav area
      if (dy > dx && dy > 4) {
        e.preventDefault();
      }
    }, { passive: false });
  }

  function init(){
    attachLoginBar();
    wireTabs();
    wireNavTouchGuard();
    ensureIdleWatcher();
    // Stripe tools are wired by a separate initializer below; avoid calling an out-of-scope symbol here.
    // Also wire Backup refresh button here for convenience.
    const rb = document.getElementById('refreshBackup');
    if (rb) rb.addEventListener('click', fetchBackupHome);
    // Bump activity on common user events
    ['mousemove','keydown','touchstart','visibilitychange'].forEach(ev => document.addEventListener(ev, bumpActivity, { passive: true }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

// Stripe Partner Tools moved into Admin Home: reuse same behavior as admin.html
(function(){
  function wireStripeTools(){
    const btnGen = document.getElementById('genStripeLink');
    const btnCopy = document.getElementById('copyOnboarding');
    if (btnGen) {
      btnGen.addEventListener('click', async () => {
        const emailEl = document.getElementById('partnerEmail');
        const status = document.getElementById('genStatus');
        const resultDiv = document.getElementById('onboardingResult');
        const urlInput = document.getElementById('onboardingUrl');
        const acctSpan = document.getElementById('onboardingAccount');
        const email = (emailEl && emailEl.value || '').trim();
        if (!email) {
          if (status) {
            status.textContent = '❌ Παρακαλώ εισάγετε email συνεργάτη';
            status.style.color = '#ff6b6b';
            // Show feedback under the button
            status.style.flexBasis = '100%';
            status.style.display = 'block';
            status.style.marginTop = '4px';
            status.style.marginLeft = '0px';
          }
          return;
        }
        if (status) {
          status.textContent = 'Generating...';
          status.style.color = '#ccc';
          status.setAttribute('role','status');
          status.setAttribute('aria-live','polite');
          // Place feedback under the button consistently
          status.style.flexBasis = '100%';
          status.style.display = 'block';
          status.style.marginTop = '4px';
          status.style.marginLeft = '0px';
        }
        if (resultDiv) resultDiv.style.display = 'none';
        try {
          const res = await fetch('/api/partners/connect-link?email=' + encodeURIComponent(email));
          const j = await res.json().catch(() => ({}));
          if (!res.ok || !j || !j.url) throw new Error(j && j.error ? j.error : ('HTTP ' + res.status));
          if (urlInput) urlInput.value = j.url;
          if (acctSpan) acctSpan.textContent = j.accountId || '';
          if (resultDiv) resultDiv.style.display = 'block';
          if (status) {
            status.textContent = '✅ Το link δημιουργήθηκε και στάλθηκε στο email του συνεργάτη.';
            status.style.color = '#7bd88f';
          }
          // If we navigate to Stripe onboarding, the message will disappear with the page.
          // Keep it visible for ~3.5s when navigation does not occur (mobile or blockers).
          let cleared = false;
          const clearLater = setTimeout(() => {
            if (!cleared && status) status.textContent = '';
          }, 3500);
          const visHandler = () => {
            try {
              if (document.visibilityState === 'hidden') {
                cleared = true;
                if (status) status.textContent = '';
                clearTimeout(clearLater);
                document.removeEventListener('visibilitychange', visHandler, true);
              }
            } catch(_) {}
          };
          document.addEventListener('visibilitychange', visHandler, true);
          try { window.location.href = j.url; } catch(_) {}
        } catch (e) {
          if (resultDiv) resultDiv.style.display = 'none';
          if (status) {
            status.textContent = '❌ Αποτυχία δημιουργίας link: ' + (e && e.message ? e.message : 'Unknown error');
            status.style.color = '#ff6b6b';
            // Ensure error appears under the button
            status.style.flexBasis = '100%';
            status.style.display = 'block';
            status.style.marginTop = '4px';
            status.style.marginLeft = '0px';
          }
        }
      });
    }
    if (btnCopy) {
      btnCopy.addEventListener('click', async () => {
        const urlEl = document.getElementById('onboardingUrl');
        const url = urlEl ? (urlEl.value || '') : '';
        if (!url) return;
        try { await navigator.clipboard.writeText(url); alert('Copied!'); }
        catch (_) {
          const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); alert('Copied.');
        }
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireStripeTools);
  else wireStripeTools();
})();
