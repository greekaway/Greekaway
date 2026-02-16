'use strict';
/**
 * DriversSystem – Daily Target Calculator
 *
 * Extracted from driverssystem.js to keep files small and focused.
 * Calculates: daily earnings target, per-€1 breakdown, cost per km.
 *
 * Uses expense category definitions (type: frequent/monthly/annual) and
 * expenseRole (professional/personal/tax) to break down what the driver needs.
 */

/**
 * @param {Object} deps – injected functions from the main data layer
 * @param {Function} deps.greeceNow
 * @param {Function} deps.greeceDateStr
 * @param {Function} deps.getCarExpenseCategories
 * @param {Function} deps.getPersonalExpenseCategories
 * @param {Function} deps.getTaxExpenseCategories
 * @param {Function} deps.getExpensesRange
 * @param {Function} deps.getEntriesRange
 * @param {Object}   opts – { driverId }
 * @returns {Object} target data
 */
async function getDailyTarget(deps, opts = {}) {
  const {
    greeceNow,
    greeceDateStr,
    getCarExpenseCategories,
    getPersonalExpenseCategories,
    getTaxExpenseCategories,
    getExpensesRange,
    getEntriesRange
  } = deps;

  const now = greeceNow();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [year, mon] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const dayOfMonth = now.getDate();
  const firstDay = `${currentMonth}-01`;
  const today = greeceDateStr();

  // 3-month lookback for frequent/monthly averages
  const lookbackStart = new Date(year, mon - 4, 1);
  const lookbackFrom = `${lookbackStart.getFullYear()}-${String(lookbackStart.getMonth() + 1).padStart(2, '0')}-01`;
  const prevMonthEnd = new Date(year, mon - 1, 0);
  const lookbackTo = `${prevMonthEnd.getFullYear()}-${String(prevMonthEnd.getMonth() + 1).padStart(2, '0')}-${String(prevMonthEnd.getDate()).padStart(2, '0')}`;

  // 12-month lookback for annual items
  const annualStart = new Date(year - 1, mon - 1, 1);
  const annualFrom = `${annualStart.getFullYear()}-${String(annualStart.getMonth() + 1).padStart(2, '0')}-01`;

  // Load all category definitions
  const [carCats, persCats, taxCats] = await Promise.all([
    getCarExpenseCategories(),
    getPersonalExpenseCategories(),
    getTaxExpenseCategories()
  ]);

  // Build item lookup: itemId → { type, expenseRole, category }
  const itemDefs = {};
  const addItems = (cats, expCategory) => {
    (cats || []).forEach(group => {
      (group.items || []).forEach(item => {
        if (item.active === false) return;
        const key = `${expCategory}_${item.id}`;
        itemDefs[key] = {
          ...item,
          groupId: group.id,
          expCategory,
          expenseRole: item.expenseRole || (expCategory === 'car' ? 'professional' : expCategory === 'personal' ? 'personal' : 'tax')
        };
      });
    });
  };
  addItems(carCats, 'car');
  addItems(persCats, 'personal');
  addItems(taxCats, 'tax');

  // Fetch expenses for different periods
  const driverFilter = opts.driverId ? { driverId: opts.driverId } : {};

  const currentExpData = await getExpensesRange({ ...driverFilter, from: firstDay, to: today });
  const currentExpenses = currentExpData.expenses || [];

  const lookbackExpData = await getExpensesRange({ ...driverFilter, from: lookbackFrom, to: lookbackTo });
  const lookbackExpenses = lookbackExpData.expenses || [];

  const annualExpData = await getExpensesRange({ ...driverFilter, from: annualFrom, to: lookbackTo });
  const annualExpenses = annualExpData.expenses || [];

  // Count distinct months in lookback (for averaging)
  const lookbackMonths = new Set(lookbackExpenses.map(e => (e.date || '').slice(0, 7)));
  const lookbackMonthCount = Math.max(lookbackMonths.size, 1);
  const annualMonths = new Set(annualExpenses.map(e => (e.date || '').slice(0, 7)));
  const annualMonthCount = Math.max(annualMonths.size, 1);

  // Calculate estimated monthly expenses by item type
  let estimatedMonthly = 0;
  const byRole = { professional: 0, personal: 0, tax: 0 };
  const processedItems = new Set();

  const getItemDef = (exp) => {
    const key = `${exp.category}_${exp.itemId}`;
    return itemDefs[key] || null;
  };

  // Group lookback expenses by item
  const lookbackByItem = {};
  lookbackExpenses.forEach(exp => {
    const key = `${exp.category}_${exp.itemId}`;
    if (!lookbackByItem[key]) lookbackByItem[key] = 0;
    lookbackByItem[key] += exp.amount || 0;
  });

  // Group annual expenses by item
  const annualByItem = {};
  annualExpenses.forEach(exp => {
    const key = `${exp.category}_${exp.itemId}`;
    if (!annualByItem[key]) annualByItem[key] = 0;
    annualByItem[key] += exp.amount || 0;
  });

  // Process each known item definition
  Object.entries(itemDefs).forEach(([key, def]) => {
    let monthlyEstimate = 0;

    if (def.type === 'annual') {
      const annualTotal = annualByItem[key] || 0;
      monthlyEstimate = annualTotal / Math.max(annualMonthCount, 12);
      if (monthlyEstimate === 0) {
        const currentForItem = currentExpenses.filter(e => `${e.category}_${e.itemId}` === key);
        const currentTotal = currentForItem.reduce((s, e) => s + (e.amount || 0), 0);
        if (currentTotal > 0) monthlyEstimate = currentTotal / 12;
      }
    } else {
      const total = lookbackByItem[key] || 0;
      monthlyEstimate = total / lookbackMonthCount;
      if (monthlyEstimate === 0) {
        const currentForItem = currentExpenses.filter(e => `${e.category}_${e.itemId}` === key);
        monthlyEstimate = currentForItem.reduce((s, e) => s + (e.amount || 0), 0);
      }
    }

    if (monthlyEstimate > 0) {
      estimatedMonthly += monthlyEstimate;
      const role = def.expenseRole || 'professional';
      byRole[role] = (byRole[role] || 0) + monthlyEstimate;
      processedItems.add(key);
    }
  });

  // Catch-all: current month expenses for items NOT in definitions
  currentExpenses.forEach(exp => {
    const key = `${exp.category}_${exp.itemId}`;
    if (!processedItems.has(key)) {
      estimatedMonthly += exp.amount || 0;
      const def = getItemDef(exp);
      const role = def ? (def.expenseRole || 'professional') : 'professional';
      byRole[role] = (byRole[role] || 0) + (exp.amount || 0);
    }
  });

  // Current month revenue
  const entries = await getEntriesRange({ ...driverFilter, from: firstDay, to: today });
  const totalNet = entries.reduce((s, e) => s + (e.netAmount || 0), 0);
  const totalGross = entries.reduce((s, e) => s + (e.amount || 0), 0);

  // Working days (distinct dates with entries)
  const workingDaysSet = new Set(entries.map(e => e.date));
  const workingDays = workingDaysSet.size;

  // Remaining working days estimation
  const daysElapsed = dayOfMonth;
  const remainingCalendarDays = daysInMonth - dayOfMonth;
  const workRate = workingDays > 0 ? workingDays / Math.max(daysElapsed, 1) : 0.8;
  const estimatedRemainingWorkDays = Math.max(Math.round(remainingCalendarDays * workRate), 1);

  // Amount still needed
  const amountNeeded = Math.max(estimatedMonthly - totalNet, 0);

  // Daily target
  const dailyTarget = estimatedRemainingWorkDays > 0 ? amountNeeded / estimatedRemainingWorkDays : amountNeeded;

  // Breakdown per €1 earned
  const breakdownPer1 = {};
  if (estimatedMonthly > 0) {
    breakdownPer1.professional = byRole.professional / estimatedMonthly;
    breakdownPer1.personal = byRole.personal / estimatedMonthly;
    breakdownPer1.tax = byRole.tax / estimatedMonthly;
    breakdownPer1.yours = Math.max(1 - breakdownPer1.professional - breakdownPer1.personal - breakdownPer1.tax, 0);
  } else {
    breakdownPer1.professional = 0;
    breakdownPer1.personal = 0;
    breakdownPer1.tax = 0;
    breakdownPer1.yours = 1;
  }

  // ── Cost per km breakdown (fuel vs maintenance) ──
  let costPerKm = null;
  try {
    const fuelItemIds = new Set();
    const maintItemIds = new Set();
    (carCats || []).forEach(group => {
      const gname = (group.name || '').toLowerCase();
      (group.items || []).forEach(item => {
        if (!item.affectsKmCost) return;
        const iname = (item.name || '').toLowerCase();
        if (iname.includes('καύσιμ') || iname.includes('βενζίν') || iname.includes('πετρέλαι') || iname.includes('φυσικ') || iname.includes('ηλεκτρ') || gname.includes('καύσιμ')) {
          fuelItemIds.add(item.id);
        } else {
          maintItemIds.add(item.id);
        }
      });
    });

    const carCurrentExp = currentExpenses.filter(e => e.category === 'car');
    const kmReadings = [];
    carCurrentExp.forEach(e => {
      if (e.km && typeof e.km === 'number' && e.km > 0) {
        kmReadings.push(e.km);
      }
    });

    if (kmReadings.length >= 2) {
      kmReadings.sort((a, b) => a - b);
      const kmDriven = kmReadings[kmReadings.length - 1] - kmReadings[0];
      if (kmDriven > 0) {
        let fuelCost = 0;
        let maintCost = 0;
        carCurrentExp.forEach(e => {
          const amt = e.amount || 0;
          if (fuelItemIds.has(e.itemId)) fuelCost += amt;
          else if (maintItemIds.has(e.itemId)) maintCost += amt;
        });
        costPerKm = {
          fuel: fuelCost / kmDriven,
          maintenance: maintCost / kmDriven,
          total: (fuelCost + maintCost) / kmDriven,
          kmDriven
        };
      }
    }
  } catch (_) { /* silent */ }

  return {
    month: currentMonth,
    daysInMonth,
    dayOfMonth,
    remainingCalendarDays,
    totalNet,
    totalGross,
    earnedThisMonth: totalNet,
    monthlyExpenses: estimatedMonthly,
    workingDays,
    estimatedMonthlyExpenses: estimatedMonthly,
    amountNeeded,
    estimatedRemainingWorkDays,
    dailyTarget,
    byRole,
    breakdownPer1,
    costPerKm,
    todayNet: entries.filter(e => e.date === today).reduce((s, e) => s + (e.netAmount || 0), 0),
    todayGross: entries.filter(e => e.date === today).reduce((s, e) => s + (e.amount || 0), 0)
  };
}

module.exports = { getDailyTarget };
