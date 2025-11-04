// admin-providers.js — client-only demo providers list with availability status indicator
(function(){
  let allRows = [];
  let debounceTimer = null;

  function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"]/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m])); }
  function statusInfo(lastUpdate){
    if(!lastUpdate) return {cls:'red', label:'Outdated'};
    const now = new Date();
    const d = Math.floor((now - new Date(lastUpdate))/86400000);
    if (d <= 7) return {cls:'green', label:'Fresh'};
    if (d <= 21) return {cls:'orange', label:'Medium'};
    return {cls:'red', label:'Old'};
  }
  function getCategory(p){
    if (p.category) return p.category;
    const n = String(p.name||'').toLowerCase();
    if (n.includes('van')) return 'Vans';
    if (n.includes('boat')) return 'Boats';
    if (n.includes('tour')) return 'Tours';
    return 'Hotels';
  }
  function passFilters(p){
    const q = (document.getElementById('q')?.value || '').trim().toLowerCase();
    const ptype = (document.getElementById('ptype')?.value || '').toLowerCase();
    const status = (document.getElementById('status')?.value || '').toLowerCase();
    const cat = document.getElementById('category')?.value || '';
    if (q){
      const hay = [p.name, p.email, p.id].map(v=>String(v||'').toLowerCase());
      if (!hay.some(s=>s.includes(q))) return false;
    }
    if (ptype && String(p.payout||'').toLowerCase() !== ptype) return false;
    if (status){
      // Seed data has no status; only apply if row has a status property
      if (p.status && String(p.status).toLowerCase() !== status) return false;
    }
    if (cat && getCategory(p) !== cat) return false;
    return true;
  }
  function render(){
    const tbody = document.getElementById('prov-rows'); if(!tbody) return;
    tbody.innerHTML = '';
    (allRows||[]).filter(passFilters).forEach(p => {
      const tr = document.createElement('tr');
      if (p.is_demo) tr.setAttribute('data-is-demo','true');
      const badge = '<span class="badge-demo" title="'+escapeHtml(p.demo_note||'Demo')+'"><span class="dot"></span>Demo</span>';
      const s = statusInfo(p.last_availability_update);
      const dot = '<span class="status-dot '+s.cls+'" title="Last availability update: '+escapeHtml(p.last_availability_update||'-')+'"></span>';
      const actions = '<button class="btn small" data-action="notify">Notify Provider / Ειδοποίηση Πάροχου</button>';
      const category = getCategory(p);
      const last = p.last_availability_update || '-';
      const notes = p.notes || '';
      tr.innerHTML = ''+
        '<td>' + dot + escapeHtml(p.name||'-') + ' ' + badge + '</td>'+
        '<td>'+escapeHtml(p.phone||'-')+'</td>'+
        '<td>'+escapeHtml(p.email||'-')+'</td>'+
        '<td>'+escapeHtml(p.iban||p.stripe||'-')+'</td>'+
        '<td>'+escapeHtml((p.payout||'Demo').toString())+'</td>'+
        '<td>'+escapeHtml(category)+'</td>'+
        '<td class="mono">'+escapeHtml(last)+'</td>'+
        '<td>'+actions+'</td>'+
        '<td>'+escapeHtml(notes)+'</td>';
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('button[data-action="notify"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tr = e.currentTarget.closest('tr');
        const name = tr ? tr.querySelector('td')?.textContent?.trim() || 'Provider' : 'Provider';
        const body = '<div style="white-space:pre-wrap">'+
`Πρότυπο μήνυμα προς πάροχο / Notify template

Αγαπητέ συνεργάτη,
Θα μπορούσες να ενημερώσεις τη διαθεσιμότητά σου στο Greekaway;
(Παρακαλούμε απάντησε σε αυτό το email ή ενημέρωσε το panel σου.)

Ευχαριστούμε,
Greekaway Admin`+
        '</div>';
        if (window.DEMO) window.DEMO.openModal('Notify Provider / Ειδοποίηση: '+escapeHtml(name), body);
      });
    });
  }

  function clearFilters(){ ['q','ptype','status','category'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; }); render(); }

  function init(){
    allRows = (window.ADMIN_SEEDS && window.ADMIN_SEEDS.providers) || [];
    render();
    const q = document.getElementById('q'); if(q){ q.addEventListener('input', ()=>{ clearTimeout(debounceTimer); debounceTimer=setTimeout(render,200); }); }
    ['ptype','status','category'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('change', render); });
    document.getElementById('resetFilters')?.addEventListener('click', clearFilters);
  }

  document.addEventListener('DOMContentLoaded', function(){ init(); });
})();
