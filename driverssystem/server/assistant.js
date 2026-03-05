'use strict';
/**
 * DriversSystem AI Assistant
 * 
 * Reads REAL data from the live data layer (entries, expenses, dashboard)
 * and sends it to OpenAI as context so the assistant answers with actual numbers.
 * 
 * Source of truth: always the live Admin Panel & live entries.
 * No hardcoded/static financial data in this file.
 */

const dataLayer = require('../../src/server/data/driverssystem');
const { buildVehicleStatsContext } = require('./vehicle-stats');

// ─────────────────────────────────────────────────────────
// FINANCIAL CONTEXT BUILDER
// Reads all real data for a driver and produces a structured
// text block that gets injected as system context for OpenAI.
// ─────────────────────────────────────────────────────────

function formatEUR(v) {
  return (v || 0).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
}

function pct(a, b) {
  if (!b) return '—';
  const p = ((a - b) / Math.abs(b)) * 100;
  return `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;
}

async function buildDriverFinancialContext(driverId) {
  // Greece timezone
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Athens' }));
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const dayOfMonth = now.getDate();
  const toStr = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = toStr(now);

  // Current month range
  const curMonthStr = `${year}-${String(month).padStart(2, '0')}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = `${curMonthStr}-01`;

  // Previous month range
  const prevDate = new Date(year, month - 2, 1);
  const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const daysInPrevMonth = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).getDate();
  const prevFirst = `${prevMonthStr}-01`;
  const prevLast = `${prevMonthStr}-${String(daysInPrevMonth).padStart(2, '0')}`;

  // Last 7 days range
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = toStr(sevenDaysAgo);

  // Previous 7 days (7-14 days ago) for comparison
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const fourteenDaysAgoStr = toStr(fourteenDaysAgo);

  // ── Fetch all data in parallel ──
  const [
    dashboardCurrent,
    dashboardPrev,
    entriesCurrent,
    entriesPrev,
    entriesLast7,
    entriesPrev7,
    expCurrent,
    expPrev,
    expLast7,
    tripSources,
    driverDebts,
    driverPartners,
    partnersSummary,
    driverObligations,
    obligationPayments,
    obligationsSummary
  ] = await Promise.all([
    dataLayer.getDashboard({ driverId, month: curMonthStr }),
    dataLayer.getDashboard({ driverId, month: prevMonthStr }),
    dataLayer.getEntriesRange({ driverId, from: firstDay, to: today }),
    dataLayer.getEntriesRange({ driverId, from: prevFirst, to: prevLast }),
    dataLayer.getEntriesRange({ driverId, from: sevenDaysAgoStr, to: today }),
    dataLayer.getEntriesRange({ driverId, from: fourteenDaysAgoStr, to: sevenDaysAgoStr }),
    dataLayer.getExpensesRange({ driverId, from: firstDay, to: today }),
    dataLayer.getExpensesRange({ driverId, from: prevFirst, to: prevLast }),
    dataLayer.getExpensesRange({ driverId, from: sevenDaysAgoStr, to: today }),
    dataLayer.getTripSources(),
    dataLayer.getDebts({ driverId }),
    dataLayer.getPartners({ driverId }),
    dataLayer.getPartnersSummary(driverId),
    dataLayer.getObligations({ driverId }),
    dataLayer.getObligationPayments({ driverId }),
    dataLayer.getObligationsSummary(driverId)
  ]);

  const dc = dashboardCurrent;
  const dp = dashboardPrev;

  // ── Working days ──
  const workDaysCurrent = new Set(entriesCurrent.map(e => e.date)).size;
  const workDaysPrev = new Set(entriesPrev.map(e => e.date)).size;
  const workDaysLast7 = new Set(entriesLast7.map(e => e.date)).size;
  const workDaysPrev7 = new Set(entriesPrev7.map(e => e.date)).size;

  // ── Revenue calculations ──
  const sumGross = (arr) => arr.reduce((s, e) => s + (e.amount || 0), 0);
  const sumNet = (arr) => arr.reduce((s, e) => s + (e.netAmount || 0), 0);

  const grossCurrent = sumGross(entriesCurrent);
  const netCurrent = sumNet(entriesCurrent);
  const grossPrev = sumGross(entriesPrev);
  const netPrev = sumNet(entriesPrev);
  const grossLast7 = sumGross(entriesLast7);
  const netLast7 = sumNet(entriesLast7);
  const grossPrev7 = sumGross(entriesPrev7);
  const netPrev7 = sumNet(entriesPrev7);

  // ── Per-source breakdown (current month) ──
  const bySource = {};
  entriesCurrent.forEach(e => {
    const key = e.sourceId || 'unknown';
    if (!bySource[key]) bySource[key] = { name: e.sourceName || key, gross: 0, net: 0, count: 0 };
    bySource[key].gross += e.amount || 0;
    bySource[key].net += e.netAmount || 0;
    bySource[key].count++;
  });

  // ── Expense details (current month) ──
  const expItems = expCurrent.expenses || [];
  const expByGroup = {};
  expItems.forEach(e => {
    const cat = e.category || 'other';
    const desc = e.description || cat;
    if (!expByGroup[cat]) expByGroup[cat] = { total: 0, items: {} };
    expByGroup[cat].total += e.amount || 0;
    if (!expByGroup[cat].items[desc]) expByGroup[cat].items[desc] = 0;
    expByGroup[cat].items[desc] += e.amount || 0;
  });

  // ── Projection ──
  const avgNetPerDay = workDaysCurrent > 0 ? netCurrent / workDaysCurrent : 0;
  const avgGrossPerDay = workDaysCurrent > 0 ? grossCurrent / workDaysCurrent : 0;
  const remainingDays = daysInMonth - dayOfMonth;
  const projectedNet = avgNetPerDay * daysInMonth;
  const projectedGross = avgGrossPerDay * daysInMonth;
  const totalExpCurrentMonth = expCurrent.totalExpenses || 0;
  const projectedBalance = projectedNet - totalExpCurrentMonth;

  // ── Commission from apps ──
  const totalCommission = grossCurrent - netCurrent;

  // ── Build context text ──
  const lines = [];
  lines.push(`=== ΔΕΔΟΜΕΝΑ ΟΔΗΓΟΥ — ${today} ===`);
  lines.push('');

  // Data completeness warning
  const hasEntries = entriesCurrent.length > 0;
  const hasExpenses = expItems.length > 0;
  if (!hasEntries && !hasExpenses) {
    lines.push('⚠️ ΠΡΟΣΟΧΗ: Δεν υπάρχουν καταχωρήσεις εσόδων ούτε εξόδων αυτόν τον μήνα. Ζήτα από τον οδηγό να καταχωρήσει δεδομένα πρώτα.');
  } else if (!hasEntries) {
    lines.push('⚠️ ΠΡΟΣΟΧΗ: Δεν υπάρχουν καταχωρήσεις εσόδων αυτόν τον μήνα. Μόνο έξοδα υπάρχουν.');
  } else if (!hasExpenses) {
    lines.push('⚠️ ΠΡΟΣΟΧΗ: Δεν υπάρχουν καταχωρήσεις εξόδων αυτόν τον μήνα. Ο υπολογισμός υπολοίπου δεν είναι πλήρης.');
  }

  lines.push('');
  lines.push(`── ΤΡΕΧΩΝ ΜΗΝΑΣ (${curMonthStr}, μέρα ${dayOfMonth}/${daysInMonth}) ──`);
  lines.push(`Μεικτά έσοδα: ${formatEUR(grossCurrent)}`);
  lines.push(`Καθαρά έσοδα (μετά προμηθ.): ${formatEUR(netCurrent)}`);
  lines.push(`Προμήθειες εφαρμογών: ${formatEUR(totalCommission)}`);
  lines.push(`Διαδρομές: ${entriesCurrent.length}`);
  lines.push(`Μέρες εργασίας: ${workDaysCurrent}`);
  lines.push(`Μέσο καθαρό/ημέρα: ${formatEUR(avgNetPerDay)}`);
  lines.push(`Μέσο μεικτό/ημέρα: ${formatEUR(avgGrossPerDay)}`);

  // By source
  lines.push('');
  lines.push('Ανά πηγή (τρέχων μήνας):');
  const sources = tripSources.filter(s => s.active !== false);
  sources.forEach(src => {
    const data = bySource[src.id];
    if (data) {
      lines.push(`  ${src.name}: Μεικτά ${formatEUR(data.gross)}, Καθαρά ${formatEUR(data.net)}, Διαδρομές ${data.count}, Προμήθεια ${src.commission}%`);
    } else {
      lines.push(`  ${src.name}: Καμία καταχώρηση`);
    }
  });

  // Expenses
  lines.push('');
  lines.push(`── ΕΞΟΔA ΤΡΕΧΟΝΤΟΣ ΜΗΝΑ ──`);
  lines.push(`Σύνολο εξόδων: ${formatEUR(totalExpCurrentMonth)}`);
  const catLabels = { car: 'Αυτοκίνητο', personal: 'Προσωπικά/Σπιτιού', tax: 'Φόροι/Ασφαλιστικά', fixed: 'Πάγια', family: 'Οικογένεια' };
  Object.keys(expByGroup).forEach(cat => {
    const g = expByGroup[cat];
    lines.push(`  ${catLabels[cat] || cat}: ${formatEUR(g.total)}`);
    Object.entries(g.items).forEach(([desc, amt]) => {
      lines.push(`    • ${desc}: ${formatEUR(amt)}`);
    });
  });

  // Balance
  lines.push('');
  lines.push(`── ΥΠΟΛΟΙΠΟ / ΤΣΕΠΗ ──`);
  lines.push(`Καθαρά - Έξοδα μέχρι σήμερα: ${formatEUR(netCurrent - totalExpCurrentMonth)}`);

  // Projections
  lines.push('');
  lines.push(`── ΠΡΟΒΛΕΨΗ ΤΕΛΟΥΣ ΜΗΝΑ ──`);
  if (workDaysCurrent >= 3) {
    lines.push(`Με τον ρυθμό που πας (${workDaysCurrent} μέρες, μ.ο. ${formatEUR(avgNetPerDay)}/μέρα):`);
    lines.push(`  Προβλεπόμενα καθαρά: ${formatEUR(projectedNet)}`);
    lines.push(`  Προβλεπόμενα μεικτά: ${formatEUR(projectedGross)}`);
    lines.push(`  Εκτίμηση υπολοίπου (καθαρά - τρέχοντα έξοδα): ${formatEUR(projectedBalance)}`);
    lines.push(`  Υπόλοιπες μέρες μήνα: ${remainingDays}`);
  } else {
    lines.push('Λίγες μέρες καταχωρήσεων (<3). Η πρόβλεψη δεν είναι αξιόπιστη ακόμα.');
  }

  // Comparison vs previous month
  lines.push('');
  lines.push(`── ΣΥΓΚΡΙΣΗ ΜΕ ΠΡΟΗΓΟΥΜΕΝΟ ΜΗΝΑ (${prevMonthStr}) ──`);
  lines.push(`Προηγ. μήνας — Μεικτά: ${formatEUR(grossPrev)}, Καθαρά: ${formatEUR(netPrev)}, Διαδρομές: ${entriesPrev.length}, Μέρες: ${workDaysPrev}`);
  lines.push(`Μεταβολή μεικτών: ${pct(grossCurrent, grossPrev)}`);
  lines.push(`Μεταβολή καθαρών: ${pct(netCurrent, netPrev)}`);
  lines.push(`Προηγ. μήνας — Σύνολο εξόδων: ${formatEUR(expPrev.totalExpenses || 0)}`);

  // Comparison last 7 days
  lines.push('');
  lines.push(`── ΤΕΛΕΥΤΑΙΕΣ 7 ΜΕΡΕΣ (${sevenDaysAgoStr} → ${today}) ──`);
  lines.push(`Μεικτά: ${formatEUR(grossLast7)}, Καθαρά: ${formatEUR(netLast7)}, Διαδρομές: ${entriesLast7.length}, Μέρες: ${workDaysLast7}`);
  lines.push(`Έξοδα 7ημέρου: ${formatEUR(expLast7.totalExpenses || 0)}`);
  lines.push(`Σύγκριση με προηγ. 7ήμερο: Μεικτά ${pct(grossLast7, grossPrev7)}, Καθαρά ${pct(netLast7, netPrev7)}`);

  // ── Vehicle stats (cost/km, group breakdown, km readings) ──
  try {
    const vehicleCtx = await buildVehicleStatsContext(driverId);
    if (vehicleCtx) lines.push(vehicleCtx);
  } catch (err) {
    lines.push('\n⚠️ Δεν ήταν δυνατός ο υπολογισμός στατιστικών οχήματος.');
  }

  // ── Debts (Πιστώσεις / Χρεώσεις) ──
  if (driverDebts && driverDebts.length > 0) {
    lines.push('');
    lines.push('── ΕΚΚΡΕΜΟΤΗΤΕΣ ΟΦΕΙΛΩΝ ──');
    let totalOwed = 0, totalOwe = 0;
    driverDebts.forEach(d => {
      if (d.type === 'owed') totalOwed += d.amount || 0;
      else totalOwe += d.amount || 0;
    });
    lines.push(`Πιστώσεις συνολικά: ${formatEUR(totalOwed)} (${driverDebts.filter(d => d.type === 'owed').length} εγγραφές)`);
    lines.push(`Χρεώσεις συνολικά: ${formatEUR(totalOwe)} (${driverDebts.filter(d => d.type === 'owe').length} εγγραφές)`);
    lines.push(`Ισοζύγιο: ${formatEUR(totalOwed - totalOwe)}`);
    driverDebts.forEach(d => {
      const dir = d.type === 'owed' ? 'Πίστωση από' : 'Χρέωση προς';
      const note = d.note ? ` (${d.note})` : '';
      lines.push(`  • ${dir}: ${d.name} — ${formatEUR(d.amount)} — ${d.date}${note}`);
    });
  } else {
    lines.push('');
    lines.push('── ΕΚΚΡΕΜΟΤΗΤΕΣ ΟΦΕΙΛΩΝ ──');
    lines.push('Δεν υπάρχουν εκκρεμότητες οφειλών.');
  }

  // ── Partners (Συνεργάτες) ──
  if (driverPartners && driverPartners.length > 0) {
    lines.push('');
    lines.push('── ΣΥΝΕΡΓΑΤΕΣ ──');
    let totalOwedByPartners = 0;
    let totalOwedToPartners = 0;
    driverPartners.forEach(p => {
      const s = (partnersSummary && partnersSummary[p.id]) || { balance: 0, lastTxnDate: '' };
      const balance = s.balance || 0;
      if (balance > 0) totalOwedByPartners += balance;
      else if (balance < 0) totalOwedToPartners += Math.abs(balance);
      const balLabel = balance > 0 ? 'σου χρωστάει' : balance < 0 ? 'χρωστάς' : 'μηδέν';
      const lastTxn = s.lastTxnDate ? ` — Τελ. κίνηση: ${s.lastTxnDate}` : '';
      lines.push(`  • ${p.name}: Υπόλοιπο ${formatEUR(Math.abs(balance))} (${balLabel})${lastTxn}`);
    });
    lines.push(`Σύνολο που σου χρωστάνε συνεργάτες: ${formatEUR(totalOwedByPartners)}`);
    lines.push(`Σύνολο που χρωστάς σε συνεργάτες: ${formatEUR(totalOwedToPartners)}`);
    lines.push(`Καθαρό ισοζύγιο συνεργατών: ${formatEUR(totalOwedByPartners - totalOwedToPartners)}`);
  } else {
    lines.push('');
    lines.push('── ΣΥΝΕΡΓΑΤΕΣ ──');
    lines.push('Δεν υπάρχουν καταχωρημένοι συνεργάτες.');
  }

  // ── Obligations (Μηνιαίες Υποχρεώσεις) ──
  if (driverObligations && driverObligations.length > 0) {
    lines.push('');
    lines.push('── ΜΗΝΙΑΙΕΣ ΥΠΟΧΡΕΩΣΕΙΣ ──');
    if (obligationsSummary) {
      lines.push(`Σύνολο που μου χρωστάνε (ανεξόφλητα): ${formatEUR(obligationsSummary.totalOwedToMe)}`);
      lines.push(`Σύνολο που χρωστάω (ανεξόφλητα): ${formatEUR(obligationsSummary.totalIOwe)}`);
    }
    const paidSet = new Set((obligationPayments || []).map(p => `${p.obligationId}__${p.period}`));
    driverObligations.filter(o => o.active).forEach(o => {
      const dirLabel = o.direction === 'incoming' ? 'Μου χρωστάνε' : 'Χρωστάω';
      const freq = o.frequency === 'monthly' ? 'Μηνιαία' : o.frequency === 'quarterly' ? 'Τριμηνιαία' : 'Ετήσια';
      lines.push(`  • ${o.title} (${o.counterparty || '—'}): ${formatEUR(o.amount)} ${freq} — ${dirLabel}`);
    });
  } else {
    lines.push('');
    lines.push('── ΜΗΝΙΑΙΕΣ ΥΠΟΧΡΕΩΣΕΙΣ ──');
    lines.push('Δεν υπάρχουν καταχωρημένες υποχρεώσεις.');
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────
// SYSTEM PROMPT for the DriversSystem assistant
// ─────────────────────────────────────────────────────────

function buildSystemPrompt() {
  return `Είσαι ο οικονομικός βοηθός του DriversSystem — μια εφαρμογή για επαγγελματίες οδηγούς (Uber, Bolt, Beat, κ.λπ.) στην Ελλάδα.

ΡΟΛΟΣ:
- Λειτουργείς σαν οικονομικός καθρέφτης του οδηγού. Απαντάς ΜΟΝΟ με βάση τα πραγματικά δεδομένα που σου δίνονται στο context.
- Ποτέ δεν εφευρίσκεις αριθμούς. Αν δεν υπάρχουν δεδομένα, λες ξεκάθαρα τι λείπει.

ΚΑΝΟΝΕΣ ΑΠΑΝΤΗΣΗΣ:
1. Κάθε απάντηση αναφέρει ΞΕΚΑΘΑΡΑ περίοδο (π.χ. «αυτόν τον μήνα μέχρι σήμερα», «προηγούμενος μήνας», «τελευταίες 7 μέρες»).
2. Λες «ανεβαίνεις» ή «πέφτεις» ΜΟΝΟ αν συγκρίνεις με προηγούμενη περίοδο — πάντα δίνεις ποσοστό/διαφορά.
3. Η πρόβλεψη μήνα («με τον ρυθμό που πας») βασίζεται στις μέρες εργασίας × μέσο όρο ανά μέρα.
4. Αν δεν υπάρχουν αρκετά δεδομένα, λες καθαρά τι λείπει (π.χ. «λείπουν έξοδα», «λίγες μέρες καταχωρήσεων»).

ΤΥΠΟΣ ΕΡΩΤΗΣΕΩΝ ΠΟΥ ΠΡΕΠΕΙ ΝΑ ΑΠΑΝΤΑΣ:
- «Δεν έχω λεφτά στην τσέπη μου, τι πάει λάθος;» → δείξε καθαρά αυτού μήνα vs έξοδα, πού φεύγουν τα χρήματα
- «Ξοδεύω πολλά;» → ανάλυση εξόδων κατά κατηγορία, σύγκριση με προηγ. μήνα
- «Πού φεύγουν τα χρήματα;» → breakdown εξόδων με ποσά
- «Πόσο μου κοστίζει το χιλιόμετρο;» → κόστος/km = Σ(έξοδα αυτοκινήτου με affectsKmCost) ÷ (maxKm − minKm). Αν δεν υπάρχουν 2+ καταγραφές km, ζήτα από τον οδηγό να συμπληρώνει τα km στις εργασίες service/συντήρηση/βλάβες.
- «Πόσα ξοδεύω στο αμάξι;» → σύνολο εξόδων αυτοκινήτου, ανάλυση ανά ομάδα (service, συντήρηση, καύσιμα, νομικά, βλάβες, ατύχημα)
- «Δουλεύω αρκετά;» → μέρες εργασίας, μέσος ανά μέρα, σύγκριση
- «Με τον ρυθμό που πάω πού θα φτάσω;» → πρόβλεψη τέλους μήνα
- «Ποιες πιστώσεις έχω;» / «Τι χρεώσεις έχω;» / «Ποιος μου χρωστάει;» / «Τι χρωστάω;» → δείξε τα δεδομένα από τις εκκρεμότητες οφειλών (debts). Πιστώσεις = μου χρωστάνε, Χρεώσεις = χρωστάω. Αν δεν υπάρχουν, πες ότι δεν έχει καταγράψει εκκρεμότητες.
- «Πόσα μου χρωστάει ο Νίκος;» / «Τι υπόλοιπο έχω με το ξενοδοχείο;» / «Ποιοι συνεργάτες μου χρωστάνε;» → δείξε δεδομένα από τους Συνεργάτες. Κάθε συνεργάτης έχει χρεώσεις (δουλειά που σου δίνει) και πληρωμές (που σε πληρώνει). Θετικό υπόλοιπο = σου χρωστάει, αρνητικό = χρωστάς εσύ. Αν δεν υπάρχουν συνεργάτες, πες ότι δεν έχει καταχωρήσει.

ΥΠΟΛΟΓΙΣΜΟΙ:
- Υπόλοιπο (τσέπη) = Καθαρά έσοδα − Σύνολο εξόδων (αυτοκίνητο + προσωπικά + φόροι + πάγια + οικογένεια)
- Μέσος/μέρα = Καθαρά ÷ Μέρες εργασίας
- Πρόβλεψη = Μέσος/μέρα × Μέρες μήνα
- Μεταβολή = (Τρέχον − Προηγούμενο) ÷ |Προηγούμενο| × 100%
- Κόστος/km = Σ(έξοδα αυτοκινήτου που επηρεάζουν κόστος/km) ÷ (μέγιστο km − ελάχιστο km)
  Πρέπει να υπάρχουν 2+ καταγραφές km (από service/συντήρηση/βλάβες) για να υπολογιστεί.
  Αν δεν υπάρχουν, ενημέρωσε ότι χρειάζεται να συμπληρώνει τα km.

ΜΟΡΦΟΠΟΙΗΣΗ:
- Χρησιμοποίησε ελληνικά ποσά (€).
- Μην κάνεις μεγάλες παραγράφους — χρησιμοποίησε bullets, bold, και σύντομα σημεία.
- Η γλώσσα σου πρέπει να είναι φιλική, σύντομη, και με νούμερα.
- Αν ο οδηγός γράφει σε εν αγγλικό, απάντα σε αγγλικά. Αλλιώς πάντα ελληνικά.`;
}

// ─────────────────────────────────────────────────────────
// REGISTER ROUTES
// ─────────────────────────────────────────────────────────

function registerDriversSystemAssistant(app, opts = {}) {
  const OPENAI_API_KEY = opts.OPENAI_API_KEY || null;

  // POST /api/driverssystem/assistant
  app.post('/api/driverssystem/assistant', async (req, res) => {
    try {
      const body = req.body || {};
      const message = String(body.message || '').trim();
      const history = Array.isArray(body.history) ? body.history : [];
      const driverId = String(body.driverId || '').trim();

      if (!message) {
        return res.status(400).json({ error: 'Missing message' });
      }

      // Build financial context from real data
      let financialContext = '';
      try {
        financialContext = await buildDriverFinancialContext(driverId || '');
      } catch (err) {
        console.error('[driverssystem-assistant] context build error:', err.message);
        financialContext = '⚠️ Δεν ήταν δυνατή η ανάγνωση δεδομένων. Ενημέρωσε τον οδηγό ότι υπάρχει τεχνικό πρόβλημα.';
      }

      // If no OpenAI key — return a structured mock reply based on real data
      if (!OPENAI_API_KEY) {
        const mockReply = buildMockReply(message, financialContext, driverId);
        return res.json({ reply: mockReply, model: 'mock-financial', driverId });
      }

      // Build messages for OpenAI
      const messages = [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'system', content: `Ακολουθούν τα ΠΡΑΓΜΑΤΙΚΑ οικονομικά δεδομένα του οδηγού:\n\n${financialContext}` },
        ...history
          .filter(m => m && m.role && m.content)
          .slice(-10) // keep last 10 messages for context window
          .map(m => ({ role: m.role, content: String(m.content) })),
        { role: 'user', content: message }
      ];

      const fetch = global.fetch || require('node-fetch');
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.3,
          max_tokens: 1200
        })
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        console.error('[driverssystem-assistant] OpenAI error:', resp.status, errText.slice(0, 300));
        // Fallback to mock
        const mockReply = buildMockReply(message, financialContext, driverId);
        return res.json({ reply: mockReply, model: 'mock-fallback', driverId });
      }

      const data = await resp.json();
      const reply = data?.choices?.[0]?.message?.content || 'Συγγνώμη, δεν μπόρεσα να απαντήσω αυτή τη στιγμή.';

      return res.json({ reply, model: 'gpt-4o-mini', driverId });
    } catch (err) {
      console.error('[driverssystem-assistant] error:', err.stack || err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /api/driverssystem/assistant/snapshot — quick financial snapshot for the chat widget
  app.get('/api/driverssystem/assistant/snapshot', async (req, res) => {
    try {
      const driverId = String(req.query.driverId || '').trim();
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const dashboard = await dataLayer.getDashboard({ driverId, month });
      return res.json({
        month,
        totalNet: dashboard.totalNet,
        totalGross: dashboard.totalGross,
        totalExpenses: dashboard.totalExpenses,
        balance: dashboard.balanceSoFar,
        workingDays: dashboard.workingDays,
        totalTrips: dashboard.totalTrips,
        avgNetPerDay: dashboard.avgNetPerDay,
        projectedNet: dashboard.projectedNet,
        projectedBalance: dashboard.projectedNetAfterExpenses
      });
    } catch (err) {
      console.error('[driverssystem-assistant] snapshot error:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  console.log('[driverssystem] assistant routes registered');
}

// ─────────────────────────────────────────────────────────
// MOCK REPLY (when no OpenAI key available)
// Returns a structured answer using the real financial context
// ─────────────────────────────────────────────────────────

function buildMockReply(message, financialContext, driverId) {
  if (!financialContext || financialContext.includes('Δεν υπάρχουν καταχωρήσεις εσόδων ούτε εξόδων')) {
    return '📊 Δεν υπάρχουν ακόμα καταχωρήσεις αυτόν τον μήνα.\n\nΚαταχώρησε τις διαδρομές σου στις «Καταχωρήσεις» και τα έξοδά σου για να μπορώ να σε βοηθήσω!';
  }

  // Extract key numbers from context using regex
  const extract = (label) => {
    const re = new RegExp(label + ':\\s*([\\d.,]+\\s*€|[\\d.,]+)', 'i');
    const m = financialContext.match(re);
    return m ? m[1] : '—';
  };

  const lines = [];
  lines.push('📊 **Γρήγορη Επισκόπηση**\n');
  lines.push(`💰 Καθαρά έσοδα μήνα: ${extract('Καθαρά έσοδα')}`);
  lines.push(`📉 Σύνολο εξόδων: ${extract('Σύνολο εξόδων')}`);
  lines.push(`🏦 Υπόλοιπο (τσέπη): ${extract('Καθαρά - Έξοδα μέχρι σήμερα')}`);
  lines.push(`📅 Μέρες εργασίας: ${extract('Μέρες εργασίας')}`);
  lines.push(`🚗 Διαδρομές: ${extract('Διαδρομές')}`);
  lines.push('');
  lines.push('_Αυτή είναι μια γρήγορη σύνοψη. Για πλήρη ανάλυση, ρώτα κάτι συγκεκριμένο (π.χ. «πού φεύγουν τα χρήματα;»)._');
  lines.push('\n⚠️ _Σύνδεση με AI σε εξέλιξη — αυτή η απάντηση βασίζεται σε αυτόματη σύνοψη._');

  return lines.join('\n');
}

module.exports = { registerDriversSystemAssistant };
