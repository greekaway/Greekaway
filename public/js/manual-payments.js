(function(){
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  let basicAuth = null;
  let items = [];
  let sortField = '';
  let sortDir = 'desc';

  function escapeHtml(s){ if (s==null) return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
  function formatAmount(amount){
    if (amount == null || amount === '') return '';
    let num = Number(amount);
    if (!isFinite(num)) return String(amount);
    // Heuristic: large values are in cents
    if (Math.abs(num) > 1000) num = num / 100;
    return num.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00A0€';
  }
  function formatDate(iso){
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2,'0');
    const mi = String(d.getMinutes()).padStart(2,'0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }

  function setStatus(msg,color){ const el=$('#mpStatus'); if(el){ el.textContent=msg||''; if(color) el.style.color=color; }}

  // Keep table header (thead) sticky correctly under the sticky bar
  function setStickyOffset(){
    try {
      const bar = document.getElementById('mpStickyBar');
      const h = bar ? (bar.offsetHeight || 0) : 0;
      document.documentElement.style.setProperty('--mp-sticky-offset', h + 'px');
    } catch(_) {}
  }

  async function loginSubmit(e){
    if (e) e.preventDefault();
    const u = $('#user').value || '';
    const p = $('#pass').value || '';
    basicAuth = 'Basic ' + btoa(u + ':' + p);
    $('#auth').style.display = 'none';
    $('#main').style.display = 'block';
    await fetchItems();
  }

  async function fetchItems(){
    try {
      const tbody = $('#mpTable tbody'); if (!tbody) return;
      tbody.innerHTML=''; setStatus('Φόρτωση...', '#aaa'); $('#mpMessage').textContent='';
      const res = await fetch('/api/manual-payments', { headers: { Authorization: basicAuth }});
      if (!res.ok) throw new Error('HTTP '+res.status);
      const arr = await res.json();
      items = Array.isArray(arr) ? arr : [];
      render();
      setStatus('');
    } catch (e) {
      $('#mpMessage').textContent = 'Σφάλμα φόρτωσης. Δοκιμάστε ξανά.';
      setStatus('' , '#aaa');
    }
  }

  function getField(row, key){
    switch(key){
      case 'partner': return row.partner_name || row.partner || row.partnerName || '';
      case 'trip': return row.trip_title || row.trip || row.trip_title_en || row.title || '';
      case 'date': return row.date || row.created_at || row.payment_date || '';
      case 'amount': return row.amount_cents ?? row.amount ?? row.amount_eur ?? 0;
      case 'iban': return row.iban || row.bank_iban || '';
      case 'status': return row.status || row.payment_status || '';
      case 'balance': return row.partner_balance_cents ?? row.partner_balance ?? 0;
      case 'id': return row.id || row.payment_id || row._id || '';
      default: return '';
    }
  }

  function sortItems(){
    if (!sortField) return items.slice();
    const out = items.slice();
    out.sort((a,b) => {
      const av = getField(a, sortField);
      const bv = getField(b, sortField);
      if (sortField === 'amount' || sortField === 'balance') {
        const na = Number(av)||0; const nb = Number(bv)||0;
        return (na - nb) * (sortDir === 'asc' ? 1 : -1);
      }
      if (sortField === 'date') {
        const ta = av ? new Date(av).getTime() : 0;
        const tb = bv ? new Date(bv).getTime() : 0;
        return (ta - tb) * (sortDir === 'asc' ? 1 : -1);
      }
      return String(av).localeCompare(String(bv)) * (sortDir === 'asc' ? 1 : -1);
    });
    return out;
  }

  function render(){
    const tbody = $('#mpTable tbody'); if (!tbody) return;
    tbody.innerHTML = '';
    const data = sortItems();
    if (!data.length) { $('#mpMessage').textContent = 'Δεν υπάρχουν εγγραφές.'; return; }
    $('#mpMessage').textContent = '';
    for (const row of data) {
      const tr = document.createElement('tr');
      const id = getField(row,'id');
      const partner = getField(row,'partner');
      const trip = getField(row,'trip');
      const date = getField(row,'date');
      const amount = getField(row,'amount');
      const iban = getField(row,'iban');
      const status = (getField(row,'status') || '').toString();
      const balance = getField(row,'balance');
      const isPaid = /paid|πληρώθηκε|settled/i.test(status);
      const btnLabel = isPaid ? 'Πληρώθηκε' : 'Απλήρωτο';
      const btnClass = isPaid ? 'is-paid' : 'is-pending';
      tr.innerHTML = `
        <td>${escapeHtml(partner)}</td>
        <td>${escapeHtml(trip)}</td>
        <td>${escapeHtml(formatDate(date))}</td>
        <td style="text-align:right">${escapeHtml(formatAmount(amount))}</td>
        <td>${escapeHtml(iban)}</td>
        <td class="mp-status" data-id="${escapeHtml(id)}">${escapeHtml(isPaid ? 'πληρώθηκε' : (status || 'εκκρεμεί'))}</td>
        <td style="text-align:right">${escapeHtml(formatAmount(balance))}</td>
        <td style="text-align:center">
          <button class="btn mp-mark ${btnClass}" data-id="${escapeHtml(id)}" ${isPaid?'disabled':''}>${escapeHtml(btnLabel)}</button>
        </td>`;
      tbody.appendChild(tr);
    }
  }

  async function onMarkPaid(id, btn){
    if (!id) return;
    try {
      btn.disabled = true; btn.textContent = 'Αποστολή...';
      const res = await fetch('/api/manual-payments/mark-paid', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization: basicAuth },
        body: JSON.stringify({ id })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      // Update UI optimistically
      const cell = document.querySelector(`.mp-status[data-id="${CSS.escape(id)}"]`);
      if (cell) cell.textContent = 'πληρώθηκε';
      btn.textContent = 'Πληρώθηκε';
      btn.classList.remove('is-pending');
      btn.classList.add('is-paid');
      btn.disabled = true;
      // Zero the partner balance cell (7th column)
      try {
        const tr = btn.closest('tr');
        const balTd = tr ? tr.querySelector('td:nth-child(7)') : null;
        if (balTd) balTd.textContent = formatAmount(0);
      } catch(_) {}
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Πληρώθηκε';
      alert('Αποτυχία ενημέρωσης: ' + (e && e.message ? e.message : e));
    }
  }

  function wire(){
    const auth = $('#auth'); if (auth) auth.addEventListener('submit', loginSubmit);
    const loginBtn = $('#login'); if (loginBtn) loginBtn.addEventListener('click', loginSubmit);
    const refresh = $('#mpRefresh'); if (refresh) refresh.addEventListener('click', fetchItems);
    const exportBtn = $('#mpExport'); if (exportBtn) exportBtn.addEventListener('click', exportCsv);
    // Compute sticky header offset now and on resize
    setStickyOffset();
    window.addEventListener('resize', setStickyOffset);
    // Sorting
    $$('#mpTable thead th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const f = th.getAttribute('data-sort');
        if (sortField === f) sortDir = (sortDir === 'asc' ? 'desc' : 'asc'); else sortField = f;
        render();
      });
    });
    // Delegate mark-paid
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest && e.target.closest('.mp-mark');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      onMarkPaid(id, btn);
    });
  }

  function exportCsv(){
    const rows = [];
    rows.push(['Όνομα συνεργάτη','Τίτλος εκδρομής','Ημερομηνία','Ποσό (€)','IBAN','Κατάσταση','Υπόλοιπο συνεργάτη']);
    const data = sortItems();
    data.forEach(row => {
      const vals = [
        getField(row,'partner'),
        getField(row,'trip'),
        formatDate(getField(row,'date')),
        formatAmount(getField(row,'amount')),
        getField(row,'iban'),
        (getField(row,'status')||'εκκρεμεί'),
        formatAmount(getField(row,'balance'))
      ];
      rows.push(vals.map(v => '"'+String(v).replace(/"/g,'""')+'"'));
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'manual-payments.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
