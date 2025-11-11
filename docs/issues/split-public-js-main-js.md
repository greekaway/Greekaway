# Split Proposal: public/js/main.js

Path: `public/js/main.js`
Size: 92,963 bytes
Lines: 1,570
Type: frontend bundle

## Why Split
Combines booking UI, DOM manipulation, API calls, state, and i18n. Difficult to maintain and test.

## Proposed Structure
- `public/js/booking/index.js`
- `public/js/booking/dom.js`
- `public/js/booking/state.js`
- `public/js/booking/api.js`
- `public/js/booking/i18n.js`

## Checklist
- [ ] Identify module boundaries
- [ ] Create submodules and move code
- [ ] Ensure global init order preserved
- [ ] Add minimal unit tests for pure functions
- [ ] Manual smoke test booking flow

## Difficulty
Medium

## Risks
Implicit globals, script ordering, event listener registration.
