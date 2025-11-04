// admin-payments.js — client-only demo renderer
(function(){
  let allRows = [];
  let debounceTimer = null;

  function euro(cents, cur){
    const n = (Number(cents)||0)/100; return new Intl.NumberFormat('el-GR',{style:'currency',currency:cur||'EUR'}).format(n);
  }
  function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"]/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m])); }
  function getType(row){ return (row.type||'').toLowerCase() || (row.status==='pending' ? 'stripe' : 'manual'); }

  function passFilters(row){
    const q = (document.getElementById('q')?.value || '').trim().toLowerCase();
    const from = document.getElementById('from')?.value || '';
    const to = document.getElementById('to')?.value || '';
    const ptype = (document.getElementById('ptype')?.value || '').toLowerCase();

    if (from && String(row.date||'') < from) return false;
    if (to && String(row.date||'') > to) return false;

    if (ptype && getType(row) !== ptype) return false;

    if (q){
      const hay = [row.partner, row.id, row.trip_name, row.trip_id, row.booking_id, row.note, row.notes]
        .map(v => String(v||'').toLowerCase());
      const hit = hay.some(s => s.includes(q));
      if (!hit) return false;
    }
    return true;
  }

  function renderRows(){
    const tbody = document.getElementById('pay-rows'); if(!tbody) return;
    tbody.innerHTML = '';
    (allRows||[]).filter(passFilters).forEach(row => {
      const tr = document.createElement('tr');
      if (row.is_demo) tr.setAttribute('data-is-demo','true');
      const note = row.demo_note || 'Demo entry — δεν επηρεάζει DB';
      const badge = '<span class="badge-demo" title="'+escapeHtml(note)+'"><span class="dot"></span>Demo</span>';
      const trip = row.trip_name || row.trip || row.trip_id || '-';
      const bkid = row.booking_id || '-';
      const notes = row.note || row.notes || '';
      tr.innerHTML = ''+
        '<td class="mono">'+escapeHtml(row.date||'')+'</td>'+
        '<td>'+escapeHtml(row.partner||'-')+'</td>'+
        '<td class="col-trip">'+escapeHtml(trip)+'</td>'+
        '<td class="mono col-bookingid">'+escapeHtml(bkid)+'</td>'+
        '<td class="num">'+escapeHtml(euro(row.amount_cents,row.currency))+'</td>'+
        '<td>'+(escapeHtml((getType(row)||'').charAt(0).toUpperCase()+getType(row).slice(1)))+'</td>'+
        '<td><span>'+escapeHtml(row.status||'-')+'</span> '+badge+'</td>'+
        '<td>'+escapeHtml(notes)+'</td>';
      tbody.appendChild(tr);
    });
  }

  function clearFilters(){
    ['q','from','to','ptype'].forEach(id=>{ const el=document.getElementById(id); if(!el) return; el.value=''; });
    renderRows();
  }

  function init(){
    allRows = (window.ADMIN_SEEDS && window.ADMIN_SEEDS.payments) || [];
    renderRows();
    // Wire filters: live search and change events
    const q = document.getElementById('q'); if(q){ q.addEventListener('input',()=>{ clearTimeout(debounceTimer); debounceTimer=setTimeout(renderRows,200); }); }
    ['from','to','ptype'].forEach(id=>{ const el=document.getElementById(id); if(el){ el.addEventListener('change', renderRows); }});
    const reset = document.getElementById('resetFilters'); if (reset) reset.addEventListener('click', clearFilters);
  }

  document.addEventListener('DOMContentLoaded', function(){ init(); });
})();
