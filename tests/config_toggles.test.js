/**
 * Quick verification test for hero video toggle & flight config
 * Run: node tests/config_toggles.test.js
 */
'use strict';

const { validateAndMerge } = require('../moveathens/server/moveathens-helpers');

let pass = 0, fail = 0;
function assert(label, condition) {
  if (condition) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.error(`  ❌ ${label}`); }
}

// Minimal valid config payload
function makePayload(overrides = {}) {
  return {
    heroHeadline: 'Test',
    heroSubtext: 'Sub',
    phoneNumber: '+306900000000',
    whatsappNumber: '+306900000000',
    companyEmail: 'test@test.com',
    irisPhone: '',
    footerLabels: { home: 'h', prices: 'p', cta: 'c', info: 'i', context: 'x' },
    footerIcons: { home: '', prices: '', cta: '', info: '', context: '' },
    ...overrides
  };
}
const current = makePayload({ heroVideoEnabled: true, flightTrackingEnabled: true, flightCheckMinsBefore: 25 });

// ──────────────────────────────────────
console.log('\n── Hero Video Toggle ──');

let r1 = validateAndMerge(makePayload({ heroVideoEnabled: false }), current);
assert('heroVideoEnabled=false is stored', r1.ok && r1.data.heroVideoEnabled === false);

let r2 = validateAndMerge(makePayload({ heroVideoEnabled: true }), current);
assert('heroVideoEnabled=true is stored', r2.ok && r2.data.heroVideoEnabled === true);

let r3 = validateAndMerge(makePayload({}), current);
assert('heroVideoEnabled not sent → keeps current', r3.ok && r3.data.heroVideoEnabled === true);

// ──────────────────────────────────────
console.log('\n── Flight Tracking Toggle ──');

let r4 = validateAndMerge(makePayload({ flightTrackingEnabled: false }), current);
assert('flightTrackingEnabled=false is stored', r4.ok && r4.data.flightTrackingEnabled === false);

let r5 = validateAndMerge(makePayload({ flightTrackingEnabled: true }), current);
assert('flightTrackingEnabled=true is stored', r5.ok && r5.data.flightTrackingEnabled === true);

// ──────────────────────────────────────
console.log('\n── Flight Check Minutes ──');

let r6 = validateAndMerge(makePayload({ flightCheckMinsBefore: 10 }), current);
assert('flightCheckMinsBefore=10 is stored', r6.ok && r6.data.flightCheckMinsBefore === 10);

let r7 = validateAndMerge(makePayload({ flightCheckMinsBefore: 120 }), current);
assert('flightCheckMinsBefore=120 is stored (max)', r7.ok && r7.data.flightCheckMinsBefore === 120);

let r8 = validateAndMerge(makePayload({ flightCheckMinsBefore: 3 }), current);
assert('flightCheckMinsBefore=3 rejected (< 5)', r8.ok && r8.data.flightCheckMinsBefore === 25);

let r9 = validateAndMerge(makePayload({ flightCheckMinsBefore: 999 }), current);
assert('flightCheckMinsBefore=999 rejected (> 120)', r9.ok && r9.data.flightCheckMinsBefore === 25);

// ──────────────────────────────────────
console.log(`\n── Results: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail > 0 ? 1 : 0);
