(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function qsId(name){ try{ return new URLSearchParams(window.location.search).get(name); }catch(_){ return null; } }
  function fmtDate(d){ try{ return new Date(d).toISOString().slice(0,10); }catch(_){ return d; } }
  async function fetchBooking(id){ try{ const r = await fetch('/api/bookings/' + encodeURIComponent(id)); if(!r.ok) return null; return await r.json(); }catch(_){ return null; } }
  function todayISO(){ return new Date().toISOString().slice(0,10); }
  function alreadyRatedKey(bookingId,email){ return `gw_feedback_done_${bookingId||'no'}_${(email||'').toLowerCase()}`; }
  async function submitFeedback({trip_id, traveler_email, rating, comment}){
    try{
      const r = await fetch('/api/feedback', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ trip_id, traveler_email, rating, comment })});
      return r.ok;
    }catch(_){ return false; }
  }
  function buildUI(){
    const wrap = document.createElement('div');
    wrap.className = 'gw-feedback-wrap';
    const tr = (k)=> (window.t? window.t(k): k);
    wrap.innerHTML = `
      <style>
        .gw-feedback-wrap{ position:fixed; right:16px; bottom:calc(84px + env(safe-area-inset-bottom)); z-index:30000; background:#0E1520; color:#fff; border:1px solid rgba(255,255,255,0.16); border-radius:14px; box-shadow:0 16px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05); max-width:320px; padding:12px; font-family:system-ui,-apple-system,Segoe UI,Roboto; }
        .gw-feedback-title{ font-weight:800; margin-bottom:6px; }
        .gw-feedback-actions{ display:flex; gap:8px; margin-top:8px; }
        .gw-feedback-btn{ flex:1; background:#142132; color:#fff; border:1px solid rgba(255,255,255,0.16); border-radius:10px; padding:8px 10px; cursor:pointer; font-weight:800; }
        .gw-feedback-btn:hover{ background:#1B2B42; }
        .gw-feedback-close{ position:absolute; top:6px; right:8px; opacity:.7; cursor:pointer; }
        .gw-feedback-text{ width:100%; margin-top:8px; background:#0E1520; color:#fff; border:1px solid rgba(255,255,255,0.16); border-radius:10px; padding:6px 8px; min-height:34px; }
      </style>
      <div class="gw-feedback-close" aria-label="${tr('ui.close')}">✕</div>
      <div class="gw-feedback-title">${tr('feedback.title')}</div>
      <div style="font-size:.92rem; opacity:.9">${tr('feedback.subtitle')}</div>
      <div class="gw-feedback-actions">
        <button class="gw-feedback-btn" data-rating="positive">😊 ${tr('feedback.positive')}</button>
        <button class="gw-feedback-btn" data-rating="neutral">😐 ${tr('feedback.neutral')}</button>
        <button class="gw-feedback-btn" data-rating="negative">🙁 ${tr('feedback.negative')}</button>
      </div>
      <textarea class="gw-feedback-text" placeholder="${tr('feedback.placeholder')}"></textarea>
    `;
    return wrap;
  }

  async function maybeShow(){
    try{
      const bookingId = qsId('bookingId');
      if(!bookingId) return; // no-op
      const booking = await fetchBooking(bookingId);
      if(!booking || !booking.date || !booking.user_email) return;
      const today = todayISO();
      if (fmtDate(booking.date) >= today) return; // only after trip date
      const k = alreadyRatedKey(bookingId, booking.user_email);
      try{ if(localStorage.getItem(k)==='1') return; }catch(_){ }
      const ui = buildUI();
      document.body.appendChild(ui);
      const close = ()=>{ try{ ui.remove(); }catch(_){ } };
      ui.querySelector('.gw-feedback-close').addEventListener('click', close);
      ui.querySelectorAll('.gw-feedback-btn').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const rating = btn.getAttribute('data-rating');
          const comment = ui.querySelector('.gw-feedback-text').value || null;
          const ok = await submitFeedback({ trip_id: booking.trip_id, traveler_email: booking.user_email, rating, comment });
          if (ok) { try{ localStorage.setItem(k,'1'); }catch(_){ } close(); }
          else { btn.textContent = (window.t? window.t('feedback.try_again') : 'Try again'); }
        });
      });
    }catch(_){ }
  }

  window.GWFeedbackPrompt = { init: ()=> ready(maybeShow) };
  // React to language change to update an already rendered prompt
  window.addEventListener('i18n:changed', ()=>{
    try{
      const wrap = document.querySelector('.gw-feedback-wrap');
      if (!wrap) return;
      const tr = (k)=> (window.t? window.t(k): k);
      const close = wrap.querySelector('.gw-feedback-close'); if (close) close.setAttribute('aria-label', tr('ui.close'));
      const title = wrap.querySelector('.gw-feedback-title'); if (title) title.textContent = tr('feedback.title');
      const subtitle = title && title.nextElementSibling; if (subtitle) subtitle.textContent = tr('feedback.subtitle');
      const buttons = wrap.querySelectorAll('.gw-feedback-btn');
      if (buttons && buttons.length === 3) {
        buttons[0].textContent = `😊 ${tr('feedback.positive')}`;
        buttons[1].textContent = `😐 ${tr('feedback.neutral')}`;
        buttons[2].textContent = `🙁 ${tr('feedback.negative')}`;
      }
      const ta = wrap.querySelector('.gw-feedback-text'); if (ta) ta.setAttribute('placeholder', tr('feedback.placeholder'));
    }catch(_){ }
  });
})();
