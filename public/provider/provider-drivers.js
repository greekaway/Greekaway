/* Provider Drivers Module */
(function(){
  if (window.ProviderAuth) window.ProviderAuth.requireSync();
  function qs(id){ return document.getElementById(id); }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
  function openModal(){ const m = qs('driverModal'); m.classList.add('show'); }
  function closeModal(){ const m = qs('driverModal'); m.classList.remove('show'); }
  async function fetchDrivers(){
    try {
      const r = await ProviderAPI.authed('/api/drivers');
      return (r && r.drivers) || [];
    } catch(_) { return []; }
  }
  function render(list){
    const wrap = qs('driversList');
    if (!wrap) return;
    if (!list.length){ wrap.innerHTML = '<div class="card">Δεν υπάρχουν οδηγοί</div>'; return; }
    wrap.innerHTML = list.map(d => `
      <div class="driver-card" data-id="${escapeHtml(d.id)}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div>
            <h3>${escapeHtml(d.name||'—')}</h3>
            <p class="meta">${escapeHtml(d.contact||'—')}</p>
          </div>
          <div>
            <span class="driver-status${d.status==='active'?'':' pending'}">${d.status==='active'?'Ενεργός':'Σε αναμονή'}</span>
          </div>
        </div>
      </div>
    `).join('');
  }
  async function refresh(){ const data = await fetchDrivers(); render(data); }
  async function submitForm(e){
    e.preventDefault();
    const out = qs('formResult'); if (out) out.textContent = 'Αποθήκευση…';
    const payload = {
      name: qs('dName').value.trim(),
      contact: qs('dContact').value.trim(),
      plate: qs('dPlate').value.trim(),
      notes: qs('dNotes').value.trim()
    };
    if (!payload.name || !payload.contact || !payload.plate){ out && (out.textContent = 'Συμπληρώστε όλα τα υποχρεωτικά πεδία (Όνομα, Επικοινωνία, Πινακίδα).'); return; }
    try {
      const r = await ProviderAPI.authed('/api/drivers', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      out && (out.textContent = 'Ο οδηγός δημιουργήθηκε');
      setTimeout(()=>{ closeModal(); refresh(); }, 300);
    } catch(err){ out && (out.textContent = 'Αποτυχία: ' + (err && err.message || 'Σφάλμα')); }
  }
  function init(){
    Theme.init();
    footerNav();
    qs('btnAdd')?.addEventListener('click', openModal);
    qs('modalClose')?.addEventListener('click', closeModal);
    qs('driverForm')?.addEventListener('submit', submitForm);
    refresh();
    setInterval(refresh, 20000); // periodic refresh
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
