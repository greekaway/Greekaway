# Split Proposal: public/js/booking-addons.js

Path: `public/js/booking-addons.js`
Size: 22,885 bytes
Lines: 423
Type: frontend booking component

## Why Split
Addons UI and calculations mixed; better abstraction will reduce coupling with main booking script.

## Proposed Structure
- `public/js/booking/addons/index.js`
- `public/js/booking/addons/ui.js`
- `public/js/booking/addons/calculations.js`

## Checklist
- [ ] Identify calculation helpers
- [ ] Unit test price calculations
- [ ] Separate DOM handlers
- [ ] Integrate with main booking state

## Difficulty
Low-Medium

## Risks
State sync with main booking; ensure events remain idempotent.
