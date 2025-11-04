// admin-manual.js — client-only demo manual entries
(function(){
  let allRows = [];
  let debounceTimer = null;

  function euro(cents, cur){ const n=(Number(cents)||0)/100; return new Intl.NumberFormat('el-GR',{style:'currency',currency:cur||'EUR'}).format(n); }
  function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"]/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m])); }
  function canonType(t){ t=String(t||'').toLowerCase(); return t.replace(/^manual-/, ''); }

  function passFilters(r){
    const t = canonType(r.type);
    const fType = (document.getElementById('mType')?.value || '').toLowerCase();
    const from = document.getElementById('mFrom')?.value || '';
    const to = document.getElementById('mTo')?.value || '';
    const q = (document.getElementById('mQ')?.value || '').trim().toLowerCase();

    if (fType && t !== fType) return false;
    const d = String(r.date||'');
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (q){
      const hay = [r.note, r.booking_id, r.provider_name, r.provider_id]
        .map(v => String(v||'').toLowerCase());
      if (!hay.some(s=>s.includes(q))) return false;
    }
    return true;
  }

  function render(){
    const tbody = document.getElementById('manual-rows'); if (!tbody) return;
    tbody.innerHTML = '';
    (allRows||[]).filter(passFilters).forEach(r => {
      const tr = document.createElement('tr');
      if (r.is_demo) tr.setAttribute('data-is-demo','true');
      const badge = '<span class="badge-demo" title="'+escapeHtml(r.demo_note||'Demo')+'"><span class="dot"></span>Demo</span>';
      const amt = (r.amount_cents==null? '—' : euro(r.amount_cents, r.currency));
      const bkid = r.booking_id || '-';
      const partner = r.provider_name || r.partner || r.provider_id || '-';
      const t = canonType(r.type);
      let primaryAction = 'Επεξεργασία';
      if (t==='payout') primaryAction = 'Σήμανση ως κατατεθειμένο';
      else if (t==='refund') primaryAction = 'Σήμανση ως επιστράφηκε';
      else if (t==='adjustment') primaryAction = 'Επεξεργασία';
      tr.innerHTML = ''+
        '<td class="mono">'+escapeHtml(r.date||'')+'</td>'+
        '<td>'+escapeHtml(t||'-')+'</td>'+
        '<td class="mono col-bookingid">'+escapeHtml(bkid)+'</td>'+
        '<td class="col-provider">'+escapeHtml(partner)+'</td>'+
        '<td>'+escapeHtml(r.note||'-')+' '+badge+'</td>'+
        '<td class="num">'+escapeHtml(amt)+'</td>'+
        '<td>'+
        '  <button class="btn small" data-action="edit" aria-disabled="true" title="Demo entry — δεν επιτρέπεται">'+escapeHtml(primaryAction)+'</button> '
        +' <button class="btn small secondary" data-action="del" aria-disabled="true" title="Demo entry — δεν επιτρέπεται">Διαγραφή</button>'+
        '</td>';
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('button').forEach(btn => btn.addEventListener('click', e => {
      e.preventDefault();
      if (window.DEMO) window.DEMO.openModal('Demo entry','Demo entry — δεν επιτρέπεται ενέργεια');
    }));
  }

  function clearFilters(){ ['mType','mFrom','mTo','mQ'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; }); render(); }

  function init(){
    allRows = (window.ADMIN_SEEDS && window.ADMIN_SEEDS.manual) || [];
    render();
    const reset = document.getElementById('resetFilters'); if (reset) reset.addEventListener('click', clearFilters);
    const q = document.getElementById('mQ'); if (q){ q.addEventListener('input', ()=>{ clearTimeout(debounceTimer); debounceTimer=setTimeout(render,200); }); }
    ['mFrom','mTo','mType'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('change', render); });
  }

  document.addEventListener('DOMContentLoaded', function(){ init(); });
})();
