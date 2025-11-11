# Split Proposal: public/js/manual-payments.js

Path: `public/js/manual-payments.js`
Size: 20,273 bytes
Lines: 474
Type: frontend admin (payments)

## Why Split
Validation, API, and DOM logic intertwined; isolating modules improves testability.

## Proposed Structure
- `public/js/admin/payments/index.js`
- `public/js/admin/payments/validation.js`
- `public/js/admin/payments/api.js`

## Checklist
- [ ] Extract validation helpers
- [ ] Stub API client
- [ ] Wire UI separate from logic
- [ ] Add unit tests

## Difficulty
Medium

## Risks
Async error handling; ensure user feedback unchanged.
