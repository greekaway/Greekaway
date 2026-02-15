'use strict';
/**
 * DriversSystem — Vehicle Statistics Module
 * ──────────────────────────────────────────
 * Self-contained module for vehicle cost analytics.
 * Designed to be readable by the AI assistant so it can answer
 * driver questions like "Πόσο μου κοστίζει το χιλιόμετρο;"
 *
 * DATA MODEL:
 * ─ Car expense records have optional `km` field (odometer reading)
 *   only when the expense item has `requiresKm: true`
 *   (groups: service, maintenance, breakdowns).
 * ─ Items with `affectsKmCost: true` contribute to the cost/km calculation.
 * ─ cost/km = Σ(expenses where affectsKmCost) ÷ (maxKm − minKm) in a period.
 * ─ If no km readings exist, cost/km cannot be calculated.
 *
 * EXPORTS:
 * ─ getVehicleStats(filters)   → full vehicle analytics object
 * ─ registerVehicleStatsRoutes → Express route registration
 */

const dataLayer = require('../../src/server/data/driverssystem');

// ── Helpers ──

function greeceNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Athens' }));
}

function greeceDateStr() {
  const gr = greeceNow();
  return gr.getFullYear() + '-' +
    String(gr.getMonth() + 1).padStart(2, '0') + '-' +
    String(gr.getDate()).padStart(2, '0');
}

function formatEUR(v) {
  return (v || 0).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
}

// ──────────────────────────────────────────────────────────
// VEHICLE STATS CALCULATOR
// ──────────────────────────────────────────────────────────

/**
 * Calculate comprehensive vehicle statistics for a driver/period.
 *
 * @param {Object} filters
 * @param {string} [filters.driverId]  Driver ID
 * @param {string} [filters.from]      Start date YYYY-MM-DD
 * @param {string} [filters.to]        End date YYYY-MM-DD
 * @param {string} [filters.month]     Shorthand: YYYY-MM (overrides from/to)
 * @returns {Object} Vehicle statistics
 */
