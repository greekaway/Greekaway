# Split Proposal: routes/pickup-route.js

Path: `routes/pickup-route.js`
Size: 17,980 bytes
Lines: 347
Type: backend route

## Why Split
Optimization, time window computation, and HTTP concerns intermixed.

## Proposed Structure
- `src/routes/pickup/index.js`
- `src/services/pickup/optimization.js`
- `src/services/pickup/timeWindow.js`

## Checklist
- [ ] Isolate pure time calculations
- [ ] Extract optimization algorithm
- [ ] Add unit tests for time windows
- [ ] Integrate with route registration

## Difficulty
Medium

## Risks
Performance regressions; ensure algorithm unchanged.
