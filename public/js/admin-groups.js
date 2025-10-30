// admin-groups.js — extracted from admin-groups.html inline script
(function(){
  // Basic auth passthrough: support ?auth=base64(user:pass)
  const qsFull = new URLSearchParams(location.search);
  const authEncoded = qsFull.get('auth');
  const basicAuth = authEncoded ? ('Basic ' + authEncoded) : null;
  function apiFetch(url, init){
    const headers = new Headers((init && init.headers) || {});
    if (basicAuth) headers.set('Authorization', basicAuth);
    return fetch(url, { ...(init||{}), headers });
  }

  const qs = new URLSearchParams(location.search);
  const tripIdEl = document.getElementById('tripId');
  const dateEl = document.getElementById('date');
  if (!tripIdEl || !dateEl) return; // safety
  tripIdEl.value = qs.get('trip_id') || '';
  dateEl.value = qs.get('date') || new Date().toISOString().slice(0,10);

  const pool = document.getElementById('pool');
  const groupsWrap = document.getElementById('groups');

  function travItem(t){
    const el = document.createElement('div');
    el.className = 'trav';
    el.draggable = true;
    el.dataset.email = t.email;
    el.innerHTML = `<div><strong>${t.name||t.email}</strong></div>
      <div class="meta">
        <span>Lang: ${t.language||'—'}</span>
        <span>Type: ${t.traveler_type||'—'}</span>
        <span>Soc: ${t.sociality||'—'}</span>
        <span>Avg: ${t.average_rating!=null?Number(t.average_rating).toFixed(1):'—'}</span>
      </div>`;
    wireDrag(el);
    return el;
  }

  function groupBox(g){
    const box = document.createElement('div');
    box.className = 'group' + (g.locked? ' group-locked' : '');
    box.dataset.id = g.id || '';
    const header = document.createElement('div');
    header.className = 'group-header';
    header.innerHTML = `<div>Group ${g.id ? g.id.slice(0,6) : '(new)'} — <small>${g.locked? 'Locked' : 'Unlocked'}</small></div>`;
    const actions = document.createElement('div');
    const lockBtn = document.createElement('button'); lockBtn.textContent = 'Lock group'; lockBtn.disabled = !!g.locked;
    lockBtn.addEventListener('click', ()=> lockGroup(g.id));
    actions.appendChild(lockBtn);
    header.appendChild(actions);
    box.appendChild(header);

    const list = document.createElement('div');
    list.className = 'list';
    list.dataset.list = 'group';
    box.appendChild(list);
    g.travelers.forEach(e => list.appendChild(travItem(e)));
    wireDrop(list);
    return box;
  }

  function wireDrag(el){
    el.addEventListener('dragstart', (e)=>{ el.classList.add('dragging'); e.dataTransfer.setData('text/plain', el.dataset.email); });
    el.addEventListener('dragend', ()=>{ el.classList.remove('dragging'); });
  }
  function wireDrop(list){
    list.addEventListener('dragover', (e)=>{ e.preventDefault(); });
    list.addEventListener('drop', (e)=>{
      e.preventDefault();
      const email = e.dataTransfer.getData('text/plain');
      if (!email) return;
      if ([...list.querySelectorAll('.trav')].some(x=>x.dataset.email===email)) return;
      const dragged = document.querySelector(`.trav[data-email="${CSS.escape(email)}"]`);
      if (dragged) list.appendChild(dragged);
    });
  }

  async function load(){
    const trip_id = tripIdEl.value.trim(); const date = dateEl.value.trim();
    if (!trip_id || !date) return alert('Fill trip_id and date');
    const r = await apiFetch(`/admin/groups?trip_id=${encodeURIComponent(trip_id)}&date=${encodeURIComponent(date)}`, { headers: { 'Accept': 'application/json' } });
    const j = await r.json();
    pool.innerHTML = '';
    (j.travelers||[]).forEach(t => pool.appendChild(travItem(t)));
    groupsWrap.innerHTML = '';
    (j.groups||[]).forEach(g => {
      const list = (Array.isArray(g.travelers) ? g.travelers : []).map(email => (j.travelers||[]).find(t => t.email===email) || { email });
      groupsWrap.appendChild(groupBox({ id: g.id, locked: g.locked, travelers: list }));
    });
    wireDrop(pool);
  }

  async function lockGroup(id){
    const trip_id = tripIdEl.value.trim(); const date = dateEl.value.trim();
    const box = groupsWrap.querySelector(`.group[data-id="${CSS.escape(id)}"]`);
    const emails = [...box.querySelectorAll('.trav')].map(el => el.dataset.email);
    const r = await apiFetch('/admin/groups', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ op: 'update', id, trip_id, date, travelers: emails, lock: true }) });
    if (r.ok) { alert('Locked'); load(); } else { alert('Lock failed'); }
  }

  document.getElementById('load').addEventListener('click', load);
  document.getElementById('newGroup').addEventListener('click', async ()=>{
    const trip_id = tripIdEl.value.trim(); const date = dateEl.value.trim();
    const r = await apiFetch('/admin/groups', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ op: 'create', trip_id, date, travelers: [] }) });
    if (r.ok) load(); else alert('Create failed');
  });

  document.getElementById('auto').addEventListener('click', async ()=>{
    const trip_id = tripIdEl.value.trim(); const date = dateEl.value.trim();
    if (!trip_id || !date) return alert('Fill trip_id and date');
    const r = await apiFetch(`/admin/groups?trip_id=${encodeURIComponent(trip_id)}&date=${encodeURIComponent(date)}`, { headers: { 'Accept': 'application/json' } });
    const j = await r.json();
    const poolTravs = j.travelers || [];
    const p = await apiFetch(`/admin/suggest-pairs?trip_id=${encodeURIComponent(trip_id)}&date=${encodeURIComponent(date)}`, { headers: { 'Accept': 'application/json' } });
    const pairs = await p.json();
    const score = {};
    pairs.forEach(({a,b,score:s})=>{ score[`${a}|${b}`]=s; score[`${b}|${a}`]=s; });
    const emails = poolTravs.map(t=>t.email);

    const remaining = new Set(emails);
    async function createGroup(){
      if (remaining.size===0) return null;
      let seed = null, bestSum = -Infinity;
      for (const e of remaining) {
        let s = 0; for (const o of remaining) if (o!==e) s += (score[`${e}|${o}`]||0);
        if (s>bestSum) { bestSum=s; seed=e; }
      }
      if (!seed) return null;
      const group = [seed]; remaining.delete(seed);
      while (group.length < 7) {
        let cand = null, best = -Infinity;
        for (const e of remaining) {
          const avg = group.reduce((acc,g)=>acc+(score[`${e}|${g}`]||0),0)/group.length;
          if (avg>best) { best=avg; cand=e; }
        }
        if (!cand) break;
        if (group.length>=5 && best<0) break;
        group.push(cand); remaining.delete(cand);
      }
      while (group.length<5 && remaining.size){ const e = remaining.values().next().value; group.push(e); remaining.delete(e); }
      return group;
    }

    groupsWrap.innerHTML='';
    const built = [];
    while (remaining.size){ const g = await createGroup(); if (!g) break; built.push(g); }
    built.forEach(arr=>{
      const list = arr.map(email => poolTravs.find(t=>t.email===email) || { email });
      groupsWrap.appendChild(groupBox({ id:null, locked:false, travelers:list }));
    });
    const assigned = new Set(built.flat());
    pool.innerHTML='';
    poolTravs.filter(t=>!assigned.has(t.email)).forEach(t => pool.appendChild(travItem(t)));
  });

  if (tripIdEl.value && dateEl.value) { load(); }
})();