async function getVehicleStats(filters = {}) {
  // Resolve date range
  let from = filters.from;
  let to = filters.to;
  if (filters.month) {
    const [y, m] = filters.month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    from = `${filters.month}-01`;
    to = `${filters.month}-${String(daysInMonth).padStart(2, '0')}`;
  }
  if (!from) {
    const now = greeceNow();
    from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }
  if (!to) to = greeceDateStr();

  // Fetch car expenses AND personal/tax expenses (some may affect cost/km)
  const [expData, carCategories, persCategories, taxCategories, persExpData, taxExpData] = await Promise.all([
    dataLayer.getExpensesRange({
      driverId: filters.driverId,
      from,
      to,
      category: 'car'
    }),
    dataLayer.getCarExpenseCategories(),
    dataLayer.getPersonalExpenseCategories(),
    dataLayer.getTaxExpenseCategories(),
    dataLayer.getExpensesRange({
      driverId: filters.driverId,
      from,
      to,
      category: 'personal'
    }),
    dataLayer.getExpensesRange({
      driverId: filters.driverId,
      from,
      to,
      category: 'tax'
    })
  ]);

  const carExpenses = expData.expenses || [];
  const persExpenses = persExpData.expenses || [];
  const taxExpenses = taxExpData.expenses || [];

  // Build item lookup from ALL category definitions (id → item properties)
  const itemDefs = {};
  (carCategories || []).forEach(group => {
    (group.items || []).forEach(item => {
      itemDefs[item.id] = {
        ...item,
        groupId: group.id,
        groupName: group.name,
        expCategory: 'car'
      };
    });
  });
  (persCategories || []).forEach(group => {
    (group.items || []).forEach(item => {
      itemDefs[`pers_${item.id}`] = {
        ...item,
        groupId: group.id,
        groupName: group.name,
        expCategory: 'personal'
      };
    });
  });
  (taxCategories || []).forEach(group => {
    (group.items || []).forEach(item => {
      itemDefs[`tax_${item.id}`] = {
        ...item,
        groupId: group.id,
        groupName: group.name,
        expCategory: 'tax'
      };
    });
  });

  // ── Classify expenses ──
  let totalCarExpenses = 0;
  let totalAffectsKm = 0;           // expenses that count toward cost/km
  const kmReadings = [];              // odometer readings with dates
  const byGroup = {};                 // group-level breakdown
  const byItem = {};                  // item-level breakdown

  carExpenses.forEach(exp => {
    const amt = exp.amount || 0;
    totalCarExpenses += amt;

    // Group breakdown
    const gid = exp.groupId || 'unknown';
    const gname = exp.groupName || gid;
    if (!byGroup[gid]) byGroup[gid] = { name: gname, total: 0, count: 0, items: {} };
    byGroup[gid].total += amt;
    byGroup[gid].count++;

    // Item breakdown
    const iid = exp.itemId || 'unknown';
    const iname = exp.itemName || iid;
    if (!byGroup[gid].items[iid]) byGroup[gid].items[iid] = { name: iname, total: 0, count: 0 };
    byGroup[gid].items[iid].total += amt;
    byGroup[gid].items[iid].count++;

    // Check if item affects cost/km
    const def = itemDefs[iid];
    if (def && def.affectsKmCost) {
      totalAffectsKm += amt;
    }

    // Collect km readings (odometer snapshots)
    if (exp.km && typeof exp.km === 'number' && exp.km > 0) {
      kmReadings.push({ km: exp.km, date: exp.date, itemName: iname });
    }
  });

  // ── Also include personal/tax expenses that affect cost/km ──
  let totalNonCarAffectsKm = 0;
  [...persExpenses, ...taxExpenses].forEach(exp => {
    const amt = exp.amount || 0;
    const iid = exp.itemId || 'unknown';
    const prefix = exp.category === 'personal' ? 'pers_' : 'tax_';
    const def = itemDefs[prefix + iid];
    if (def && def.affectsKmCost) {
      totalAffectsKm += amt;
      totalNonCarAffectsKm += amt;
    }
  });

  // ── Cost per km calculation ──
  let costPerKm = null;
  let kmRange = null;
  let kmMin = null;
  let kmMax = null;

  if (kmReadings.length >= 2) {
    // Sort by odometer value
    kmReadings.sort((a, b) => a.km - b.km);
    kmMin = kmReadings[0].km;
    kmMax = kmReadings[kmReadings.length - 1].km;
    const kmDriven = kmMax - kmMin;

    if (kmDriven > 0) {
      costPerKm = totalAffectsKm / kmDriven;
      kmRange = kmDriven;
    }
  }

  // ── Per-allocation split ──
  let vehicleCost = 0;  // allocation: 'vehicle' — general vehicle upkeep
  let tripCost = 0;     // allocation: 'trip'    — per-trip costs (tolls, parking)

  carExpenses.forEach(exp => {
    const def = itemDefs[exp.itemId];
    if (def && def.allocation === 'trip') {
      tripCost += exp.amount || 0;
    } else {
      vehicleCost += exp.amount || 0;
    }
  });

  return {
    period: { from, to },
    driverId: filters.driverId || null,

    // Totals
    totalCarExpenses,
    totalAffectsKm,
    totalNonCarAffectsKm,   // personal/tax with affectsKmCost
    vehicleCost,
    tripCost,

    // Cost per km
    costPerKm,
    kmRange,
    kmMin,
    kmMax,
    kmReadingsCount: kmReadings.length,

    // Breakdowns
    byGroup,

    // Raw km readings (useful for AI context)
    kmReadings: kmReadings.map(r => ({
      km: r.km,
      date: r.date,
      item: r.itemName
    }))
  };
}

// ──────────────────────────────────────────────────────────
// BUILD AI-READABLE CONTEXT
// Generates a structured Greek text block that the AI assistant
// can read and use to answer cost/km and vehicle expense questions.
// ──────────────────────────────────────────────────────────

