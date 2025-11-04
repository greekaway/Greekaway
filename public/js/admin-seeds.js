/* admin-seeds.js
   Client-side only demo data and helpers for Admin pages.
   IMPORTANT: This file must never write to server or DB. */
 (function(){
  const today = new Date();
  function fmt(d){ return d.toISOString().slice(0,10); }
  function daysAgo(n){ const dt=new Date(today); dt.setDate(dt.getDate()-n); return fmt(dt); }
  function daysFrom(n){ const dt=new Date(today); dt.setDate(dt.getDate()+n); return fmt(dt); }

  // Build ~28 demo rows per category
  const payments = [];
  const statuses = ['pending','paid','failed'];
  for (let i=1;i<=28;i++){
    payments.push({
      id: `D-PAY-${String(i).padStart(3,'0')}`,
      date: i%5===0 ? daysAgo(i%14) : fmt(today),
      amount_cents: 1000 + (i*137) % 25000,
      currency: 'EUR',
      status: statuses[i%statuses.length],
      partner: `Demo Partner ${String.fromCharCode(64 + (i%26||26))}`,
      is_demo: true,
      demo_note: 'Demo — δεν επηρεάζει DB'
    });
  }

  const manual = [];
  const mtypes = ['manual-refund','manual-adjustment','manual-payout'];
  for (let i=1;i<=26;i++){
    manual.push({
      id: `D-MAN-${String(i).padStart(3,'0')}`,
      type: mtypes[i%mtypes.length],
      date: daysAgo((i*2)%17),
      note: i%3===0? 'Adjustment test' : (i%2===0? 'Demo refund' : 'Manual payout'),
      amount_cents: (i%2===0 ? 1000 + (i*77)%5000 : -1*(200 + (i*55)%1500)),
      currency: 'EUR',
      is_demo: true,
      demo_note: 'Demo — client only'
    });
  }

  const providers = [];
  for (let i=1;i<=27;i++){
    const days = (i*5)%40; // spread across 0..39 days
    providers.push({
      id: `D-PR-${String(i).padStart(3,'0')}`,
      name: i%3===0? `Demo Boats ${i}` : (i%3===1? `Demo Vans ${i}` : `Demo Tours ${i}`),
      phone: `+30 210 ${String(1000000 + i*1111).slice(0,7)}`,
      email: `provider${i}@example.com`,
      last_availability_update: daysAgo(days),
      payout: (i%2===0? 'stripe':'manual'),
      is_demo: true,
      demo_note: days<=7? 'Fresh update' : (days<=21 ? 'Medium freshness' : 'Needs contact')
    });
  }

  const availability = [];
  for (let i=1;i<=30;i++){
    const provIdx = (i%providers.length) || providers.length;
    const prov = providers[provIdx-1];
    availability.push({
      id: `D-AV-${String(i).padStart(3,'0')}`,
      provider_id: prov.id,
      provider_name: prov.name,
      date: daysFrom((i*3)%25),
      capacity: 6 + (i%8),
      booked: (i*2)%7,
      last_update: prov.last_availability_update,
      is_demo: true,
      demo_note: prov.demo_note
    });
  }

  window.ADMIN_SEEDS = { payments, manual, providers, availability };

  // DEMO state manager (always active, no UI toggle)
  function isActive(){ return true; }

  // Simple modal helper
  function openModal(title, bodyHtml){
    let m = document.getElementById('ga-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'ga-modal';
      m.className = 'ga-modal';
      m.innerHTML = '<div class="ga-modal-backdrop" role="presentation"></div>'+
                    '<div class="ga-modal-dialog" role="dialog" aria-modal="true">'+
                    '  <div class="ga-modal-header"><h3 id="ga-modal-title"></h3><button class="ga-modal-close" aria-label="Close">×</button></div>'+
                    '  <div class="ga-modal-body" id="ga-modal-body"></div>'+
                    '  <div class="ga-modal-footer"><button class="btn" id="ga-modal-ok">OK</button></div>'+
                    '</div>';
      document.body.appendChild(m);
      m.querySelector('.ga-modal-backdrop').addEventListener('click', closeModal);
      m.querySelector('.ga-modal-close').addEventListener('click', closeModal);
      m.querySelector('#ga-modal-ok').addEventListener('click', closeModal);
    }
    m.querySelector('#ga-modal-title').textContent = title || '';
    m.querySelector('#ga-modal-body').innerHTML = bodyHtml || '';
    m.style.display = 'block';
  }
  function closeModal(){ const m = document.getElementById('ga-modal'); if (m) m.style.display='none'; }

  window.DEMO = { isActive, openModal, closeModal };
})();
