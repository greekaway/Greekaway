/* admin-seeds.js
   Demo-only datasets for Admin UI tables.
   IMPORTANT:
   - Do NOT write to DB. All rows include is_demo: true
   - Guard any POST/PUT actions: if (row && row.is_demo) block and show a notice
   - Pure client-side; loaded only by admin pages for initial table population
*/
(function(){
  const today = new Date();
  const fmt = (d) => d instanceof Date ? d.toISOString().slice(0,10) : String(d||'').slice(0,10);
  const daysAgo = (n) => { const dt=new Date(today); dt.setDate(dt.getDate()-n); return fmt(dt); };
  const daysFrom = (n) => { const dt=new Date(today); dt.setDate(dt.getDate()+n); return fmt(dt); };
  const euroCents = (min=900, max=98000) => 100 * Math.floor((min + Math.random()*(max-min))/100);

  const partners = [
    { id:'p_athens_tours',    name:'Athens Tours',      email:'athens@partners.test', phone:'+30 210 1111111', payout:'manual',  iban:'GR11 1111 1111 1111' },
    { id:'p_delphi_guides',   name:'Delphi Guides',     email:'delphi@partners.test', phone:'+30 210 2222222', payout:'manual',  iban:'GR22 2222 2222 2222' },
    { id:'p_bluewave',        name:'BlueWave Cruises',  email:'bluewave@partners.test', phone:'+30 210 3333333', payout:'stripe', stripe:'acct_demo_bluewave' },
    { id:'p_santorini_sun',   name:'Santorini Sun',     email:'santorini@partners.test', phone:'+30 210 4444444', payout:'stripe', stripe:'acct_demo_santorini' },
    { id:'p_crete_trails',    name:'Crete Trails',      email:'crete@partners.test',   phone:'+30 210 5555555', payout:'manual',  iban:'GR33 3333 3333 3333' },
    { id:'p_meteora_views',   name:'Meteora Views',     email:'meteora@partners.test', phone:'+30 210 6666666', payout:'stripe', stripe:'acct_demo_meteora' },
    { id:'p_ionian_waves',    name:'Ionian Waves',      email:'ionian@partners.test',  phone:'+30 210 7777777', payout:'manual',  iban:'GR44 4444 4444 4444' },
    { id:'p_rhodes_escape',   name:'Rhodes Escape',     email:'rhodes@partners.test',  phone:'+30 210 8888888', payout:'manual',  iban:'GR55 5555 5555 5555' },
    { id:'p_parnassos_ski',   name:'Parnassos Ski',     email:'parnassos@partners.test', phone:'+30 210 9999999', payout:'stripe', stripe:'acct_demo_parnassos' },
    { id:'p_delos_cruises',   name:'Delos Cruises',     email:'delos@partners.test',   phone:'+30 210 1212121', payout:'manual',  iban:'GR66 6666 6666 6666' }
  ];

  const trips = [
    { id:'athens',    title:'Athens Highlights' },
    { id:'delphi',    title:'Delphi Day Trip' },
    { id:'santorini', title:'Santorini Sunset' },
    { id:'lefkas',    title:'Lefkada Blue Caves' },
    { id:'meteora',   title:'Meteora Monasteries' },
    { id:'crete',     title:'Crete Food Tour' },
    { id:'rhodes',    title:'Rhodes Old Town' },
    { id:'parnassos', title:'Parnassos Ski Day' },
    { id:'mykonos',   title:'Mykonos Beaches' },
    { id:'delos',     title:'Delos Archaeology' }
  ];

  function choice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  // -------- Payments (≈30) --------
  const payStatuses = ['succeeded','pending','failed'];
  const payTypes = ['stripe','manual'];
  const payments = [];
  for (let i=1;i<=30;i++){
    const p = choice(partners);
    const t = choice(trips);
    const status = payStatuses[i % payStatuses.length];
    const type = payTypes[i % payTypes.length];
    payments.push({
      id: `D-PAY-${String(i).padStart(3,'0')}`,
      date: (i%6===0 ? daysAgo((i*3)%30) : (i%5===0 ? daysFrom(i%10) : daysAgo(i%12))),
      partner: p.name,
      trip_id: t.id,
      trip_name: t.title,
      booking_id: `bk_demo_${String((i*7)%97+1).padStart(3,'0')}`,
      amount_cents: euroCents(1200, 125000),
      currency: 'EUR',
      type,
      status,
      note: (status==='failed' ? 'Card declined (demo)' : ''),
      is_demo: true,
      demo_note: 'Demo — UI only'
    });
  }

  // -------- Manual entries (≈30) --------
  const manualTypes = ['manual-refund','manual-adjustment','manual-payout'];
  const manual = [];
  for (let i=1;i<=30;i++){
    const p = choice(partners);
    const t = choice(trips);
    const mtype = manualTypes[i % manualTypes.length];
    const amt = (mtype==='manual-refund' ? -1 : 1) * euroCents(800, 80000);
    manual.push({
      id: `D-MAN-${String(i).padStart(3,'0')}`,
      type: mtype,
      date: (i%4===0 ? daysAgo((i*2)%20) : (i%3===0 ? daysFrom(i%8) : daysAgo(i%10))),
      booking_id: `bk_demo_${String((i*5)%101+10).padStart(3,'0')}`,
      provider_id: p.id,
      provider_name: p.name,
      note: (mtype==='manual-refund' ? 'Refund (demo)' : (mtype==='manual-payout' ? 'Payout (demo)' : 'Adjustment (demo)')),
      amount_cents: amt,
      currency: 'EUR',
      is_demo: true,
      demo_note: 'Demo — client only'
    });
  }

  // -------- Providers (≈30) --------
  const providers = [];
  for (let i=0;i<30;i++){
    const base = partners[i % partners.length];
    const name = base.name + ' ' + (i+1);
    const id = base.id + '_' + String(i+1).padStart(2,'0');
    const days = (i*3) % 40;
    const payout = base.payout;
    providers.push({
      id,
      name,
      phone: base.phone,
      email: base.email.replace('@', `+${i+1}@`),
      last_availability_update: (days%5===0 ? daysAgo(days) : (days%3===0 ? daysAgo(days%9) : daysAgo(days%21))),
      payout,
      iban: payout==='manual' ? (base.iban || 'GR00 0000 0000 0000') : undefined,
      stripe: payout==='stripe' ? (base.stripe || 'acct_demo_'+(i+1)) : undefined,
      category: (function(n){ n=n.toLowerCase(); if (n.includes('boat')) return 'Boats'; if (n.includes('van')) return 'Vans'; if (n.includes('cruise')) return 'Boats'; if (n.includes('ski')) return 'Tours'; return 'Tours'; })(name),
      notes: (days<=7? 'Fresh update' : (days<=21 ? 'Medium freshness' : 'Needs contact')),
      is_demo: true,
      demo_note: 'Demo provider — UI only'
    });
  }

  // -------- Availability (≈30) --------
  const availability = [];
  for (let i=1;i<=30;i++){
    const prov = providers[i % providers.length];
    const t = choice(trips);
    const cap = 6 + (i % 10);
    const booked = Math.min(cap, (i*3) % (cap+1));
    const ahead = (i*2) % 28;
    availability.push({
      id: `D-AV-${String(i).padStart(3,'0')}`,
      provider_id: prov.id,
      provider_name: prov.name,
      trip_id: t.id,
      trip_name: t.title,
      date: daysFrom(ahead),
      capacity: cap,
      booked: booked,
      last_update: prov.last_availability_update,
      is_demo: true,
      demo_note: prov.notes || 'Demo availability'
    });
  }

  // Export into global namespace (read-only usage by admin tables)
  window.ADMIN_SEEDS = { payments, manual, providers, availability };

  // Minimal demo-only helpers
  function ensureModal(){
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
    return m;
  }
  function openModal(title, bodyHtml){ const m=ensureModal(); m.querySelector('#ga-modal-title').textContent=title||''; m.querySelector('#ga-modal-body').innerHTML=bodyHtml||''; m.style.display='block'; }
  function closeModal(){ const m=document.getElementById('ga-modal'); if (m) m.style.display='none'; }
  function guardIfDemo(row, action){
    try {
      if (row && row.is_demo){
        const t = typeof action === 'string' ? action : 'Ενέργεια';
        openModal('Demo entry', t+': Demo entry — δεν επιτρέπεται ενέργεια');
        return false;
      }
    } catch(_){}
    return true;
  }
  window.DEMO = { openModal, closeModal, guardIfDemo };
})();