async function buildVehicleStatsContext(driverId) {
  const now = greeceNow();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Previous month
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  // All-time stats (last 12 months for history)
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const yearAgoStr = `${yearAgo.getFullYear()}-${String(yearAgo.getMonth() + 1).padStart(2, '0')}-01`;

  const [current, prev, annual] = await Promise.all([
    getVehicleStats({ driverId, month: curMonth }),
    getVehicleStats({ driverId, month: prevMonth }),
    getVehicleStats({ driverId, from: yearAgoStr })
  ]);

  const lines = [];
  lines.push('');
  lines.push('── ΣΤΑΤΙΣΤΙΚΑ ΟΧΗΜΑΤΟΣ ──');

  // Current month
  lines.push(`\nΤρέχων μήνας (${curMonth}):`);
  lines.push(`  Σύνολο εξόδων αυτοκινήτου: ${formatEUR(current.totalCarExpenses)}`);
  lines.push(`  Έξοδα που επηρεάζουν κόστος/km: ${formatEUR(current.totalAffectsKm)}`);
  lines.push(`  Κόστος οχήματος (πάγια): ${formatEUR(current.vehicleCost)}`);
  lines.push(`  Κόστος διαδρομών (διόδια/πάρκινγκ): ${formatEUR(current.tripCost)}`);

  if (current.costPerKm !== null) {
    lines.push(`  💡 Κόστος ανά χιλιόμετρο: ${current.costPerKm.toFixed(4)} €/km`);
    lines.push(`  Εύρος χιλιομέτρων: ${current.kmMin.toLocaleString('el-GR')} → ${current.kmMax.toLocaleString('el-GR')} km (${current.kmRange.toLocaleString('el-GR')} km)`);
  } else if (current.kmReadingsCount === 1) {
    lines.push(`  ⚠️ Κόστος/km: Υπάρχει μόνο 1 καταγραφή χιλιομέτρων. Χρειάζονται τουλάχιστον 2 για υπολογισμό.`);
  } else {
    lines.push(`  ⚠️ Κόστος/km: Δεν υπάρχουν καταγραφές χιλιομέτρων αυτόν τον μήνα.`);
  }

  // Group breakdown
  const groups = Object.values(current.byGroup);
  if (groups.length > 0) {
    lines.push(`  Ανάλυση ανά ομάδα:`);
    groups.forEach(g => {
      lines.push(`    ${g.name}: ${formatEUR(g.total)} (${g.count} εγγραφές)`);
      Object.values(g.items).forEach(item => {
        lines.push(`      • ${item.name}: ${formatEUR(item.total)} ×${item.count}`);
      });
    });
  }

  // Previous month comparison
  lines.push(`\nΠροηγούμενος μήνας (${prevMonth}):`);
  lines.push(`  Σύνολο εξόδων αυτοκινήτου: ${formatEUR(prev.totalCarExpenses)}`);
  if (prev.costPerKm !== null) {
    lines.push(`  Κόστος/km: ${prev.costPerKm.toFixed(4)} €/km (${prev.kmRange.toLocaleString('el-GR')} km)`);
  }
  if (current.totalCarExpenses > 0 && prev.totalCarExpenses > 0) {
    const change = ((current.totalCarExpenses - prev.totalCarExpenses) / prev.totalCarExpenses) * 100;
    lines.push(`  Μεταβολή: ${change >= 0 ? '+' : ''}${change.toFixed(1)}%`);
  }

  // Annual / 12-month overview
  lines.push(`\nΤελευταίοι 12 μήνες (${yearAgoStr} → σήμερα):`);
  lines.push(`  Συνολικά έξοδα αυτοκινήτου: ${formatEUR(annual.totalCarExpenses)}`);
  lines.push(`  Έξοδα κόστους/km: ${formatEUR(annual.totalAffectsKm)}`);
  if (annual.costPerKm !== null) {
    lines.push(`  💡 Ετήσιο κόστος/km: ${annual.costPerKm.toFixed(4)} €/km`);
    lines.push(`  Εύρος: ${annual.kmMin.toLocaleString('el-GR')} → ${annual.kmMax.toLocaleString('el-GR')} km (${annual.kmRange.toLocaleString('el-GR')} km)`);
  }
  if (annual.kmReadingsCount > 0) {
    lines.push(`  Καταγραφές χιλιομέτρων: ${annual.kmReadingsCount}`);
    // Show timeline of km readings
    const readings = annual.kmReadings || [];
    if (readings.length > 0) {
      lines.push(`  Ιστορικό km:`);
      readings.forEach(r => {
        lines.push(`    ${r.date}: ${r.km.toLocaleString('el-GR')} km (${r.item})`);
      });
    }
  }

  return lines.join('\n');
}

// ──────────────────────────────────────────────────────────
// EXPRESS ROUTES
// ──────────────────────────────────────────────────────────

function registerVehicleStatsRoutes(app) {
  // GET /api/driverssystem/vehicle-stats
  app.get('/api/driverssystem/vehicle-stats', async (req, res) => {
    try {
      const { driverId, from, to, month } = req.query;
      const stats = await getVehicleStats({ driverId, from, to, month });
      return res.json(stats);
    } catch (err) {
      console.error('[driverssystem] vehicle-stats error:', err.message);
      return res.status(500).json({ error: err.message || 'Server error' });
    }
  });

  console.log('[driverssystem] vehicle-stats routes registered');
}

module.exports = {
  getVehicleStats,
  buildVehicleStatsContext,
  registerVehicleStatsRoutes
};
